// lib/sigapRapat.ts
//
// (9 Okt 2026) SIGAP -- presensi rapat Zoom (modal di aplikasi petugas + token). Logika murni (tanpa DB) supaya bisa diuji.
// Permintaan user: petugas menekan "Hadir" di modal, tetapi hadir hanya sah bila mengetik token rapat (bawaan "psp2026").
// Token diperiksa di SERVER; token tidak pernah dikirim ke klien petugas.

export type PeranSasaran = "semua" | "ppl" | "pml";

export type Rapat = {
  id: number;
  judul: string;
  aktif: boolean;
  mulai_at: string;
  selesai_at: string;
  tautan: string | null;
  meeting_id: string | null;
  passcode: string | null;
  token: string;
  buka_menit: number;
  tutup_menit: number;
  sasaran_peran: PeranSasaran;
  sasaran_kegiatan_id: number;
  /** (9 Okt 2026) akun di luar daftar PPL/PML yang tetap boleh presensi (mis. admin/panitia). */
  akun_tambahan: number[];
};

export const KOLOM_RAPAT = "id, judul, aktif, mulai_at, selesai_at, tautan, meeting_id, passcode, token, buka_menit, tutup_menit, sasaran_peran, sasaran_kegiatan_id, akun_tambahan";

/** Batas percobaan token salah: 5 kali per 10 menit per petugas per rapat. */
export const BATAS_SALAH = 5;
export const JENDELA_SALAH_MS = 10 * 60_000;

export type StatusRapat = "belum" | "buka" | "sudah" | "tutup" | "nonaktif";

/** Jendela hadir: [mulai - buka_menit, selesai + tutup_menit). */
export function jendelaRapat(r: Pick<Rapat, "mulai_at" | "selesai_at" | "buka_menit" | "tutup_menit">): { buka: number; tutup: number } {
  return { buka: new Date(r.mulai_at).getTime() - r.buka_menit * 60_000, tutup: new Date(r.selesai_at).getTime() + r.tutup_menit * 60_000 };
}

export function statusRapat(r: Rapat, sudahHadir: boolean, sekarangMs: number): StatusRapat {
  if (!r.aktif) return "nonaktif";
  if (sudahHadir) return "sudah";
  const { buka, tutup } = jendelaRapat(r);
  if (sekarangMs < buka) return "belum";
  if (sekarangMs >= tutup) return "tutup";
  return "buka";
}

/** Rapat tampil di modal bila aktif dan belum lewat jendela tutup. */
export function masihRelevan(r: Rapat, sekarangMs: number): boolean {
  return r.aktif && sekarangMs < jendelaRapat(r).tutup;
}

/** Peran penugasan cocok dengan sasaran rapat. */
export function perannyaSasaran(peran: string, sasaran: PeranSasaran): boolean {
  const p = peran.toLowerCase();
  if (p !== "ppl" && p !== "pml") return false;
  return sasaran === "semua" || sasaran === p;
}

const normalToken = (s: string) => s.normalize("NFKC").trim().toLowerCase();

/** Bandingkan token tanpa peka huruf besar/kecil & spasi tepi; waktu tetap (tanpa bocor panjang kecocokan awal). */
export function cocokToken(masukan: unknown, benar: string): boolean {
  if (typeof masukan !== "string") return false;
  const a = normalToken(masukan);
  const b = normalToken(benar);
  if (!a || !b) return false;
  let selisih = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) selisih |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return selisih === 0;
}

export type HasilHadir = { ok: true } | { ok: false; kode: "nonaktif" | "belum_buka" | "tutup" | "sudah"; pesan: string };

/** Boleh mencatat hadir pada saat ini? (token diperiksa terpisah) */
export function bolehHadir(r: Rapat, sudahHadir: boolean, sekarangMs: number): HasilHadir {
  const s = statusRapat(r, sudahHadir, sekarangMs);
  if (s === "sudah") return { ok: false, kode: "sudah", pesan: "Kehadiran Anda sudah tercatat." };
  if (s === "nonaktif") return { ok: false, kode: "nonaktif", pesan: "Rapat ini tidak aktif." };
  if (s === "belum") return { ok: false, kode: "belum_buka", pesan: "Presensi belum dibuka. Tombol Hadir aktif mendekati jam rapat." };
  if (s === "tutup") return { ok: false, kode: "tutup", pesan: "Presensi rapat sudah ditutup. Hubungi panitia bila Anda hadir." };
  return { ok: true };
}

/** Pilih satu rapat yang ditampilkan: yang sedang buka dulu, lalu yang paling dekat mulai. */
export function pilihRapat<T extends Rapat>(daftar: T[], sekarangMs: number): T | null {
  const hidup = daftar.filter((r) => masihRelevan(r, sekarangMs));
  if (!hidup.length) return null;
  const skor = (r: T) => {
    const { buka } = jendelaRapat(r);
    return sekarangMs >= buka ? 0 : 1; // yang sudah dibuka lebih dulu
  };
  return [...hidup].sort((a, b) => skor(a) - skor(b) || new Date(a.mulai_at).getTime() - new Date(b.mulai_at).getTime())[0];
}

/** Bentuk rapat yang dikirim ke petugas: TANPA token. */
export function keBentukPetugas(r: Rapat, hadirAt: string | null, sekarangMs: number) {
  const { buka, tutup } = jendelaRapat(r);
  return {
    id: r.id,
    judul: r.judul,
    mulai_at: r.mulai_at,
    selesai_at: r.selesai_at,
    buka_at: new Date(buka).toISOString(),
    tutup_at: new Date(tutup).toISOString(),
    tautan: r.tautan,
    meeting_id: r.meeting_id,
    passcode: r.passcode,
    status: statusRapat(r, !!hadirAt, sekarangMs),
    hadir_at: hadirAt,
  };
}

/** Tautan Zoom hanya https. */
export function tautanAman(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
}
