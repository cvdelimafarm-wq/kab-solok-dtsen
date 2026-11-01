// lib/vanguard/konstanta.ts  (murni)
//
// (1 Nov 2026) VANGUARD V5b: batas-batas bersama yang dipakai kode klien DAN server. Dipisah dari rekam.ts karena rekam.ts memuat data kasus penuh (kunci) lewat penilai,
// sehingga kode klien (pengaturan, layar petugas) tidak boleh mengimpornya.

export const VERSI_KASUS = 1;
export const MAKS_PETUNJUK = 3;
export const MAKS_PERCOBAAN_PER_KASUS = 200;
export const MAKS_NILAI = 9_000_000_000_000; // 9 triliun rupiah per kotak: jauh di atas kewajaran, di bawah batas bilangan aman JS
export const MAKS_SEL = 400;
export const MAKS_DURASI_DTK = 86_400;
export const MAKS_KALKULATOR = 500;
