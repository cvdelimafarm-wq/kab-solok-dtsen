// lib/keu/galat.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- pemetaan galat basis data (gerbang keu_jalankan / keu_tulis) ke status HTTP dan pesan untuk
// pengguna. Fungsi dan penjaga di basis data memakai SQLSTATE yang tetap (lihat catatan SQL fase a-l):
//   42501 tidak berwenang / akun tidak dikenal      -> 403
//   23514 aturan data atau alur tidak terpenuhi     -> 422
//   23505 kembar (sudah ada)                        -> 409
//   23503 acuan tidak ada                           -> 422
//   P0002 / 42P01 / 42883 tidak ditemukan           -> 404
//   22023 masukan salah bentuk                      -> 400
//   54000 batas terlampaui                          -> 409
// Pesan RAISE di basis data sudah berbahasa Indonesia dan ditulis untuk dibaca pengguna, jadi diteruskan apa adanya untuk kode yang dikenal.
// Kode lain (galat tak terduga) TIDAK diteruskan mentah: pesannya bisa memuat nama tabel atau kolom.
// Murni (tanpa React/DB) supaya mudah diuji.

export type GalatKeu = { status: number; kode: string; pesan: string };
export type GalatMentah = { code?: string | null; message?: string | null } | null | undefined;

const PETA: Record<string, number> = {
  "42501": 403,
  "23514": 422,
  "23503": 422,
  "23505": 409,
  "P0002": 404,
  "42P01": 404,
  "42883": 404,
  "22023": 400,
  "54000": 409,
  "P0001": 422,
};

const PESAN_UMUM: Record<number, string> = {
  403: "Anda tidak berwenang melakukan ini.",
  404: "Data atau fungsi yang dimaksud tidak ditemukan.",
};

/** Galat dari supabase-js/PostgREST (`{ code, message }`) -> status HTTP + pesan. */
export function petakanGalat(e: GalatMentah): GalatKeu {
  const kode = (e?.code ?? "").toString();
  const pesan = (e?.message ?? "").toString().trim();
  const status = PETA[kode];
  if (status) {
    return { status, kode, pesan: pesan || PESAN_UMUM[status] || "Permintaan tidak dapat diproses." };
  }
  // Galat PostgREST sendiri (mis. PGRST202 fungsi tidak ada di cache skema): jangan bocorkan, beri petunjuk umum.
  if (kode.startsWith("PGRST")) {
    return { status: 502, kode, pesan: "Layanan basis data belum siap atau belum diperbarui (migrasi belum dijalankan?). Hubungi admin." };
  }
  return { status: 500, kode: kode || "tidak_diketahui", pesan: "Terjadi kesalahan pada basis data. Coba lagi; bila berulang, hubungi admin." };
}
