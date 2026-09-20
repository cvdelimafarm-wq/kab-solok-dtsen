// app/api/penyisiran/master-petugas/route.ts
//
// GET   -> daftar SEMUA petugas (tabel petugas_penyisiran_akun, yang SAMA
//          dipakai tab Penyisiran Usaha/Identifikasi Jorong/Perencanaan
//          Lapangan) + kolom "Master Petugas": email, alamat_kecamatan/
//          alamat_nagari/alamat_detail (3 kolom terpisah, diisi MANUAL,
//          BUKAN dari koordinat GPS -- lihat migrasi
//          20260918_master_petugas_pisah_alamat.sql yg mengubah kolom
//          "alamat" tunggal jadi 3 kolom ini), status_kepegawaian (mitra/
//          organik), dan pengawas_id (self-reference ke petugas lain di
//          tabel yg sama -- satu pengawas boleh membawahi banyak PPL,
//          lihat migrasi 20260918_master_petugas_kolom_dan_pengawas.sql).
// PATCH -> ubah SATU petugas (email/alamat_kecamatan/alamat_nagari/
//          alamat_detail/status_kepegawaian/pengawas_id).
//
// Dipakai tab BARU "Master Petugas" -- akses DIKUNCI ke pengelola yg sama
// dgn tab "Manajemen Target" (bolehAksesManajemenTarget), krn data ini
// dipakai jg utk keperluan resmi (export Excel Pengawas/Pencacah per
// SUBSLS, lihat .../alokasi/export-subsls/route.ts) yg SEBAIKNYA cuma bisa
// diubah pengelola, bukan tiap petugas sendiri2.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALID = new Set(["mitra", "organik"]);
// Whitelist field yg boleh diubah lewat PATCH -- lihat komentar serupa di
// app/api/penyisiran/target/route.ts kenapa ini sengaja dijaga terpisah,
// bukan dipercayakan ke nama kolom yg dikirim client.
const FIELD_VALID = new Set([
  "email",
  "no_hp",
  "alamat_kecamatan",
  "alamat_nagari",
  "alamat_detail",
  "status_kepegawaian",
  "pengawas_id",
]);

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function pastikanPengelola(
  req: NextRequest,
  supabase: any
): Promise<{ nama: string } | NextResponse> {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const { data: akun, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nama = akun?.nama ?? null;
  if (!bolehAksesManajemenTarget(nama)) {
    return NextResponse.json(
      { error: "Tab ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }
  return { nama: nama as string };
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate instanceof NextResponse) return gate;

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama, aktif, email, no_hp, alamat_kecamatan, alamat_nagari, alamat_detail, status_kepegawaian, pengawas_id")
    .order("nama", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const semua = data ?? [];
  // Petakan nama pengawas di sini (bukan lewat embed PostgREST self-join,
  // yg lebih ribet dituliskan) -- cukup satu Map dari id->nama krn semua
  // baris petugas SUDAH ikut ter-load di query yg sama persis di atas.
  const namaById = new Map<number, string>(semua.map((p: any) => [p.id, p.nama]));
  const petugas = semua.map((p: any) => ({
    id: p.id,
    nama: p.nama,
    aktif: p.aktif,
    email: p.email ?? null,
    no_hp: p.no_hp ?? null,
    alamat_kecamatan: p.alamat_kecamatan ?? null,
    alamat_nagari: p.alamat_nagari ?? null,
    alamat_detail: p.alamat_detail ?? null,
    status_kepegawaian: p.status_kepegawaian ?? null,
    pengawas_id: p.pengawas_id ?? null,
    pengawas_nama: p.pengawas_id != null ? namaById.get(p.pengawas_id) ?? null : null,
  }));

  return NextResponse.json({ petugas });
}

export async function PATCH(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const fieldsInput = body?.fields;
  if (!petugasId) {
    return NextResponse.json({ error: "petugas_id wajib diisi." }, { status: 400 });
  }
  if (!fieldsInput || typeof fieldsInput !== "object") {
    return NextResponse.json({ error: "Tidak ada field yang dikirim." }, { status: 400 });
  }

  const fields: Record<string, string | number | null> = {};
  for (const key of Object.keys(fieldsInput)) {
    if (!FIELD_VALID.has(key)) continue;
    const val = fieldsInput[key];
    if (key === "status_kepegawaian") {
      if (val === null || val === "") {
        fields[key] = null;
      } else if (typeof val === "string" && STATUS_VALID.has(val)) {
        fields[key] = val;
      } else {
        return NextResponse.json({ error: `Status kepegawaian tidak valid: ${val}` }, { status: 400 });
      }
    } else if (key === "pengawas_id") {
      if (val === null || val === "") {
        fields[key] = null;
      } else {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: "pengawas_id tidak valid." }, { status: 400 });
        }
        if (n === petugasId) {
          return NextResponse.json({ error: "Petugas tidak bisa menjadi pengawas dirinya sendiri." }, { status: 400 });
        }
        fields[key] = n;
      }
    } else {
      // email / alamat_kecamatan / alamat_nagari / alamat_detail -- teks
      // bebas, kosongkan jadi null
      fields[key] = val === "" || val == null ? null : String(val);
    }
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang valid untuk disimpan." }, { status: 400 });
  }

  const { error } = await supabase.from("petugas_penyisiran_akun").update(fields).eq("id", petugasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
