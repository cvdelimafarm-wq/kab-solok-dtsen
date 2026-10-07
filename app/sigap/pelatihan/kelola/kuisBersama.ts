// app/sigap/pelatihan/kelola/kuisBersama.ts
//
// (8 Okt 2026) Tipe & pembantu bersama untuk tab "Adu Sigap" (Pengaturan Kelas, Pantau Live, Bank Kuis, Riwayat & Rekap).

import type { Pengaturan } from "@/lib/sigapKuis";
import { fetchJson } from "../../admin/api";
import { URL_KUIS_ADMIN } from "./kuisHost";

export type StatusR = "lobi" | "soal" | "jawaban" | "selesai";

export type KuisRingkas = {
  id: number;
  judul: string;
  aktif: boolean;
  dibuat_at: string;
  diubah_at: string;
  jumlah_soal: number;
  total_detik: number;
  topik: Record<string, number>;
};
export type RuangRingkas = { id: number; kuis_id: number; kelas: number; status: StatusR; soal_ke: number; dibuka_at: string; selesai_at: string | null; jumlah_peserta: number };
export type KonfigKelas = { kegiatan_id: number; kelas: number; kuis_id: number | null; pengaturan: Pengaturan; soal_pilihan: number[]; diubah_at: string | null; anggota: number };
export type Daftar = { sekarang: string; boleh_kelola: boolean; maks_soal: number; kelas_saya?: number | null; kuis: KuisRingkas[]; kelas: KonfigKelas[]; ruang: RuangRingkas[] };

export const LABEL_STATUS: Record<string, string> = { lobi: "Lobi · menunggu peserta", soal: "Soal berjalan", jawaban: "Menampilkan jawaban", selesai: "Selesai" };
export const menit = (d: number) => (d >= 60 ? `${Math.floor(d / 60)} mnt${d % 60 ? ` ${d % 60} dtk` : ""}` : `${d} dtk`);

export async function kirim<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(URL_KUIS_ADMIN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export type AksiFn = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
