// lib/vanguard/remark.ts  (murni: tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V5c: remark "tidak lulus, tetap mendata dengan pendampingan khusus" diteruskan ke LEVEL DI ATAS petugas yang bermasalah:
//   PPL bermasalah -> terlihat oleh PML dan oleh supervisor (dan korwil); PML bermasalah -> terlihat HANYA oleh supervisor (dan korwil).
// Petugas sendiri melihat hasilnya di layar Vanguard-nya; admin kegiatan melihat semua di dasbor. Remark hanya untuk hasil final TIDAK LULUS (bukan "belum final").
// Catatan: pemetaan tim PML-PPL per kegiatan belum ada secara umum (tiap kegiatan punya tabelnya sendiri), jadi PML melihat PPL kegiatan yang sama.

import { bukuPerAkun, type BarisPercobaanDb, type Peserta } from "./dasbor";
import { hasilFinal, type Pengaturan } from "./pengaturan";

/** Peran pelihat -> peran bawahan yang remark-nya boleh dilihat. Peran lain (ppl, administrasi, dll.) tidak melihat remark orang lain. */
const PERAN_DILIHAT: Record<string, string[]> = { supervisor: ["pml", "ppl"], korwil: ["pml", "ppl"], pml: ["ppl"] };
const URUTAN_PERAN = ["supervisor", "korwil", "pml"]; // dari tertinggi

/** Pilih peran terpenting seorang akun pada satu kegiatan (satu akun bisa punya lebih dari satu penugasan). */
export function peranTertinggi(peran: (string | null)[]): string | null {
  for (const p of URUTAN_PERAN) if (peran.includes(p)) return p;
  return peran.find((p) => p === "ppl") ?? null;
}
export const peranDilihat = (pelihat: string | null): string[] => (pelihat ? PERAN_DILIHAT[pelihat] ?? [] : []);

export type BarisRemark = { akun_id: number; nama: string; peran: string; nilai: number; benar: number; dibuka: number; remark: string };

/** Daftar remark yang boleh dilihat `pelihat` di satu kegiatan, urut peran (PML dulu) lalu nama. */
export function susunRemark(pelihat: string | null, peserta: Peserta[], perc: BarisPercobaanDb[], peng: Pengaturan): BarisRemark[] {
  const dilihat = peranDilihat(pelihat);
  if (dilihat.length === 0 || peng.nilai_lulus === null) return [];
  const buku = bukuPerAkun(peng, perc);
  const hasil: BarisRemark[] = [];
  for (const p of peserta) {
    if (!p.peran || !dilihat.includes(p.peran)) continue;
    const h = hasilFinal(peng, [...(buku.get(p.akun_id)?.values() ?? [])]);
    if (h.status !== "tidak_lulus" || !h.remark) continue;
    hasil.push({ akun_id: p.akun_id, nama: p.nama, peran: p.peran, nilai: h.nilai, benar: h.benar, dibuka: h.dibuka, remark: h.remark });
  }
  const urut = (x: string) => (x === "pml" ? 0 : 1);
  return hasil.sort((a, b) => urut(a.peran) - urut(b.peran) || a.nama.localeCompare(b.nama, "id"));
}
