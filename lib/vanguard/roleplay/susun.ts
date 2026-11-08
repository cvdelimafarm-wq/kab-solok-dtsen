// lib/vanguard/roleplay/susun.ts  (murni)
//
// (8 Nov 2026) Roleplay bersama kelas: menyusun bahan layar (ringkasan langkah, pemetaan variasi, rekap kelas, review per peserta) dari data mentah
// supaya rute API tinggal memuat data dan memanggil fungsi di sini (mudah diuji tanpa basis data).

import {
  KOSONG, TEKS_KONVERSI, hasilKelas, hasilPeserta, jejakNilai, konversiPeriode, labelSatuan, nilaiRupiahTanda, petakanVariasi, petunjukSalahLetak, satuanCakupan, satuanPerluTanda,
  sesiTuntasDitandai, tandaPeserta, teksVariasi, type BagianSesi, type CakupanSesi, type HasilPeserta, type IsianRoleplay, type KonversiNilai, type NilaiSatuan, type PesertaIsian,
} from "./penilaian";

export type StatusLangkah = "berjalan" | "diperiksa" | "selesai";
export type LangkahBaris = { id: number; nomor: number; bagian: BagianSesi; dari: number | null; sampai: number | null; status: StatusLangkah; diperiksa_at: string | null; selesai_at: string | null };
export type TandaPerLangkah = ReadonlyMap<number, ReadonlyMap<string, readonly string[]>>;

export const cakupanLangkah = (l: Pick<LangkahBaris, "bagian" | "dari" | "sampai">): CakupanSesi => ({ bagian: l.bagian, dari: l.dari, sampai: l.sampai });
export const teksCakupan = (l: Pick<LangkahBaris, "bagian" | "dari" | "sampai">): string => (l.bagian === "iv1" ? (l.dari === l.sampai || l.sampai == null ? `Blok IV.1 · R${l.dari}` : `Blok IV.1 · R${l.dari}–R${l.sampai}`) : `Blok ${l.bagian === "VI" || l.bagian === "VII" ? l.bagian : `V.${l.bagian}`}`);

/** Gabungan satuan semua langkah (cakupan roleplay). */
export function semuaSatuan(langkah: readonly LangkahBaris[]): string[] {
  const s = new Set<string>();
  for (const l of langkah) for (const k of satuanCakupan(cakupanLangkah(l))) s.add(k);
  return [...s];
}

/** Peta satuan -> variasi benar, gabungan tanda semua langkah. */
export function tandaGabungan(tanda: TandaPerLangkah): Map<string, readonly string[]> {
  const m = new Map<string, readonly string[]>();
  for (const per of tanda.values()) for (const [k, v] of per) m.set(k, v);
  return m;
}

export type RingkasLangkah = LangkahBaris & { teks: string; satuan_total: number; perlu_tanda: number; sudah_tanda: number; siap_lanjut: boolean };

export function ringkasLangkah(l: LangkahBaris, peserta: readonly PesertaIsian[], tanda: TandaPerLangkah): RingkasLangkah {
  const satuan = satuanCakupan(cakupanLangkah(l));
  const per = tanda.get(l.id) ?? new Map<string, readonly string[]>();
  const perlu = satuanPerluTanda(satuan, peserta);
  return { ...l, teks: teksCakupan(l), satuan_total: satuan.length, perlu_tanda: perlu.length, sudah_tanda: perlu.filter((k) => per.has(k)).length, siap_lanjut: l.status === "diperiksa" && sesiTuntasDitandai(satuan, peserta, per) };
}

export type VariasiTampil = { tanda: string; teks: string; jumlah: number; akun: number[]; nama: string[]; benar: boolean | null };
export type PemetaanSatuan = { kunci: string; label: string; ditandai: boolean; variasi: VariasiTampil[] };
export type PemetaanLangkah = { langkah: number; satuan: PemetaanSatuan[] };

/** Pemetaan variasi untuk satu langkah: hanya satuan yang diisi minimal satu peserta. `benar` pada variasi = null bila satuan belum ditandai. */
export function susunPemetaan(l: LangkahBaris, peserta: readonly PesertaIsian[], nama: ReadonlyMap<number, string>, tanda: TandaPerLangkah): PemetaanLangkah {
  const per = tanda.get(l.id) ?? new Map<string, readonly string[]>();
  const satuan = satuanPerluTanda(satuanCakupan(cakupanLangkah(l)), peserta).map((kunci): PemetaanSatuan => {
    const benar = per.get(kunci);
    return {
      kunci,
      label: labelSatuan(kunci),
      ditandai: !!benar,
      variasi: petakanVariasi(kunci, peserta).map((v) => ({ tanda: v.tanda, teks: teksVariasi(kunci, v.tanda), jumlah: v.jumlah, akun: v.akun, nama: v.akun.map((a) => nama.get(a) ?? `Akun ${a}`), benar: benar ? benar.includes(v.tanda) : null })),
    };
  });
  return { langkah: l.nomor, satuan };
}

export type TampilReview = {
  kunci: string; label: string; hasil: NilaiSatuan["hasil"]; skor: number; jawaban: string; benar: string[];
  konversi: { kode: KonversiNilai; teks: string } | null;
  salah_letak: { label: string; nilai: number }[];
};
export type TampilHasil = { poin: number; skor: number; dinilai: number; benar: number; salah: number; kosong: number; luar: { kunci: string; label: string; jawaban: string }[]; review: TampilReview[] };

function konversiSatuan(kunci: string, tandaPes: string | null, benar: readonly string[]): TampilReview["konversi"] {
  if (tandaPes === null) return null;
  const mine = nilaiRupiahTanda(kunci, tandaPes);
  for (const b of benar) for (const nb of nilaiRupiahTanda(kunci, b)) for (const np of mine) {
    const k = konversiPeriode(np, nb);
    if (k) return { kode: k, teks: TEKS_KONVERSI[k] };
  }
  return null;
}

/** Review satu peserta berwarna per satuan (hijau benar, merah salah dengan jawaban benar, oranye kosong padahal harus diisi) + isian di luar cakupan. */
export function susunHasilPeserta(akunId: number, isian: IsianRoleplay | null | undefined, cakupan: readonly string[], tanda: ReadonlyMap<string, readonly string[]>): TampilHasil {
  const h: HasilPeserta = hasilPeserta(akunId, isian, cakupan, tanda);
  const t = tandaPeserta(isian);
  const review = h.satuan.map((s): TampilReview => ({
    kunci: s.kunci,
    label: labelSatuan(s.kunci),
    hasil: s.hasil,
    skor: s.skor,
    jawaban: s.tanda === null ? "Tidak diisi" : teksVariasi(s.kunci, s.tanda),
    benar: s.benar.map((b) => teksVariasi(s.kunci, b)),
    konversi: s.hasil === "benar" ? null : konversiSatuan(s.kunci, s.tanda, s.benar),
    salah_letak: s.hasil === "benar" ? [] : petunjukSalahLetak(isian, s.kunci, s.benar).map((p) => ({ label: labelSatuan(p.dari.kunci), nilai: p.nilai })),
  }));
  return {
    poin: h.poin, skor: h.skor, dinilai: h.dinilai, benar: h.benar, salah: h.salah, kosong: h.kosong,
    luar: h.luar.map((k) => ({ kunci: k, label: labelSatuan(k), jawaban: teksVariasi(k, t.get(k) ?? KOSONG) })),
    review,
  };
}

export type BarisRekap = { akun_id: number; nama: string; poin: number; skor: number; dinilai: number; benar: number; salah: number; kosong: number; luar: number; sudah_isi: boolean };

/** Rekap kelas (poin sementara dari satuan yang sudah ditandai); urut poin tertinggi. */
export function susunRekap(peserta: readonly PesertaIsian[], nama: ReadonlyMap<number, string>, cakupan: readonly string[], tanda: ReadonlyMap<string, readonly string[]>): BarisRekap[] {
  const adaIsi = new Map(peserta.map((p) => [p.akun_id, tandaPeserta(p.isian).size > 0]));
  return hasilKelas(peserta, cakupan, tanda).map((h) => ({ akun_id: h.akun_id, nama: nama.get(h.akun_id) ?? `Akun ${h.akun_id}`, poin: h.poin, skor: h.skor, dinilai: h.dinilai, benar: h.benar, salah: h.salah, kosong: h.kosong, luar: h.luar.length, sudah_isi: adaIsi.get(h.akun_id) ?? false }));
}

export { jejakNilai };
