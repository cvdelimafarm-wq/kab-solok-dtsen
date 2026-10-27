// lib/sigapKorwilTab.ts  (murni)
//
// (27 Okt 2026) Alamat dalam untuk Lembar Supervisi korwil (/sigap/korwil). Tab dipilih lewat ?tab= supaya tombol dari halaman lain bisa membuka
// bagian yang tepat, mis. dari formulir laporan translok korwil langsung ke Lembar Quality Check (kuesioner), bukan ke Lembar Pendataan.

export type TabKorwil = "lapangan" | "kuesioner" | "hasil";

const TAB_SAH: readonly TabKorwil[] = ["lapangan", "kuesioner", "hasil"];

/** Alamat Lembar Quality Check (tab kuesioner) di Lembar Supervisi. */
export const ALAMAT_LEMBAR_QC_KORWIL = "/sigap/korwil?tab=kuesioner";

/** Nilai ?tab= -> tab yang sah, atau null (kosong / di luar daftar -> tab awal). */
export function tabDariAlamat(nilai: string | null | undefined): TabKorwil | null {
  if (!nilai) return null;
  return (TAB_SAH as readonly string[]).includes(nilai) ? (nilai as TabKorwil) : null;
}
