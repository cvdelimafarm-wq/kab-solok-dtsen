// lib/translokSusulan.ts  (murni; dipakai server dan klien)
//
// (3 Nov 2026) "Ajukan susulan": petugas translok mengajukan melengkapi foto/laporan sebuah hari lampau, atau menambah hari kerja yang terlewat dipilih
// lalu melengkapinya lewat unggah. Basis data: sigap_translok_susulan (SQL 20261103c). Keputusan pemilik:
//   - Penyetuju: salah satu dari 2 atasan terdekat yang ADA pada rantai PML -> Korwil -> Supervisor -> PJ kegiatan (tingkat kosong dilewati); admin translok juga boleh.
//   - Jendela susulan 1 hari (24 jam sejak disetujui).
//   - Hari yang disusulkan dibayar penuh bila dilengkapi dalam jendela (aturan lama: hari lampau lengkap / sedang izin susulan masuk Kwitansi).
// Disetujui = sistem membuat (bila belum ada) hari kerja + izin susulan (sigap_izin_susulan) berbatas waktu; foto lewat unggah, laporan lewat formulir yang sudah ada.

import { rapikanTeks } from "@/lib/translokBlokir";

export type StatusSusulan = "diajukan" | "disetujui" | "ditolak" | "dibatalkan";
/** tambah = hari itu belum hari kerja (dibuatkan); lengkapi = hari kerja sudah ada, hanya butuh izin. */
export type ModeSusulan = "tambah" | "lengkapi";

export type BarisSusulan = {
  id: number;
  kegiatan_id: number;
  penugasan_id: number;
  akun_id: number;
  tanggal: string;
  alasan: string;
  status: StatusSusulan;
  mode: ModeSusulan | null;
  diajukan_at: string;
  keputusan_oleh: string | null;
  keputusan_at: string | null;
  keputusan_catatan: string | null;
  izin_sampai: string | null;
};

export const KOLOM_SUSULAN = "id, kegiatan_id, penugasan_id, akun_id, tanggal, alasan, status, mode, diajukan_at, keputusan_oleh, keputusan_at, keputusan_catatan, izin_sampai";

export const JENDELA_SUSULAN_JAM = 24;
export const MIN_ALASAN_SUSULAN = 10;
export const MAKS_ALASAN_SUSULAN = 500;
export const MAKS_CATATAN_SUSULAN = 300;
/** Pengaman: paling banyak sekian tanggal ke belakang yang ditawarkan di lembar pengajuan. */
export const MAKS_TANGGAL_KANDIDAT = 62;

export function tanggalValid(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type HasilAlasan = { ok: true; alasan: string } | { ok: false; pesan: string };
export function cekAlasanSusulan(v: unknown): HasilAlasan {
  const a = rapikanTeks(v, MAKS_ALASAN_SUSULAN);
  return a.length < MIN_ALASAN_SUSULAN ? { ok: false, pesan: `Tulis alasan susulan minimal ${MIN_ALASAN_SUSULAN} huruf (apa yang terlewat dan mengapa).` } : { ok: true, alasan: a };
}

// ---------------------------------------------------------------- aturan pengajuan
export type FaktaPengajuan = {
  tanggal: string;
  hariIni: string;
  periode: { mulai: string | null; selesai: string | null };
  jenisKegiatan: string | null;
  /** SPJ penugasan sudah diverifikasi dan dikunci admin */
  dikunci: boolean;
  /** kegiatan sudah lewat masa tenggang (arsip baca-saja) */
  arsip: boolean;
  /** akun sedang diblokir sementara pada kegiatan ini */
  diblokir: boolean;
  /** tanggal itu sudah hari kerja pada penugasan ini */
  adaHariKerja: boolean;
  /** tanggal itu sudah menjadi hari kerja akun ini pada kegiatan LAIN (satu orang satu tanggal satu kegiatan) */
  dipakaiKegiatanLain: boolean;
  jumlahHariKerjaAktif: number;
  maksHari: number | null;
  /** hari itu sudah lengkap (laporan bila wajib + foto sesuai aturan) */
  lengkap: boolean;
  /** sudah ada izin susulan yang masih berlaku untuk tanggal itu */
  izinAktif: boolean;
  /** sudah ada pengajuan yang menunggu keputusan untuk tanggal itu */
  pengajuanTerbuka: boolean;
};

export type HasilPengajuan = { ok: true; mode: ModeSusulan } | { ok: false; pesan: string };

export function cekPengajuan(f: FaktaPengajuan): HasilPengajuan {
  const tolak = (pesan: string): HasilPengajuan => ({ ok: false, pesan });
  if (!tanggalValid(f.tanggal)) return tolak("Tanggal tidak valid.");
  if (f.dikunci) return tolak("SPJ kegiatan ini sudah diverifikasi dan dikunci admin. Data tidak dapat diubah lagi.");
  if (f.arsip) return tolak("Kegiatan ini sudah ditutup dan menjadi arsip baca-saja. Hubungi PJ kegiatan atau admin anggaran.");
  if (f.diblokir) return tolak("Akses translok Anda sedang diblokir sementara.");
  if (f.jenisKegiatan === "pelatihan") return tolak("Susulan tidak berlaku untuk pelatihan. Hari pelatihan diatur panitia di Kelola Pelatihan.");
  if (f.tanggal >= f.hariIni) return tolak("Susulan hanya untuk tanggal yang sudah lewat. Hari ini dan hari mendatang bisa langsung dipilih atau diisi.");
  if (!f.periode.mulai || !f.periode.selesai) return tolak("Periode kegiatan belum ditetapkan admin anggaran.");
  if (f.tanggal < f.periode.mulai || f.tanggal > f.periode.selesai) return tolak("Tanggal itu di luar periode kegiatan.");
  if (f.dipakaiKegiatanLain) return tolak("Tanggal itu sudah menjadi hari kerja Anda di kegiatan lain.");
  if (f.izinAktif) return tolak("Tanggal itu sedang diberi izin susulan. Lengkapi saja sekarang.");
  if (f.pengajuanTerbuka) return tolak("Pengajuan untuk tanggal itu masih menunggu persetujuan.");
  if (f.adaHariKerja && f.lengkap) return tolak("Tanggal itu sudah lengkap. Tidak ada yang perlu disusulkan.");
  if (!f.adaHariKerja && f.maksHari && f.jumlahHariKerjaAktif >= f.maksHari) {
    return tolak(`Kuota hari kerja Anda penuh (${f.maksHari} hari). Lepaskan satu hari yang terlewat di menu Hari Kerja, lalu ajukan lagi.`);
  }
  return { ok: true, mode: f.adaHariKerja ? "lengkapi" : "tambah" };
}

/** Batas berlaku izin yang diberikan sekarang. */
export function izinSampaiIso(sekarangMs: number, jam = JENDELA_SUSULAN_JAM): string {
  return new Date(sekarangMs + jam * 3_600_000).toISOString();
}

/** Tanggal kandidat (terbaru dulu): dari hari kemarin mundur sampai awal periode, paling banyak MAKS_TANGGAL_KANDIDAT. */
export function tanggalKandidat(periode: { mulai: string | null; selesai: string | null }, hariIni: string, maks = MAKS_TANGGAL_KANDIDAT): string[] {
  if (!tanggalValid(hariIni) || !periode.mulai || !periode.selesai || !tanggalValid(periode.mulai) || !tanggalValid(periode.selesai)) return [];
  const akhir = periode.selesai < hariIni ? periode.selesai : (() => {
    const d = new Date(`${hariIni}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const hasil: string[] = [];
  const d = new Date(`${akhir}T00:00:00Z`);
  while (hasil.length < maks) {
    const t = d.toISOString().slice(0, 10);
    if (t < periode.mulai) break;
    hasil.push(t);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return hasil;
}

// ---------------------------------------------------------------- penyetuju (2 level atasan)
/**
 * Tingkat atasan pengaju, dari yang terdekat: tiap atasan pada rantai (PML, lalu Korwil, ...) satu tingkat sendiri, lalu kelompok Supervisor, lalu kelompok PJ
 * kegiatan. Pengaju sendiri dan akun yang sudah muncul di tingkat sebelumnya dibuang; tingkat kosong dilewati.
 */
export function susunLevel(rantai: readonly number[], supervisor: readonly number[], pj: readonly number[], pengaju: number): number[][] {
  const dipakai = new Set<number>([pengaju]);
  const hasil: number[][] = [];
  const tambah = (ids: readonly number[]) => {
    const l = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0 && !dipakai.has(x)))].sort((a, b) => a - b);
    if (!l.length) return;
    l.forEach((x) => dipakai.add(x));
    hasil.push(l);
  };
  for (const a of rantai) tambah([a]);
  tambah(supervisor);
  tambah(pj);
  return hasil;
}

/** Penyetuju sah = gabungan dua tingkat terdekat. */
export function penyetujuDuaLevel(levels: readonly (readonly number[])[], jumlahLevel = 2): number[] {
  return [...new Set(levels.slice(0, jumlahLevel).flat())].sort((a, b) => a - b);
}

export function bolehMemutuskanSusulan(penyetuju: readonly number[], aktor: number, pengaju: number, adminTranslok = false): boolean {
  if (aktor === pengaju) return false;
  return adminTranslok || penyetuju.includes(aktor);
}

// ---------------------------------------------------------------- teks
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
/** "2026-10-28" -> "Rab, 28 Okt 2026" */
export function tanggalIndo(t: string): string {
  if (!tanggalValid(t)) return t;
  const d = new Date(`${t}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "sisa 5 jam 20 menit" / "sisa 40 menit" / "berakhir". */
export function sisaJendelaTeks(izinSampai: string | null, sekarangMs: number): string {
  if (!izinSampai) return "";
  const akhir = new Date(izinSampai).getTime();
  if (!Number.isFinite(akhir) || akhir <= sekarangMs) return "berakhir";
  const menit = Math.max(1, Math.floor((akhir - sekarangMs) / 60_000));
  if (menit < 60) return `sisa ${menit} menit`;
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return m ? `sisa ${j} jam ${m} menit` : `sisa ${j} jam`;
}

export type TampilStatus = { label: string; nada: "emas" | "hijau" | "merah" | "abu"; aktif: boolean };
export function statusTampil(b: Pick<BarisSusulan, "status" | "izin_sampai" | "keputusan_oleh" | "keputusan_catatan">, sekarangMs: number): TampilStatus {
  if (b.status === "diajukan") return { label: "Menunggu persetujuan", nada: "emas", aktif: false };
  if (b.status === "disetujui") {
    const sisa = sisaJendelaTeks(b.izin_sampai, sekarangMs);
    return sisa && sisa !== "berakhir"
      ? { label: `Disetujui, lengkapi sekarang (${sisa})`, nada: "hijau", aktif: true }
      : { label: "Disetujui, jendela susulan sudah berakhir", nada: "abu", aktif: false };
  }
  if (b.status === "ditolak") {
    const oleh = b.keputusan_oleh ? ` oleh ${b.keputusan_oleh}` : "";
    const cat = b.keputusan_catatan ? `: ${b.keputusan_catatan}` : "";
    return { label: `Ditolak${oleh}${cat}`, nada: "merah", aktif: false };
  }
  return { label: "Dibatalkan", nada: "abu", aktif: false };
}

export function pesanPengajuanSusulan(nama: string, kegiatan: string, tanggal: string): { judul: string; isi: string } {
  const n = rapikanTeks(nama, 60) || "Petugas";
  return { judul: "Pengajuan susulan translok", isi: `${n} mengajukan susulan untuk ${tanggalIndo(tanggal)}${kegiatan ? ` (${rapikanTeks(kegiatan, 80)})` : ""}. Buka tab Hari ini untuk menyetujui atau menolak.` };
}
export function pesanKeputusanSusulan(setuju: boolean, oleh: string, tanggal: string): { judul: string; isi: string } {
  const o = rapikanTeks(oleh, 60) || "Atasan";
  return setuju
    ? { judul: "Susulan disetujui", isi: `${o} menyetujui susulan ${tanggalIndo(tanggal)}. Lengkapi foto dan laporan dalam ${JENDELA_SUSULAN_JAM} jam.` }
    : { judul: "Susulan ditolak", isi: `${o} belum dapat menyetujui susulan ${tanggalIndo(tanggal)}. Hubungi PML atau admin.` };
}

/** Terlama dulu. */
export function urutkanSusulan<T extends { diajukan_at: string; id: number }>(daftar: readonly T[]): T[] {
  return [...daftar].sort((a, b) => a.diajukan_at.localeCompare(b.diajukan_at) || a.id - b.id);
}
