// lib/vanguard/sertifikasi/nilai.ts  (HANYA server/tes: memuat templat dan kunci)
//
// (1 Nov 2026) VANGUARD V7d: kolam butir ujian, penyajian butir (bahan soal TANPA kunci), dan penilaian satu butir di server.
// Butir = kasus yang punya templat angka acak (kasus K: kuesioner/templat-k.json; kasus lama: kasus/templat-a.json, dst. bertambah per level).

import { kasusBenar } from "../engine";
import { kasusDariBenih, TEMPLAT_V1 } from "../kasus/acak";
import { MAKS_NILAI, MAKS_SEL } from "../konstanta";
import { soalK, TEMPLAT_K, nilaiKasusK } from "../kuesioner/nilaiK";
import { bersihkanIsian } from "../kuesioner/validasi";
import { selDikenal } from "../sel";
import type { Nilai } from "../tipe";
import { cacahKesalahan, poinButir } from "./skor";
import type { ButirKolam } from "./ujian";

const PUBLIK_V1 = ["kode", "level", "judul", "cerita", "info", "iv", "meta", "blok", "lengkap", "bebas", "nama"];

export const KOLAM: ButirKolam[] = [
  ...TEMPLAT_K.map((t) => ({ kode: t.kode, jenis: "k" as const, area: "IV" })),
  ...TEMPLAT_V1.map((t) => ({ kode: t.kode, jenis: "v1" as const, area: String(((t.kasus.blok as string[] | undefined) ?? ["?"]).join("+")) })),
];
export const cariKolam = (kode: string): ButirKolam | undefined => KOLAM.find((b) => b.kode === kode);

export type SoalSaji = { jenis: "k" | "v1"; kode: string; benih: number; judul: string; data: Record<string, unknown> };

/** Bahan soal untuk perangkat petugas. Tanpa kunci, alternatif, jebakan, petunjuk, langkah, pembahasan. */
export function sajikanButir(kode: string, benih: number): SoalSaji | null {
  const b = cariKolam(kode);
  if (!b) return null;
  if (b.jenis === "k") {
    const s = soalK(kode, benih);
    return s ? { jenis: "k", kode, benih, judul: s.judul, data: { cerita: s.cerita, catatan: s.catatan, info: s.info } } : null;
  }
  const k = kasusDariBenih(kode, benih) as unknown as Record<string, unknown> | undefined;
  if (!k) return null;
  return { jenis: "v1", kode, benih, judul: String(k.judul ?? kode), data: Object.fromEntries(PUBLIK_V1.filter((f) => k[f] !== undefined).map((f) => [f, k[f]])) };
}

export type RincianNilai = { jenis: string; tingkat: "fatal" | "berat" | "ringan"; pesan: string; sel: string | null; anda?: number | null; seharusnya?: number | null };
export type HasilButir = { benar: boolean; poin: number; fatal: number; berat: number; ringan: number; rincian: RincianNilai[]; isianBersih: unknown };

function bersihkanNilaiV1(mentah: unknown): { nilai: Nilai; galat: string | null } {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) return { nilai: {}, galat: "Isian tidak sah." };
  const o = mentah as Record<string, unknown>;
  const kunci = Object.keys(o);
  if (kunci.length > MAKS_SEL) return { nilai: {}, galat: "Isian terlalu banyak." };
  const nilai: Nilai = {};
  for (const k of kunci) {
    if (!selDikenal(k)) return { nilai: {}, galat: "Kotak tidak dikenal." };
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > MAKS_NILAI) return { nilai: {}, galat: "Nilai isian harus bilangan bulat nol atau lebih." };
    if (v !== 0) nilai[k] = v;
  }
  return { nilai, galat: null };
}

/** Menilai satu butir dari isian tak tepercaya. Galat isian dikembalikan sebagai { galat }. */
export function nilaiButir(kode: string, benih: number, isian: unknown): HasilButir | { galat: string } {
  const b = cariKolam(kode);
  if (!b) return { galat: "Butir tidak dikenal." };
  let rincian: RincianNilai[]; let benar: boolean; let isianBersih: unknown;
  if (b.jenis === "k") {
    const kasus = soalK(kode, benih);
    if (!kasus) return { galat: "Butir tidak dikenal." };
    const { isian: bersih, galat } = bersihkanIsian(isian);
    if (galat) return { galat };
    const h = nilaiKasusK(kasus as never, bersih);
    benar = h.benar; isianBersih = bersih;
    rincian = h.kesalahan.map((x) => ({ jenis: x.jenis, tingkat: x.tingkat, pesan: x.pesan, sel: x.art ? `R${x.r}A${x.art}` : `R${x.r}` }));
  } else {
    const kasus = kasusDariBenih(kode, benih);
    if (!kasus) return { galat: "Butir tidak dikenal." };
    const { nilai, galat } = bersihkanNilaiV1(isian);
    if (galat) return { galat };
    const h = kasusBenar(kasus, nilai);
    benar = h.benar; isianBersih = nilai;
    // "anda" dan "seharusnya" (rupiah; 0 = kosong) agar tinjauan dapat menampilkan jawaban petugas berdampingan dengan jawaban seharusnya
    const baris = new Map(h.evaluasi.rows.map((r) => [r.k, r]));
    rincian = h.evaluasi.fb.map((f) => { const r = f.k ? baris.get(f.k) : undefined; return { jenis: f.jenis, tingkat: f.tingkat, pesan: f.m, sel: f.k, ...(r ? { anda: r.u, seharusnya: r.e } : {}) }; });
    for (const p of h.pemeriksaan) if (!p.ok && !p.info && p.jenis) rincian.push({ jenis: p.jenis, tingkat: p.tingkat ?? "fatal", pesan: p.t, sel: null });
  }
  const c = cacahKesalahan(rincian);
  return { benar, poin: benar ? 100 : poinButir(c), ...c, rincian, isianBersih };
}

export type Penjelasan = { langkah: string[]; pembahasan: string; rujukan: string };
/** Cara benar mengisi butir (langkah, pembahasan, rujukan) untuk pop-up penjelasan. Hanya dikirim SETELAH butir dijawab (latihan) atau ujian selesai. */
export function penjelasanButir(kode: string, benih: number): Penjelasan | null {
  const b = cariKolam(kode);
  if (!b) return null;
  if (b.jenis === "k") {
    const k = soalK(kode, benih) as unknown as { petunjuk?: string[]; pembahasan?: string; rujukan?: string } | undefined;
    return k ? { langkah: [], pembahasan: String(k.pembahasan ?? ""), rujukan: String(k.rujukan ?? "") } : null;
  }
  const k = kasusDariBenih(kode, benih) as unknown as { langkah?: string[]; pembahasan?: string; rujukan?: string } | undefined;
  return k ? { langkah: Array.isArray(k.langkah) ? k.langkah.map(String) : [], pembahasan: String(k.pembahasan ?? ""), rujukan: String(k.rujukan ?? "") } : null;
}
