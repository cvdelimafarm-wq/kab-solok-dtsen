// app/api/penyisiran/penyisiran-names/route.ts
//
// Daftar petugas AKTIF (id + nama + lokasi rumah kalau sudah ditetapkan)
// dari petugas_penyisiran_akun -- dipakai dropdown "Nama Anda" di tab
// Penyisiran Usaha (app/seruti/penyisiran-usaha.tsx) supaya tiap checklist
// yang disimpan bisa diatribusikan ke petugas yang login, dan supaya skor
// prioritas berbasis jarak (kalau lokasi rumah sudah ditetapkan) bisa
// dihitung di client. BEDA dari /api/penyisiran/jorong-names yang memang
// SENGAJA publik (dipakai di layar login sebelum ada token) -- di sini
// SUDAH dikunci role "penyisiran" krn cuma dipanggil dari dalam tab yang
// sudah lolos PIN.
//
// Petugas yang dinonaktifkan (aktif=false, lihat tab "Monitoring Petugas
// Penyisiran" -> fitur "Kelola Petugas Penyisiran") TIDAK muncul di sini --
// sekadar mencegah checklist baru diatribusikan ke petugas yang sudah
// tidak aktif, TIDAK menghapus riwayat kunjungan yang sudah tercatat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama, lat, lng")
    .eq("aktif", true)
    .order("nama", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ petugas: data ?? [] });
}
