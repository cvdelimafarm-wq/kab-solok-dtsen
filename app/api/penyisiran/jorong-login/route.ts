// app/api/penyisiran/jorong-login/route.ts
//
// Login PERSONAL utk tab baru "Identifikasi Jorong" -- Nama + Tanggal
// Lahir milik masing-masing PETUGAS PENYISIRAN, dicocokkan ke tabel
// petugas_penyisiran_akun (TABEL TERPISAH dari ppl_akun -- lihat migrasi
// supabase/migrations/20260918_petugas_penyisiran_akun.sql -- petugas
// penyisiran adalah staf/mitra yg menyisir lapangan SEKARANG, boleh saja
// orang yg sama juga terdaftar sbg PPL lama di ppl_akun, dua tabel tidak
// saling berkaitan).
//
// Sama pola dgn /api/penyisiran/identifikasi-login (nama dicocokkan via
// nama_norm case/spasi-insensitive, tanggal lahir harus persis sama),
// bedanya token yang terbit berperan "identifikasi_jorong" (bukan
// "identifikasi_ppl") -- supaya endpoint daftar/isi keluarga tahu harus
// pakai filter Kecamatan/Nagari/Sub SLS manual, BUKAN auto-scope ke
// alokasi wilayah pribadi (petugas penyisiran tidak punya tabel alokasi).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signSession } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama, tanggal_lahir, aktif")
    .eq("nama_norm", namaNorm)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json(
      { error: "Nama tidak ditemukan di daftar petugas penyisiran. Periksa kembali ejaan nama Anda." },
      { status: 401 }
    );
  }

  // Petugas yg dinonaktifkan lewat "Kelola Petugas Penyisiran" (tab
  // Monitoring) tidak bisa login lagi -- lihat komentar migrasi kolom
  // `aktif`.
  if (data.aktif === false) {
    return NextResponse.json(
      { error: "Akun ini sudah dinonaktifkan. Hubungi petugas BPS Kabupaten Solok kalau ini keliru." },
      { status: 403 }
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
    return NextResponse.json({ error: "Nama ditemukan, tapi tanggal lahir tidak cocok." }, { status: 401 });
  }

  const token = signSession("identifikasi_jorong", String(data.id));
  return NextResponse.json({ token, nama: data.nama });
}
