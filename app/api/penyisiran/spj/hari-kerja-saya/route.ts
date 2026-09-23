// app/api/penyisiran/spj/hari-kerja-saya/route.ts
//
// GET -- daftar TANGGAL "hari kerja" yg sudah ditag akun SPJ yg login,
// dipakai kartu monitoring "Kelengkapan per Jenis Dokumen" (Administrasi,
// non-pengelola, lihat app/penyisiran/spj-monitoring.tsx
// KelengkapanDokumenSaya()) sbg PENYEBUT (denominator) kelengkapan --
// lihat lib/spjMatriks.ts hitungKelengkapanPerJenis().
//
// Logic SUMBER tanggal (jenis "penyisiran" vs fallback "tetangga") sekarang
// ditaruh BERSAMA di lib/spjHariKerja.ts (daftarHariKerjaPetugas) -- SATU
// sumber yg SAMA dipakai ULANG oleh
// app/api/penyisiran/spj/buat-otomatis/route.ts (fitur "Buat Otomatis" 3
// dokumen SPJ per-SET tanggal, lihat lib/spjSetHariTugas.ts), supaya kartu
// kelengkapan di sini & pembuatan SET dokumen otomatis SELALU melihat "hari
// kerja" yg persis sama. Lihat komentar lengkap di lib/spjHariKerja.ts utk
// penjelasan kedua sumber (hari_tugas vs fallback_st_range).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession } from "@/lib/spjAuth";
import { daftarHariKerjaPetugas } from "@/lib/spjHariKerja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const hasil = await daftarHariKerjaPetugas(supabase, session);
  return NextResponse.json(hasil);
}
