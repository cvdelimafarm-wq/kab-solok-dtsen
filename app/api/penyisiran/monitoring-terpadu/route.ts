// app/api/penyisiran/monitoring-terpadu/route.ts
//
// Tab "Monitoring" (terpadu) -- gabungan 7 area monitoring lintas tab yang
// sebelumnya cuma ada terpisah-pisah (Monitoring Petugas, Monitoring PPL,
// Ringkasan Identifikasi di Manajemen Target): kualitas kunjungan Penyisiran
// Usaha, konsistensi jawaban lintas sumber Identifikasi (PPL/Jorong/Tetangga),
// realisasi vs rencana Perencanaan Lapangan (termasuk kuota OH Translok),
// kelengkapan SPJ (Surat Tugas tanpa Visum), beban kerja & kelengkapan data
// Master Petugas, progres vs tenggat waktu Identifikasi, dan konflik alokasi
// wilayah PPL (1 ID Sub SLS dipegang >1 PPL).
//
// Ini VIEW AGREGAT internal staf -- dikunci role "penyisiran" (PIN admin)
// ATAU "penyisiran_petugas" (login personal, SAMA dgn tab Penyisiran Usaha)
// -- DIPERLUAS (permintaan user "cukup 1 login dan semua bisa masuk menu
// sesuai role") supaya tab ini bisa dibuka pakai login personal petugas yg
// SAMA, tanpa perlu PIN admin terpisah lagi. Semua angka dihitung sekali di
// satu RPC (penyisiran_monitoring_terpadu) supaya frontend cukup 1x fetch.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_monitoring_terpadu");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
