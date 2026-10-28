// lib/sigapSpjCetak.ts  (murni, tanpa Supabase/React)
//
// (28 Okt 2026) Unduh SPJ untuk tim administrasi (Kelola Pendataan > Administrasi & SPJ > Unduh SPJ). Logika murni:
//  - rentang cetak: hari dibayar dibatasi [dari, sampai]; kelompok (kwitansi/visum/surat pernyataan) dan nominal dihitung ulang dari rentang;
//  - memilih peran (semua/korwil/PML/PPL) dan mengurutkan petugas (menurut tim: korwil -> tiap PML diikuti PPL-nya; atau abjad);
//  - ringkasan (petugas, hari, nominal) dan nama berkas keluaran.
import { kelompokTanggal } from "@/lib/sigap";

// Jenis dokumen SPJ (definisi di sini supaya layar admin tidak menarik lib/sigapDokumen.ts yang memuat modul server seperti sharp; sigapDokumen mengekspor ulang).
export type JenisDok = "surat_tugas" | "kwitansi" | "visum" | "laporan" | "dokumentasi" | "surat_pernyataan";

/** Urutan baku di PDF gabungan (per kelompok: kwitansi, visum, surat pernyataan, lalu laporan & dokumentasi per hari). */
export const URUTAN_JENIS: JenisDok[] = ["surat_tugas", "kwitansi", "visum", "surat_pernyataan", "laporan", "dokumentasi"];

export const LABEL_JENIS: Record<JenisDok, string> = {
  surat_tugas: "Surat Tugas",
  kwitansi: "Kwitansi",
  visum: "Visum",
  surat_pernyataan: "Surat Pernyataan Kendaraan Dinas",
  laporan: "Laporan",
  dokumentasi: "Dokumentasi",
};

export type FilterPeran = "semua" | "korwil" | "pml" | "ppl";
export type UrutCetak = "tim" | "abjad";
export type FormatCetak = "pdf" | "zip";

export const PILIHAN_PERAN: { kode: FilterPeran; label: string }[] = [
  { kode: "semua", label: "Semua peran" },
  { kode: "korwil", label: "Korwil saja" },
  { kode: "pml", label: "PML saja" },
  { kode: "ppl", label: "PPL saja" },
];

/** Maksimum petugas per PDF gabungan (memori browser); lebih dari itu dibagi beberapa PDF. */
export const MAKS_PER_PDF = 8;

export type PetugasCetak = {
  penugasan_id: number;
  akun_id: number;
  nama: string;
  peran: string;
  /** akun PML tim ini (untuk PML = dirinya sendiri, untuk PPL = atasannya); null = tanpa tim */
  tim_akun_id: number | null;
  tim_nama: string | null;
  /** tanggal yang dibayar (semua kelompok), format YYYY-MM-DD */
  dibayar: string[];
  tarif: number;
};

const iso = /^\d{4}-\d{2}-\d{2}$/;
export const tanggalIso = (s: string | null | undefined): s is string => !!s && iso.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Rentang valid bila dua-duanya kosong (semua) atau dua-duanya tanggal valid dengan dari <= sampai. Satu sisi saja = tidak valid. */
export function rentangValid(dari?: string | null, sampai?: string | null): boolean {
  if (!dari && !sampai) return true;
  return tanggalIso(dari) && tanggalIso(sampai) && dari <= sampai;
}

/** Tanggal dibayar yang jatuh dalam rentang (kosong = semua). Hasil urut & unik. */
export function dibayarDalamRentang(dibayar: string[], dari?: string | null, sampai?: string | null): string[] {
  const unik = Array.from(new Set(dibayar)).sort();
  if (!dari && !sampai) return unik;
  return unik.filter((t) => (!dari || t >= dari) && (!sampai || t <= sampai));
}

/** Kelompok tanggal berurutan + nominal (jumlah hari x tarif) dihitung ulang dari hari dibayar dalam rentang. */
export function kelompokRentang(dibayar: string[], tarif: number, dari?: string | null, sampai?: string | null) {
  return kelompokTanggal(dibayarDalamRentang(dibayar, dari, sampai)).map((k) => ({ ...k, nominal: k.jumlah_hari * tarif }));
}

export function saringPeran<T extends { peran: string }>(daftar: T[], filter: FilterPeran): T[] {
  return filter === "semua" ? [...daftar] : daftar.filter((p) => p.peran === filter);
}

const bandingNama = (a: string, b: string) => a.localeCompare(b, "id", { sensitivity: "base" });
const RANK_PERAN: Record<string, number> = { korwil: 0, supervisor: 1, pml: 2, ppl: 3 };
const rank = (p: string) => RANK_PERAN[p] ?? 9;

/**
 * Urutan cetak.
 *  - "abjad": nama A-Z (peran tidak mempengaruhi).
 *  - "tim": korwil (abjad), supervisor (abjad), lalu tiap tim menurut nama PML; dalam tim PML lebih dulu, lalu PPL-nya (abjad).
 *    PPL yang atasannya tidak ikut daftar (mis. filter "PPL saja") tetap dikelompokkan per tim; tanpa tim di paling akhir.
 */
export function urutkanPetugas<T extends Pick<PetugasCetak, "nama" | "peran" | "tim_akun_id" | "tim_nama">>(daftar: T[], urut: UrutCetak): T[] {
  const salin = [...daftar];
  if (urut === "abjad") return salin.sort((a, b) => bandingNama(a.nama, b.nama) || rank(a.peran) - rank(b.peran));
  const lokasi = (p: T) => (p.peran === "korwil" ? 0 : p.peran === "supervisor" ? 1 : p.tim_akun_id != null ? 2 : 3);
  return salin.sort((a, b) => {
    const la = lokasi(a);
    const lb = lokasi(b);
    if (la !== lb) return la - lb;
    if (la === 2) {
      const t = bandingNama(a.tim_nama ?? "", b.tim_nama ?? "");
      if (t) return t;
      if (a.tim_akun_id !== b.tim_akun_id) return (a.tim_akun_id ?? 0) - (b.tim_akun_id ?? 0);
      const pa = a.peran === "pml" ? 0 : 1;
      const pb = b.peran === "pml" ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return bandingNama(a.nama, b.nama);
  });
}

export type RingkasCetak = { petugas: number; tanpaHari: number; hari: number; nominal: number };

/** Ringkasan untuk pratinjau: petugas yang punya hari dibayar dalam rentang, jumlah hari-orang, dan total nominal. */
export function ringkasCetak(daftar: Pick<PetugasCetak, "dibayar" | "tarif">[], dari?: string | null, sampai?: string | null): RingkasCetak {
  let petugas = 0;
  let tanpaHari = 0;
  let hari = 0;
  let nominal = 0;
  for (const p of daftar) {
    const n = dibayarDalamRentang(p.dibayar, dari, sampai).length;
    if (n === 0) {
      tanpaHari++;
      continue;
    }
    petugas++;
    hari += n;
    nominal += n * p.tarif;
  }
  return { petugas, tanpaHari, hari, nominal };
}

const aman = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "SIGAP";

/** SPJ_<kode>_<dari>_<sampai | semua>[_bagian-i-dari-n].<pdf|zip> */
export function namaBerkasCetak(kode: string, dari: string | null | undefined, sampai: string | null | undefined, bagian: number, jumlahBagian: number, format: FormatCetak): string {
  const rentang = dari && sampai ? `${dari}_sd_${sampai}` : "semua-hari";
  return `SPJ_${aman(kode)}_${rentang}${jumlahBagian > 1 ? `_bagian-${bagian}-dari-${jumlahBagian}` : ""}.${format}`;
}

/** Teks rentang untuk tampilan: "1-20 Okt 2026" tidak dipakai; cukup "2026-10-01 s.d. 2026-10-20" agar tanpa ambiguitas. */
export const teksRentang = (dari?: string | null, sampai?: string | null) => (dari && sampai ? `${dari} s.d. ${sampai}` : "semua hari pendataan");

/** Ringkasan satu kalimat susunan: "Urut menurut tim: Korwil, lalu tiap PML diikuti PPL-nya." */
export function teksUrutan(urut: UrutCetak, filter: FilterPeran): string {
  if (urut === "abjad") return "Urut abjad nama.";
  if (filter === "pml") return "Urut menurut tim (nama PML), hanya PML.";
  if (filter === "ppl") return "Urut menurut tim (nama PML-nya), hanya PPL.";
  if (filter === "korwil") return "Hanya korwil, urut abjad.";
  return "Urut menurut tim: korwil, lalu tiap PML diikuti PPL-nya.";
}

/**
 * Peta tim per akun dari data mentah: PML = timnya sendiri; PPL = PML atasannya (lewat bencana_petugas.atasan_id); peran lain / tanpa atasan = tidak ada.
 * `akun`: sigap_akun (id, petugas_bencana_id); `petugas`: bencana_petugas (id, atasan_id); `akunAtasan`: sigap_akun milik atasan (id, nama, petugas_bencana_id).
 */
export function petaTim(
  penugasan: { akun_id: number; peran: string; nama: string }[],
  akun: { id: number; petugas_bencana_id: number | null }[],
  petugas: { id: number; atasan_id: number | null }[],
  akunAtasan: { id: number; nama: string; petugas_bencana_id: number | null }[]
): Map<number, { id: number; nama: string }> {
  const hasil = new Map<number, { id: number; nama: string }>();
  for (const p of penugasan) {
    if (p.peran === "pml") {
      hasil.set(p.akun_id, { id: p.akun_id, nama: p.nama });
    } else if (p.peran === "ppl") {
      const pb = akun.find((x) => x.id === p.akun_id)?.petugas_bencana_id;
      const atasan = pb == null ? null : petugas.find((x) => x.id === pb)?.atasan_id;
      const aa = atasan == null ? undefined : akunAtasan.find((x) => x.petugas_bencana_id === atasan);
      if (aa) hasil.set(p.akun_id, { id: aa.id, nama: aa.nama });
    }
  }
  return hasil;
}
