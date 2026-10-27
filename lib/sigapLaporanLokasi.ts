// lib/sigapLaporanLokasi.ts
//
// (27 Okt 2026) Aturan LOKASI pada laporan harian transport lokal (formulir "Laporan realisasi" di /sigap/translok/<token>).
// Keputusan user (27 Okt 2026): KORWIL boleh menyimpan laporan tanpa lokasi. Peran lain (PML, PPL, dan lainnya) tetap wajib minimal 1 lokasi.
// Sebabnya: sejak 27 Okt laporan korwil terisi otomatis dari Lembar Quality Check, yang tidak punya lokasi; tombol simpan dulu mati diam-diam
// karena daftar lokasi kosong. Logika murni (tanpa React/DB) supaya dipakai sama oleh formulir (HP) dan server (API), dan bisa diuji.

/** Peran yang lokasinya TIDAK wajib pada laporan harian. */
export const PERAN_LOKASI_OPSIONAL: readonly string[] = ["korwil"];

/** Apakah laporan peran ini wajib memuat minimal 1 lokasi? */
export function lokasiWajib(peran: string | null | undefined): boolean {
  return !PERAN_LOKASI_OPSIONAL.includes(String(peran ?? "").trim().toLowerCase());
}

type MasukanSimpan = {
  peran: string | null | undefined;
  jumlahLokasi: number;
  /** isian jumlah apa adanya dari kolom (teks; "" = belum diisi) */
  jumlah: string;
};

/** Alasan tombol simpan belum bisa ditekan (selain alasan "isian berbeda dari lembar"), atau null bila siap. */
export function petunjukSimpanLaporan(m: MasukanSimpan): string | null {
  if (m.jumlah.trim() === "") return "Isi jumlah dulu.";
  if (m.jumlahLokasi <= 0 && lokasiWajib(m.peran)) return "Tambahkan minimal 1 lokasi dulu (pilih kecamatan, nagari, jorong, lalu tekan Tambahkan lokasi).";
  return null;
}

/** Tombol simpan boleh ditekan? `butuhAlasan` = isian berbeda dari lembar tetapi Kendala belum diisi; `sibuk` = sedang menyimpan. */
export function bolehSimpanLaporan(m: MasukanSimpan & { butuhAlasan: boolean; sibuk: boolean }): boolean {
  return !m.sibuk && !m.butuhAlasan && petunjukSimpanLaporan(m) === null;
}

/** Teks pengganti daftar lokasi yang kosong. */
export function teksTanpaLokasi(peran: string | null | undefined): string {
  return lokasiWajib(peran) ? "Belum ada lokasi." : "Tanpa lokasi (tidak wajib untuk korwil). Tambahkan bila perlu.";
}

/** Pemeriksaan di server: pesan galat bila lokasi kosong padahal wajib; null bila lolos. */
export function galatLokasiLaporan(peran: string | null | undefined, jumlahLokasi: number): string | null {
  return jumlahLokasi <= 0 && lokasiWajib(peran) ? "Pilih minimal 1 lokasi." : null;
}
