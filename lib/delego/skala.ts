// lib/delego/skala.ts
//
// (14 Nov 2026, fase D) Delego pindah dari kapasitas 75 ke 100 poin per hari, tidak berlaku mundur.
//  * Delegasi yang MULAI sebelum MULAI_SKALA_100 memakai poin skala 75 (salinan katalog lama); yang mulai pada/sesudahnya skala 100
//    (poin per satuan dari Master > Poin beban kerja; diganti di basis data oleh pemicu keu_dlg_skala100, skema-sql/20261114a).
//  * Supaya beban satu hari tidak mencampur dua skala, poin delegasi skala 75 yang jatuh pada hari skala 100 dikalikan 100/75.
//  * MULAI_SKALA_100 adalah PENGATURAN yang dapat diubah; harus sama dengan keu_dlg_skala100_mulai() di SQL.
//  * Katalog skor lama (keu_dlg_jenis.poin_per_satuan) tetap skala 75 dan hanya dipakai sebagai data awal; sumber poin = Master.

export const MULAI_SKALA_100 = "2026-11-16";
export const KAPASITAS_KATALOG = 75;
export const KAPASITAS_SKALA_100 = 100;

/** Skala poin (kapasitas harian) untuk tanggal YYYY-MM-DD. */
export const skalaPada = (tanggal: string): number => (tanggal >= MULAI_SKALA_100 ? KAPASITAS_SKALA_100 : KAPASITAS_KATALOG);

/** Faktor pengali poin delegasi (yang mulai pada `mulai`) bila dibaca pada hari `tanggal`. 1 bila skalanya sama. */
export function faktorSkala(mulai: string | null | undefined, tanggal: string): number {
  if (!mulai) return 1;
  const a = skalaPada(mulai);
  const b = skalaPada(tanggal);
  return a === b ? 1 : b / a;
}

export type PoinUntuk = { jenis_id: number; poin_katalog: number | string; poin?: number | string | null; sumber?: string | null; survei_kode?: string | null };

/** Label singkat asal poin dari kolom poin_sumber / keu_poin_untuk ("matriks:seruti_tw4:riwayat", "katalog×100/75", "diisi"). */
export function labelSumberPoin(sumber: string | null | undefined): string {
  const s = (sumber ?? "").trim();
  if (!s) return "";
  if (s === "diisi") return "diisi pemberi";
  if (s.startsWith("katalog")) return "katalog lama × 100/75";
  const [, survei, asal] = s.split(":");
  const nama: Record<string, string> = { riwayat: "riwayat", gabungan: "riwayat + usul", usul: "usul pegawai", manual: "input manual", awal: "data awal" };
  return `Master · ${survei === "umum" ? "Umum" : survei ?? ""} · ${nama[asal ?? ""] ?? asal ?? ""}`;
}

/**
 * Poin per satuan yang akan berlaku untuk delegasi baru yang mulai pada `mulai`:
 * sebelum tanggal skala 100 = poin katalog lama; sesudahnya = poin Master dari `daftar` (keu_poin_untuk_daftar),
 * bila tidak ada = katalog × 100/75 (sama dengan cadangan di SQL).
 */
export function ppsEfektif(jenis: { id: number; poin_per_satuan: number | string } | null, daftar: readonly PoinUntuk[] | null | undefined, mulai: string): { pps: number; kapasitas: number; sumber: string } {
  if (!jenis) return { pps: 0, kapasitas: skalaPada(mulai), sumber: "" };
  const kat = Number(jenis.poin_per_satuan) || 0;
  if (mulai < MULAI_SKALA_100) return { pps: kat, kapasitas: KAPASITAS_KATALOG, sumber: "katalog skala 75" };
  const b = daftar?.find((x) => x.jenis_id === jenis.id);
  const p = b && b.poin !== null && b.poin !== undefined ? Number(b.poin) : NaN;
  if (Number.isFinite(p) && p > 0) return { pps: p, kapasitas: KAPASITAS_SKALA_100, sumber: labelSumberPoin(b?.sumber) };
  return { pps: Math.round(((kat * KAPASITAS_SKALA_100) / KAPASITAS_KATALOG) * 100) / 100, kapasitas: KAPASITAS_SKALA_100, sumber: labelSumberPoin("katalog×100/75") };
}
