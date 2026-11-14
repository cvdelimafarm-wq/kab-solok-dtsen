// lib/pejabatServer.ts
//
// (14 Nov 2026) Mengambil pejabat yang berlaku pada satu tanggal dari satu sumber (fungsi basis data keu_pejabat_pada, SQL 20261114s).
// Khusus server (klien service role). Logika murni ada di lib/pejabat.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dariJsonPejabat, GalatPejabat, hariIniWib, pejabatSpj, tanggalAcuanTahun, tanggalAtau, timpaMasterKontrak, type PejabatPada, type PejabatSpj } from "./pejabat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Pejabat yang berlaku pada tanggal itu (YYYY-MM-DD). Gagal membaca = GalatPejabat, agar dokumen tidak tercetak tanpa nama pejabat. */
export async function ambilPejabat(db: Db, tanggal: string): Promise<PejabatPada> {
  const { data, error } = await db.rpc("keu_pejabat_pada", { p_tanggal: tanggal, p_akun: null });
  if (error) throw new GalatPejabat(`Data pejabat tidak dapat dibaca: ${error.message}`);
  return dariJsonPejabat(data);
}

/** Kepala, PPK, dan Bendahara untuk kwitansi dan visum pada tanggal itu; melempar GalatPejabat bila ada yang belum diatur. */
export async function ambilPejabatSpj(db: Db, tanggal: string): Promise<PejabatSpj> {
  return pejabatSpj(await ambilPejabat(db, tanggal), tanggal);
}

/**
 * Master kontrak per tahun dengan nama, NIP, dan SK PPK serta Pejabat Pengadaan dari satu sumber pejabat. Tanggal acuan: tanggal mulai
 * paket bila ada, selain itu hari ini (tahun berjalan) atau 31 Desember tahun itu.
 */
export async function masterKontrakDenganPejabat(db: Db, master: Record<string, string>, tahun: number, tanggalPaket?: string | null): Promise<Record<string, string>> {
  const acuan = tanggalAtau(tanggalPaket, tanggalAcuanTahun(tahun, hariIniWib()));
  return timpaMasterKontrak(master, await ambilPejabat(db, acuan));
}
