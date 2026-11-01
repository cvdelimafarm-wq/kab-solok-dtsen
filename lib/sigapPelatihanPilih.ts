// lib/sigapPelatihanPilih.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Pelatihan mana yang dilayani untuk SEORANG peserta bila ia terdaftar di lebih dari satu pelatihan aktif (mis. petugas yang ikut Pelatihan PSP
// Pascabencana lalu Pelatihan Seruti TW IV). Sebelumnya peserta PSP selalu dilayani PSP (pelatihan bawaan) sehingga pelatihan berikutnya tidak pernah terlihat.
// Aturan: yang belum selesai dan paling awal mulainya (berlangsung lebih dulu, lalu paling dekat) -> bila semua sudah selesai, yang paling baru selesai.
// Pelatihan tanpa tanggal dianggap belum selesai dan diurutkan sesudah yang bertanggal. Seri -> id terkecil. Satu kandidat -> kandidat itu; kosong -> null.

export type KandidatPelatihan = { id: number; tanggal_mulai: string | null; tanggal_selesai: string | null };

export function pilihPelatihanPeserta(kandidat: readonly KandidatPelatihan[], hariIni: string): number | null {
  if (kandidat.length === 0) return null;
  if (kandidat.length === 1) return kandidat[0].id;
  const akhir = (k: KandidatPelatihan) => k.tanggal_selesai ?? k.tanggal_mulai;
  const belum = kandidat.filter((k) => {
    const a = akhir(k);
    return a === null || a >= hariIni;
  });
  if (belum.length > 0) {
    return [...belum].sort((a, b) => (a.tanggal_mulai ?? "9999-12-31").localeCompare(b.tanggal_mulai ?? "9999-12-31") || a.id - b.id)[0].id;
  }
  return [...kandidat].sort((a, b) => (akhir(b) ?? "").localeCompare(akhir(a) ?? "") || a.id - b.id)[0].id;
}
