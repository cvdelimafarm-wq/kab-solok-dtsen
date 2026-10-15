// lib/sigapGalat.ts  (hanya server)
//
// (15 Okt 2026) Galat 500 yang AMAN untuk petugas: pesan umum ke HP, rincian (pesan database/stack) hanya masuk log server.
// Alasan (U-09): `error.message` Supabase/Postgres dapat memuat nama tabel, kolom, atau batasan -- tidak berguna bagi petugas dan membocorkan struktur.
import { NextResponse } from "next/server";

export const PESAN_GALAT_SERVER = "Terjadi kesalahan di server. Coba lagi sebentar lagi.";

export function galatServer(tag: string, err: unknown, pesan: string = PESAN_GALAT_SERVER): NextResponse {
  console.error(tag, err);
  return NextResponse.json({ error: pesan }, { status: 500 });
}
