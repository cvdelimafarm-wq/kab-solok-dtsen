// lib/cacheTtl.ts
//
// (28 Okt 2026) Simpanan singkat di memori server untuk hasil yang dibaca berulang dan jarang berubah (mis. pengecekan akun pada
// setiap permintaan API). Latar: ±20.600 permintaan dalam 10 menit dari server ke Supabase untuk ±90 pengguna; sigap_akun saja ±5.500
// dalam 16 menit, sehingga database jenuh dan respons mencapai belasan detik. Fungsi MURNI (tanpa DB/React; jam bisa disuntik) agar teruji.
//
// Aturan:
//  - Hanya hasil non-null yang disimpan (null = "tidak ada/nonaktif" selalu dicek ulang, jadi akun yang baru diaktifkan langsung bisa masuk).
//  - Galat TIDAK disimpan dan dilempar ke semua penunggu; permintaan berikutnya mencoba lagi.
//  - Permintaan bersamaan untuk kunci yang sama digabung menjadi satu pembacaan (anti-badai).
//  - Jumlah entri dibatasi (`maks`); yang paling lama disingkirkan lebih dulu.

export type OpsiCacheTtl = {
  ttlMs: number; // umur entri
  maks?: number; // batas jumlah entri (bawaan 2000)
  sekarang?: () => number; // jam (untuk tes)
};

export type CacheTtl<K, V> = {
  /** Ambil dari simpanan bila masih segar; bila tidak, panggil `muat` (digabung bila sedang berjalan). */
  ambil(kunci: K, muat: () => Promise<V | null>): Promise<V | null>;
  /** Buang satu kunci (mis. setelah PIN diganti atau akun dinonaktifkan). */
  lupakan(kunci: K): void;
  /** Kosongkan semuanya. */
  bersihkan(): void;
  /** Jumlah entri tersimpan (termasuk yang kedaluwarsa tetapi belum disingkirkan). */
  ukuran(): number;
};

export function buatCacheTtl<K, V>(opsi: OpsiCacheTtl): CacheTtl<K, V> {
  const ttl = Math.max(0, opsi.ttlMs);
  const maks = Math.max(1, opsi.maks ?? 2000);
  const jam = opsi.sekarang ?? Date.now;
  const simpan = new Map<K, { nilai: V; kedaluwarsa: number }>();
  const berjalan = new Map<K, Promise<V | null>>();

  const sisihkan = (t: number) => {
    // Map menjaga urutan penyisipan -> entri pertama = paling lama.
    for (const [k, e] of simpan) {
      if (simpan.size < maks && e.kedaluwarsa > t) break;
      simpan.delete(k);
      if (simpan.size < maks) break;
    }
  };

  return {
    async ambil(kunci, muat) {
      const t = jam();
      const ada = simpan.get(kunci);
      if (ada && ada.kedaluwarsa > t) return ada.nilai;
      if (ada) simpan.delete(kunci);
      const sedang = berjalan.get(kunci);
      if (sedang) return sedang;
      const p = (async () => {
        try {
          const nilai = await muat();
          if (nilai !== null && nilai !== undefined && ttl > 0) {
            const t2 = jam();
            simpan.delete(kunci);
            sisihkan(t2);
            if (simpan.size >= maks) simpan.delete(simpan.keys().next().value as K);
            simpan.set(kunci, { nilai, kedaluwarsa: t2 + ttl });
          }
          return nilai;
        } finally {
          berjalan.delete(kunci);
        }
      })();
      berjalan.set(kunci, p);
      return p;
    },
    lupakan(kunci) {
      simpan.delete(kunci);
    },
    bersihkan() {
      simpan.clear();
    },
    ukuran() {
      return simpan.size;
    },
  };
}
