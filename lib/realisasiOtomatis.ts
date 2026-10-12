// lib/realisasiOtomatis.ts
//
// (11 Okt 2026) Laporan realisasi harian PML/PPL terisi otomatis dari hasil lapangan di aplikasi -- permintaan user:
//  - PML  <- hasil identifikasi (Lembar Identifikasi): lokasi = jorong dari Sub SLS yang diidentifikasi hari itu, jumlah = banyak Sub SLS.
//  - PPL / korwil <- hasil pendataan (Lembar Pendataan KK): lokasi = jorong KK yang didata hari itu, jumlah = KK berhasil (terdampak + tidak terdampak).
// Isian otomatis hanya SARAN: petugas tetap menekan Simpan (laporan menentukan hak translok), dan boleh mengubahnya.
// Murni (tanpa DB/React) supaya mudah diuji.

export type SumberOtomatis = "identifikasi" | "pendataan";
export type LokasiRealisasi = { kecamatan: string; nagari: string; jorong: string; idsubsls?: string | null };
export type BarisOtomatis = { tanggal: string; idsubsls: string; n: number; sumber: SumberOtomatis };
export type WilayahRingkas = { idsubsls: string; kecamatan: string; nagari: string; sls: string };
export type RealisasiOtomatis = {
  sumber: SumberOtomatis;
  jumlah: number;
  satuan: string;
  lokasi: LokasiRealisasi[];
  /** jorong yang tidak muat di daftar lokasi (batas 10) */
  lokasi_terpotong: number;
};

/** Batas lokasi per laporan (sama dengan penyimpanan di API). */
export const MAKS_LOKASI = 10;

export const LABEL_SUMBER: Record<SumberOtomatis, string> = { identifikasi: "data identifikasi", pendataan: "data pendataan" };

/** Satuan angka laporan: PML Pendataan Pascabencana mengisi Sub SLS (hasil identifikasi), peran lain memakai satuan kegiatan. */
export function satuanLaporan(kodeKegiatan: string, peran: string, satuanKegiatan: string): string {
  return kodeKegiatan.startsWith("pascabencana") && peran === "pml" ? "Sub SLS" : satuanKegiatan;
}

/** Peran apa yang punya sumber otomatis (hanya Pendataan Pascabencana). */
export function sumberUntukPeran(kodeKegiatan: string, peran: string): SumberOtomatis | null {
  if (!kodeKegiatan.startsWith("pascabencana")) return null;
  if (peran === "pml") return "identifikasi";
  if (peran === "ppl" || peran === "korwil") return "pendataan";
  return null;
}

export const kunciLokasi = (l: { kecamatan: string; nagari: string; jorong: string }): string => `${l.kecamatan}|${l.nagari}|${l.jorong}`.toLowerCase();

/**
 * Kelompokkan baris hasil per tanggal menjadi isian laporan. Tanggal tanpa baris tidak ada di hasil.
 * Jumlah = jumlah n seluruh baris; lokasi = jorong (SLS) berbeda, terurut menurut wilayah, paling banyak MAKS_LOKASI.
 */
export function susunRealisasiOtomatis(baris: BarisOtomatis[], wilayah: WilayahRingkas[], satuan: string): Map<string, RealisasiOtomatis> {
  const peta = new Map(wilayah.map((w) => [w.idsubsls, w]));
  const per = new Map<string, BarisOtomatis[]>();
  for (const b of baris) {
    if (!(b.n > 0)) continue;
    const a = per.get(b.tanggal);
    if (a) a.push(b);
    else per.set(b.tanggal, [b]);
  }
  const hasil = new Map<string, RealisasiOtomatis>();
  for (const [tanggal, rows] of per) {
    const lokasiPer = new Map<string, LokasiRealisasi>();
    let jumlah = 0;
    for (const r of rows) {
      jumlah += r.n;
      const w = peta.get(r.idsubsls);
      if (!w) continue;
      const l: LokasiRealisasi = { kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls, idsubsls: w.idsubsls };
      const k = kunciLokasi(l);
      const lama = lokasiPer.get(k);
      if (!lama || w.idsubsls < (lama.idsubsls ?? "")) lokasiPer.set(k, l);
    }
    const semua = [...lokasiPer.values()].sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.jorong.localeCompare(b.jorong));
    hasil.set(tanggal, { sumber: rows[0].sumber, jumlah, satuan, lokasi: semua.slice(0, MAKS_LOKASI), lokasi_terpotong: Math.max(0, semua.length - MAKS_LOKASI) });
  }
  return hasil;
}

export type PerbandinganOtomatis = { lokasiSama: boolean; jumlahSama: boolean; semuaSama: boolean };

/** Bandingkan isian (form atau laporan tersimpan) dengan saran otomatis. Jumlah kosong dianggap tidak sama. */
export function bandingkanOtomatis(isian: { lokasi: { kecamatan: string; nagari: string; jorong: string }[]; jumlah: number | null }, oto: RealisasiOtomatis): PerbandinganOtomatis {
  const a = new Set(isian.lokasi.map(kunciLokasi));
  const b = new Set(oto.lokasi.map(kunciLokasi));
  const lokasiSama = a.size === b.size && [...a].every((x) => b.has(x));
  const jumlahSama = isian.jumlah === oto.jumlah;
  return { lokasiSama, jumlahSama, semuaSama: lokasiSama && jumlahSama };
}

/**
 * (12 Okt 2026, permintaan user) Hari LAMPAU (sebelum hari ini WIB) yang petugasnya tidak membuat laporan manual tetapi sudah
 * mengerjakan identifikasi (PML) / pendataan (PPL, korwil) DIANGGAP sudah menyelesaikan laporan. Dokumentasi foto tetap mengikuti aturan kegiatan.
 * Hari ini & hari mendatang tidak dianggap: petugas masih bisa mengonfirmasi/mengubah isiannya.
 */
export function laporanDianggap(tanggal: string, hariIni: string, adaLaporanManual: boolean, oto: { jumlah: number } | null | undefined): boolean {
  return !adaLaporanManual && tanggal < hariIni && !!oto && oto.jumlah > 0;
}

/** Catatan pada laporan yang dianggap otomatis (tampil di PDF Laporan sebagai Kendala). */
export function catatanDianggap(sumber: SumberOtomatis): string {
  return `Laporan dibuat otomatis dari ${LABEL_SUMBER[sumber]} (petugas tidak mengisi laporan manual).`;
}
