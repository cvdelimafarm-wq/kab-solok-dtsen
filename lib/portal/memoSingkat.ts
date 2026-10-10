// lib/portal/memoSingkat.ts  (hanya server)
//
// (10 Okt 2026) Simpanan sementara di memori server untuk hasil yang mahal tetapi jarang berubah (mis. fungsi skor 1084 Sub SLS).
// Permintaan yang datang bersamaan berbagi satu pemanggilan (tidak berlipat); yang gagal tidak disimpan. Kunci harus memuat semua
// yang membedakan hasilnya (mis. id petugas). Berlaku per proses: aman karena hanya mempercepat -- tanpa simpanan, hasilnya sama.
// -- permintaan user: perpindahan antar layer terlalu lama.

type Isi = { sampai: number; janji: Promise<unknown> };
const simpanan = new Map<string, Isi>();
const MAKS_KUNCI = 500;

export function memoWaktu<T>(kunci: string, ttlMs: number, ambil: () => Promise<T>): Promise<T> {
  const kini = Date.now();
  const ada = simpanan.get(kunci);
  if (ada && ada.sampai > kini) return ada.janji as Promise<T>;
  if (simpanan.size >= MAKS_KUNCI) {
    for (const [k, v] of simpanan) if (v.sampai <= kini) simpanan.delete(k);
    if (simpanan.size >= MAKS_KUNCI) simpanan.clear();
  }
  const janji = ambil();
  const isi: Isi = { sampai: kini + ttlMs, janji };
  simpanan.set(kunci, isi);
  janji.catch(() => {
    if (simpanan.get(kunci) === isi) simpanan.delete(kunci);
  });
  return janji;
}

/** Buang simpanan berawalan tertentu (dipanggil setelah data sumbernya diubah). */
export function buangMemo(awalan: string) {
  for (const k of Array.from(simpanan.keys())) if (k.startsWith(awalan)) simpanan.delete(k);
}
