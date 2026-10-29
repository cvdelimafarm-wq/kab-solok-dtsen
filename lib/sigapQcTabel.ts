// lib/sigapQcTabel.ts
//
// (29 Okt 2026) Tabel hasil QC Pemahaman per petugas (tab QC Kelola Pendataan): satu baris per orang (PML dan PPL), kolom
// Nama · Peran · Nama PML · Jumlah percobaan · Nilai P1..Pn. Murni (tanpa DB / tanpa React) supaya bisa diuji.
// Sumber: rekap per tim (QcRekapTim) + rincian per percobaan (RincianQc, boleh kosong pada API lama).

import type { QcRekapTim } from "@/lib/sigapQc";
import { bacaPmlSendiri, type RincianQc } from "@/lib/sigapQcMonitor";

export type BarisQc = {
  akun_id: number;
  nama: string;
  peran: "PML" | "PPL";
  /** Nama PML timnya; untuk baris PML = null. */
  pml: string | null;
  percobaan: number;
  /** Nilai per percobaan, indeks 0 = P1. null = percobaan itu belum ada. */
  nilai: (number | null)[];
  terbaik: number | null;
  lulus: boolean;
  terlambat: boolean;
};

export type StatusSaring = "semua" | "belum" | "tidak_lulus" | "lulus";

/** Jumlah kolom nilai: sebanyak maksimum percobaan pengaturan (minimal 1), melebar bila ada petugas yang percobaannya lebih banyak. Batas 10. */
export function jumlahKolomNilai(maks: number, rincian?: RincianQc): number {
  let k = Number.isFinite(maks) && maks >= 1 ? Math.floor(maks) : 4;
  if (rincian) {
    for (const daftar of Object.values(rincian.percobaan)) for (const x of daftar) if (x.ke > k) k = x.ke;
  }
  return Math.min(Math.max(k, 1), 10);
}

function nilaiPerPercobaan(akunId: number, rincian: RincianQc | undefined, kolom: number): { nilai: (number | null)[]; terlambat: boolean; jumlah: number } {
  const nilai: (number | null)[] = Array.from({ length: kolom }, () => null);
  const daftar = rincian?.percobaan[akunId] ?? [];
  let terlambat = false;
  for (const x of daftar) {
    if (x.ke >= 1 && x.ke <= kolom) nilai[x.ke - 1] = x.skor;
    if (x.terlambat) terlambat = true;
  }
  return { nilai, terlambat, jumlah: daftar.length };
}

/** Urutan baris mengikuti tim: PML dahulu, lalu PPL-nya (urutan dari server). */
export function susunBarisQc(rekap: QcRekapTim[], rincian: RincianQc | undefined, kolom: number): BarisQc[] {
  const out: BarisQc[] = [];
  for (const t of rekap) {
    if (t.pml_akun_id != null) {
      const ps = bacaPmlSendiri(t.pml_sendiri);
      const r = nilaiPerPercobaan(t.pml_akun_id, rincian, kolom);
      const percobaan = Math.max(ps?.percobaan ?? 0, r.jumlah);
      const nilai = r.nilai;
      if (r.jumlah === 0 && ps && ps.skor_terbaik != null && kolom > 0) nilai[0] = ps.skor_terbaik; // API lama: hanya nilai terbaik yang diketahui
      out.push({ akun_id: t.pml_akun_id, nama: t.pml_nama, peran: "PML", pml: null, percobaan, nilai, terbaik: ps?.skor_terbaik ?? null, lulus: !!ps?.lulus, terlambat: r.terlambat });
    }
    for (const x of t.ppl) {
      const r = nilaiPerPercobaan(x.akun_id, rincian, kolom);
      const nilai = r.nilai;
      if (r.jumlah === 0 && x.skor_awal != null && kolom > 0) nilai[0] = x.skor_awal; // API lama: hanya nilai awal
      out.push({ akun_id: x.akun_id, nama: x.nama, peran: "PPL", pml: t.pml_nama || null, percobaan: Math.max(x.percobaan, r.jumlah), nilai, terbaik: x.skor_terbaik, lulus: x.lulus, terlambat: x.terlambat || r.terlambat });
    }
  }
  return out;
}

/** Penyaring tabel: kata pencarian (nama petugas ATAU nama PML, tanpa huruf besar/kecil) dan status. */
export function saringBarisQc(baris: BarisQc[], cari: string, status: StatusSaring): BarisQc[] {
  const kata = cari.trim().toLowerCase();
  return baris.filter((b) => {
    if (kata && !b.nama.toLowerCase().includes(kata) && !(b.pml ?? "").toLowerCase().includes(kata)) return false;
    if (status === "belum") return b.percobaan === 0;
    if (status === "tidak_lulus") return b.percobaan > 0 && !b.lulus;
    if (status === "lulus") return b.lulus;
    return true;
  });
}

/** Ringkasan jumlah per status (untuk lencana penyaring). */
export function hitungStatusQc(baris: BarisQc[]): Record<StatusSaring, number> {
  return {
    semua: baris.length,
    belum: baris.filter((b) => b.percobaan === 0).length,
    tidak_lulus: baris.filter((b) => b.percobaan > 0 && !b.lulus).length,
    lulus: baris.filter((b) => b.lulus).length,
  };
}

/** Soal yang paling sering salah pada percobaan pertama, digabung dari semua tim (jumlah dijumlahkan per soal). */
export function gabungSoalSalah(rekap: QcRekapTim[]): { soal_id: string; pertanyaan: string; jumlah: number }[] {
  const peta = new Map<string, { soal_id: string; pertanyaan: string; jumlah: number }>();
  for (const t of rekap) {
    for (const s of t.salah) {
      const a = peta.get(s.soal_id);
      if (a) a.jumlah += s.jumlah;
      else peta.set(s.soal_id, { soal_id: s.soal_id, pertanyaan: s.pertanyaan, jumlah: s.jumlah });
    }
  }
  return Array.from(peta.values()).sort((a, b) => b.jumlah - a.jumlah);
}

// ====================================================================== Urut, filter per kolom, fokus dari infografis / kartu
// (29 Okt 2026) Tabel mengikuti standar kolom: tiap kolom bisa diurut (klik judul) dan difilter (baris filter di bawah judul).
// "Fokus" = penyaring dari luar tabel (klik batang infografis, kartu "Tanpa notifikasi"): daftar akun / nama yang ditampilkan.

export type KolomUrut = "nama" | "peran" | "pml" | "percobaan" | `p${number}`;
export type ArahUrut = "asc" | "desc";
export type FilterNilai = "semua" | "terisi" | "kosong" | "lulus" | "belum_lulus";
export type FilterKolom = {
  nama: string;
  peran: "" | "PML" | "PPL";
  /** "" = semua; "-" = baris tanpa PML (yaitu baris PML); selain itu nama PML persis. */
  pml: string;
  /** "" = semua; selain itu jumlah percobaan persis (angka sebagai teks). */
  percobaan: string;
  /** Indeks 0 = P1. Yang tidak ada = "semua". */
  nilai: Record<number, FilterNilai>;
};

export const FILTER_KOLOM_KOSONG: FilterKolom = { nama: "", peran: "", pml: "", percobaan: "", nilai: {} };

export const kolomAdaFilter = (f: FilterKolom): boolean =>
  !!f.nama.trim() || !!f.peran || !!f.pml || !!f.percobaan || Object.values(f.nilai).some((v) => v && v !== "semua");

/** Urut stabil. Nilai kosong selalu di bawah, apa pun arahnya. */
export function urutkanBaris(baris: BarisQc[], kolom: KolomUrut | null, arah: ArahUrut): BarisQc[] {
  if (!kolom) return baris;
  const kali = arah === "asc" ? 1 : -1;
  const idx = kolom.startsWith("p") && kolom !== "peran" && kolom !== "percobaan" && kolom !== "pml" ? Number(kolom.slice(1)) - 1 : -1;
  const d = baris.map((b, i) => ({ b, i }));
  d.sort((x, y) => {
    let r = 0;
    if (kolom === "nama") r = x.b.nama.localeCompare(y.b.nama, "id", { sensitivity: "base" }) * kali;
    else if (kolom === "peran") r = x.b.peran.localeCompare(y.b.peran) * kali;
    else if (kolom === "pml") {
      const a = x.b.pml;
      const c = y.b.pml;
      if (a == null || c == null) r = a == null && c == null ? 0 : a == null ? 1 : -1;
      else r = a.localeCompare(c, "id", { sensitivity: "base" }) * kali;
    } else if (kolom === "percobaan") r = (x.b.percobaan - y.b.percobaan) * kali;
    else if (idx >= 0) {
      const a = x.b.nilai[idx] ?? null;
      const c = y.b.nilai[idx] ?? null;
      if (a == null || c == null) r = a == null && c == null ? 0 : a == null ? 1 : -1;
      else r = (a - c) * kali;
    }
    return r !== 0 ? r : x.i - y.i;
  });
  return d.map((x) => x.b);
}

export function saringKolom(baris: BarisQc[], f: FilterKolom, nilaiLulus: number): BarisQc[] {
  const kata = f.nama.trim().toLowerCase();
  return baris.filter((b) => {
    if (kata && !b.nama.toLowerCase().includes(kata)) return false;
    if (f.peran && b.peran !== f.peran) return false;
    if (f.pml) {
      if (f.pml === "-" ? b.pml != null : b.pml !== f.pml) return false;
    }
    if (f.percobaan && String(b.percobaan) !== f.percobaan) return false;
    for (const [k, v] of Object.entries(f.nilai)) {
      if (!v || v === "semua") continue;
      const n = b.nilai[Number(k)] ?? null;
      if (v === "terisi" && n == null) return false;
      if (v === "kosong" && n != null) return false;
      if (v === "lulus" && !(n != null && n >= nilaiLulus)) return false;
      if (v === "belum_lulus" && !(n != null && n < nilaiLulus)) return false;
    }
    return true;
  });
}

/** Nama PML yang ada di tabel (untuk pilihan filter), urut abjad. */
export function daftarPmlBaris(baris: BarisQc[]): string[] {
  return Array.from(new Set(baris.map((b) => b.pml).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

/** Nilai percobaan yang ada (untuk pilihan filter "Jumlah percobaan"), naik. */
export function daftarJumlahPercobaan(baris: BarisQc[]): number[] {
  return Array.from(new Set(baris.map((b) => b.percobaan))).sort((a, b) => a - b);
}

export type FokusQc = { judul: string; akun?: number[]; nama?: string[]; catatan?: string };

const rapat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function terapkanFokus(baris: BarisQc[], fokus: FokusQc | null): BarisQc[] {
  if (!fokus) return baris;
  const akun = new Set(fokus.akun ?? []);
  const nama = new Set((fokus.nama ?? []).map(rapat));
  return baris.filter((b) => akun.has(b.akun_id) || nama.has(rapat(b.nama)));
}

/** Nama pada fokus yang tidak ditemukan di tabel (mis. beda penulisan / bukan peserta tim mana pun). */
export function namaTakCocok(baris: BarisQc[], fokus: FokusQc | null): string[] {
  if (!fokus?.nama) return [];
  const ada = new Set(baris.map((b) => rapat(b.nama)));
  return fokus.nama.filter((n) => !ada.has(rapat(n)));
}
