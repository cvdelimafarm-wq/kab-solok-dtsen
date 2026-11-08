// lib/wilayahSampelIdent.ts
//
// (7 Nov 2026) "Wilayah tugas" pada Identifikasi lanjutan TIDAK diketik lagi: daftarnya dibaca dari alokasi sub SLS pada Kelola Pendataan
// (Persiapan > Alokasi sub SLS), yaitu wilayah sampel kegiatan pendataan yang satu induk dengan Identifikasi itu. Berkas ini hanya fungsi murni
// (peringkas dan penyusun teks surat pengantar nagari); pembacaan basis data ada di lib/portal/wilayahSampelIdent.ts.

/** Satu nagari yang memuat sub SLS sampel. */
export type NagariSampel = { kecamatan: string; nagari: string; sub_sls: number; target: number };

export type KegiatanSampel = { id: number; nama: string };

export type DataWilayahSampel = {
  /** Identifikasi tertaut ke kegiatan (langsung atau lewat induk) yang berjenis pendataan */
  tertaut: boolean;
  /** tabel alokasi sudah ada (migrasi sudah dijalankan) */
  siap: boolean;
  kegiatan: KegiatanSampel[];
  nagari: NagariSampel[];
  total_sub_sls: number;
  total_target: number;
  /** sub SLS beralokasi yang kecamatan/nagarinya tidak ditemukan di master (tidak ikut daftar nagari) */
  tanpa_master: number;
  /** Isi kolom `sub_sls` per nagari dan total: sub SLS (model 1), objek (model 2/3), atau campuran. Tanpa nilai = sub SLS. (8 Nov 2026, D4) */
  satuan?: "sub SLS" | "objek" | "unit";
};

export const WILAYAH_SAMPEL_KOSONG: DataWilayahSampel = { tertaut: false, siap: true, kegiatan: [], nagari: [], total_sub_sls: 0, total_target: 0, tanpa_master: 0, satuan: "sub SLS" };

const ANGKA_ROMAWI = /^(?=[IVXLC]+$)(?:X{0,3})(?:IX|IV|V?I{0,3})$/;

/** "KUBUNG" -> "Kubung"; "X KOTO DIATAS" -> "X Koto Diatas" (angka Romawi dipertahankan). */
export function judulWilayah(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((k) => (k === "" ? k : ANGKA_ROMAWI.test(k) ? k : k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()))
    .join(" ");
}

type BarisWilayah = { kecamatan: string; nagari: string; target: number };

/** Ringkas sub SLS beralokasi menjadi satu baris per (kecamatan, nagari), urut kecamatan lalu nagari. Baris tanpa nama nagari dilewati. */
export function ringkasNagari(wilayah: readonly BarisWilayah[]): { nagari: NagariSampel[]; tanpa_master: number } {
  const peta = new Map<string, NagariSampel>();
  let tanpa = 0;
  for (const w of wilayah) {
    const kec = judulWilayah(w.kecamatan ?? "");
    const nag = judulWilayah(w.nagari ?? "");
    if (kec === "" || nag === "") { tanpa += 1; continue; }
    const kunci = `${kec}|${nag}`;
    const ada = peta.get(kunci);
    const t = Number.isFinite(w.target) ? Math.max(0, Math.floor(w.target)) : 0;
    if (ada) { ada.sub_sls += 1; ada.target += t; } else peta.set(kunci, { kecamatan: kec, nagari: nag, sub_sls: 1, target: t });
  }
  const nagari = [...peta.values()].sort((a, b) => a.kecamatan.localeCompare(b.kecamatan, "id") || a.nagari.localeCompare(b.nagari, "id"));
  return { nagari, tanpa_master: tanpa };
}

/** Satu nagari per baris, sebagai alamat tujuan surat pengantar kegiatan. */
export function teksSuratNagari(nagari: readonly Pick<NagariSampel, "kecamatan" | "nagari">[]): string {
  return nagari.map((n) => `Nagari ${n.nagari}, Kecamatan ${n.kecamatan}`).join("\n");
}

/** Terlalu panjang untuk isian (maks 2000 huruf di lib/keu/lanjutan.ts)? Dipotong di batas baris agar tidak ada baris setengah. */
export const MAKS_TEKS_WILAYAH = 2000;
export function teksSuratAman(nagari: readonly Pick<NagariSampel, "kecamatan" | "nagari">[]): { teks: string; terpotong: number } {
  const baris = nagari.map((n) => `Nagari ${n.nagari}, Kecamatan ${n.kecamatan}`);
  let teks = "";
  let dipakai = 0;
  for (const b of baris) {
    const calon = teks === "" ? b : `${teks}\n${b}`;
    if (calon.length > MAKS_TEKS_WILAYAH) break;
    teks = calon;
    dipakai += 1;
  }
  return { teks, terpotong: baris.length - dipakai };
}

/** Isian tersimpan sama dengan daftar alokasi sekarang? (abaikan spasi dan urutan baris) */
export function samaDenganAlokasi(tersimpan: string, teksAlokasi: string): boolean {
  const norm = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean).sort().join("\n");
  return norm(tersimpan) === norm(teksAlokasi);
}

/** Kegiatan pendataan yang jadi sumber wilayah: dari kegiatan tertaut, kegiatan pada induk yang sama, disaring jenis pendataan. */
export function pilihKegiatanPendataan(
  tertaut: readonly number[],
  induk: readonly { kegiatan_ids: readonly (string | number)[] }[],
  jenis: ReadonlyMap<number, { jenis: string; nama: string }>,
): KegiatanSampel[] {
  const calon = new Set<number>(tertaut);
  for (const i of induk) {
    const ids = i.kegiatan_ids.map(Number).filter((n) => Number.isInteger(n));
    if (ids.some((x) => tertaut.includes(x))) ids.forEach((x) => calon.add(x));
  }
  return [...calon]
    .filter((id) => jenis.get(id)?.jenis === "pendataan")
    .sort((a, b) => a - b)
    .map((id) => ({ id, nama: jenis.get(id)?.nama ?? `Kegiatan ${id}` }));
}
