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
// View AGREGAT internal staf -- dikunci role "penyisiran" (PIN admin) ATAU
// "penyisiran_petugas" (login personal, SAMA dgn tab Penyisiran Usaha) --
// DIPERLUAS (permintaan user "cukup 1 login dan semua bisa masuk menu
// sesuai role") supaya tab Monitoring bisa dibuka pakai login personal
// petugas, tanpa PIN admin terpisah lagi.
//
// Query param opsional ?tanggal=YYYY-MM-DD (permintaan user: kartu #1 & #2
// di tab Monitoring perlu tanggal yang BISA DIGESER/DIGANTI, bukan cuma
// "hari ini") -- divalidasi ketat (regex + Date.parse) supaya tidak asal
// diteruskan mentah ke RPC, & DIBATASI tidak boleh lebih dari hari ini
// (Asia/Jakarta) krn tanggal masa depan tidak ada gunanya utk monitoring
// kinerja. Kalau tidak dikirim/tidak valid, RPC-nya sendiri default ke hari
// ini (lihat migrasi 20260921_monitoring_kinerja_tanggal_pilihan.sql).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";
import { TARGET_HARIAN_KK } from "@/lib/monitoringKinerjaHarian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tanggalHariIniJakarta(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }); // en-CA -> format YYYY-MM-DD
}

function parseTanggalParam(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (Number.isNaN(Date.parse(raw))) return null;
  const hariIni = tanggalHariIniJakarta();
  return raw > hariIni ? hariIni : raw;
}

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const tanggal = parseTanggalParam(req.nextUrl.searchParams.get("tanggal"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc(
    "penyisiran_monitoring_kinerja_hari_ini",
    tanggal ? { p_tanggal: tanggal } : {}
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ baris: data ?? [], target_harian_kk: TARGET_HARIAN_KK, tanggal: tanggal ?? tanggalHariIniJakarta() });
}
