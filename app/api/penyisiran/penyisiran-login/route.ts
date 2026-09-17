// app/api/penyisiran/penyisiran-login/route.ts
//
// Login PERSONAL utk tab "Penyisiran Usaha" -- Nama + Tanggal Lahir,
// dicocokkan ke tabel petugas_penyisiran_akun (TABEL SAMA dgn
// "Identifikasi Jorong", cuma role token yang terbit beda --
// "penyisiran_petugas", lihat lib/penyisiranAuth.ts). MENGGANTIKAN PIN
// bersama yang dulu dipakai tab ini -- PIN ("penyisiran") tetap ada tapi
// sekarang cuma dipakai tab Monitoring.
//
// Kalau nama+tanggal lahir yang diketik TIDAK cocok di petugas_penyisiran_akun,
// tapi cocok persis di ppl_akun ATAU tetangga_akun (org itu memang
// terdaftar di sistem, cuma bukan sbg petugas penyisiran), pesan errornya
// dibedakan dari "nama/tanggal lahir salah total" -- lihat PESAN_ROLE.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signSession } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PESAN_ROLE = "Tab ini hanya dapat diakses petugas penyisiran.";

function normNama(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nama = typeof body?.nama === "string" ? body.nama : "";
  const tanggalLahir = typeof body?.tanggal_lahir === "string" ? body.tanggal_lahir : "";

  if (!nama.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) {
    return NextResponse.json(
      { error: "Isi nama lengkap dan tanggal lahir (format tanggal tidak valid)." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaNorm = normNama(nama);

  // Terdaftar di tabel akun LAIN (bukan petugas_penyisiran_akun) dgn
  // nama+tanggal lahir yang SAMA persis dgn yang baru diketik? -- kalau
  // ya, org itu ADA di sistem, cuma bukan petugas penyisiran.
  async function terdaftarDiTabelLain(): Promise<boolean> {
    const [ppl, tetangga] = await Promise.all([
      supabase.from("ppl_akun").select("id").eq("nama_norm", namaNorm).eq("tanggal_lahir", tanggalLahir).maybeSingle(),
      supabase.from("tetangga_akun").select("id").eq("nama_norm", namaNorm).eq("tanggal_lahir", tanggalLahir).maybeSingle(),
    ]);
    return !!ppl.data || !!tetangga.data;
  }

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama, tanggal_lahir, aktif, lat, lng")
    .eq("nama_norm", namaNorm)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    if (await terdaftarDiTabelLain()) {
      return NextResponse.json({ error: PESAN_ROLE }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Nama tidak ditemukan di daftar petugas penyisiran. Periksa kembali ejaan nama Anda." },
      { status: 401 }
    );
  }

  if (!data.tanggal_lahir) {
    return NextResponse.json(
      {
        error:
          "Tanggal lahir Anda belum tercatat di sistem sehingga belum bisa login. Mohon hubungi petugas BPS Kabupaten Solok untuk melengkapi data ini.",
      },
      { status: 403 }
    );
  }

  if (data.tanggal_lahir !== tanggalLahir) {
    if (await terdaftarDiTabelLain()) {
      return NextResponse.json({ error: PESAN_ROLE }, { status: 403 });
    }
    return NextResponse.json({ error: "Nama ditemukan, tapi tanggal lahir tidak cocok." }, { status: 401 });
  }

  if (data.aktif === false) {
    return NextResponse.json(
      { error: "Akun ini sudah dinonaktifkan. Hubungi petugas BPS Kabupaten Solok kalau ini keliru." },
      { status: 403 }
    );
  }

  const token = signSession("penyisiran_petugas", String(data.id));
  return NextResponse.json({ token, nama: data.nama, lat: data.lat, lng: data.lng, petugas_id: data.id });
}
