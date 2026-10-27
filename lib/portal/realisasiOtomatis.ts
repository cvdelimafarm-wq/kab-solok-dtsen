// lib/portal/realisasiOtomatis.ts  (hanya server)
//
// (11 Okt 2026) Isian otomatis Laporan realisasi PML/PPL dari hasil identifikasi / pendataan (lihat lib/realisasiOtomatis.ts).
// Sumber data: fungsi database bencana_realisasi_otomatis(akun, peran) -- definisi "berhasil" sama dengan Monitoring Lapangan
// (PPL/korwil: hasil terakhir tiap KK per hari WIB = terdampak/tidak terdampak; PML: Sub SLS yang diisi akun itu per hari WIB).
// Kegagalan membaca TIDAK boleh merusak halaman petugas: dikembalikan kosong (form tetap bisa diisi manual).

import type { Db } from "@/lib/sigap";
import { susunRealisasiOtomatis, sumberUntukPeran, type BarisOtomatis, type RealisasiOtomatis, type WilayahRingkas } from "@/lib/realisasiOtomatis";

/** Satu baris hasil fungsi database -> BarisOtomatis. Sub SLS boleh kosong (lembar QC objek petugas tidak punya lokasi). */
export function barisDari(tanggal: string, r: Record<string, unknown>): BarisOtomatis {
  const sumber = r.sumber === "identifikasi" ? "identifikasi" : r.sumber === "qc" ? "qc" : "pendataan";
  return { tanggal, idsubsls: typeof r.idsubsls === "string" && r.idsubsls ? r.idsubsls : null, n: Number(r.n) || 0, sumber };
}

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
    if (!ada.has(t)) continue;
    baris.push(barisDari(t, r));
  }
  return susunRealisasiOtomatis(baris, wilayah, satuan);
}

// (14 Okt 2026) Versi RINGAN untuk ringkasan Beranda/tahapan/pengingat (lib/portal/kegiatan.ts): sama seperti ambilRealisasiOtomatis tetapi
// nama wilayah hanya diambil untuk Sub SLS yang muncul di hasil (bukan seluruh master 5000 baris) dan hasilnya disimpan 30 detik per akun,
// karena ringkasan dimuat berkali-kali (Beranda tiap 10 menit, tahapan kegiatan tiap 45 detik). Kegagalan = kosong (tidak merusak halaman).
const CACHE_RINGAN = new Map<string, { at: number; data: Map<string, RealisasiOtomatis> }>();
const UMUR_CACHE_RINGAN_MS = 30_000;

export async function ambilRealisasiOtomatisRingan(db: Db, akunId: number, peran: string, kodeKegiatan: string, satuan: string, tanggal: string[]): Promise<Map<string, RealisasiOtomatis>> {
  if (!sumberUntukPeran(kodeKegiatan, peran) || tanggal.length === 0) return new Map();
  const kunci = `${akunId}|${peran}|${satuan}|${tanggal.join(",")}`;
  const sekarang = Date.now();
  const ada = CACHE_RINGAN.get(kunci);
  if (ada && sekarang - ada.at < UMUR_CACHE_RINGAN_MS) return ada.data;
  const { data, error } = await db.rpc("bencana_realisasi_otomatis", { p_akun: akunId, p_peran: peran });
  if (error) {
    console.error("[realisasiOtomatisRingan]", error.message);
    return new Map();
  }
  const set = new Set(tanggal);
  const baris: BarisOtomatis[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const t = String(r.tanggal ?? "").slice(0, 10);
    if (!set.has(t)) continue;
    baris.push(barisDari(t, r));
  }
  let wilayah: WilayahRingkas[] = [];
  const ids = Array.from(new Set(baris.map((b) => b.idsubsls).filter((x): x is string => !!x))).slice(0, 300);
  if (ids.length > 0) {
    const { data: w } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls").in("idsubsls", ids);
    wilayah = (w ?? []) as WilayahRingkas[];
  }
  const hasil = susunRealisasiOtomatis(baris, wilayah, satuan);
  if (CACHE_RINGAN.size > 500) CACHE_RINGAN.clear();
  CACHE_RINGAN.set(kunci, { at: sekarang, data: hasil });
  return hasil;
}

/** Master wilayah ringkas (kode Sub SLS -> kecamatan/nagari/SLS), dibaca per halaman 1000 baris. */
export async function ambilWilayahRingkas(db: Db): Promise<(WilayahRingkas & { sub_sls: string })[]> {
  const wil: (WilayahRingkas & { sub_sls: string })[] = [];
  for (let i = 0; i < 5000; i += 1000) {
    const { data: hal } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").order("idsubsls").range(i, i + 999);
    wil.push(...((hal ?? []) as typeof wil));
    if (!hal || hal.length < 1000) break;
  }
  return wil;
}
