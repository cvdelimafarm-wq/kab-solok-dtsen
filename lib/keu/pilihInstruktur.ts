// lib/keu/pilihInstruktur.ts
//
// (2 Nov 2026) Nama instruktur pada Identifikasi lanjutan dipilih dari daftar pegawai organik (view keu_v_pegawai_organik) lewat pemilih yang bisa diketik; bila instrukturnya
// bukan pegawai organik, pakai nama lain dengan mengetiknya. MURNI (tanpa basis data). Data yang disimpan tetap hanya `nama` (tanpa skema baru):
// pegawai organik dikenali dari kecocokan nama dengan daftar.

import type { AsalInstruktur } from "./identifikasi";
import type { Instruktur } from "./lanjutan";

/** Nilai khusus pilihan dropdown: instruktur di luar daftar pegawai organik (nama diketik). */
export const PILIHAN_LAINNYA = "__lainnya__";
const ASAL_INTERNAL: AsalInstruktur = "Internal BPS";
const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Menerapkan pilihan pemilih nama ke instruktur. Pegawai organik: nama terisi, Asal otomatis "Internal BPS", dan id akun disimpan (tertaut). Pindah ke nama lain atau kosong
 * melepas id akun dan asal otomatis tadi (asal pilihan sendiri dipertahankan). Level dan jam tidak berubah.
 */
export function terapkanPilihan(y: Instruktur, pilihan: string, organik: readonly string[], akun?: number): Instruktur {
  const dariPegawai = y.akun !== undefined || organik.includes(pangkas(y.nama));
  const { akun: _lama, ...tanpa } = y;
  const asalLepas: AsalInstruktur = dariPegawai && y.asal === ASAL_INTERNAL ? "" : y.asal;
  if (pilihan === "") return { ...tanpa, nama: "", asal: asalLepas };
  if (pilihan === PILIHAN_LAINNYA) return { ...tanpa, nama: dariPegawai ? "" : y.nama, asal: asalLepas };
  return { ...tanpa, nama: pilihan, asal: ASAL_INTERNAL, ...(akun !== undefined ? { akun } : {}) };
}
