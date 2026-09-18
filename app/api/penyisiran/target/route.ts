// app/api/penyisiran/target/route.ts
//
// GET  -> daftar SEMUA petugas (tabel petugas_penyisiran_akun) + target
//         masing2 (LEFT JOIN petugas_target, null kalau belum diisi) --
//         dipakai tabel edit di tab "Manajemen Target".
// PATCH -> ubah target SATU petugas (petugas_id diisi) ATAU SEMUA petugas
//          sekaligus (terapkan_semua: true, petugas_id diabaikan) --
//          dipakai baik edit per-baris maupun tombol "Terapkan ke Semua
//          Petugas".
//
// Dikunci role "penyisiran_petugas" (sama dgn tab Penyisiran Usaha, krn
// keempat pengelola tab ini MEMANG login personal lewat akun yg sama di
// petugas_penyisiran_akun) DITAMBAH pengecekan nama pengelola lewat
// lib/manajemenTargetAkses.ts -- role/tabel akunnya sengaja TIDAK dibuat
// baru, tapi nama hasil login HARUS salah satu dari 4 nama yg diizinkan,
// SELALU dicek ulang di server (bukan cuma disembunyikan di client) krn
// semua petugas penyisiran lain jg punya token role yang sama persis.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SATUAN_VALID = new Set(["kk", "sls", "nagari", "kecamatan"]);
// Field yg boleh diubah lewat endpoint ini -- whitelist SENGAJA dijaga di
// sini (bukan cuma dipercayakan ke nama kolom yg dikirim client) supaya
// body request tidak bisa dipakai menulis kolom lain di luar target
// (mis. updated_by/updated_at, yg memang diisi manual di bawah, bukan
// dari body).
const FIELD_VALID = new Set([
  "target_identifikasi_jumlah",
  "target_identifikasi_satuan",
  "target_kunjungan_kk",
  "target_berhasil_kk",
]);

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Cek gabungan: token valid role "penyisiran_petugas" DAN namanya termasuk
 * yg diizinkan (lib/manajemenTargetAkses.ts). Mengembalikan nama pengelola
 * (utk diisi ke kolom updated_by) kalau lolos, atau null+response error
 * kalau tidak.
 */
async function pastikanPengelola(
  req: NextRequest,
  supabase: ReturnType<typeof createClient>
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
    .select(
      "id, nama, aktif, petugas_target(target_identifikasi_jumlah, target_identifikasi_satuan, target_kunjungan_kk, target_berhasil_kk)"
    )
    .order("nama", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // petugas_target(...) datang sbg objek tunggal (relasi 1:1, petugas_id
  // adalah PRIMARY KEY) atau null kalau petugas itu belum pernah diberi
  // target sama sekali -- diratakan di sini spy frontend tidak perlu tahu
  // bentuk hasil embed PostgREST.
  const petugas = (data ?? []).map((row: any) => {
    const t = row.petugas_target ?? null;
    return {
      id: row.id,
      nama: row.nama,
      aktif: row.aktif,
      target_identifikasi_jumlah: t?.target_identifikasi_jumlah ?? null,
      target_identifikasi_satuan: t?.target_identifikasi_satuan ?? null,
      target_kunjungan_kk: t?.target_kunjungan_kk ?? null,
      target_berhasil_kk: t?.target_berhasil_kk ?? null,
    };
  });

  return NextResponse.json({ petugas });
}

export async function PATCH(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate instanceof NextResponse) return gate;
  const { nama: namaPengelola } = gate;

  const body = await req.json().catch(() => null);
  const terapkanSemua = Boolean(body?.terapkan_semua);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const fieldsInput = body?.fields;

  if (!fieldsInput || typeof fieldsInput !== "object") {
    return NextResponse.json({ error: "Tidak ada field target yang dikirim." }, { status: 400 });
  }
  if (!terapkanSemua && !petugasId) {
    return NextResponse.json({ error: "petugas_id wajib diisi (atau kirim terapkan_semua: true)." }, { status: 400 });
  }

  // Validasi & saring field -- HANYA yg ada di FIELD_VALID yg diteruskan,
  // sisanya diabaikan diam2 (bukan error) spy client boleh kirim field yg
  // tidak relevan tanpa masalah (mis. state UI lain yg kebetulan ikut).
  const fields: Record<string, number | string | null> = {};
  for (const key of Object.keys(fieldsInput)) {
    if (!FIELD_VALID.has(key)) continue;
    const val = fieldsInput[key];
    if (key === "target_identifikasi_satuan") {
      if (val === null || val === "") {
        fields[key] = null;
      } else if (typeof val === "string" && SATUAN_VALID.has(val)) {
        fields[key] = val;
      } else {
        return NextResponse.json({ error: `Satuan tidak valid: ${val}` }, { status: 400 });
      }
    } else {
      // target_identifikasi_jumlah / target_kunjungan_kk / target_berhasil_kk
      if (val === null || val === "") {
        fields[key] = null;
      } else {
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          return NextResponse.json({ error: `Nilai target tidak valid utk ${key}: ${val}` }, { status: 400 });
        }
        fields[key] = n;
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Tidak ada field target yang valid utk disimpan." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  if (terapkanSemua) {
    const { data: semuaPetugas, error: errList } = await supabase.from("petugas_penyisiran_akun").select("id");
    if (errList) return NextResponse.json({ error: errList.message }, { status: 500 });
    const rows = (semuaPetugas ?? []).map((p: { id: number }) => ({
      petugas_id: p.id,
      ...fields,
      updated_at: nowIso,
      updated_by: namaPengelola,
    }));
    if (rows.length === 0) return NextResponse.json({ ok: true, diperbarui: 0 });
    const { error } = await supabase.from("petugas_target").upsert(rows, { onConflict: "petugas_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, diperbarui: rows.length });
  }

  const { error } = await supabase.from("petugas_target").upsert(
    { petugas_id: petugasId, ...fields, updated_at: nowIso, updated_by: namaPengelola },
    { onConflict: "petugas_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, diperbarui: 1 });
}
