// app/api/penyisiran/monitoring-kinerja-hari-ini/route.ts
//
// Data mentah utk seksi baru "Monitoring Kinerja PPL Hari Ini" (seksi #1 di
// tab "Monitoring" -- lihat app/penyisiran/monitoring-terpadu.tsx). SATU RPC
// (penyisiran_monitoring_kinerja_hari_ini(), lihat migrasi
// 20260920_monitoring_kinerja_ppl_hari_ini.sql) yg menggabungkan:
//  - penyisiran_usaha (via penyisiran_oleh_id): ditemukan/dikunjungi hari
//    ini + dasar akurasi identifikasi.
//  - petugas_penyisiran_akun.pengawas_id: nama PML.
//  - spj_matriks_kelengkapan(): status Laporan/Dokumentasi hari ini.
//
// View AGREGAT internal staf -- dikunci role "penyisiran" (PIN sama dgn tab
// Penyisiran Usaha / 2 tab Monitoring lain), BUKAN endpoint publik/petugas.
//
// Target Pendataan Harian (KK) SENGAJA tidak disimpan di database -- atas
// permintaan user, nilainya SAMA utk SEMUA petugas (bukan per-petugas spt
// target total di tab Manajemen Target), jadi cukup 1 konstanta di sini
// (dikonsumsi jg oleh FE, lihat TARGET_HARIAN_KK di monitoring-terpadu.tsx --
// NILAINYA HARUS SAMA, kalau mau diubah ubah di DUA tempat ini).
export const TARGET_HARIAN_KK = 7;

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

  const { data, error } = await supabase.rpc("penyisiran_monitoring_kinerja_hari_ini");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ baris: data ?? [], target_harian_kk: TARGET_HARIAN_KK });
}
