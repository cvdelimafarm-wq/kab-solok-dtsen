// lib/realisasiOtomatis.ts
//
// (11 Okt 2026) Laporan realisasi harian PML/PPL terisi otomatis dari hasil lapangan di aplikasi -- permintaan user:
//  - PML  <- hasil identifikasi (Lembar Identifikasi): lokasi = jorong dari Sub SLS yang diidentifikasi hari itu, jumlah = banyak Sub SLS.
//  - PPL <- hasil pendataan (Lembar Pendataan KK): lokasi = jorong KK yang didata hari itu, jumlah = KK berhasil (terdampak + tidak terdampak).
//  - (27 Okt 2026, permintaan user) KORWIL <- Lembar Quality Check (kuesioner supervisi): jumlah = lembar QC yang disimpan korwil hari itu (sigap_qc_lembar).
//    Lokasi hanya ada bila lembarnya menunjuk KK (objek "kk"); lembar objek "petugas" tidak punya lokasi, jadi korwil mengisi lokasi sendiri.
//    Hari SEBELUM tanggal mulai QC (BATAS_QC_KORWIL, lihat migrasi 20261027e) tetap memakai data pendataan lama supaya "laporan dianggap" hari lampau tidak hilang.
//  - (31 Okt 2026, permintaan user) SPDT NTP (PPL & PML) <- menu Sampel: jumlah = KK berbeda yang koordinatnya dibuka akun itu hari itu (sigap_spdt_buka),
//    lokasi = jorong KK tersebut. Data menu cukup untuk mengisi laporan harian Translok; petugas boleh mengubahnya dan menambah catatan (Kendala).
// Isian otomatis hanya SARAN: petugas tetap menekan Simpan (laporan menentukan hak translok), dan boleh mengubahnya.
// Murni (tanpa DB/React) supaya mudah diuji.

export type SumberOtomatis = "identifikasi" | "pendataan" | "qc" | "spdt";
export type LokasiRealisasi = { kecamatan: string; nagari: string; jorong: string; idsubsls?: string | null };
export type BarisOtomatis = { tanggal: string; idsubsls: string | null; n: number; sumber: SumberOtomatis };
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

export const LABEL_SUMBER: Record<SumberOtomatis, string> = { identifikasi: "data identifikasi", pendataan: "data pendataan", qc: "Lembar Quality Check", spdt: "koordinat KK yang dibuka di menu Sampel" };

/** Tanggal (WIB) mulai korwil dihitung dari Lembar Quality Check; sebelum ini tetap dari data pendataan. Harus sama dengan tanggal di migrasi 20261027e. */
export const BATAS_QC_KORWIL = "2026-10-27";
/** Satuan angka laporan korwil (jumlah lembar QC LENGKAP yang disimpan). */
export const SATUAN_QC = "lembar QC";
/** Satuan hari lampau korwil yang masih dari data pendataan (sebelum Lembar Quality Check dipakai). */
export const SATUAN_PENDATAAN_LAMA = "keluarga";

/** Satuan angka laporan: PML Pendataan Pascabencana mengisi Sub SLS (hasil identifikasi), korwil mengisi lembar QC, peran lain memakai satuan kegiatan. */
export function satuanLaporan(kodeKegiatan: string, peran: string, satuanKegiatan: string): string {
  if (!kodeKegiatan.startsWith("pascabencana")) return satuanKegiatan;
  if (peran === "pml") return "Sub SLS";
  if (peran === "korwil") return SATUAN_QC;
  return satuanKegiatan;
}

/**
 * Satuan angka laporan PADA TANGGAL tertentu. Sama dengan satuanLaporan, kecuali korwil sebelum BATAS_QC_KORWIL: hari itu angkanya KK (satuan kegiatan),
 * bukan lembar QC. Dipakai di semua tempat yang menampilkan angka satu hari (kartu hari, detail admin, PDF laporan).
 */
export function satuanLaporanTanggal(kodeKegiatan: string, peran: string, satuanKegiatan: string, tanggal: string): string {
  if (kodeKegiatan.startsWith("pascabencana") && peran === "korwil" && tanggal < BATAS_QC_KORWIL) return satuanKegiatan;
  return satuanLaporan(kodeKegiatan, peran, satuanKegiatan);
}

/** Peran apa yang punya sumber otomatis (hanya Pendataan Pascabencana). */
export function sumberUntukPeran(kodeKegiatan: string, peran: string): SumberOtomatis | null {
  if (kodeKegiatan.startsWith("spdt_ntp")) return peran === "ppl" || peran === "pml" ? "spdt" : null;
  if (!kodeKegiatan.startsWith("pascabencana")) return null;
  if (peran === "pml") return "identifikasi";
  if (peran === "ppl") return "pendataan";
  if (peran === "korwil") return "qc";
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
      const w = r.idsubsls ? peta.get(r.idsubsls) : undefined;
      if (!w) continue;
      const l: LokasiRealisasi = { kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls, idsubsls: w.idsubsls };
      const k = kunciLokasi(l);
      const lama = lokasiPer.get(k);
      if (!lama || w.idsubsls < (lama.idsubsls ?? "")) lokasiPer.set(k, l);
    }
    const semua = [...lokasiPer.values()].sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.jorong.localeCompare(b.jorong));
    const sumberHari = rows[0].sumber;
    // korwil: hari lampau dari pendataan memakai satuan lama (keluarga), hari QC memakai "lembar QC"
    const satuanHari = sumberHari === "pendataan" && satuan === SATUAN_QC ? SATUAN_PENDATAAN_LAMA : satuan;
    hasil.set(tanggal, { sumber: sumberHari, jumlah, satuan: satuanHari, lokasi: semua.slice(0, MAKS_LOKASI), lokasi_terpotong: Math.max(0, semua.length - MAKS_LOKASI) });
  }
  return hasil;
}

/** Baris log "koordinat KK dibuka" (sigap_spdt_buka) bersama wilayah KK-nya. */
export type BukaSpdt = { tanggal: string; kk_id: number; kecamatan: string; nagari: string; jorong: string };

/** SPDT NTP: jumlah = KK berbeda yang dibuka per tanggal; lokasi = jorong berbeda (maks MAKS_LOKASI). Tanggal tanpa baris tidak ada di hasil. */
export function susunRealisasiSpdt(baris: BukaSpdt[], satuan: string): Map<string, RealisasiOtomatis> {
  const per = new Map<string, BukaSpdt[]>();
  for (const b of baris) {
    const a = per.get(b.tanggal);
    if (a) a.push(b);
    else per.set(b.tanggal, [b]);
  }
  const hasil = new Map<string, RealisasiOtomatis>();
  for (const [tanggal, rows] of per) {
    const kk = new Set(rows.map((r) => r.kk_id));
    const lok = new Map<string, LokasiRealisasi>();
    for (const r of rows) {
      const l: LokasiRealisasi = { kecamatan: r.kecamatan, nagari: r.nagari, jorong: r.jorong, idsubsls: null };
      if (!lok.has(kunciLokasi(l))) lok.set(kunciLokasi(l), l);
    }
    const semua = [...lok.values()].sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.jorong.localeCompare(b.jorong));
    hasil.set(tanggal, { sumber: "spdt", jumlah: kk.size, satuan, lokasi: semua.slice(0, MAKS_LOKASI), lokasi_terpotong: Math.max(0, semua.length - MAKS_LOKASI) });
  }
  return hasil;
}

export type PerbandinganOtomatis = { lokasiSama: boolean; jumlahSama: boolean; semuaSama: boolean };

/** Bandingkan isian (form atau laporan tersimpan) dengan saran otomatis. Jumlah kosong dianggap tidak sama. */
export function bandingkanOtomatis(isian: { lokasi: { kecamatan: string; nagari: string; jorong: string }[]; jumlah: number | null }, oto: RealisasiOtomatis): PerbandinganOtomatis {
  const a = new Set(isian.lokasi.map(kunciLokasi));
  const b = new Set(oto.lokasi.map(kunciLokasi));
  // sumber tanpa lokasi (lembar QC objek petugas): tidak ada yang dibandingkan, lokasi isian petugas dianggap sesuai
  const lokasiSama = b.size === 0 || (a.size === b.size && [...a].every((x) => b.has(x)));
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
