// lib/ketentuanPelatihan.ts  (murni, tanpa basis data)
//
// (2 Nov 2026) Pelatihan 5 tab, tahap B: ketentuan pelatihan (diatur PJ) dan respons undangan (terima / tolak). Undangan hanya mencatat KESEDIAAN.
// Terima wajib disertai centang setuju; tolak wajib beralasan singkat. Ketentuan yang diperbarui setelah diterima hanya MEMBERI TAHU (tanpa setuju ulang).

export const MAKS_BUTIR = 20;
export const MAKS_PANJANG_BUTIR = 300;
export const MIN_ALASAN = 3;
export const MAKS_ALASAN = 200;

export type Ketentuan = {
  /** Saklar per kegiatan: true = tampilan lima tab. Kegiatan lama (mis. PSP) tetap tampilan Langkah. */
  tab_baru: boolean;
  /** Butir ketentuan tambahan dari PJ (waktu dan tempat diambil dari data undangan yang sudah ada). */
  butir: string[];
  versi: number;
};

export const KETENTUAN_BAWAAN: Ketentuan = { tab_baru: false, butir: [], versi: 1 };

export type ResponsUndangan = { respons: "terima" | "tolak"; alasan: string | null; versi_ketentuan: number; dijawab_at: string } | null;

export type StatusUndangan = "belum" | "diterima" | "ditolak";

/** Membersihkan daftar butir: teks saja, dipangkas, tanpa baris kosong, paling banyak MAKS_BUTIR. */
export function bersihkanButir(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const hasil: string[] = [];
  for (const b of x) {
    if (typeof b !== "string") continue;
    const t = b.replace(/\s+/g, " ").trim().slice(0, MAKS_PANJANG_BUTIR);
    if (t) hasil.push(t);
    if (hasil.length >= MAKS_BUTIR) break;
  }
  return hasil;
}

/** Baris tabel ketentuan -> bentuk aman. Baris kosong / rusak -> bawaan (tampilan lama). */
export function bacaKetentuan(baris: unknown): Ketentuan {
  if (!baris || typeof baris !== "object") return { ...KETENTUAN_BAWAAN };
  const r = baris as Record<string, unknown>;
  const versi = typeof r.versi === "number" && Number.isInteger(r.versi) && r.versi >= 1 ? r.versi : 1;
  return { tab_baru: r.tab_baru === true, butir: bersihkanButir(r.butir), versi };
}

export function statusUndangan(r: ResponsUndangan): StatusUndangan {
  if (!r) return "belum";
  return r.respons === "terima" ? "diterima" : "ditolak";
}

/** Petugas sudah menerima versi ketentuan yang lebih lama daripada yang berlaku sekarang -> hanya pemberitahuan. */
export function ketentuanBerubah(r: ResponsUndangan, k: Ketentuan): boolean {
  return !!r && r.respons === "terima" && r.versi_ketentuan < k.versi;
}

export type HasilPeriksaRespons = { ok: true; respons: "terima" | "tolak"; alasan: string | null } | { ok: false; pesan: string };

/** Memeriksa isi permintaan POST respons undangan. */
export function periksaRespons(masukan: unknown): HasilPeriksaRespons {
  const m = (masukan && typeof masukan === "object" ? masukan : {}) as Record<string, unknown>;
  if (m.respons === "terima") {
    if (m.setuju !== true) return { ok: false, pesan: "Centang persetujuan ketentuan pelatihan dahulu." };
    return { ok: true, respons: "terima", alasan: null };
  }
  if (m.respons === "tolak") {
    const alasan = typeof m.alasan === "string" ? m.alasan.replace(/\s+/g, " ").trim() : "";
    if (alasan.length < MIN_ALASAN) return { ok: false, pesan: "Tulis alasan singkat penolakan." };
    return { ok: true, respons: "tolak", alasan: alasan.slice(0, MAKS_ALASAN) };
  }
  return { ok: false, pesan: "Pilihan harus terima atau tolak." };
}

export type TeksKartuUndangan = { judul: string; ket: string; tombol: string; nada: "emas" | "hijau" | "merah" };

/** Teks kartu undangan di tab Hari ini. */
export function teksKartuUndangan(status: StatusUndangan, berubah: boolean): TeksKartuUndangan {
  if (status === "belum") return { judul: "Belum direspons", ket: "Baca ketentuan pelatihan, lalu pilih terima atau tolak undangan.", tombol: "Buka undangan", nada: "emas" };
  if (status === "ditolak") return { judul: "Ditolak", ket: "Anda menolak undangan ini. Panitia akan mencari pengganti.", tombol: "Baca ketentuan", nada: "merah" };
  return berubah
    ? { judul: "Diterima · ketentuan diperbarui", ket: "PJ memperbarui ketentuan pelatihan. Silakan baca kembali; tidak perlu menyetujui ulang.", tombol: "Baca ketentuan", nada: "emas" }
    : { judul: "Diterima", ket: "Terima kasih. Ketentuan dapat dibaca kembali kapan saja.", tombol: "Baca ketentuan", nada: "hijau" };
}
