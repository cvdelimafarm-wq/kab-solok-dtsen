// lib/vanguard/roleplay/penilaian.ts  (murni, tanpa DB dan React)
//
// (8 Nov 2026) ROLEPLAY BERSAMA KELAS (Vanguard): semua peserta menuliskan jawaban SATU responden peran ke Vanguard masing-masing (Blok IV.1, V, VI, VII).
// Tidak ada soal dan kunci: instruktur menekan PERIKSA, melihat PEMETAAN variasi jawaban peserta, lalu MENCENTANG semua variasi yang benar
// (yang tidak dicentang = salah; suara terbanyak BUKAN kunci). Berkas ini memuat seluruh hitungannya:
//   - satuan nilai = satu RINCIAN (Blok IV.1, R.n) atau satu KOTAK (Blok V-VII). Satu satuan dinilai UTUH: letak (rincian/ART), sumber (K7), banyaknya, nilai harus cocok semua;
//   - variasi = tanda tangan (signature) jawaban peserta pada satuan itu; "Tidak diisi" juga variasi (tanda tangan kosong);
//   - skor (putusan Iqbal 8 Nov 2026, mengacu ke kunci jawaban = variasi yang dicentang benar): benar +1; SELAIN ITU -0,3, baik salah isi, tidak diisi padahal harus diisi, maupun isian di luar cakupan;
//     poin = maks(0, 100 x skor / satuan dinilai). Hasil "kosong" tetap dibedakan (warna oranye di review) tetapi skornya sama dengan salah.
// Nama komoditas dan satuan tulisan sendiri (rincian "lainnya") TIDAK ikut tanda tangan (teks bebas). Poin roleplay tidak masuk nilai pelatihan, bintang, sertifikasi, atau poin kinerja.

import { RINCIAN_IV1, cariRincianIv1 } from "../kuesioner/rincian";
import { SEL_PER_BLOK, labelSel } from "../sel";
import type { Blok } from "../tipe";

export const SKOR_BENAR = 1;
export const SKOR_SALAH = -0.3;
/** Selisih rupiah yang masih dianggap sama (pembulatan), sama dengan engine kuesioner. */
export const TOLERANSI_RP = 1;
/** Tanda tangan jawaban kosong ("Tidak diisi"). */
export const KOSONG = "";

/** Isian satu peserta pada sesi roleplay: Blok IV.1 (entri komoditas) dan kotak V-VII (id -> rupiah). IV.2 belum dimodelkan. */
export type EntriRoleplay = { r: number; art?: number; k1?: number; k2?: number; k3?: number; k4?: number; sumber?: number; nama?: string; satuan?: string };
export type IsianRoleplay = { iv1?: EntriRoleplay[]; nilai?: Record<string, number> };

export type BagianSesi = "iv1" | Blok;
export const BAGIAN_SAH: readonly BagianSesi[] = ["iv1", "A", "B", "C", "D", "E", "F", "G", "VI", "VII"];
/** Satu langkah/sesi roleplay: Blok IV.1 menurut rentang nomor R, atau satu blok V-VII utuh. */
export type CakupanSesi = { bagian: BagianSesi; dari?: number | null; sampai?: number | null };

const KUNCI_R = "r";
const KUNCI_SEL = "s";
export const kunciIv1 = (r: number): string => `${KUNCI_R}${r}`;
export const kunciSel = (id: string): string => `${KUNCI_SEL}:${id}`;
export const adalahKunciIv1 = (k: string): boolean => /^r\d+$/.test(k);
export const noRDariKunci = (k: string): number => Number(k.slice(1));

/** Daftar kunci satuan pada satu cakupan, urut seperti pada kuesioner. Rentang R di luar rincian yang ada diabaikan. */
export function satuanCakupan(c: CakupanSesi): string[] {
  if (c.bagian === "iv1") {
    const dari = c.dari ?? 1, sampai = c.sampai ?? 9999;
    return RINCIAN_IV1.filter((r) => r.no >= dari && r.no <= sampai).map((r) => kunciIv1(r.no));
  }
  return (SEL_PER_BLOK[c.bagian] ?? []).map((s) => kunciSel(s.id));
}

export const labelSatuan = (kunci: string): string => {
  if (adalahKunciIv1(kunci)) { const r = cariRincianIv1(noRDariKunci(kunci)); return `R${noRDariKunci(kunci)} · ${r?.nama ?? "rincian"}`; }
  return labelSel(kunci.slice(KUNCI_SEL.length + 1));
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Tanda tangan jawaban

const angka = (x: number | undefined): string => (typeof x === "number" && Number.isFinite(x) ? String(Math.round(x * 10000) / 10000) : "");
const ada = (x: number | undefined): boolean => typeof x === "number" && Number.isFinite(x);

/** Tanda tangan satu entri Blok IV.1: "art:sumber:k1:k2:k3:k4". Entri tanpa angka sama sekali tidak dihitung (kosong). */
function tandaEntri(e: EntriRoleplay): string | null {
  if (!ada(e.k1) && !ada(e.k2) && !ada(e.k3) && !ada(e.k4)) return null;
  return `${e.art ?? 0}:${e.sumber === undefined ? "" : e.sumber}:${angka(e.k1)}:${angka(e.k2)}:${angka(e.k3)}:${angka(e.k4)}`;
}

/** Peta satuan -> tanda tangan untuk satu peserta (hanya yang terisi). Nilai kotak 0 dihitung terisi (peserta sengaja mengisi 0). */
export function tandaPeserta(isian: IsianRoleplay | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  const per = new Map<number, string[]>();
  for (const e of isian?.iv1 ?? []) {
    const t = tandaEntri(e);
    if (t) per.set(e.r, [...(per.get(e.r) ?? []), t]);
  }
  for (const [r, daftar] of per) m.set(kunciIv1(r), daftar.sort().join(";"));
  for (const [id, v] of Object.entries(isian?.nilai ?? {})) if (ada(v)) m.set(kunciSel(id), String(Math.round(v)));
  return m;
}

export type UraianIv1 = { art: number; sumber: number | null; k1: number | null; k2: number | null; k3: number | null; k4: number | null };
const kenal = (s: string): number | null => (s === "" ? null : Number(s));
/** Tanda tangan satuan IV.1 -> daftar entri (untuk ditampilkan). */
export function uraiIv1(tanda: string): UraianIv1[] {
  if (tanda === KOSONG) return [];
  return tanda.split(";").map((p) => { const [a, s, k1, k2, k3, k4] = p.split(":"); return { art: Number(a), sumber: kenal(s), k1: kenal(k1), k2: kenal(k2), k3: kenal(k3), k4: kenal(k4) }; });
}
const fmt = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 4 });
/** Teks ringkas satu variasi untuk layar instruktur. */
export function teksVariasi(kunci: string, tanda: string): string {
  if (tanda === KOSONG) return "Tidak diisi";
  if (!adalahKunciIv1(kunci)) return `Rp${fmt(Number(tanda))}`;
  return uraiIv1(tanda).map((e) => {
    const bagian: string[] = [];
    if (e.art > 0) bagian.push(`ART ${e.art}`);
    if (e.sumber !== null) bagian.push(`sumber ${e.sumber}`);
    if (e.k1 !== null || e.k2 !== null) bagian.push(`beli ${e.k1 !== null ? fmt(e.k1) : "-"} · Rp${e.k2 !== null ? fmt(e.k2) : "-"}`);
    if (e.k3 !== null || e.k4 !== null) bagian.push(`produksi/beri ${e.k3 !== null ? fmt(e.k3) : "-"} · Rp${e.k4 !== null ? fmt(e.k4) : "-"}`);
    return bagian.join(" · ");
  }).join(" | ");
}

const samaTanda = (kunci: string, a: string, b: string): boolean => {
  if (a === b) return true;
  if (adalahKunciIv1(kunci) || a === KOSONG || b === KOSONG) return false;
  return Math.abs(Number(a) - Number(b)) <= TOLERANSI_RP; // kotak rupiah: selisih pembulatan tetap sama
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Pemetaan variasi

export type PesertaIsian = { akun_id: number; isian: IsianRoleplay | null };
export type Variasi = { tanda: string; jumlah: number; akun: number[] };

/** Variasi jawaban satu satuan, urut terbanyak dulu ("Tidak diisi" ikut sebagai variasi bila ada peserta yang mengosongkannya). */
export function petakanVariasi(kunci: string, peserta: readonly PesertaIsian[]): Variasi[] {
  const per = new Map<string, number[]>();
  for (const p of peserta) {
    const t = tandaPeserta(p.isian).get(kunci) ?? KOSONG;
    per.set(t, [...(per.get(t) ?? []), p.akun_id]);
  }
  return [...per.entries()]
    .map(([tanda, akun]) => ({ tanda, jumlah: akun.length, akun }))
    .sort((a, b) => b.jumlah - a.jumlah || (a.tanda === KOSONG ? 1 : 0) - (b.tanda === KOSONG ? 1 : 0) || a.tanda.localeCompare(b.tanda));
}

/** Satuan yang perlu ditandai instruktur = ada minimal satu peserta yang mengisinya. Satuan yang dikosongkan semua peserta tidak dinilai. */
export function satuanPerluTanda(satuan: readonly string[], peserta: readonly PesertaIsian[]): string[] {
  const terisi = new Set<string>();
  for (const p of peserta) for (const k of tandaPeserta(p.isian).keys()) terisi.add(k);
  return satuan.filter((k) => terisi.has(k));
}

/** Tombol "Lanjut" aktif bila semua satuan yang perlu ditandai sudah punya tanda. `tanda` = peta kunci -> variasi benar. */
export function sesiTuntasDitandai(satuan: readonly string[], peserta: readonly PesertaIsian[], tanda: ReadonlyMap<string, readonly string[]>): boolean {
  return satuanPerluTanda(satuan, peserta).every((k) => tanda.has(k));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Penilaian

export type HasilSatuan = "benar" | "salah" | "kosong";
export type NilaiSatuan = { kunci: string; hasil: HasilSatuan; skor: number; tanda: string | null; benar: string[] };

/** Nilai satu satuan untuk satu peserta. `benar` = variasi yang dicentang instruktur (boleh memuat KOSONG = "Tidak diisi" benar). */
export function nilaiSatuan(kunci: string, tandaPeserta_: string | undefined, benar: readonly string[]): NilaiSatuan {
  const dasar = { kunci, tanda: tandaPeserta_ ?? null, benar: [...benar] };
  if (tandaPeserta_ === undefined) {
    return benar.includes(KOSONG) ? { ...dasar, hasil: "benar", skor: SKOR_BENAR } : { ...dasar, hasil: "kosong", skor: SKOR_SALAH };
  }
  const cocok = benar.some((b) => b !== KOSONG && samaTanda(kunci, tandaPeserta_, b));
  return cocok ? { ...dasar, hasil: "benar", skor: SKOR_BENAR } : { ...dasar, hasil: "salah", skor: SKOR_SALAH };
}

export type HasilPeserta = {
  akun_id: number;
  /** Satuan yang dinilai (punya tanda), dengan hasilnya. */
  satuan: NilaiSatuan[];
  /** Satuan terisi di luar cakupan semua sesi (dianggap salah). */
  luar: string[];
  benar: number;
  salah: number;
  kosong: number;
  skor: number;
  dinilai: number;
  poin: number;
};

/** poin = maks(0, 100 x skor / satuan dinilai), satu desimal. Belum ada yang dinilai = 0. */
export const hitungPoin = (skor: number, dinilai: number): number => (dinilai <= 0 ? 0 : Math.max(0, Math.round((100 * skor / dinilai) * 10) / 10));

/** Satuan terisi peserta yang tidak termasuk cakupan mana pun dari roleplay ini. */
export function satuanLuarCakupan(isian: IsianRoleplay | null | undefined, cakupan: readonly string[]): string[] {
  const dalam = new Set(cakupan);
  return [...tandaPeserta(isian).keys()].filter((k) => !dalam.has(k));
}

/**
 * Hasil akhir satu peserta. `cakupan` = gabungan satuan semua sesi roleplay; `tanda` = peta satuan -> variasi benar (hanya satuan yang sudah ditandai dihitung).
 * Satuan yang belum ditandai belum dihitung (tidak masuk pembagi). Isian di luar cakupan: -0,3 tiap satuan, tidak menambah pembagi.
 */
export function hasilPeserta(akunId: number, isian: IsianRoleplay | null | undefined, cakupan: readonly string[], tanda: ReadonlyMap<string, readonly string[]>): HasilPeserta {
  const t = tandaPeserta(isian);
  const satuan: NilaiSatuan[] = [];
  for (const kunci of cakupan) {
    const benar = tanda.get(kunci);
    if (!benar) continue;
    satuan.push(nilaiSatuan(kunci, t.get(kunci), benar));
  }
  const luar = satuanLuarCakupan(isian, cakupan);
  const benar = satuan.filter((s) => s.hasil === "benar").length;
  const salah = satuan.filter((s) => s.hasil === "salah").length;
  const kosong = satuan.filter((s) => s.hasil === "kosong").length;
  const skor = Math.round((benar * SKOR_BENAR + (salah + kosong + luar.length) * SKOR_SALAH) * 100) / 100;
  return { akun_id: akunId, satuan, luar, benar, salah, kosong, skor, dinilai: satuan.length, poin: hitungPoin(skor, satuan.length) };
}

/** Hasil semua peserta, urut poin tertinggi. */
export function hasilKelas(peserta: readonly PesertaIsian[], cakupan: readonly string[], tanda: ReadonlyMap<string, readonly string[]>): HasilPeserta[] {
  return peserta.map((p) => hasilPeserta(p.akun_id, p.isian, cakupan, tanda)).sort((a, b) => b.poin - a.poin || b.skor - a.skor || a.akun_id - b.akun_id);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// Bantuan "petunjuk letak nilai": nilai yang sama di satuan lain, dan selisih periode (x12, x30/7, dst.)

export type KonversiNilai = "x12" | "bagi12" | "x30/7" | "x7/30";
/** Hubungan periode antara nilai peserta dan nilai benar, bila ada (toleransi pembulatan). null = tidak ada hubungan. */
export function konversiPeriode(nilaiPeserta: number, nilaiBenar: number): KonversiNilai | null {
  if (!(nilaiPeserta > 0) || !(nilaiBenar > 0)) return null;
  const dekat = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOLERANSI_RP, 1);
  if (dekat(nilaiPeserta, nilaiBenar * 12)) return "x12";
  if (dekat(nilaiPeserta * 12, nilaiBenar)) return "bagi12";
  if (dekat(nilaiPeserta, nilaiBenar * 30 / 7)) return "x30/7";
  if (dekat(nilaiPeserta * 30 / 7, nilaiBenar)) return "x7/30";
  return null;
}
export const TEKS_KONVERSI: Record<KonversiNilai, string> = { "x12": "nilai sebulan dikali 12 (setahun)", "bagi12": "nilai setahun dibagi 12 (sebulan)", "x30/7": "nilai seminggu dikali 30/7 (sebulan)", "x7/30": "nilai sebulan dikali 7/30 (seminggu)" };

/** Angka rupiah yang dipakai peserta pada satu satuan (K2 dan K4 untuk IV.1; nilai kotak untuk V-VII). */
export function nilaiRupiahTanda(kunci: string, tanda: string): number[] {
  if (tanda === KOSONG) return [];
  if (!adalahKunciIv1(kunci)) return [Number(tanda)];
  return uraiIv1(tanda).flatMap((e) => [e.k2, e.k4]).filter((x): x is number => x !== null && x > 0);
}

export type JejakNilai = { kunci: string; tanda: string };
/** Di satuan mana saja (selain `kecuali`) peserta menuliskan nilai rupiah yang sama dengan `nilai`? Dipakai instruktur untuk melacak nilai yang salah letak. */
export function jejakNilai(isian: IsianRoleplay | null | undefined, nilai: number, kecuali?: string): JejakNilai[] {
  const hasil: JejakNilai[] = [];
  for (const [kunci, tanda] of tandaPeserta(isian)) {
    if (kunci === kecuali) continue;
    if (nilaiRupiahTanda(kunci, tanda).some((v) => Math.abs(v - nilai) <= TOLERANSI_RP)) hasil.push({ kunci, tanda });
  }
  return hasil;
}

/** Ringkasan kemungkinan salah letak untuk satu peserta pada satu satuan yang salah/kosong: nilai benar itu ditemukan di satuan lain. */
export function petunjukSalahLetak(isian: IsianRoleplay | null | undefined, kunci: string, benar: readonly string[]): { dari: JejakNilai; nilai: number }[] {
  const keluar: { dari: JejakNilai; nilai: number }[] = [];
  const lihat = new Set<string>();
  for (const b of benar) {
    for (const v of nilaiRupiahTanda(kunci, b)) {
      for (const j of jejakNilai(isian, v, kunci)) {
        const id = `${j.kunci}|${v}`;
        if (!lihat.has(id)) { lihat.add(id); keluar.push({ dari: j, nilai: v }); }
      }
    }
  }
  return keluar;
}
