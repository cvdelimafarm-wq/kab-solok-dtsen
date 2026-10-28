// lib/keu/tanggalDurasi.ts
//
// (28 Okt 2026) Isian tanggal dua arah pada Identifikasi survei (permintaan user):
//   - tanggal mulai + jumlah hari  -> tanggal selesai terisi otomatis;
//   - tanggal mulai + tanggal selesai -> jumlah hari terisi otomatis.
// Fungsi MURNI (tanpa React/DB) agar teruji. "Jumlah hari" tidak disimpan: selalu diturunkan dari mulai dan selesai (inklusif,
// mis. 12-25 November = 14 hari; satu hari = mulai sama dengan selesai), sehingga bentuk data formulir (jsonb keu_ident) tidak berubah.
// Mengubah tanggal mulai menggeser tanggal selesai dan menjaga jumlah hari tetap (kebiasaan kalender) bila keduanya sudah terisi sah.

import { selisihHari, tambahHari } from "./identifikasi";

export type Rentang = { mulai: string; selesai: string };

export const HARI_MAKS = 366;
const TGL = /^\d{4}-\d{2}-\d{2}$/;
const sahTgl = (d: string | null | undefined): d is string => typeof d === "string" && TGL.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Jumlah hari inklusif; null bila salah satu tanggal kosong/tidak sah atau selesai mendahului mulai. */
export function jumlahHariAntara(mulai: string | null | undefined, selesai: string | null | undefined): number | null {
  if (!sahTgl(mulai) || !sahTgl(selesai)) return null;
  const n = selisihHari(selesai, mulai) + 1;
  return n >= 1 ? n : null;
}

/** Tanggal selesai dari mulai + jumlah hari (inklusif); "" bila mulai tidak sah atau jumlah hari di luar 1..HARI_MAKS. */
export function selesaiDariJumlah(mulai: string | null | undefined, n: number): string {
  if (!sahTgl(mulai) || !Number.isInteger(n) || n < 1 || n > HARI_MAKS) return "";
  return tambahHari(mulai, n - 1);
}

/** Pengguna mengubah tanggal mulai. */
export function gantiMulai(r: Rentang, mulaiBaru: string): Rentang {
  if (!sahTgl(mulaiBaru)) return { mulai: mulaiBaru, selesai: r.selesai };
  const n = jumlahHariAntara(r.mulai, r.selesai);
  if (n !== null) return { mulai: mulaiBaru, selesai: selesaiDariJumlah(mulaiBaru, n) }; // jumlah hari tetap, rentang bergeser
  // belum ada durasi sah: selesai dibiarkan; bila sudah mendahului mulai baru, disamakan dengan mulai (1 hari)
  if (sahTgl(r.selesai) && r.selesai < mulaiBaru) return { mulai: mulaiBaru, selesai: mulaiBaru };
  return { mulai: mulaiBaru, selesai: r.selesai };
}

/** Pengguna mengubah tanggal selesai (jumlah hari mengikuti; selesai sebelum mulai dibiarkan agar terlihat sebagai galat). */
export function gantiSelesai(r: Rentang, selesaiBaru: string): Rentang {
  return { mulai: r.mulai, selesai: selesaiBaru };
}

/**
 * Pengguna mengisi jumlah hari. Mulai ada -> selesai dihitung; hanya selesai ada -> mulai dihitung mundur;
 * keduanya kosong atau jumlah tidak sah -> tidak berubah.
 */
export function gantiJumlahHari(r: Rentang, n: number): Rentang {
  if (!Number.isInteger(n) || n < 1) return r;
  const jml = Math.min(HARI_MAKS, n);
  if (sahTgl(r.mulai)) return { mulai: r.mulai, selesai: selesaiDariJumlah(r.mulai, jml) };
  if (sahTgl(r.selesai)) return { mulai: tambahHari(r.selesai, -(jml - 1)), selesai: r.selesai };
  return r;
}

/** " (14 hari)" untuk ditempel pada teks rentang tanggal; kosong bila tidak dapat dihitung. */
export function keteranganHari(mulai: string | null | undefined, selesai: string | null | undefined): string {
  const n = jumlahHariAntara(mulai, selesai);
  return n === null ? "" : ` (${n} hari)`;
}
