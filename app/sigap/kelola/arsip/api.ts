// app/sigap/kelola/arsip/api.ts  (hanya diimpor komponen klien)
//
// (7 Nov 2026) Helper fetch menu Arsip (sesi SIGAP yang sama dengan halaman kelola lain) dan bentuk data jawaban API /api/sigap/arsip.

import { fetchJson } from "../../admin/api";
import type { BarisNomor, Celah, Counter, JenisArsip, KkaKegiatan, KodeArsip, Kembar, RegisterArsip } from "@/lib/arsip/db";

export type { BarisNomor, Celah, Counter, JenisArsip, KkaKegiatan, KodeArsip, Kembar, RegisterArsip };

export type DataBuku = { baris: BarisNomor[]; terpotong: boolean; boleh_kelola: boolean };
export type DataRingkas = { counter: Counter[]; celah: Celah[]; kembar: Kembar[]; tahun_ada: number[]; tahun: number };
export type DataPengaturan = { kode: KodeArsip[]; jenis: JenisArsip[]; register: RegisterArsip[]; kegiatan: KkaKegiatan[]; kegiatan_semua: { id: number; nama: string }[]; unit: string };

export function ambilA<T>(param: Record<string, string | number | null | undefined>): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(param)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  return fetchJson<T>(`/api/sigap/arsip?${q.toString()}`);
}

export function aksiA<T = { ok: boolean }>(aksi: string, isi: Record<string, unknown> = {}): Promise<T> {
  return fetchJson<T>("/api/sigap/arsip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...isi }) });
}

/** Tanggal hari ini menurut WIB, bentuk YYYY-MM-DD. */
export const hariIniWib = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

export const NAMA_SUMBER: Record<string, string> = { sistem: "SIGAP", luar: "Dicatat manual", impor: "Data lama" };
