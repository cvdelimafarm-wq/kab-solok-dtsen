// lib/portal/laporanSementara.ts  (hanya server)
//
// (30 Okt 2026) Membaca angka Laporan Sementara lewat fungsi SQL sigap_laporan_sementara (hanya-baca; migrasi 20261030d).
// Hasil disimpan sebentar di memori (45 detik) supaya Segarkan beruntun dan beberapa admin sekaligus tidak mengulang agregasi 100 ribu baris KK.

import type { Db } from "@/lib/sigap";
import { bacaDataLaporan, type DataLaporan } from "@/lib/laporanSementara";

const TTL_MS = 45_000;
let simpan: { waktu: number; kunci: string; data: DataLaporan } | null = null;

export async function muatLaporanSementara(db: Db, kegiatanId: number, pelatihanId: number, segar = false): Promise<DataLaporan> {
  const kunci = `${kegiatanId}:${pelatihanId}`;
  if (!segar && simpan && simpan.kunci === kunci && Date.now() - simpan.waktu < TTL_MS) return simpan.data;
  const { data, error } = await db.rpc("sigap_laporan_sementara", { p_kegiatan: kegiatanId, p_pelatihan: pelatihanId });
  if (error) throw new Error(error.message);
  const d = bacaDataLaporan(data);
  simpan = { waktu: Date.now(), kunci, data: d };
  return d;
}
