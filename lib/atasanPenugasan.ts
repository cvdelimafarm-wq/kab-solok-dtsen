// lib/atasanPenugasan.ts
//
// (6 Nov 2026) Satu identitas petugas, tahap 3c: atasan langsung tidak lagi dibaca dari `bencana_petugas.atasan_id`,
// melainkan dari `sigap_penugasan.atasan_akun_id` (SQL 20261106e; disalin pemicu `roster_ke_penugasan` selama modul lama hidup).
// Urutan berlaku (yang belakangan menimpa yang awal, hanya bila terisi):
//   1. atasan pada penugasan PSP (kegiatan 1) — struktur tim dasar PPL -> PML -> Korwil;
//   2. atasan pada penugasan kegiatan yang sedang diperiksa;
//   3. atasan pada sigap_tim kegiatan itu.

export type BarisAtasan = { akun_id: number; atasan_akun_id: number | null };

export function gabungAtasan(psp: BarisAtasan[], kegiatan: BarisAtasan[], tim: BarisAtasan[]): Map<number, number | null> {
  const peta = new Map<number, number | null>();
  for (const b of psp) peta.set(b.akun_id, b.atasan_akun_id ?? null);
  for (const lapis of [kegiatan, tim]) {
    for (const b of lapis) {
      if (b.atasan_akun_id != null && b.atasan_akun_id !== b.akun_id) peta.set(b.akun_id, b.atasan_akun_id);
      else if (!peta.has(b.akun_id)) peta.set(b.akun_id, null);
    }
  }
  return peta;
}
