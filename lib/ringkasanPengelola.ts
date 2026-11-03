// lib/ringkasanPengelola.ts  (murni; dipakai klien dan tes)
//
// (3 Nov 2026) Tab "Hari ini" untuk PANITIA / INSTRUKTUR / ATASAN yang bukan peserta: tidak ada undangan pribadi, jadi tampil ringkasan angka jalannya pelatihan
// (diambil dari data Monitoring yang sudah disaring menurut hierarki) dan catatan yang perlu ditindaklanjuti.

export type RingkasanMon = {
  total: number;
  undangan_terima: number;
  undangan_tolak: number;
  pretest_selesai: number;
  posttest_selesai: number;
  hadir: number;
  terkunci?: number;
  izin_menunggu?: number;
  materi_wajib?: number;
  materi_belum?: number;
};

export type JenisPengguna = "peserta" | "instruktur" | "panitia";

export const SAPAAN_PENGELOLA: Record<JenisPengguna, { judul: string; ket: string }> = {
  panitia: { judul: "Anda masuk sebagai panitia", ket: "Angka di bawah mencakup seluruh peserta." },
  instruktur: { judul: "Anda masuk sebagai instruktur", ket: "Angka di bawah mencakup peserta kelas Anda." },
  peserta: { judul: "Ringkasan tim Anda", ket: "Angka di bawah mencakup Anda dan bawahan Anda." },
};

export type Catatan = { teks: string; nada: "bad" | "wait" };

/** Hal yang perlu ditindaklanjuti; kosong bila semuanya lancar. Permintaan buka kunci didahulukan karena orangnya sedang menunggu. */
export function catatanPerhatian(r: RingkasanMon): Catatan[] {
  const c: Catatan[] = [];
  if ((r.izin_menunggu ?? 0) > 0) c.push({ teks: `${r.izin_menunggu} permintaan buka kunci menunggu keputusan.`, nada: "wait" });
  if ((r.terkunci ?? 0) > 0) c.push({ teks: `${r.terkunci} orang terkunci menunggu tahapan sebelumnya.`, nada: "wait" });
  if (r.undangan_tolak > 0) c.push({ teks: `${r.undangan_tolak} orang menolak undangan.`, nada: "bad" });
  if ((r.materi_wajib ?? 0) > 0 && (r.materi_belum ?? 0) > 0) c.push({ teks: `${r.materi_belum} orang belum menuntaskan materi wajib.`, nada: "wait" });
  return c;
}

/** Persentase 0-100 (dibulatkan); total 0 = 0. */
export const persen = (nilai: number, dari: number): number => (dari > 0 ? Math.max(0, Math.min(100, Math.round((nilai / dari) * 100))) : 0);
