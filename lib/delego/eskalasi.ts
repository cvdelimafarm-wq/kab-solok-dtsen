// lib/delego/eskalasi.ts
//
// (14 Nov 2026, Fase 4b) Eskalasi butir lewat tenggat. Berkas MURNI: bentuk data keu_dlg_eskalasi_bahan, teks status, aturan isian
// jawaban pimpinan, dan saran pembinaan. Yang memutuskan dan menyimpan tetap basis data (skema-sql/20261114m_dlg_eskalasi.sql).
// Batas waktu (24 jam, 1/2/3 hari kerja, 3 kali sebulan, jam tenang) adalah PENGATURAN YANG DAPAT DIUBAH (keu_dlg_eskalasi_setelan).

import { angka } from "./hitung";

type Nada = "hijau" | "abu" | "biru" | "amber" | "merah";

export type StatusEskalasi = "menunggu_penjelasan" | "menunggu_jawaban" | "naik_kepala" | "selesai";
export type PutusanEskalasi = "perpanjang" | "alihkan" | "kurangi" | "batalkan" | "tetap_bantuan";

export type SetelanEskalasi = {
  aktif: boolean;
  jam_jelas: number;
  hk_push2: number;
  hk_jawab: number;
  hk_kepala: number;
  kali_bina: number;
  jam_tenang_mulai: number;
  jam_tenang_selesai: number;
  diubah_at?: string;
};

export const SETELAN_ESKALASI_AWAL: SetelanEskalasi = { aktif: true, jam_jelas: 24, hk_push2: 1, hk_jawab: 2, hk_kepala: 3, kali_bina: 3, jam_tenang_mulai: 20, jam_tenang_selesai: 7 };

export type ButirEskalasi = {
  id: number;
  delegasi_id: number;
  penerima_akun: number;
  tenggat: string;
  mulai_at: string;
  batas_jelas_at: string;
  penjelasan: string | null;
  dijelaskan_at: string | null;
  push2_at: string | null;
  batas_jawab: string | null;
  naik_kepala_at: string | null;
  putusan: PutusanEskalasi | null;
  catatan: string | null;
  data: Record<string, unknown> | null;
  dijawab_at: string | null;
  ditutup_at: string | null;
  ditutup_karena: "dijawab" | "tuntas" | "status" | null;
  status: StatusEskalasi;
  judul: string;
  ro_kode: string;
  satuan: string;
  target_total: string | number | null;
  poin_per_satuan: string | number | null;
  ver: number;
  pemberi_akun: number | null;
  kegiatan_id: number | null;
  penerima_nama: string;
  pemberi_nama: string | null;
  dijawab_nama: string | null;
  kegiatan_nama: string | null;
  poin_lapor: string | number;
  n_lewat_30: number;
  hk_sejak: number;
  lewat_jawab: boolean;
};

export type BahanEskalasi = {
  hari_ini: string;
  pemutus: boolean;
  setelan: SetelanEskalasi | null;
  saya: ButirEskalasi[];
  pimpinan: ButirEskalasi[];
  ringkas: { terbuka: number; lewat_jawab: number; naik_kepala: number };
};

export const TEKS_STATUS_ESKALASI: Record<StatusEskalasi, { teks: string; nada: Nada }> = {
  menunggu_penjelasan: { teks: "Menunggu penjelasan", nada: "amber" },
  menunggu_jawaban: { teks: "Menunggu jawaban pimpinan", nada: "biru" },
  naik_kepala: { teks: "Naik ke Kepala", nada: "merah" },
  selesai: { teks: "Selesai", nada: "hijau" },
};

export const PILIHAN_JAWABAN: { k: PutusanEskalasi; teks: string; bantu: string }[] = [
  { k: "perpanjang", teks: "Perpanjang tenggat", bantu: "Pekerjaan tetap pada penerima dengan tenggat baru." },
  { k: "alihkan", teks: "Alihkan", bantu: "Pindahkan ke pegawai lain (boleh dengan tenggat baru)." },
  { k: "kurangi", teks: "Kurangi target", bantu: "Target total poin diturunkan (boleh dengan tenggat baru)." },
  { k: "batalkan", teks: "Batalkan", bantu: "Pekerjaan tidak dilanjutkan; catatan menjadi alasan pembatalan." },
  { k: "tetap_bantuan", teks: "Tetap, dengan bantuan", bantu: "Tidak mengubah butir; catat bantuan yang diberikan." },
];

export const MIN_JELAS = 10;
export const MIN_CATATAN_JAWAB = 10;

export type IsianJawab = { putusan: PutusanEskalasi | null; catatan: string; tenggat: string; target: string; ke: number | null };

/** Galat isian jawaban pimpinan (sama dengan fungsi basis data); null = boleh dikirim. */
export function galatJawab(f: IsianJawab, hari: string): string | null {
  if (!f.putusan) return "Pilih jawaban.";
  if (f.catatan.trim().length < MIN_CATATAN_JAWAB) return `Catatan minimal ${MIN_CATATAN_JAWAB} huruf.`;
  if (f.putusan === "perpanjang" && (!f.tenggat || f.tenggat < hari)) return "Isi tenggat baru, tidak boleh sebelum hari ini.";
  if (f.putusan === "kurangi") {
    const t = Number(f.target.replace(",", "."));
    if (f.target.trim() === "" || !Number.isFinite(t) || t < 0) return "Isi target total baru (poin).";
  }
  if ((f.putusan === "alihkan" || f.putusan === "kurangi") && f.tenggat && f.tenggat < hari) return "Tenggat baru tidak boleh sebelum hari ini.";
  if (f.putusan === "alihkan" && !f.ke) return "Pilih penerima baru.";
  return null;
}

/** Argumen keu_dlg_eskalasi_jawab dari isian. */
export function argsJawab(id: number, f: IsianJawab): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (f.tenggat && (f.putusan === "perpanjang" || f.putusan === "alihkan" || f.putusan === "kurangi")) data.tenggat = f.tenggat;
  if (f.putusan === "kurangi") data.target_total = Number(f.target.replace(",", "."));
  if (f.putusan === "alihkan" && f.ke) data.ke = f.ke;
  return { p_id: id, p_putusan: f.putusan, p_catatan: f.catatan.trim(), p_data: data };
}

/** Kalimat jawaban untuk pegawai, mis. "Tenggat diperpanjang sampai 20 Nov". */
export function teksJawaban(b: Pick<ButirEskalasi, "putusan" | "data">, tglPendek: (t: string) => string): string {
  const d = b.data ?? {};
  switch (b.putusan) {
    case "perpanjang":
      return `Tenggat diperpanjang sampai ${typeof d.tenggat === "string" ? tglPendek(d.tenggat) : "tanggal baru"}`;
    case "alihkan":
      return "Pekerjaan dialihkan ke pegawai lain";
    case "kurangi":
      return `Target dikurangi menjadi ${angka(d.target_total as number | string | null).toLocaleString("id-ID")} poin`;
    case "batalkan":
      return "Pekerjaan dibatalkan";
    case "tetap_bantuan":
      return "Tetap dikerjakan, dengan bantuan";
    default:
      return "";
  }
}

/** Sisa jam untuk menjelaskan (bulat ke bawah); negatif = lewat. */
export function sisaJamJelas(batasJelasAt: string, sekarang: Date = new Date()): number {
  return Math.floor((new Date(batasJelasAt).getTime() - sekarang.getTime()) / 3_600_000);
}

/** Saran pembinaan langkah 2 (hanya saran, bukan otomatis) bila lewat tenggat `kali_bina` kali atau lebih dalam 30 hari. */
export const saranBina = (nLewat30: number, s: Pick<SetelanEskalasi, "kali_bina">): boolean => nLewat30 >= s.kali_bina;

/** Butir terbuka yang batas jawabnya sudah lewat: inilah ukuran "selesai" Fase 4 (harus 0). */
export const terbukaLewatJawab = (daftar: ButirEskalasi[]): number => daftar.filter((b) => !b.ditutup_at && b.lewat_jawab).length;
