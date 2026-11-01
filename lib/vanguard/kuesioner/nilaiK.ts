// lib/vanguard/kuesioner/nilaiK.ts  (murni, HANYA server/tes: memuat kunci)
//
// (1 Nov 2026) VANGUARD V6c: kasus K ("catatan konsumsi" fiktif, Mode Kuesioner Penuh) dan penilaian per entri.
// Kunci = daftar entri Blok IV.1 yang harus tercatat (rincian R.x, K1–K4, bila perlu nama dan satuan untuk baris "lainnya"). Petugas menyalin catatan ke kuesioner; penilai membandingkan isian dengan kunci.
// Jenis kesalahan (menambah jenis V1, tidak mengubahnya): salah_rincian (fatal), salah_sumber (fatal), harus_kosong (fatal), belum_diisi (berat), nama_lainnya (berat), banyaknya_meleset dan angka_meleset (ringan sampai 5%, berat lebih dari itu).
// Toleransi: nilai rupiah ±Rp1, banyaknya ±0,01. Rekap IV.3.2 dihitung engine dari isian petugas dan dibandingkan dengan rekap kunci.

import data from "./templat-k.json";
import { susunSoalK, type SoalK, type TemplatK } from "./templat";
import { hitungIv1, rekapIv32, type EntriIv1 } from "./engine";
import { rincianLainnya, cariRincianIv1 } from "./rincian";

export type IsianK = EntriIv1 & { nama?: string; satuan?: string };
export type KasusK = {
  kode: string; judul: string; level: "K"; cerita: string; catatan: string[]; info: string[];
  kunci: IsianK[]; jebakan: { r: number; k: string; m: string }[]; petunjuk: string[]; pembahasan: string; rujukan: string;
};
export const TEMPLAT_K = data as unknown as TemplatK[];
/** Soal K untuk satu benih. Benih 0 = angka baku (kasus asli). Kunci dibangun di server dari benih. */
export const soalK = (kode: string, benih = 0): SoalK | undefined => { const t = TEMPLAT_K.find((x) => x.kode === kode); return t ? susunSoalK(t, benih) : undefined; };
export const cariKasusK = (kode: string, benih = 0): KasusK | undefined => soalK(kode, benih) as unknown as KasusK | undefined;
/** Kasus pada angka baku (benih 0): dasar tes dan pembanding. */
export const KASUS_K = TEMPLAT_K.map((t) => susunSoalK(t, 0) as unknown as KasusK);

export type JenisK = "belum_diisi" | "salah_rincian" | "salah_sumber" | "harus_kosong" | "banyaknya_meleset" | "angka_meleset" | "nama_lainnya" | "salah_art" | "kode_sumber";
export type TingkatK = "fatal" | "berat" | "ringan";
export type KesalahanK = { jenis: JenisK; tingkat: TingkatK; r: number; art: number | null; pesan: string };
export type HasilK = { benar: boolean; kesalahan: KesalahanK[]; sesuai: number; total: number; rekapSesuai: boolean };

export const TINGKAT_K: Record<JenisK, TingkatK> = { belum_diisi: "berat", salah_rincian: "fatal", salah_sumber: "fatal", harus_kosong: "fatal", banyaknya_meleset: "berat", angka_meleset: "ringan", nama_lainnya: "berat", salah_art: "berat", kode_sumber: "berat" };

export const KET_SUMBER: Record<number, string> = { 0: "bukan pembelian (pemberian, dll.)", 1: "pembelian online", 2: "pembelian offline", 3: "pembelian online dan offline" };
const n = (x: number | undefined): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const kunciBaris = (e: IsianK): string => `${e.r}|${e.art ?? 0}`;
const nilaiBeli = (e: IsianK) => n(e.k2), nilaiProd = (e: IsianK) => n(e.k4);
const kosong = (e: IsianK) => n(e.k1) === 0 && n(e.k2) === 0 && n(e.k3) === 0 && n(e.k4) === 0;
const norm = (s: string | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const dekat = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const persen = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : Math.abs(a - b) / Math.abs(b));
const fmt = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export function nilaiKasusK(kasus: Pick<KasusK, "kunci" | "jebakan">, isianMentah: IsianK[]): HasilK {
  const isian = new Map<string, IsianK>();
  for (const e of isianMentah) if (!kosong(e)) isian.set(kunciBaris(e), e);
  const kunci = new Map(kasus.kunci.map((e) => [kunciBaris(e), e]));
  const kesalahan: KesalahanK[] = [];
  const tambah = (jenis: JenisK, e: { r: number; art?: number }, pesan: string, tingkat: TingkatK = TINGKAT_K[jenis]) => kesalahan.push({ jenis, tingkat, r: e.r, art: e.art ?? null, pesan: e.art ? `ART ${e.art}: ${pesan}` : pesan });
  const dipakai = new Set<string>();
  const V = (r: number, k: number) => `R${r}K${k}`;
  let sesuai = 0;

  for (const [kb, k] of kunci) {
    const i = isian.get(kb);
    if (!i) {
      // adakah nilai yang sama pada rincian lain (salah letak)?
      const target = nilaiBeli(k) + nilaiProd(k);
      const lain = [...isian.entries()].find(([ib, x]) => !kunci.has(ib) && !dipakai.has(ib) && dekat(nilaiBeli(x) + nilaiProd(x), target, 1) && target > 0);
      if (lain && lain[1].r === k.r && lain[1].art !== k.art) {
        dipakai.add(lain[0]);
        tambah("salah_art", k, `R${k.r} dicatat pada ART ${lain[1].art ?? 1}, seharusnya pada ART ${k.art}.`);
      } else if (lain) {
        dipakai.add(lain[0]);
        const khas = kasus.jebakan.find((j) => j.r === k.r);
        tambah("salah_rincian", lain[1], `Nilai Rp${fmt(target)} dicatat pada R${lain[1].r}, seharusnya pada R${k.r}${cariRincianIv1(k.r) ? ` (${cariRincianIv1(k.r)!.nama})` : ""}.${khas ? ` ${khas.m}` : ""}`);
      } else tambah("belum_diisi", k, `Rincian R${k.r}${cariRincianIv1(k.r) ? ` (${cariRincianIv1(k.r)!.nama})` : ""} belum diisi.`);
      continue;
    }
    dipakai.add(kb);
    const mulaiSalah = kesalahan.length;
    const beliKunci = n(k.k2) > 0 || n(k.k1) > 0, beliIsian = n(i.k2) > 0 || n(i.k1) > 0;
    const prodKunci = n(k.k4) > 0 || n(k.k3) > 0, prodIsian = n(i.k4) > 0 || n(i.k3) > 0;
    if (beliKunci && !beliIsian && prodIsian && !prodKunci) tambah("salah_sumber", k, `${V(k.r, 1)}–${V(k.r, 2)}: ini pembelian (kolom 5 dan 6), bukan produksi sendiri/pemberian.`);
    else if (prodKunci && !prodIsian && beliIsian && !beliKunci) tambah("salah_sumber", k, `${V(k.r, 3)}–${V(k.r, 4)}: ini produksi sendiri/pemberian (kolom 7 dan 8), bukan pembelian.`);
    else {
      const cek = (kb: 1 | 2 | 3 | 4) => {
        const kv = n(k[`k${kb}` as "k1"]), iv = n(i[`k${kb}` as "k1"]);
        if (kv === 0 && iv === 0) return;
        const nilaiKol = kb === 2 || kb === 4;
        if (nilaiKol ? dekat(iv, kv, 1) : dekat(iv, kv, 0.011)) return;
        if (kv === 0) { tambah("harus_kosong", k, `${V(k.r, kb)} seharusnya kosong.`); return; }
        const rel = persen(iv, kv);
        if (nilaiKol) tambah("angka_meleset", k, `${V(k.r, kb)} terisi Rp${fmt(iv)}, seharusnya Rp${fmt(kv)}.`, rel <= 0.05 ? "ringan" : "berat");
        else tambah("banyaknya_meleset", k, `${V(k.r, kb)} terisi ${fmt(iv)}, seharusnya ${fmt(kv)} (periksa konversi satuan).`, rel <= 0.05 ? "ringan" : "berat");
      };
      ([1, 2, 3, 4] as const).forEach(cek);
    }
    if (k.sumber !== undefined && i.sumber !== k.sumber) tambah("kode_sumber", k, `${V(k.r, 7)} (kode sumber perolehan) seharusnya ${k.sumber}: ${KET_SUMBER[k.sumber] ?? ""}.`);
    if (k.nama !== undefined && norm(i.nama) !== norm(k.nama)) tambah("nama_lainnya", k, `Baris "lainnya" R${k.r} harus ditulis ${k.nama}${k.satuan ? ` dengan satuan ${k.satuan}` : ""}.`);
    else if (k.satuan !== undefined && norm(i.satuan) !== norm(k.satuan)) tambah("nama_lainnya", k, `Satuan baris R${k.r} harus ${k.satuan}.`);
    if (kesalahan.length === mulaiSalah) sesuai += 1;
  }
  for (const [ib, x] of isian) if (!kunci.has(ib) && !dipakai.has(ib)) tambah("harus_kosong", x, `Rincian R${x.r} tidak seharusnya terisi pada catatan ini.`);

  // petunjuk jebakan khas: pesan ditempel pada kesalahan pertama di rincian yang sama
  for (const j of kasus.jebakan) { const s = kesalahan.find((x) => x.r === j.r); if (s) s.pesan += ` ${j.m}`; }

  const a = rekapIv32(hitungIv1(kasus.kunci)), b = rekapIv32(hitungIv1(isianMentah));
  const rekapSesuai = a.every((x, idx) => x.k3 === b[idx].k3 && x.k4 === b[idx].k4 && x.k5 === b[idx].k5);
  return { benar: kesalahan.length === 0, kesalahan, sesuai, total: kunci.size, rekapSesuai };
}

/** Isian kosong, untuk tes dan layar. */
export const isianKosong = (): IsianK[] => [];
export { rincianLainnya };
