// lib/delego/mutu.ts
//
// (14 Nov 2026, Fase 4a) Mutu saat tinjau. Berkas MURNI: pratinjau faktor pengakuan dan poin diakui (yang menyimpan tetap
// keu_dlg_tinjau_mutu, skema-sql/20261114l), serta penanda kewajaran laporan. Bobot dan ambang dibaca dari keu_dlg_mutu_setelan
// (pengaturan yang dapat diubah; nilai awal = usul 50/25/25).

import { angka, bulat } from "./hitung";

export type SetelanMutu = {
  w_kualitas: number;
  w_disiplin: number;
  w_tepat: number;
  tepat_terlambat: number | string;
  ambang_jumlah_kali: number | string;
  ambang_poin_laporan: number | string;
  ambang_kecepatan_kali: number | string;
};

/** Nilai awal bila setelan belum terbaca (sama dengan bawaan tabel). */
export const SETELAN_MUTU_AWAL: SetelanMutu = { w_kualitas: 50, w_disiplin: 25, w_tepat: 25, tepat_terlambat: 0.5, ambang_jumlah_kali: 2, ambang_poin_laporan: 150, ambang_kecepatan_kali: 1.5 };

/** Menit kerja efektif sehari dan kapasitas poin sehari (kapasitas 100 = 450 menit). */
export const MENIT_SEHARI = 450;
export const KAPASITAS_HARI = 100;

export const SKALA_MUTU: { nilai: number; teks: string }[] = [
  { nilai: 1, teks: "Sangat kurang" },
  { nilai: 2, teks: "Kurang" },
  { nilai: 3, teks: "Cukup" },
  { nilai: 4, teks: "Baik" },
  { nilai: 5, teks: "Sangat baik" },
];

/** Nilai di bawah ini wajib disertai alasan (sama dengan fungsi basis data). */
export const MUTU_WAJIB_ALASAN = 3;
export const MIN_ALASAN_MUTU = 5;

export const nilaiTepat = (terlambat: boolean, s: SetelanMutu): number => (terlambat ? angka(s.tepat_terlambat) : 1);

/** Faktor pengakuan 0..1 = (wk·kualitas/5 + wd·disiplin/5 + wt·ketepatan) / 100, dibulatkan 4 angka. */
export function faktorAkui(s: SetelanMutu, kualitas: number, disiplin: number, terlambat: boolean): number {
  const f = (s.w_kualitas * (kualitas / 5) + s.w_disiplin * (disiplin / 5) + s.w_tepat * nilaiTepat(terlambat, s)) / 100;
  return bulat(Math.max(0, Math.min(1, f)), 4);
}

export const poinDiakui = (poin: number, faktor: number): number => bulat(poin * faktor, 2);

export function galatMutu(kualitas: number | null, disiplin: number | null, alasan: string): string | null {
  if (!kualitas || !disiplin) return "Pilih nilai kualitas dan kedisiplinan.";
  if ((kualitas < MUTU_WAJIB_ALASAN || disiplin < MUTU_WAJIB_ALASAN) && alasan.trim().length < MIN_ALASAN_MUTU) return `Nilai di bawah ${MUTU_WAJIB_ALASAN} wajib disertai alasan minimal ${MIN_ALASAN_MUTU} huruf.`;
  return null;
}

export type TandaKewajaran = { kode: "jumlah" | "poin" | "kecepatan"; teks: string };

/**
 * Penanda kewajaran (bukan blokir; peninjau tetap memutuskan):
 *  - jumlah satuan lebih dari `ambang_jumlah_kali` x target harian;
 *  - poin satu laporan lebih dari `ambang_poin_laporan`;
 *  - poin per menit nyata lebih dari `ambang_kecepatan_kali` x laju kapasitas (100 poin / 450 menit).
 */
export function tandaKewajaran(
  l: { poin: number | string; jumlah?: number | string | null; target_harian?: number | string | null; menit_nyata?: number | null },
  s: SetelanMutu,
): TandaKewajaran[] {
  const hasil: TandaKewajaran[] = [];
  const poin = angka(l.poin);
  const jumlah = l.jumlah === null || l.jumlah === undefined ? null : angka(l.jumlah);
  const target = angka(l.target_harian ?? 0);
  const kaliJumlah = angka(s.ambang_jumlah_kali);
  if (jumlah !== null && target > 0 && jumlah > target * kaliJumlah) hasil.push({ kode: "jumlah", teks: `Jumlah ${bulat(jumlah, 1)} lebih dari ${bulat(kaliJumlah, 1)}× target harian (${bulat(target, 1)})` });
  const batasPoin = angka(s.ambang_poin_laporan);
  if (poin > batasPoin) hasil.push({ kode: "poin", teks: `Poin ${bulat(poin, 1)} melebihi ${bulat(batasPoin, 0)} dalam satu laporan` });
  const menit = l.menit_nyata ?? 0;
  if (menit > 0 && poin > 0) {
    const laju = poin / menit;
    const lajuNormal = KAPASITAS_HARI / MENIT_SEHARI;
    const kali = angka(s.ambang_kecepatan_kali);
    if (laju > lajuNormal * kali) hasil.push({ kode: "kecepatan", teks: `${bulat(poin, 1)} poin dalam ${menit} menit, lebih cepat ${bulat(laju / lajuNormal, 1)}× dari laju wajar` });
  }
  return hasil;
}

/** Teks ringkas mutu tersimpan untuk laporan pegawai, mis. "Faktor 0,63 · kualitas 4 · disiplin 2 · terlambat". */
export function teksMutu(l: { faktor_akui?: number | string | null; mutu_kualitas?: number | null; mutu_disiplin?: number | null; mutu_tepat?: number | string | null }): string | null {
  if (l.faktor_akui === null || l.faktor_akui === undefined) return null;
  const bagian = [`faktor ${bulat(angka(l.faktor_akui), 2).toLocaleString("id-ID")}`];
  if (l.mutu_kualitas) bagian.push(`kualitas ${l.mutu_kualitas}`);
  if (l.mutu_disiplin) bagian.push(`disiplin ${l.mutu_disiplin}`);
  if (l.mutu_tepat !== null && l.mutu_tepat !== undefined && angka(l.mutu_tepat) < 1) bagian.push("terlambat");
  return bagian.join(" · ");
}
