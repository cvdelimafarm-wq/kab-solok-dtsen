// lib/keu/pilihInstruktur.ts
//
// (2 Nov 2026) Nama instruktur pada Identifikasi lanjutan dipilih dari daftar pegawai organik (view keu_v_pegawai_organik); bila instrukturnya
// bukan pegawai organik, pilih "Lainnya" lalu ketik namanya. MURNI (tanpa basis data). Data yang disimpan tetap hanya `nama` (tanpa skema baru):
// pegawai organik dikenali dari kecocokan nama dengan daftar.

import type { AsalInstruktur } from "./identifikasi";
import type { Instruktur } from "./lanjutan";

/** Nilai khusus pilihan dropdown: instruktur di luar daftar pegawai organik (nama diketik). */
export const PILIHAN_LAINNYA = "__lainnya__";
const ASAL_INTERNAL: AsalInstruktur = "Internal BPS";
const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Daftar nama pegawai organik yang rapi: dipangkas, tanpa duplikat dan tanpa nama kosong, urut menurut abjad Indonesia. */
export function namaOrganik(daftar: readonly { nama: string }[] | null | undefined): string[] {
  const unik = new Set<string>();
  for (const x of daftar ?? []) { const n = pangkas(x.nama ?? ""); if (n !== "") unik.add(n); }
  return [...unik].sort((a, b) => a.localeCompare(b, "id"));
}

/**
 * Nilai yang ditampilkan dropdown untuk satu instruktur: nama pegawai bila cocok dengan daftar; PILIHAN_LAINNYA bila nama terisi tetapi bukan pegawai organik,
 * atau bila petugas sudah memilih "Lainnya" (namanya belum diketik); "" bila belum memilih apa pun.
 */
export function nilaiPilihan(nama: string, organik: readonly string[], memilihLainnya: boolean): string {
  const n = pangkas(nama);
  if (n !== "" && organik.includes(n)) return n;
  if (memilihLainnya || n !== "") return PILIHAN_LAINNYA;
  return "";
}

/** Menerapkan pilihan dropdown ke instruktur. Pegawai organik otomatis berasal "Internal BPS"; berpindah ke Lainnya mengosongkan nama dan asal "Internal BPS" yang tadi otomatis. */
export function terapkanPilihan(y: Instruktur, pilihan: string, organik: readonly string[]): Instruktur {
  if (pilihan === "") return { ...y, nama: "", asal: y.asal === ASAL_INTERNAL && organik.includes(pangkas(y.nama)) ? "" : y.asal };
  if (pilihan === PILIHAN_LAINNYA) {
    const dariPegawai = organik.includes(pangkas(y.nama));
    return { ...y, nama: dariPegawai ? "" : y.nama, asal: dariPegawai && y.asal === ASAL_INTERNAL ? "" : y.asal };
  }
  return { ...y, nama: pilihan, asal: ASAL_INTERNAL };
}

/** Nama yang sudah dipakai instruktur lain pada kelas yang sama (agar satu pegawai tidak terpilih dua kali). */
export const namaTerpakai = (daftar: readonly Instruktur[], kecualiIndeks: number): Set<string> =>
  new Set(daftar.flatMap((y, i) => (i === kecualiIndeks || pangkas(y.nama) === "" ? [] : [pangkas(y.nama)])));

/** Indeks baris yang memilih "Lainnya" setelah satu baris dihapus: baris sesudahnya bergeser satu. */
export const geserSetelahHapus = (indeks: readonly number[], dihapus: number): number[] =>
  indeks.filter((i) => i !== dihapus).map((i) => (i > dihapus ? i - 1 : i));
