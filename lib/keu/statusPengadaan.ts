// lib/keu/statusPengadaan.ts
//
// (26 Okt 2026, tahap 35) Status pelacakan pengadaan per butir draf (tahap 34): belum, diajukan, diproses, selesai, batal. Berkas ini MURNI (tanpa React/DB).
// Status hanya CATATAN pelacakan; metode dan nilai pengadaan tetap ditentukan PPK atau pejabat pengadaan (cek aturan). Basis data: keu_ident_pengadaan
// (SQL 20261026b), dibaca lewat tampilan keu_v_ident_pengadaan dan ditulis lewat fungsi keu_pengadaan_catat.

import type { ItemPengadaan } from "./pengadaan";

export type StatusPengadaan = "belum" | "diajukan" | "diproses" | "selesai" | "batal";
export const URUTAN_STATUS: readonly StatusPengadaan[] = ["belum", "diajukan", "diproses", "selesai", "batal"];

export const LABEL_STATUS: Readonly<Record<StatusPengadaan, { teks: string; warna: "abu" | "biru" | "kuning" | "hijau" | "merah" }>> = {
  belum: { teks: "Belum diajukan", warna: "abu" },
  diajukan: { teks: "Diajukan", warna: "biru" },
  diproses: { teks: "Diproses", warna: "kuning" },
  selesai: { teks: "Selesai", warna: "hijau" },
  batal: { teks: "Dibatalkan", warna: "merah" },
};

/** Satu baris tampilan keu_v_ident_pengadaan. */
export type BarisStatusPengadaan = {
  id: number; ident_id: number; item: string; uraian: string; status: StatusPengadaan; rujukan: string; catatan: string; diubah_at: string | null; diubah_oleh_nama: string | null;
};
export type CatatanStatus = { status: StatusPengadaan; rujukan: string; catatan: string; oleh: string | null; waktu: string | null };

const sahStatus = (x: unknown): x is StatusPengadaan => typeof x === "string" && (URUTAN_STATUS as readonly string[]).includes(x);
const teks = (x: unknown): string => (typeof x === "string" ? x : "");

/** Baris mentah -> peta kode butir -> catatan status. Baris dengan status atau kode tidak dikenal dilewati. */
export function petaStatus(baris: readonly Partial<BarisStatusPengadaan>[] | null | undefined): Map<string, CatatanStatus> {
  const m = new Map<string, CatatanStatus>();
  for (const b of baris ?? []) {
    if (typeof b.item !== "string" || b.item === "" || !sahStatus(b.status)) continue;
    m.set(b.item, { status: b.status, rujukan: teks(b.rujukan), catatan: teks(b.catatan), oleh: typeof b.diubah_oleh_nama === "string" ? b.diubah_oleh_nama : null, waktu: typeof b.diubah_at === "string" ? b.diubah_at : null });
  }
  return m;
}

export const statusButir = (peta: ReadonlyMap<string, CatatanStatus>, id: string): StatusPengadaan => peta.get(id)?.status ?? "belum";

export type RingkasStatus = {
  jumlah: number;
  per: Record<StatusPengadaan, number>;
  /** Butir yang sudah dicatat tetapi tidak ada lagi pada draf sekarang (mis. kelas dihapus dari lanjutan). */
  yatim: { id: string; uraian: string; status: StatusPengadaan }[];
  /** Butir sudah diajukan (atau lebih) padahal draf masih punya hal yang perlu dilengkapi. */
  diajukanBelumLengkap: number;
};

export function ringkasStatus(daftar: readonly ItemPengadaan[], peta: ReadonlyMap<string, CatatanStatus>, uraianBaris: readonly Partial<BarisStatusPengadaan>[] = []): RingkasStatus {
  const per: Record<StatusPengadaan, number> = { belum: 0, diajukan: 0, diproses: 0, selesai: 0, batal: 0 };
  let diajukanBelumLengkap = 0;
  const ada = new Set<string>();
  for (const it of daftar) {
    ada.add(it.id);
    const st = statusButir(peta, it.id);
    per[st] += 1;
    if ((st === "diajukan" || st === "diproses") && it.perlu.length > 0) diajukanBelumLengkap += 1;
  }
  const yatim: RingkasStatus["yatim"] = [];
  for (const [id, c] of peta) {
    if (ada.has(id) || c.status === "belum") continue;
    yatim.push({ id, uraian: teks(uraianBaris.find((b) => b.item === id)?.uraian) || id, status: c.status });
  }
  return { jumlah: daftar.length, per, yatim, diajukanBelumLengkap };
}

/** Urutan transisi yang lazim; selain itu tetap boleh (hak dan alasan ditegakkan basis data). */
export function statusBerikut(s: StatusPengadaan): StatusPengadaan | null {
  return s === "belum" ? "diajukan" : s === "diajukan" ? "diproses" : s === "diproses" ? "selesai" : null;
}

/** Masukan formulir -> argumen fungsi keu_pengadaan_catat; mengembalikan pesan galat bila tidak sah (sama dengan aturan basis data). */
export function periksaCatatan(status: StatusPengadaan, rujukan: string, catatan: string): string | null {
  const r = rujukan.trim(); const c = catatan.trim();
  if (r.length > 100) return "Rujukan maksimal 100 huruf.";
  if (c.length > 300) return "Catatan maksimal 300 huruf.";
  if (status === "batal" && c.length < 5) return "Status Dibatalkan wajib disertai alasan pada catatan (minimal 5 huruf).";
  return null;
}
export function argumenCatat(identId: number, it: Pick<ItemPengadaan, "id" | "uraian">, status: StatusPengadaan, rujukan: string, catatan: string): Record<string, unknown> {
  return { p_ident: identId, p_item: it.id, p_uraian: it.uraian.slice(0, 200), p_status: status, p_rujukan: rujukan.trim(), p_catatan: catatan.trim() };
}
