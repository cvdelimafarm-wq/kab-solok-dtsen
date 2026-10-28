// lib/keu/rabStatus.ts
//
// (28 Okt 2026) Status RAB per survei dan penanda revisi (logika murni, tanpa React/DB). Status disimpan per (RAB, identifikasi): 'draf' atau 'siap'
// (keu_rab_survei, 20261028g). Disahkan tidak disimpan di sini: mengikuti status RAB. Basis data menurunkan 'siap' ke 'draf' bila baris RAB bertanda
// identifikasi itu ditambah, diubah, atau dihapus; aturan lain (hak akun, minimal satu rincian) ada di penjaga tabel.
// Analisis revisi hanya MENANDAI pemicu (P-01 volume/harga, P-02 redaksi, P-04 dan P-06 item baru; lihat spesifikasi kertas kerja revisi 4.2); jenis revisi
// (POK atau administrasi) ditetapkan PPK, dan usulan revisinya disusun di tab Revisi.

import type { BarisRabRow, PemetaanItem } from "./rab";
import { rupiah } from "./ro";

export type StatusSurvei = "draf" | "siap";
export const LABEL_STATUS_SURVEI: Record<StatusSurvei, string> = { draf: "Draf", siap: "Siap diajukan" };
export type BarisStatusSurvei = { rab_id: number; ident_id: number; status: StatusSurvei; catatan: string; diubah_oleh: number | null; diubah_at: string };

/** Status survei dari daftar baris keu_rab_survei; belum ada baris = 'draf'. Status tidak dikenal dianggap 'draf'. */
export function statusDari(baris: Pick<BarisStatusSurvei, "ident_id" | "status">[] | null | undefined, identId: number): StatusSurvei {
  const b = (baris ?? []).find((x) => x.ident_id === identId);
  return b && b.status === "siap" ? "siap" : "draf";
}
export const adaBarisStatus = (baris: Pick<BarisStatusSurvei, "ident_id">[] | null | undefined, identId: number): boolean => (baris ?? []).some((x) => x.ident_id === identId);

/** Pesan bila status Siap belum boleh ditetapkan (sama dengan penjaga basis data: minimal satu rincian bertanda); null bila boleh. */
export function periksaSiap(jumlahRincianDiRab: number): string | null {
  return jumlahRincianDiRab > 0 ? null : "Salin sedikitnya satu rincian ke RAB sebelum menyatakan Siap.";
}

/** Data keu_tulis: insert bila belum ada baris status, update bila sudah. */
export function dataStatusBaru(rabId: number, identId: number, status: StatusSurvei, catatan = ""): Record<string, unknown> {
  return { rab_id: rabId, ident_id: identId, status, catatan: catatan.slice(0, 500) };
}
export function dataStatusUbah(status: StatusSurvei, catatan?: string): Record<string, unknown> {
  return catatan === undefined ? { status } : { status, catatan: catatan.slice(0, 500) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pemicu revisi
// ---------------------------------------------------------------------------------------------------------------------
export type ItemRabLengkap = { id: number; pok_kunci: string | null; akun_kode: string; uraian: string; satuan: string; komponen_kode: string; selesai: boolean };
export type KodePemicu = "P-01" | "P-02" | "P-04" | "P-06";
export type Pemicu = { kode: KodePemicu; itemId: number; judul: string; akun: string; pesan: string };
export const NAMA_PEMICU: Record<KodePemicu, string> = {
  "P-01": "Volume atau harga melebihi pagu item", "P-02": "Redaksi item berubah", "P-04": "Item baru pada akun yang belum ada di komponen", "P-06": "Item baru pada akun yang sudah ada",
};
export const CATATAN_JENIS_REVISI = "Jenis revisi (POK atau administrasi) ditetapkan PPK; SIGAP hanya menandai pemicunya. Usulan revisinya disusun di tab Revisi (cek aturan).";

const akun6 = (a: string): string => a.slice(0, 6);
const rapi = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Pemicu revisi dari RAB yang disusun lewat identifikasi ini. Hanya item yang memuat baris bertanda identifikasi ini yang diperiksa. Jumlah RAB item
 * = SEMUA baris item itu (dari semua survei), karena pagu POK dipakai bersama.
 */
export function analisisRevisi(peta: PemetaanItem[], items: ItemRabLengkap[], barisRab: BarisRabRow[], identId: number): Pemicu[] {
  const tersentuh = new Set(barisRab.filter((b) => b.ident_id === identId).map((b) => b.item_id));
  const hasil: Pemicu[] = [];
  for (const it of [...items].sort((a, b) => a.id - b.id)) {
    if (!tersentuh.has(it.id)) continue;
    const total = barisRab.filter((b) => b.item_id === it.id).reduce((s, b) => s + Number(b.jumlah), 0);
    if (it.pok_kunci) {
      const p = peta.find((x) => x.pok.kunci === it.pok_kunci);
      if (!p) continue;
      const lebih = total - p.pok.pok;
      if (lebih > 0.5) {
        hasil.push({ kode: "P-01", itemId: it.id, judul: p.pok.uraian, akun: p.pok.akun, pesan: `RAB item ${rupiah(total)} melebihi pagu POK ${rupiah(p.pok.pok)} sebesar ${rupiah(lebih)} (semua survei pada item ini). Perlu tambahan pagu item dari dana lain, atau kurangi rincian.` });
      }
      if (rapi(it.uraian) !== rapi(p.pok.uraian)) {
        hasil.push({ kode: "P-02", itemId: it.id, judul: p.pok.uraian, akun: p.pok.akun, pesan: `Redaksi item diusulkan berubah: «${p.pok.uraian}» menjadi «${it.uraian.trim()}».` });
      }
    } else {
      const sama = peta.some((x) => akun6(x.pok.akun) === akun6(it.akun_kode) && x.pok.komponen === it.komponen_kode);
      hasil.push(sama
        ? { kode: "P-06", itemId: it.id, judul: it.uraian, akun: it.akun_kode, pesan: `Item baru «${it.uraian}» pada akun ${akun6(it.akun_kode)} yang sudah ada pada komponen ${it.komponen_kode}; RAB item ${rupiah(total)} perlu dibiayai dari dana lain.` }
        : { kode: "P-04", itemId: it.id, judul: it.uraian, akun: it.akun_kode, pesan: `Item baru «${it.uraian}» pada akun ${akun6(it.akun_kode)} yang belum ada pada komponen ${it.komponen_kode}; RAB item ${rupiah(total)} perlu dibiayai dari dana lain.` });
    }
  }
  return hasil;
}

export type RingkasPemicu = Record<KodePemicu, number> & { total: number };
export function ringkasPemicu(p: Pemicu[]): RingkasPemicu {
  const r: RingkasPemicu = { "P-01": 0, "P-02": 0, "P-04": 0, "P-06": 0, total: p.length };
  for (const x of p) r[x.kode] += 1;
  return r;
}
