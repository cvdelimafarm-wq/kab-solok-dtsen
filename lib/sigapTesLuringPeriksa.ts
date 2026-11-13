// lib/sigapTesLuringPeriksa.ts
//
// (14 Nov 2026, luring 3b-3) Pemeriksaan kewajaran jawaban tes yang dikerjakan TANPA SINYAL sebelum diterima server.
// HP mencatat jam HP saat mulai, tiap ketukan, selesai, dan kirim, serta selisih jam server - jam HP (diukur saat paket diunduh).
// Server menerjemahkan jam HP ke jam server, lalu:
//  * MENOLAK bila: dimulai sesudah tes ditutup, dimulai sebelum dibuka (tes berjadwal), atau dikirim lewat 24 jam sesudah batas waktu.
//  * MENERIMA DENGAN CATATAN (untuk panitia) bila: lama pengerjaan melewati durasi (selesai dipotong ke batas), urutan ketukan janggal,
//    atau jam HP berubah antara unduh paket dan kirim (selisih bergeser > 10 menit).
// Murni (tanpa basis data).

import { BATAS_TERTAHAN_JAM } from "./sigapTesLuring";

export const TOLERANSI_LURING_MS = 2 * 60_000; // jam HP kasar; selesai sampai 2 menit lewat durasi masih wajar
export const GESER_JAM_MAKS_MS = 10 * 60_000;
export const MAKS_JEJAK = 500;

export type KirimLuring = {
  tes_id: number;
  versi: string;
  mulai_hp_ms: number;
  selesai_hp_ms: number;
  kirim_hp_ms: number;
  /** jam server - jam HP saat paket diunduh */
  selisih_ms: number;
  jawaban: Record<string, string>;
  /** ketukan: nomor soal, kode ("" = dibatalkan), jam HP */
  jejak: { n: number; k: string; ms: number }[];
};

export type HasilPeriksa =
  | { ok: true; mulai: Date; selesai: Date; batas: Date; catatan: string[] }
  | { ok: false; pesan: string };

const angka = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Baca badan permintaan; null = bentuk tidak sah. */
export function bacaKirimLuring(x: unknown): KirimLuring | null {
  if (!x || typeof x !== "object") return null;
  const b = x as Record<string, unknown>;
  if (!angka(b.tes_id) || typeof b.versi !== "string" || !angka(b.mulai_hp_ms) || !angka(b.selesai_hp_ms) || !angka(b.kirim_hp_ms) || !angka(b.selisih_ms)) return null;
  const jawaban: Record<string, string> = {};
  if (b.jawaban && typeof b.jawaban === "object") for (const [k, v] of Object.entries(b.jawaban as Record<string, unknown>)) if (typeof v === "string" && /^\d{1,4}$/.test(k)) jawaban[k] = v.slice(0, 8);
  const jejak = Array.isArray(b.jejak)
    ? (b.jejak as unknown[])
        .slice(0, MAKS_JEJAK)
        .map((j) => j as Record<string, unknown>)
        .filter((j) => j && angka(j.n) && typeof j.k === "string" && angka(j.ms))
        .map((j) => ({ n: j.n as number, k: (j.k as string).slice(0, 8), ms: j.ms as number }))
    : [];
  return { tes_id: b.tes_id, versi: b.versi.slice(0, 64), mulai_hp_ms: b.mulai_hp_ms, selesai_hp_ms: b.selesai_hp_ms, kirim_hp_ms: b.kirim_hp_ms, selisih_ms: b.selisih_ms, jawaban, jejak };
}

/**
 * `tes`: jadwal efektif (buka/tutup) dan durasi; `dimulaiInstruktur`: tes memakai agenda hari H (pintu = sandi dari instruktur, jadwal buka
 * tidak dipakai sebagai batas bawah karena Mulai bisa ditekan lebih awal). `sekarangMs` = jam server saat menerima.
 */
export function periksaKirimLuring(
  k: KirimLuring,
  tes: { buka_at: string; tutup_at: string; durasi_menit: number },
  dimulaiInstruktur: boolean,
  sekarangMs: number,
): HasilPeriksa {
  if (k.selesai_hp_ms < k.mulai_hp_ms) return { ok: false, pesan: "Catatan waktu tidak sah (selesai sebelum mulai)." };
  const mulai = k.mulai_hp_ms + k.selisih_ms;
  const durasiMs = tes.durasi_menit * 60_000;
  const batas = mulai + durasiMs;
  const buka = Date.parse(tes.buka_at);
  const tutup = Date.parse(tes.tutup_at);
  if (Number.isFinite(tutup) && mulai >= tutup + 5 * 60_000) return { ok: false, pesan: "Tes dimulai sesudah sesi ditutup." };
  if (!dimulaiInstruktur && Number.isFinite(buka) && mulai < buka - 5 * 60_000) return { ok: false, pesan: "Tes dimulai sebelum sesi dibuka." };
  if (sekarangMs > batas + BATAS_TERTAHAN_JAM * 3_600_000) return { ok: false, pesan: `Jawaban tanpa sinyal hanya diterima paling lambat ${BATAS_TERTAHAN_JAM} jam sesudah waktu pengerjaan habis.` };

  const catatan: string[] = [];
  let selesai = k.selesai_hp_ms + k.selisih_ms;
  if (selesai - mulai > durasiMs + TOLERANSI_LURING_MS) {
    catatan.push("lama pengerjaan melewati durasi; selesai dipotong ke batas waktu");
    selesai = batas;
  } else if (selesai > batas) selesai = batas;
  let lalu = k.mulai_hp_ms;
  for (const j of k.jejak) {
    if (j.ms < lalu - 1000 || j.ms > k.selesai_hp_ms + 5000) {
      catatan.push("urutan waktu ketukan janggal");
      break;
    }
    lalu = Math.max(lalu, j.ms);
  }
  const geser = sekarangMs - (k.kirim_hp_ms + k.selisih_ms);
  // kirim_hp_ms dicatat tepat sebelum permintaan dikirim, jadi geser wajar hanya beberapa detik
  if (Math.abs(geser) > GESER_JAM_MAKS_MS) catatan.push(`jam HP bergeser ${Math.round(geser / 60_000)} menit sejak paket diunduh`);
  return { ok: true, mulai: new Date(mulai), selesai: new Date(selesai), batas: new Date(batas), catatan };
}
