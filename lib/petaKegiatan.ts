// lib/petaKegiatan.ts  (murni, tanpa DOM)
//
// (8 Nov 2026, E1) Peta dasar jalan per KEGIATAN (survei model 1, alokasi per sub SLS). Satu berkas PMTiles per PPL, per PML, dan satu untuk semua wilayah
// (Korwil/Supervisor), dibuat di laptop `node scripts/peta/potong-peta.mjs --kegiatan=ID` dari alokasi aktif + batas sub SLS, disimpan di bucket "peta-dasar"
// bersama berkas lain (manifest sama). Rumus kunci dan sidik HARUS sama dengan scripts/peta/wilayah-kegiatan.mjs (diuji silang).
//   kunci = 100.000.000.000 + kegiatan_id x 10.000.000 + peran x 1.000.000 + akun      peran: 1 = PPL, 2 = PML, 3 = semua (akun 0)

import type { ManifestDasar } from "@/lib/petaDasar";

export const DASAR_KUNCI_KEGIATAN = 100_000_000_000;
export type PeranPeta = "ppl" | "pml" | "semua";
export const KODE_PERAN_PETA: Record<PeranPeta, number> = { ppl: 1, pml: 2, semua: 3 };
export const LABEL_PERAN_PETA: Record<PeranPeta, string> = { ppl: "PPL", pml: "PML", semua: "Semua wilayah (Korwil/Supervisor)" };

const bulat = (n: number, maks: number) => Number.isInteger(n) && n >= 0 && n < maks;

/** Kunci numerik berkas peta kegiatan; null bila di luar jangkauan. */
export function kunciPetaKegiatan(kegiatanId: number, peran: PeranPeta, akunId = 0): number | null {
  const kode = KODE_PERAN_PETA[peran];
  if (!kode || !bulat(kegiatanId, 10_000) || kegiatanId < 1) return null;
  const akun = peran === "semua" ? 0 : akunId;
  if (!bulat(akun, 1_000_000) || (peran !== "semua" && akun < 1)) return null;
  return DASAR_KUNCI_KEGIATAN + kegiatanId * 10_000_000 + kode * 1_000_000 + akun;
}

/** Kunci peta untuk pemakai Lembar sampel menurut perannya (Korwil/Supervisor memakai berkas "semua"); null bila belum bisa ditentukan. */
export function kunciPetaSaya(kegiatanId: number, peran: "ppl" | "pml" | "korwil" | "supervisor" | null | undefined, akunId: number | null | undefined): number | null {
  if (peran === "korwil" || peran === "supervisor") return kunciPetaKegiatan(kegiatanId, "semua");
  if ((peran === "ppl" || peran === "pml") && akunId != null) return kunciPetaKegiatan(kegiatanId, peran, akunId);
  return null;
}

/** Sidik jari pendek FNV-1a 32 bit (sama dengan sidik() di scripts/peta/wilayah.mjs). */
export function sidikTeks(teks: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Sidik himpunan sub SLS (urutan dan duplikat tidak berpengaruh). */
export function sidikAlokasi(idsubsls: readonly string[]): string {
  return sidikTeks([...new Set(idsubsls)].sort().join(","));
}

// ------------------------------------------------------------------ kelompok dan status
export type BarisAlokasiPeta = { idsubsls: string; ppl_akun_id: number | null; pml_akun_id: number | null; ppl_nama?: string | null; pml_nama?: string | null };

export type KelompokPeta = {
  kunci: number;
  peran: PeranPeta;
  akun: number;
  nama: string;
  subsls: string[];
  hash: string;
};

/** Susunan berkas yang seharusnya ada untuk satu kegiatan: "semua" lebih dulu, lalu PML, lalu PPL (urut nama). */
export function kelompokPetaKegiatan(wilayah: readonly BarisAlokasiPeta[], kegiatanId: number): KelompokPeta[] {
  const grup = new Map<number, { peran: PeranPeta; akun: number; nama: string; ids: Set<string> }>();
  const tambah = (peran: PeranPeta, akun: number, nama: string, id: string) => {
    const kunci = kunciPetaKegiatan(kegiatanId, peran, akun);
    if (kunci == null) return;
    let g = grup.get(kunci);
    if (!g) grup.set(kunci, (g = { peran, akun, nama, ids: new Set() }));
    g.ids.add(id);
  };
  for (const w of wilayah) {
    tambah("semua", 0, LABEL_PERAN_PETA.semua, w.idsubsls);
    if (w.ppl_akun_id != null) tambah("ppl", w.ppl_akun_id, w.ppl_nama || `Akun ${w.ppl_akun_id}`, w.idsubsls);
    if (w.pml_akun_id != null) tambah("pml", w.pml_akun_id, w.pml_nama || `Akun ${w.pml_akun_id}`, w.idsubsls);
  }
  const urutPeran: Record<PeranPeta, number> = { semua: 0, pml: 1, ppl: 2 };
  return [...grup]
    .map(([kunci, g]) => ({ kunci, peran: g.peran, akun: g.akun, nama: g.nama, subsls: [...g.ids].sort(), hash: sidikAlokasi([...g.ids]) }))
    .sort((a, b) => urutPeran[a.peran] - urutPeran[b.peran] || a.nama.localeCompare(b.nama, "id") || a.kunci - b.kunci);
}

/** belum = tidak ada di manifest; usang = ada tetapi alokasi berubah sejak dipotong; ada = sesuai; lama = ada, dipotong sebelum hash dicatat (tak bisa dibandingkan). */
export type StatusPeta = "belum" | "usang" | "ada" | "lama";

export function statusPetaTim(manifest: ManifestDasar | null, k: Pick<KelompokPeta, "kunci" | "hash">): { status: StatusPeta; ukuran: number } {
  const b = manifest?.tim[String(k.kunci)];
  if (!b) return { status: "belum", ukuran: 0 };
  if (!b.hash) return { status: "lama", ukuran: b.ukuran };
  return { status: b.hash === k.hash ? "ada" : "usang", ukuran: b.ukuran };
}

export type RekapPeta = { total: number; ada: number; usang: number; belum: number; lama: number; byte: number };

export function rekapPeta(manifest: ManifestDasar | null, kelompok: readonly KelompokPeta[]): RekapPeta {
  const r: RekapPeta = { total: kelompok.length, ada: 0, usang: 0, belum: 0, lama: 0, byte: 0 };
  for (const k of kelompok) {
    const s = statusPetaTim(manifest, k);
    r[s.status]++;
    r.byte += s.ukuran;
  }
  return r;
}

/** Perintah laptop (dari folder proyek) untuk membuat/memperbarui berkas. Tanpa kunci: seluruh kegiatan. */
export function perintahPeta(kegiatanId: number, kunci?: number): string {
  return `node scripts/peta/potong-peta.mjs --kegiatan=${kegiatanId}${kunci != null ? ` --tim=${kunci}` : ""} --unggah`;
}

export const perintahPerkiraanPeta = (kegiatanId: number) => `node scripts/peta/potong-peta.mjs --kegiatan=${kegiatanId} --perkiraan`;
