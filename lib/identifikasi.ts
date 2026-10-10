// lib/identifikasi.ts
//
// (10 Okt 2026) Lembar Identifikasi SLS untuk PML (tahap Pendataan Pascabencana) -- permintaan user.
// Pembagian: per SLS utuh -> 1 PML pelaksana + 1 PML pendamping (tabel bencana_identifikasi_alokasi), TERPISAH dari plotting PPL.
// Berkas murni (tanpa React/DB) supaya dipakai bersama server-klien dan mudah diuji.
//
// ATURAN ANGKA: `kk_terdampak` adalah TOTAL hasil identifikasi yang diisi PML sendiri, BUKAN penjumlahan jenis dampak,
// karena satu KK bisa terkena beberapa jenis dampak sekaligus. Maka yang diperiksa hanya: tiap jenis <= total.
// "Tidak terdampak" = Sub SLS sudah dinilai dan hasilnya nol (beda dengan belum diisi): total & semua jenis dipaksa 0.

export const JENIS_DAMPAK = [
  { kunci: "rusak_berat", label: "Rusak berat" },
  { kunci: "rusak_sedang", label: "Rusak sedang" },
  { kunci: "rusak_ringan", label: "Rusak ringan" },
  { kunci: "lahan_tertimbun", label: "Lahan pertanian tertimbun" },
  { kunci: "kekeringan", label: "Kekeringan" },
  { kunci: "lainnya", label: "Lainnya" },
] as const;

/** Kategori lama (sama dengan identifikasi jorong). */
export const JENIS_LAMA = [
  { kunci: "aset_usaha", label: "Aset usaha terdampak" },
  { kunci: "lahan_ternak", label: "Lahan ternak terdampak" },
  { kunci: "korban", label: "Korban jiwa / luka" },
] as const;

export type KunciAngka = (typeof JENIS_DAMPAK)[number]["kunci"] | (typeof JENIS_LAMA)[number]["kunci"];
export const KUNCI_RINCIAN: KunciAngka[] = [...JENIS_DAMPAK, ...JENIS_LAMA].map((x) => x.kunci);

export type Isian = Record<KunciAngka, number> & {
  /** total KK terdampak hasil identifikasi (diisi sendiri, bukan jumlah kolom) */
  kk_terdampak: number;
  tidak_terdampak: boolean;
  lainnya_ket: string;
  catatan: string;
};

export const BATAS_ANGKA = 100000;
export const BATAS_KET = 120;
export const BATAS_CATATAN = 500;

const bulat = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
};

/** Periksa & bersihkan masukan (dari klien). Kosong dianggap 0. */
export function periksaIsian(x: unknown): { ok: true; isi: Isian } | { ok: false; pesan: string } {
  if (!x || typeof x !== "object") return { ok: false, pesan: "Isian tidak terbaca." };
  const m = x as Record<string, unknown>;
  const tidak = m.tidak_terdampak === true;
  const isi = { tidak_terdampak: tidak, lainnya_ket: "", catatan: "" } as Isian;

  const total = bulat(m.kk_terdampak);
  if (total === null || total < 0 || total > BATAS_ANGKA) return { ok: false, pesan: "Jumlah KK terdampak harus bilangan bulat 0 atau lebih." };
  isi.kk_terdampak = total;

  for (const j of [...JENIS_DAMPAK, ...JENIS_LAMA]) {
    const n = bulat(m[j.kunci]);
    if (n === null || n < 0 || n > BATAS_ANGKA) return { ok: false, pesan: `"${j.label}" harus bilangan bulat 0 atau lebih.` };
    isi[j.kunci] = n;
  }

  const ket = typeof m.lainnya_ket === "string" ? m.lainnya_ket.trim() : "";
  const cat = typeof m.catatan === "string" ? m.catatan.trim() : "";
  if (ket.length > BATAS_KET) return { ok: false, pesan: `Keterangan "Lainnya" maksimal ${BATAS_KET} karakter.` };
  if (cat.length > BATAS_CATATAN) return { ok: false, pesan: `Catatan maksimal ${BATAS_CATATAN} karakter.` };
  isi.lainnya_ket = ket;
  isi.catatan = cat;

  // Tidak terdampak: semua angka harus nol (antarmuka mengosongkannya; ini pagar di server)
  if (tidak) {
    if (total !== 0 || KUNCI_RINCIAN.some((k) => isi[k] !== 0)) return { ok: false, pesan: "Sub SLS yang ditandai tidak terdampak harus berisi angka 0 semua." };
    isi.lainnya_ket = "";
    return { ok: true, isi };
  }

  // Total 0 = tidak ada KK terdampak -> sama artinya dengan "tidak terdampak" (angka jenis dampak pun harus 0)
  for (const j of [...JENIS_DAMPAK, ...JENIS_LAMA]) {
    if (isi[j.kunci] > total) return { ok: false, pesan: `"${j.label}" (${isi[j.kunci]}) tidak boleh lebih besar dari total KK terdampak (${total}).` };
  }
  if (isi.lainnya === 0) isi.lainnya_ket = "";
  if (total === 0) isi.tidak_terdampak = true;
  return { ok: true, isi };
}

/** Peringatan lunak (tidak menghalangi simpan). */
export function peringatanIsian(isi: Pick<Isian, "kk_terdampak" | "tidak_terdampak">, kkTinggal: number): string[] {
  const p: string[] = [];
  if (!isi.tidak_terdampak && kkTinggal > 0 && isi.kk_terdampak > kkTinggal) {
    p.push(`Total terdampak (${isi.kk_terdampak}) lebih besar dari perkiraan KK yang tinggal di Sub SLS ini (${kkTinggal}). Pastikan angkanya benar.`);
  }
  return p;
}

export type KeadaanSub = "belum" | "terdampak" | "tidak_terdampak";

export type SubIdentifikasi = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  /** perkiraan KK yang tinggal */
  kk: number;
  /** perkiraan KK terdampak awal */
  kk_awal: number;
  /** peran PML yang melihat: pelaksana (terdekat, utama) atau pendamping (ikut bertanggung jawab); keduanya bisa mengisi */
  peran: "pelaksana" | "pendamping";
  /** nama PML satunya (pendamping bagi pelaksana, pelaksana bagi pendamping) */
  rekan: string | null;
  /** nomor HP PML rekan (apa adanya dari data petugas) supaya bisa dihubungi -- permintaan user 10 Okt 2026 */
  rekan_hp: string | null;
  /** hasil dipakai BERSAMA pelaksana & pendamping; `oleh` = PML yang terakhir menyimpan */
  hasil: (Isian & { diperbarui_at: string; oleh: string | null }) | null;
};

export const keadaanSub = (s: Pick<SubIdentifikasi, "hasil">): KeadaanSub => (!s.hasil ? "belum" : s.hasil.tidak_terdampak ? "tidak_terdampak" : "terdampak");

export type RingkasIdentifikasi = { total: number; terisi: number; tidak_terdampak: number; kk: number; awal: number; hasil: number };

/** Ringkasan progres. `awal` hanya dari Sub SLS yang sudah terisi supaya sebanding dengan `hasil`. */
export function ringkasIdentifikasi(sub: SubIdentifikasi[]): RingkasIdentifikasi {
  let terisi = 0,
    tidak = 0,
    awal = 0,
    hasil = 0,
    kk = 0;
  for (const s of sub) {
    kk += s.kk;
    if (!s.hasil) continue;
    terisi++;
    awal += s.kk_awal;
    hasil += s.hasil.kk_terdampak;
    if (s.hasil.tidak_terdampak) tidak++;
  }
  return { total: sub.length, terisi, tidak_terdampak: tidak, kk: Math.round(kk), awal: Math.round(awal), hasil };
}

/** Kode peta dari idsubsls (16 digit: prov2 kab2 kec3 desa3 SLS4 sub2). */
export function kodeDesa(idsubsls: string): string {
  return idsubsls.slice(0, 10);
}
export function kodeSls(idsubsls: string): string {
  return idsubsls.slice(0, 14);
}
export const idSubSlsSah = (id: string): boolean => /^\d{16}$/.test(id);

/** Nomor HP -> hanya angka (untuk tautan tel:); null bila tidak masuk akal (kurang dari 8 digit). */
export function hpTel(hp: string | null | undefined): string | null {
  const d = String(hp ?? "").replace(/[^\d]/g, "");
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Nomor HP -> format internasional tanpa plus untuk tautan WhatsApp (0812... -> 62812...); null bila tidak sah. */
export function hpWa(hp: string | null | undefined): string | null {
  const d = hpTel(hp);
  if (!d) return null;
  if (d.startsWith("62")) return d;
  if (d.startsWith("0")) return `62${d.slice(1)}`;
  if (d.startsWith("8")) return `62${d}`;
  return d;
}
