// app/sigap/vanguard/roleplay/tipe.ts
//
// (8 Nov 2026) Bentuk balasan GET /api/sigap/vanguard/roleplay (lihat rute) dipakai halaman roleplay, kartu Hari ini, dan lajur langkah.

import type { BarisRekap, PemetaanLangkah, RingkasLangkah, TampilHasil } from "@/lib/vanguard/roleplay/susun";
import type { IsianRoleplay } from "@/lib/vanguard/roleplay/penilaian";

export type InfoRoleplay = { id: number; judul: string; status: "berjalan" | "selesai"; dibuat_at?: string; selesai_at?: string | null };
export type LangkahPesertaTampil = { nomor: number; teks: string; status: "berjalan" | "diperiksa" | "selesai" };

export type KeadaanTidakAktif = { aktif: false; alasan?: string };
export type KeadaanPeserta = {
  aktif: true; peran: "peserta"; kelas: number | null; pesan?: string;
  roleplay: InfoRoleplay | null; langkah: LangkahPesertaTampil[]; isian: IsianRoleplay | null; terkunci: string[]; hasil: TampilHasil | null;
};
export type KeadaanKelola = {
  aktif: true; peran: "pengelola" | "instruktur"; kelas: number | null; kelas_pilihan: { nomor: number; nama: string }[];
  roleplay: InfoRoleplay | null; langkah: RingkasLangkah[]; pemetaan: PemetaanLangkah | null; rekap: BarisRekap[];
  review: ({ akun_id: number; nama: string } & TampilHasil) | null; jumlah_peserta: number;
};
export type KeadaanRoleplay = KeadaanTidakAktif | KeadaanPeserta | KeadaanKelola;

export const adalahPeserta = (k: KeadaanRoleplay | null | undefined): k is KeadaanPeserta => !!k && k.aktif && k.peran === "peserta";
export const adalahKelola = (k: KeadaanRoleplay | null | undefined): k is KeadaanKelola => !!k && k.aktif && k.peran !== "peserta";

export const alamatRoleplay = (kegiatan: number, dari: string): string => `/sigap/vanguard/roleplay?k=${kegiatan}&dari=${encodeURIComponent(dari)}`;
