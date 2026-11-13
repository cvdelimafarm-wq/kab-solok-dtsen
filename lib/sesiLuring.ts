// lib/sesiLuring.ts
//
// (14 Nov 2026, luring 3b-2) Sesi tes yang dikerjakan TANPA SINYAL di HP: soal dari paket tersandi (sudah dibuka dengan sandi A), waktu
// menurut jam HP, setiap ketukan dicatat (jejak) untuk pemeriksaan kewajaran di server (lib/sigapTesLuringPeriksa.ts).
// Selama belum diterima server, sesi bertanda `kotor` -> tidak dibuang saat keluar akun. Sesudah diterima, sesi tetap disimpan (tidak kotor)
// supaya peserta bisa membuka lagi soal dan jawabannya; dibuang saat keluar akun atau saat percobaan baru dimulai.
// Murni kecuali adaptor penyimpanan.

import { AWALAN_LURING, type Penyimpan } from "./luringSimpan";
import type { IsiPaketSoal, PaketTes } from "./sigapTesLuring";
import { MAKS_JEJAK, type KirimLuring } from "./sigapTesLuringPeriksa";

export const kunciSesiLuring = (jenis: string): string => `${AWALAN_LURING}sesitl:${jenis}`;

export type SesiLuring = {
  v: 1;
  pemilik: string;
  kotor: boolean;
  jenis: string;
  tes_id: number;
  versi: string;
  judul: string;
  durasi_menit: number;
  selisih_ms: number;
  mulai_hp_ms: number;
  batas_hp_ms: number;
  selesai_hp_ms: number | null;
  /** true = percobaan ulang (sesudah percobaan sebelumnya selesai) */
  ulang: boolean;
  soal: IsiPaketSoal["soal"];
  jawaban: Record<string, string>;
  jejak: { n: number; k: string; ms: number }[];
  terkirim_at: string | null;
  galat_kirim: string | null;
};

export function buatSesiLuring(paket: PaketTes, isi: IsiPaketSoal, selisihMs: number, pemilik: string, hpMs: number, ulang: boolean): SesiLuring {
  return {
    v: 1,
    pemilik,
    kotor: true,
    jenis: paket.jenis,
    tes_id: paket.tes_id,
    versi: isi.versi,
    judul: paket.judul,
    durasi_menit: paket.durasi_menit,
    selisih_ms: selisihMs,
    mulai_hp_ms: hpMs,
    batas_hp_ms: hpMs + paket.durasi_menit * 60_000,
    selesai_hp_ms: null,
    ulang,
    soal: isi.soal,
    jawaban: {},
    jejak: [],
    terkirim_at: null,
    galat_kirim: null,
  };
}

/** Ketuk opsi: ketuk lagi opsi yang sama = batalkan. Diabaikan bila sesi sudah selesai. */
export function pilihJawaban(s: SesiLuring, nomor: number, kode: string, hpMs: number): SesiLuring {
  if (s.selesai_hp_ms !== null) return s;
  const jawaban = { ...s.jawaban };
  const batal = jawaban[String(nomor)] === kode;
  if (batal) delete jawaban[String(nomor)];
  else jawaban[String(nomor)] = kode;
  const jejak = s.jejak.length < MAKS_JEJAK ? [...s.jejak, { n: nomor, k: batal ? "" : kode, ms: hpMs }] : s.jejak;
  return { ...s, jawaban, jejak, kotor: true };
}

export const sisaMs = (s: SesiLuring, hpMs: number): number => Math.max(0, s.batas_hp_ms - hpMs);

/** Selesai (Kirim ditekan atau waktu habis). Waktu habis dicatat tepat pada batas. */
export function selesaikan(s: SesiLuring, hpMs: number): SesiLuring {
  if (s.selesai_hp_ms !== null) return s;
  return { ...s, selesai_hp_ms: Math.min(hpMs, s.batas_hp_ms), kotor: true };
}

export function muatanKirim(s: SesiLuring, hpMs: number): KirimLuring & { ulang: boolean } {
  return {
    tes_id: s.tes_id,
    versi: s.versi,
    mulai_hp_ms: s.mulai_hp_ms,
    selesai_hp_ms: s.selesai_hp_ms ?? Math.min(hpMs, s.batas_hp_ms),
    kirim_hp_ms: hpMs,
    selisih_ms: s.selisih_ms,
    jawaban: s.jawaban,
    jejak: s.jejak,
    ulang: s.ulang,
  };
}

export const tandaiTerkirim = (s: SesiLuring, iso: string): SesiLuring => ({ ...s, kotor: false, terkirim_at: iso, galat_kirim: null });

export function simpanSesiLuring(p: Penyimpan, s: SesiLuring): void {
  try {
    p.setItem(kunciSesiLuring(s.jenis), JSON.stringify(s));
  } catch {
    /* penuh: tetap berjalan di layar */
  }
}

export function bacaSesiLuring(p: Penyimpan, jenis: string, pemilik: string): SesiLuring | null {
  try {
    const t = p.getItem(kunciSesiLuring(jenis));
    if (!t) return null;
    const x = JSON.parse(t) as SesiLuring;
    if (!x || x.v !== 1 || x.pemilik !== pemilik || !Array.isArray(x.soal)) return null;
    return x;
  } catch {
    return null;
  }
}

export function buangSesiLuring(p: Penyimpan, jenis: string): void {
  try {
    p.removeItem(kunciSesiLuring(jenis));
  } catch {
    /* abaikan */
  }
}

/** Galat yang berarti server MENOLAK (tidak perlu dicoba lagi otomatis), bukan sinyal putus. */
export const ditolakServer = (pesan: string): boolean => /sudah selesai|ditutup|sebelum sesi dibuka|paling lambat|tidak sah|milik tes lain|tidak terdaftar/i.test(pesan);

/**
 * (luring 3b-4) Ringkasan keadaan tes terakhir dari server (bersinyal): dipakai saat tanpa sinyal untuk tahu apakah peserta boleh
 * MENGULANG (wajib 100 dan belum 100). Tidak kotor -> dibuang saat keluar akun.
 */
export type RingkasTes = { v: 1; pemilik: string; status: string; percobaan: number; wajib_100: boolean; tuntas: boolean; bisa_ulang: boolean; disimpan_at: string };
export const kunciRingkasTes = (jenis: string): string => `${AWALAN_LURING}ringkas:${jenis}`;

export function simpanRingkasTes(p: Penyimpan, jenis: string, r: Omit<RingkasTes, "v">): void {
  try {
    p.setItem(kunciRingkasTes(jenis), JSON.stringify({ v: 1, ...r }));
  } catch {
    /* abaikan */
  }
}

export function bacaRingkasTes(p: Penyimpan, jenis: string, pemilik: string): RingkasTes | null {
  try {
    const x = JSON.parse(p.getItem(kunciRingkasTes(jenis)) ?? "null") as RingkasTes | null;
    return x && x.v === 1 && x.pemilik === pemilik ? x : null;
  } catch {
    return null;
  }
}

/**
 * Boleh memulai tes tanpa sinyal?
 *  - belum pernah mengerjakan (tidak ada ringkasan selesai) -> percobaan pertama;
 *  - percobaan terakhir selesai, wajib 100, belum 100, dan masih boleh mengulang -> percobaan ulang;
 *  - ada kiriman tanpa sinyal yang belum diterima server -> tidak (nilainya belum diketahui).
 */
export function bolehMulaiLuring(ringkas: RingkasTes | null, sesi: SesiLuring | null): { boleh: boolean; ulang: boolean; alasan?: string } {
  if (sesi && sesi.kotor) return { boleh: false, ulang: false, alasan: "Jawaban tanpa sinyal sebelumnya belum terkirim; nilainya diketahui setelah ada sinyal." };
  if (sesi && !sesi.kotor && (!ringkas || Date.parse(ringkas.disimpan_at) < Date.parse(sesi.terkirim_at ?? ""))) {
    return { boleh: false, ulang: false, alasan: "Nilai percobaan terakhir belum diketahui di HP ini. Tunggu ada sinyal." };
  }
  if (!ringkas || ringkas.status === "belum_buka" || ringkas.status === "buka") return { boleh: true, ulang: false };
  if (ringkas.status === "selesai" && ringkas.wajib_100 && !ringkas.tuntas && ringkas.bisa_ulang) return { boleh: true, ulang: true };
  if (ringkas.status === "mengerjakan") return { boleh: false, ulang: false, alasan: "Tes ini sudah dimulai bersinyal; lanjutkan dari halaman tes (jawaban tersimpan di HP)." };
  return { boleh: false, ulang: false, alasan: ringkas.tuntas ? "Tes ini sudah selesai." : "Tes ini sudah selesai dan tidak bisa diulang." };
}
