// lib/lapangan.ts
//
// (11 Okt 2026) Monitoring Lapangan (admin): hasil identifikasi (PML), pendataan (PPL), dan status translok per orang per tanggal
// -- permintaan user. Fungsi murni (tanpa database) supaya mudah diuji; data baris datang dari fungsi database bencana_monitoring_lapangan.
//  - Jumlah berhasil: PPL = KK terdampak + tidak terdampak; PML = Sub SLS yang sudah diidentifikasi.
//  - Status lapangan: "identifikasi" (PML) / "pendataan" (PPL) bila ada jumlah berhasil pada tanggal itu; selain itu "belum" (semua petugas berwilayah tetap tampil).
//  - "Tidak ditemukan" tidak dihitung sebagai berhasil, tetapi dianggap aktivitas lapangan saat menilai anomali translok.
//  - Status translok dari hari kerja yang dipilih + laporan harian + foto dokumentasi (aturan kegiatan Pendataan).

import { hariLengkap, type AturanIsian } from "@/lib/sigap";

export type PeranLapangan = "pml" | "ppl" | "korwil"; // korwil = pegawai organik (bukan PML/PPL) yang bertindak sebagai koordinator wilayah

/** Satu baris hasil fungsi database (orang × tanggal). */
export type BarisLapangan = {
  akun_id: number;
  nama: string;
  peran: PeranLapangan;
  pml_id: number | null;
  pml_nama: string | null;
  tanggal: string; // YYYY-MM-DD (WIB)
  sub_idf: number; // Sub SLS diidentifikasi pada tanggal itu
  kk_berhasil: number; // KK terdampak + tidak terdampak pada tanggal itu
  kk_tdk_ditemukan: number;
  agg_sub: number; // kumulatif sampai tanggal baris
  agg_kk: number;
  hari_kerja: boolean;
  ada_laporan: boolean;
  jumlah_foto: number;
};

export type StatusLapangan = "identifikasi" | "pendataan" | "belum";
export type StatusTranslok = "lengkap" | "sebagian" | "anomali" | "tidak_ada";

export const LABEL_LAPANGAN: Record<PeranLapangan, { hasil: string; satuan: string }> = {
  pml: { hasil: "Identifikasi", satuan: "Sub SLS" },
  ppl: { hasil: "Pendataan", satuan: "KK" },
  korwil: { hasil: "Pendataan", satuan: "KK" },
};
export const LABEL_PERAN: Record<PeranLapangan, string> = { pml: "PML", ppl: "PPL", korwil: "Korwil" };
export const LABEL_STATUS_TRANSLOK: Record<StatusTranslok, string> = {
  lengkap: "Lengkap",
  sebagian: "Sebagian",
  anomali: "Anomali",
  tidak_ada: "Tidak ada klaim",
};

/** Jumlah berhasil pada tanggal baris: PML = Sub SLS diidentifikasi, PPL = KK berhasil. */
export function jumlahBerhasil(b: Pick<BarisLapangan, "peran" | "sub_idf" | "kk_berhasil">): number {
  return b.peran === "pml" ? b.sub_idf : b.kk_berhasil;
}
/** Agregat (kumulatif) sampai tanggal baris. */
export function jumlahAgregat(b: Pick<BarisLapangan, "peran" | "agg_sub" | "agg_kk">): number {
  return b.peran === "pml" ? b.agg_sub : b.agg_kk;
}

export const LABEL_STATUS_LAPANGAN: Record<StatusLapangan, string> = { identifikasi: "Ada identifikasi", pendataan: "Ada pendataan", belum: "Belum ada hasil" };

/**
 * KK berhasil yang DIHITUNG: PML tidak (ukuran PML hanya Sub SLS diidentifikasi -- keputusan user 11 Okt 2026).
 * Penandaan KK oleh PML di Lembar Pendataan tetap tersimpan, hanya tidak masuk angka Monitoring Lapangan.
 */
export function kkDihitung(b: Pick<BarisLapangan, "peran" | "kk_berhasil">): number {
  return b.peran === "pml" ? 0 : b.kk_berhasil;
}

/** PML = identifikasi bila ada Sub SLS diidentifikasi; PPL/korwil = pendataan bila ada KK berhasil. */
export function statusLapangan(b: BarisLapangan): StatusLapangan {
  if (b.peran === "pml") return b.sub_idf > 0 ? "identifikasi" : "belum";
  return b.kk_berhasil > 0 ? "pendataan" : "belum";
}

/** Ada aktivitas lapangan pada tanggal itu (termasuk KK "tidak ditemukan" yang tidak dihitung berhasil). */
export function adaAktivitas(b: BarisLapangan): boolean {
  return b.sub_idf > 0 || b.kk_berhasil > 0 || b.kk_tdk_ditemukan > 0;
}

/**
 * Status translok satu baris (mengikuti mockup yang dilihat user):
 *  - tidak_ada : tanpa hari kerja, tanpa laporan/foto, tanpa hasil lapangan.
 *  - anomali   : ada hasil lapangan/laporan/foto tanpa hari kerja dipilih, ATAU hari kerja dipilih tetapi tidak ada hasil lapangan sama sekali (korwil dikecualikan: hari kerja tanpa hasil tetap wajar).
 *  - sebagian  : hari kerja dipilih, ada hasil, tetapi laporan/foto belum memenuhi aturan kegiatan.
 *  - lengkap   : hari kerja dipilih, ada hasil, laporan + foto memenuhi aturan kegiatan.
 */
export function statusTranslok(b: BarisLapangan, aturan: AturanIsian): StatusTranslok {
  const aktif = adaAktivitas(b);
  // Korwil mengoordinasi/mengawasi: hasil lapangan tidak diwajibkan, jadi hari kerja tanpa hasil bukan anomali
  if (b.peran === "korwil") {
    if (!b.hari_kerja) return aktif || b.ada_laporan || b.jumlah_foto > 0 ? "anomali" : "tidak_ada";
    return hariLengkap(b.ada_laporan, b.jumlah_foto, aturan) ? "lengkap" : "sebagian";
  }
  if (!b.hari_kerja) return aktif || b.ada_laporan || b.jumlah_foto > 0 ? "anomali" : "tidak_ada";
  if (!aktif) return "anomali";
  return hariLengkap(b.ada_laporan, b.jumlah_foto, aturan) ? "lengkap" : "sebagian";
}

/** Alasan singkat untuk status anomali (tooltip/keterangan). */
export function alasanAnomali(b: BarisLapangan, aturan: AturanIsian): string {
  if (statusTranslok(b, aturan) !== "anomali") return "";
  return b.hari_kerja ? "Hari kerja dipilih tetapi belum ada hasil lapangan" : "Ada hasil/laporan/foto tetapi hari kerja tidak dipilih";
}

export type SaringanLapangan = {
  peran: "semua" | PeranLapangan;
  pml_id: number | null; // tim: satu PML beserta PPL-nya
  cari: string;
  dari: string | null;
  sampai: string | null;
  lapangan: "semua" | StatusLapangan;
  translok: "semua" | StatusTranslok;
};
export const SARINGAN_AWAL: SaringanLapangan = { peran: "semua", pml_id: null, cari: "", dari: null, sampai: null, lapangan: "semua", translok: "semua" };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function saring(baris: BarisLapangan[], s: SaringanLapangan, aturan: AturanIsian): BarisLapangan[] {
  const q = norm(s.cari);
  return baris.filter((b) => {
    if (s.peran !== "semua" && b.peran !== s.peran) return false;
    if (s.pml_id != null && b.pml_id !== s.pml_id) return false;
    if (s.dari && b.tanggal < s.dari) return false;
    if (s.sampai && b.tanggal > s.sampai) return false;
    if (q && !norm(b.nama).includes(q) && !norm(b.pml_nama ?? "").includes(q)) return false;
    if (s.lapangan !== "semua" && statusLapangan(b) !== s.lapangan) return false;
    if (s.translok !== "semua" && statusTranslok(b, aturan) !== s.translok) return false;
    return true;
  });
}

export type KunciUrut = "tanggal" | "nama" | "berhasil" | "agregat";
/** Urut stabil; seri diurut tanggal terbaru lalu nama. */
export function urutkan(baris: BarisLapangan[], kunci: KunciUrut, turun: boolean): BarisLapangan[] {
  const arah = turun ? -1 : 1;
  const nilai = (b: BarisLapangan): number | string => (kunci === "tanggal" ? b.tanggal : kunci === "nama" ? norm(b.nama) : kunci === "berhasil" ? jumlahBerhasil(b) : jumlahAgregat(b));
  return [...baris].sort((a, b) => {
    const x = nilai(a);
    const y = nilai(b);
    if (x < y) return -1 * arah;
    if (x > y) return 1 * arah;
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return norm(a.nama).localeCompare(norm(b.nama));
  });
}

export type RingkasLapangan = {
  baris: number;
  orang: number;
  orang_berhasil: number; // orang yang punya hasil minimal sekali pada baris tersaring
  sub_idf: number; // jumlah Sub SLS diidentifikasi (PML)
  kk_berhasil: number; // jumlah KK terdampak + tidak terdampak (PPL dan korwil; penandaan oleh PML tidak dihitung)
  kk_oleh_pml: number; // KK berhasil yang ditandai PML (tidak dihitung, sekadar info)
  kk_tdk_ditemukan: number;
  translok: Record<StatusTranslok, number>;
  belum_ada_hasil: number; // baris tanpa hasil
};

export function ringkas(baris: BarisLapangan[], aturan: AturanIsian): RingkasLapangan {
  const r: RingkasLapangan = { baris: baris.length, orang: 0, orang_berhasil: 0, sub_idf: 0, kk_berhasil: 0, kk_oleh_pml: 0, kk_tdk_ditemukan: 0, translok: { lengkap: 0, sebagian: 0, anomali: 0, tidak_ada: 0 }, belum_ada_hasil: 0 };
  const orang = new Set<number>();
  const berhasil = new Set<number>();
  for (const b of baris) {
    orang.add(b.akun_id);
    r.sub_idf += b.sub_idf;
    r.kk_berhasil += kkDihitung(b);
    if (b.peran === "pml") r.kk_oleh_pml += b.kk_berhasil;
    if (b.peran !== "pml") r.kk_tdk_ditemukan += b.kk_tdk_ditemukan;
    r.translok[statusTranslok(b, aturan)] += 1;
    if (statusLapangan(b) !== "belum") berhasil.add(b.akun_id);
    else r.belum_ada_hasil += 1;
  }
  r.orang = orang.size;
  r.orang_berhasil = berhasil.size;
  return r;
}

/** Agregat terakhir tiap orang pada baris tersaring (baris dengan tanggal terbaru), dijumlahkan: Sub SLS (PML) dan KK (PPL). */
export function agregatAkhir(baris: BarisLapangan[]): { sub: number; kk: number } {
  const akhir = new Map<number, BarisLapangan>();
  for (const b of baris) {
    const a = akhir.get(b.akun_id);
    if (!a || b.tanggal > a.tanggal) akhir.set(b.akun_id, b);
  }
  let sub = 0;
  let kk = 0;
  for (const b of akhir.values()) {
    if (b.peran === "pml") sub += b.agg_sub;
    else kk += b.agg_kk;
  }
  return { sub, kk };
}

/** Daftar tim (PML) untuk pilihan saringan, urut nama. */
export function daftarTim(baris: BarisLapangan[]): { id: number; nama: string }[] {
  const m = new Map<number, string>();
  for (const b of baris) if (b.pml_id != null && !m.has(b.pml_id)) m.set(b.pml_id, b.pml_nama ?? `PML ${b.pml_id}`);
  return [...m.entries()].map(([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama));
}

/** Tanggal YYYY-MM-DD digeser n hari (aman terhadap zona waktu: dihitung di UTC). */
export function geserTanggal(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Periksa & rapikan rentang tanggal dari query string. null = tidak dibatasi. */
export function periksaRentang(dari: unknown, sampai: unknown): { ok: true; dari: string | null; sampai: string | null } | { ok: false; pesan: string } {
  const sah = (v: unknown): string | null | false => {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? false : v;
  };
  const a = sah(dari);
  const z = sah(sampai);
  if (a === false || z === false) return { ok: false, pesan: "Format tanggal harus YYYY-MM-DD." };
  if (a && z && a > z) return { ok: false, pesan: "Tanggal mulai tidak boleh setelah tanggal akhir." };
  return { ok: true, dari: a, sampai: z };
}
