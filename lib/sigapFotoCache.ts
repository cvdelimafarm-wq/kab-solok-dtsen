// lib/sigapFotoCache.ts
//
// (27 Okt 2026) Pembantu murni untuk simpanan (cache) Kamera SIGAP: daftar "Foto saya" dan mode kegiatan tampil seketika dari HP
// lalu diperbarui diam-diam (lihat app/portal/dataBersama.ts). Permintaan user: "membuka kamera sampai kirim dan daftar foto yang
// pernah diambil terasa lama/macet, belum ada cache".
// Tidak mengubah arti angka apa pun; hanya batas jumlah baris awal, teks umur data, dan pembeda galat "tanpa sinyal" vs "ditolak server".

/** Jumlah foto awal di "Foto saya" (sebelumnya langsung 100). */
export const BATAS_AWAL = 30;
/** Batas atas yang pernah dan masih dilayani server. Juga nilai bawaan bila klien lama tidak mengirim ?batas. */
export const BATAS_MAKS = 100;

/** Server: nilai ?batas dari klien. Kosong / bukan bilangan bulat 1..BATAS_MAKS -> BATAS_MAKS (perilaku lama, aman untuk klien lama). */
export function batasDaftar(param: string | null | undefined): number {
  if (param === null || param === undefined || !/^\d{1,4}$/.test(param.trim())) return BATAS_MAKS;
  const n = Number(param);
  if (!Number.isInteger(n) || n < 1) return BATAS_MAKS;
  return Math.min(n, BATAS_MAKS);
}

/** Server: minta `batas + 1` baris, lalu potong; kelebihan satu baris berarti "masih ada yang lebih lama". */
export function potongDaftar<T>(baris: T[] | null | undefined, batas: number): { daftar: T[]; adaLagi: boolean } {
  const semua = baris ?? [];
  return { daftar: semua.slice(0, batas), adaLagi: semua.length > batas };
}

/** Klien: alamat daftar "Foto saya" (kunci simpanan). Dua kunci terpisah supaya daftar pendek tetap tampil saat daftar panjang dimuat. */
export function jalurFotoSaya(semua: boolean): string {
  return `/api/sigap/foto?batas=${semua ? BATAS_MAKS : BATAS_AWAL}`;
}

/** Klien: galat ini karena TIDAK ADA SAMBUNGAN (boleh pakai simpanan, tampilkan "tanpa sinyal"), bukan karena server menolak. */
export function galatSinyal(pesan: string | null | undefined, online?: boolean): boolean {
  if (online === false) return true;
  if (!pesan) return false;
  return /failed to fetch|network|load failed|tidak ada sambungan|sambungan|offline/i.test(pesan);
}

/** Teks umur data tersimpan, mis. "baru saja", "5 menit lalu", "3 jam lalu", "2 hari lalu". Waktu mundur / tidak sah -> "baru saja". */
export function umurTeks(tibaMs: number, sekarangMs: number): string {
  if (!Number.isFinite(tibaMs) || !Number.isFinite(sekarangMs) || tibaMs <= 0) return "belum pernah";
  const detik = Math.floor((sekarangMs - tibaMs) / 1000);
  if (detik < 60) return "baru saja";
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

/** Teks tombol saat foto dikirim. null = kemajuan belum diketahui; >= 1 = semua byte sudah sampai, server masih memproses (cap, simpan, catat). */
export function teksProgresKirim(bagian: number | null): string {
  if (bagian === null || !Number.isFinite(bagian)) return "Mengirim…";
  if (bagian >= 1) return "Memproses di server…";
  return `Mengunggah ${Math.max(0, Math.min(99, Math.floor(bagian * 100)))}%…`;
}
