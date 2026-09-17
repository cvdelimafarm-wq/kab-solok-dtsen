// app/api/penyisiran/monitoring-petugas/route.ts
//
// Tab "Monitoring Petugas Penyisiran" -- rekap per petugas (tabel
// petugas_penyisiran_akun): jumlah keluarga yang sudah diidentifikasi lewat
// tab "Identifikasi Jorong" & "Identifikasi Tetangga/Lainnya" (dipisah krn
// satu orang bisa punya login di kedua tabel akun tsb -- lihat
// identifikasi_ppl_role), plus jumlah keluarga yang sudah dikunjungi/didata
// atas nama petugas itu di tab "Penyisiran Usaha" sendiri (penyisiran_oleh_id).
// Bungkus RPC penyisiran_monitoring_petugas() -- lihat migrasi
// 20260918_penyisiran_petugas_pasti_monitoring.sql.
//
// Dikunci role "penyisiran" (PIN internal BPS, sama dgn tab Penyisiran
// Usaha) -- lihat juga /api/penyisiran/petugas-toggle-aktif utk fitur
// "Kelola Petugas Penyisiran" (aktifkan/nonaktifkan) yang default
// disembunyikan di tab ini.

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

  const { data, error } = await supabase.rpc("penyisiran_monitoring_petugas");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ petugas: data ?? [] });
}
