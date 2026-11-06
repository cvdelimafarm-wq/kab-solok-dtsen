// lib/pilihCari.ts
//
// (6 Nov 2026) Logika murni untuk dropdown bisa-dicari (app/components/SelectCari.tsx). Dipisah dari komponen supaya bisa diuji tanpa DOM.
// Permintaan user: seluruh dropdown aplikasi menjadi "Searchable Dropdown".

export type OpsiPilih = {
  /** nilai yang dikirim ke onChange (selalu string, seperti <option value>) */
  nilai: string;
  /** teks yang tampil di daftar dan di tombol */
  label: string;
  nonaktif: boolean;
  /** judul kelompok (dari <optgroup label>) bila ada */
  kelompok?: string;
};

/** Kotak cari baru muncul bila pilihan sebanyak ini atau lebih (daftar pendek tak perlu dicari). */
export const AMBANG_CARI = 6;
/** Baris yang digambar sekaligus; sisanya muncul setelah pencarian dipersempit (menjaga HP tetap lancar). */
export const BATAS_TAMPIL = 300;

/** Huruf kecil, tanpa aksen, spasi dirapatkan: "  Jorong  Ö " -> "jorong o". */
export function normalisasi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function perluKotakCari(jumlahPilihan: number): boolean {
  return jumlahPilihan >= AMBANG_CARI;
}

/**
 * Saring pilihan: setiap kata kueri (dipisah spasi) harus ada di label, urutan bebas ("solok kec" cocok dengan "Kec. Solok").
 * Urutan asli daftar dipertahankan. Kueri kosong = semua.
 */
export function saringPilihan(opsi: readonly OpsiPilih[], kueri: string): OpsiPilih[] {
  const kata = normalisasi(kueri).split(" ").filter(Boolean);
  if (kata.length === 0) return opsi.slice();
  return opsi.filter((o) => {
    const t = normalisasi(o.label);
    return kata.every((k) => t.includes(k));
  });
}

/** Indeks pilihan aktif berikutnya (melewati yang nonaktif). Berhenti di ujung (tidak berputar). `dari` -1 = belum ada yang disorot. */
export function geserAktif(daftar: readonly OpsiPilih[], dari: number, arah: 1 | -1): number {
  if (daftar.length === 0) return -1;
  if (dari < 0) return indeksPertamaAktif(daftar, arah);
  for (let i = dari + arah; i >= 0 && i < daftar.length; i += arah) {
    if (!daftar[i].nonaktif) return i;
  }
  return dari;
}

/** Indeks pertama yang bisa dipilih dari awal (arah 1) atau dari akhir (arah -1); -1 bila tak ada. */
export function indeksPertamaAktif(daftar: readonly OpsiPilih[], arah: 1 | -1 = 1): number {
  if (arah === 1) {
    for (let i = 0; i < daftar.length; i++) if (!daftar[i].nonaktif) return i;
  } else {
    for (let i = daftar.length - 1; i >= 0; i--) if (!daftar[i].nonaktif) return i;
  }
  return -1;
}

/** Pilihan awal yang disorot saat daftar dibuka: yang sedang terpilih, kalau tidak ada yang pertama. */
export function indeksAwal(daftar: readonly OpsiPilih[], nilaiTerpilih: string): number {
  const i = daftar.findIndex((o) => o.nilai === nilaiTerpilih && !o.nonaktif);
  return i >= 0 ? i : indeksPertamaAktif(daftar, 1);
}

/** Label terpanjang (menentukan lebar tombol agar tidak berubah-ubah ketika pilihan berganti, seperti <select> bawaan). */
export function labelTerpanjang(opsi: readonly OpsiPilih[]): string {
  let t = "";
  for (const o of opsi) if (o.label.length > t.length) t = o.label;
  return t;
}

/**
 * Label-label yang menentukan lebar tombol: `n` terpanjang menurut jumlah huruf (huruf lebar seperti "m" bisa membuat label yang lebih pendek
 * justru lebih lebar, jadi satu label terpanjang saja tidak cukup). Daftar kecil: semuanya.
 */
export function labelPenentuLebar(opsi: readonly OpsiPilih[], n = 8): string[] {
  const unik = Array.from(new Set(opsi.map((o) => o.label)));
  if (unik.length <= n) return unik;
  return unik.sort((a, b) => b.length - a.length).slice(0, n);
}

/** Pilihan yang tampil, dibatasi BATAS_TAMPIL; `sisa` = jumlah yang tersembunyi. */
export function potongTampil<T>(daftar: readonly T[], batas = BATAS_TAMPIL): { tampil: T[]; sisa: number } {
  if (daftar.length <= batas) return { tampil: daftar.slice(), sisa: 0 };
  return { tampil: daftar.slice(0, batas), sisa: daftar.length - batas };
}

/** Label yang ditampilkan di tombol: pilihan yang cocok; bila tak ada yang cocok, pilihan pertama (perilaku <select> bawaan). */
export function labelTerpilih(opsi: readonly OpsiPilih[], nilai: string): { label: string; cocok: boolean } {
  const o = opsi.find((x) => x.nilai === nilai);
  if (o) return { label: o.label, cocok: true };
  return { label: opsi[0]?.label ?? "", cocok: false };
}
