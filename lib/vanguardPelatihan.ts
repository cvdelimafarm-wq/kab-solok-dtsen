// lib/vanguardPelatihan.ts  (murni; dipakai klien)
//
// (2 Nov 2026) Kelola Pelatihan > Vanguard: pilihan penyalaan dan teks keterangannya. Penentu menyala di server: lib/vanguardAkses.ts (centang manual menang atas Identifikasi survei).

export type KeadaanVanguardKelola = {
  kegiatan_id: number;
  menyala: boolean;
  sumber: "centang" | "identifikasi" | "mati";
  /** true / false = centang manual; null = tidak ada centang (mengikuti Identifikasi survei). */
  centang: boolean | null;
  percobaan: number;
  boleh_kelola: boolean;
};

export type PilihanVanguard = "nyala" | "mati" | "ikut";
export const PILIHAN_VANGUARD: { kode: PilihanVanguard; nilai: boolean | null; label: string; ket: string }[] = [
  { kode: "nyala", nilai: true, label: "Nyalakan untuk pelatihan ini", ket: "Kartu Vanguard tampil bagi peserta dan percobaan dicatat." },
  { kode: "mati", nilai: false, label: "Matikan", ket: "Tidak tampil, apa pun isi Identifikasi survei." },
  { kode: "ikut", nilai: null, label: "Ikuti Identifikasi survei (bawaan)", ket: "Menyala hanya bila Identifikasi survei yang sudah sah menjawab Ya untuk Vanguard pada pelatihan ini." },
];

export const pilihanDari = (centang: boolean | null): PilihanVanguard => (centang === true ? "nyala" : centang === false ? "mati" : "ikut");

export function teksSumberVanguard(sumber: KeadaanVanguardKelola["sumber"]): string {
  if (sumber === "centang") return "Saat ini menyala atau mati menurut pilihan manual di bawah.";
  if (sumber === "identifikasi") return "Saat ini menyala karena Identifikasi survei yang sah meminta Vanguard.";
  return "Saat ini tidak menyala.";
}
