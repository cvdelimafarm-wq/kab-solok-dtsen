// lib/sigapSesiTerbuka.ts  (murni, tanpa database)
//
// (9 Nov 2026) Modal PEMBLOKIR untuk peserta saat sebuah sesi dibuka, plus teks push yang menyertainya. SETELAN BAWAAN SEMUA PELATIHAN (putusan Iqbal), untuk empat jenis sesi:
//   pretest, posttest (dimulai instruktur lewat Agenda sesi), roleplay (Vanguard roleplay bareng kelas), kuis (ruang Adu Sigap).
// Pemuat data ada di lib/sigapSesiTerbukaDb.ts; layar modal di app/sigap/PemblokirSesi.tsx; rute di app/api/sigap/pelatihan/sesi-terbuka.

import { pesanMulaiPush } from "@/lib/sigapAgenda";

export type JenisSesi = "pretest" | "posttest" | "roleplay" | "kuis";
export const URUTAN_SESI: readonly JenisSesi[] = ["pretest", "posttest", "roleplay", "kuis"];

export type SesiTerbuka = {
  /** Kunci unik: dipakai klien untuk mengenali sesi baru (getar sekali) */
  kunci: string;
  jenis: JenisSesi;
  /** Nama sesi untuk judul modal, mis. "Pretest" */
  judul: string;
  /** Peserta sudah memulai dan masih berjalan: tombol berbunyi "Lanjutkan" */
  lanjut: boolean;
  /** Halaman tujuan (alamat internal) */
  url: string;
};

export const alamatTes = (jenis: string): string => `/sigap/pelatihan/tes/${encodeURIComponent(jenis)}`;
export const ALAMAT_KUIS = "/sigap/pelatihan/kuis";
export const alamatRoleplayPeserta = (kegiatanId: number): string => `/sigap/vanguard/roleplay?k=${kegiatanId}`;

export const urutkanSesi = (daftar: readonly SesiTerbuka[]): SesiTerbuka[] =>
  [...daftar].sort((a, b) => URUTAN_SESI.indexOf(a.jenis) - URUTAN_SESI.indexOf(b.jenis) || a.kunci.localeCompare(b.kunci));

// ---------------------------------------------------------------- keputusan per jenis

/**
 * Tes yang dimulai instruktur (punya baris agenda). "mulai" = jendela sedang berjalan dan peserta belum memulai; "lanjut" = peserta sudah memulai dan waktunya masih ada.
 * Tes tanpa agenda (berjadwal biasa) TIDAK memunculkan modal. Tes tidak aktif atau terkunci tahapan (blokir) juga tidak: peserta tidak boleh terjebak di halaman yang menolaknya.
 */
export function tesPerluModal(m: {
  agenda: { status: "menunggu" | "berjalan" | "selesai" } | null;
  tesAktif: boolean;
  terkunci: boolean;
  sesi: { selesai_at: string | null; batas_at: string } | null;
  sekarang: Date;
  toleransiDetik?: number;
}): "mulai" | "lanjut" | null {
  if (!m.agenda || !m.tesAktif || m.terkunci) return null;
  if (m.sesi) {
    if (m.sesi.selesai_at) return null;
    const lewat = m.sekarang.getTime() > new Date(m.sesi.batas_at).getTime() + (m.toleransiDetik ?? 0) * 1000;
    return lewat ? null : "lanjut";
  }
  return m.agenda.status === "berjalan" ? "mulai" : null;
}

/** Roleplay berjalan dan peserta belum menyimpan isian apa pun (sama dengan "mendesak" di kartu Hari ini). */
export const roleplayPerluModal = (m: { status: "berjalan" | "selesai" | null; sudahIsi: boolean }): boolean => m.status === "berjalan" && !m.sudahIsi;

/** Ruang Adu Sigap aktif yang masih bisa dimasuki dan peserta belum bergabung. */
export function kuisPerluModal(m: { status: string | null; gabungTerlambat: boolean; sudahGabung: boolean }): boolean {
  if (!m.status || m.status === "selesai" || m.sudahGabung) return false;
  return m.status === "lobi" || m.gabungTerlambat;
}

// ---------------------------------------------------------------- teks

export const namaSesi = (jenis: JenisSesi, judulTes?: string): string =>
  jenis === "pretest" ? "Pretest" : jenis === "posttest" ? "Posttest" : jenis === "roleplay" ? "Roleplay Vanguard" : judulTes?.trim() || "Kuis Adu Sigap";

/** Isi modal. */
export function teksModal(s: Pick<SesiTerbuka, "jenis" | "judul" | "lanjut">): { judul: string; isi: string; tombol: string } {
  const nama = s.judul;
  if (s.jenis === "pretest" || s.jenis === "posttest") {
    return s.lanjut
      ? { judul: `${nama} sedang berjalan`, isi: "Waktu pengerjaan Anda masih berjalan. Kembali ke tes sekarang dan selesaikan; jangan membuka halaman lain.", tombol: `Lanjutkan ${nama}` }
      : { judul: `${nama} sudah dibuka`, isi: "Instruktur sudah memulai tes. Kerjakan SEKARANG dan jangan membuka halaman lain. Waktu pengerjaan dihitung sejak Anda menekan Mulai di halaman tes.", tombol: `Kerjakan ${nama} sekarang` };
  }
  if (s.jenis === "roleplay") return { judul: "Roleplay Vanguard dimulai", isi: "Instruktur membuka roleplay bareng kelas. Buka sekarang dan ikuti sesi bersama kelas Anda; jangan membuka halaman lain.", tombol: "Buka Roleplay sekarang" };
  return { judul: `${nama} dibuka`, isi: "Ruang kuis kelas Anda sudah dibuka. Bergabung sekarang sebelum kuis dimulai; jangan membuka halaman lain.", tombol: "Bergabung ke kuis" };
}

/** Pesan push saat sesi dibuka (judul <= 80, isi <= 240 karakter, lihat lib/sigapPushUtil). */
export function pesanSesiDibuka(jenis: JenisSesi, judulTes = ""): { judul: string; isi: string } {
  if (jenis === "pretest" || jenis === "posttest") return pesanMulaiPush(jenis, judulTes);
  if (jenis === "roleplay") return { judul: "Roleplay Vanguard dimulai", isi: "Instruktur membuka roleplay bareng kelas. Buka sekarang dan ikuti sesinya." };
  return { judul: "Kuis Adu Sigap dibuka", isi: "Ruang kuis kelas Anda dibuka. Bergabung sekarang sebelum kuis dimulai." };
}

// ---------------------------------------------------------------- klien

const jalurDari = (alamat: string): string => alamat.split(/[?#]/)[0];

/** Peserta sedang berada di halaman salah satu sesi yang terbuka: modal tidak ditampilkan (supaya tidak menutupi tes yang sedang dikerjakan). */
export function sedangDiHalamanSesi(jalur: string, daftar: readonly SesiTerbuka[]): boolean {
  const j = jalur.replace(/\/+$/, "") || "/";
  return daftar.some((s) => jalurDari(s.url).replace(/\/+$/, "") === j);
}

/** Jalur yang tidak pernah diblokir (panel pengelola). */
export const jalurBebasBlokir = (jalur: string): boolean => jalur.startsWith("/sigap/kelola") || jalur.startsWith("/sigap/pelatihan/kelola") || jalur.startsWith("/sigap/admin");
