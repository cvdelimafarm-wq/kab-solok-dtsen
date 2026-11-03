// lib/gerbangUndangan.ts  (murni, tanpa basis data)
//
// (3 Nov 2026) GERBANG UNDANGAN pelatihan: sebelum undangan DITERIMA, peserta tidak boleh mengakses apa pun di pelatihan selain kartu undangan (tab Hari ini).
// Ditolak -> namanya dikeluarkan dari pelatihan (penugasan dinonaktifkan; catatan penolakan tetap tersimpan untuk panitia) dan kartunya hilang dari Beranda.
// Gerbang hanya berlaku bagi pelatihan yang memakai tampilan lima tab (pelatihan lama / yang sudah selesai tidak berubah).

export type Gerbang = "boleh" | "belum";

export const PESAN_GERBANG = "Terima undangan pelatihan dahulu untuk membuka bagian ini.";
/** Tubuh jawaban 403 yang seragam di semua API pelatihan; `undangan_belum` dipakai klien untuk mengalihkan ke Hari ini. */
export const TUBUH_GERBANG = { error: PESAN_GERBANG, undangan_belum: true } as const;

/** Keputusan gerbang. Bukan tampilan lima tab -> selalu boleh; sudah menerima -> boleh; belum menjawab / pernah menolak (lalu diaktifkan kembali panitia) -> belum. */
export function gerbangDari(tampilanBaru: boolean, respons: "terima" | "tolak" | null): Gerbang {
  if (!tampilanBaru) return "boleh";
  return respons === "terima" ? "boleh" : "belum";
}

/** Tab yang tetap terbuka saat gerbang tertutup: hanya Hari ini (kartu undangan). */
export function tabBolehSaatTerkunci(kode: string): boolean {
  return kode === "hari-ini";
}

/** Teks halaman pengganti bagi bagian yang terkunci. */
export const TEKS_TERKUNCI = { judul: "Terima undangan dahulu", ket: "Bagian pelatihan lainnya terbuka setelah Anda membaca ketentuan dan menerima undangan.", tombol: "Buka undangan" } as const;

export type PenolakBaris = { akun_id: number; nama: string; alasan: string | null; dijawab_at: string };
