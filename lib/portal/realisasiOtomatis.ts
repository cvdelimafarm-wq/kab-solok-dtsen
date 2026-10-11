// lib/portal/realisasiOtomatis.ts  (hanya server)
//
// (11 Okt 2026) Isian otomatis Laporan realisasi PML/PPL dari hasil identifikasi / pendataan (lihat lib/realisasiOtomatis.ts).
// Sumber data: fungsi database bencana_realisasi_otomatis(akun, peran) -- definisi "berhasil" sama dengan Monitoring Lapangan
// (PPL/korwil: hasil terakhir tiap KK per hari WIB = terdampak/tidak terdampak; PML: Sub SLS yang diisi akun itu per hari WIB).
// Kegagalan membaca TIDAK boleh merusak halaman petugas: dikembalikan kosong (form tetap bisa diisi manual).

import type { Db } from "@/lib/sigap";
import { susunRealisasiOtomatis, sumberUntukPeran, type BarisOtomatis, type RealisasiOtomatis, type WilayahRingkas } from "@/lib/realisasiOtomatis";

export async function ambilRealisasiOtomatis(
  db: Db,
  akunId: number,
  peran: string,
  kodeKegiatan: string,
  satuan: string,
  tanggal: string[],
  wilayah: WilayahRingkas[]
): Promise<Map<string, RealisasiOtomatis>> {
  if (!sumberUntukPeran(kodeKegiatan, peran) || tanggal.length === 0) return new Map();
  const { data, error } = await db.rpc("bencana_realisasi_otomatis", { p_akun: akunId, p_peran: peran });
  if (error) {
    console.error("[realisasiOtomatis]", error.message);
    return new Map();
  }
  const ada = new Set(tanggal);
  const baris: BarisOtomatis[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const t = String(r.tanggal ?? "").slice(0, 10);
    if (!ada.has(t) || typeof r.idsubsls !== "string") continue;
    baris.push({ tanggal: t, idsubsls: r.idsubsls, n: Number(r.n) || 0, sumber: r.sumber === "identifikasi" ? "identifikasi" : "pendataan" });
  }
  return susunRealisasiOtomatis(baris, wilayah, satuan);
}
