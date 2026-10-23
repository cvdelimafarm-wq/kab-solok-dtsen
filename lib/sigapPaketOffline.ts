// lib/sigapPaketOffline.ts  (murni; dipakai klien dan diuji di vitest)
//
// (23 Okt 2026) Kamera SIGAP tanpa sinyal. HP menyimpan PAKET token yang diambil saat masih ada sinyal (lihat /api/sigap/foto/paket).
// Tiap foto tanpa sinyal memakai satu token dari paket. Waktu foto = waktu server saat paket terbit (t) + lama berjalan menurut jam HP
// sejak paket diterima. Jam monotonik (performance.now) hilang bila halaman dimuat ulang/HP restart, jadi lama berjalan diukur dengan
// jam dinding (Date.now); jam monotonik hanya dibawa bila masih halaman yang sama, supaya server bisa mendeteksi jam HP diubah.
// Foto semacam itu selalu KUNING di server ("waktu_offline"), tidak pernah hijau.

import { UMUR_PAKET_MS } from "@/lib/sigapFoto";

export type PaketHp = {
  akun_id: number;
  /** Waktu server (ms epoch) saat paket terbit. */
  t: number;
  /** Token yang masih belum dipakai. */
  tokens: string[];
  /** Date.now() HP saat paket diterima. */
  wall_at: number;
  /** performance.now() HP saat paket diterima, dan performance.timeOrigin halaman itu (pembeda "halaman yang sama"). */
  mono_at: number;
  origin: number;
};

/** Paket baru diminta bila tidak ada, milik akun lain, tersisa < sisaMin token, lebih tua dari `umurMaksMs`, atau jam HP mundur. */
export function perluPaketBaru(p: PaketHp | null, akunId: number, now: number, sisaMin = 8, umurMaksMs = 6 * 3_600_000): boolean {
  if (!p || p.akun_id !== akunId) return true;
  if (p.tokens.length < sisaMin) return true;
  const umur = now - p.wall_at;
  return umur < 0 || umur > umurMaksMs || umur > UMUR_PAKET_MS;
}

/** true bila paket masih sah dipakai (belum lewat UMUR_PAKET_MS menurut jam HP, jam HP tidak mundur, dan masih ada token). */
export function paketMasihBerlaku(p: PaketHp | null, akunId: number, now: number): boolean {
  if (!p || p.akun_id !== akunId || p.tokens.length === 0) return false;
  const umur = now - p.wall_at;
  return umur >= 0 && umur <= UMUR_PAKET_MS;
}

export type AmbilPaket = {
  paket: PaketHp; // paket sesudah satu token diambil
  token: string;
  elapsed_wall: number;
  /** null bila halaman sudah dimuat ulang sejak paket diterima (jam monotonik tidak sebanding). */
  elapsed_mono: number | null;
};

/** Mengambil satu token dari paket (tidak mengubah `p`). null bila paket tak sah/habis. */
export function ambilDariPaket(p: PaketHp | null, akunId: number, now: number, monoNow: number, originNow: number): AmbilPaket | null {
  if (!paketMasihBerlaku(p, akunId, now)) return null;
  const paket = p as PaketHp;
  const [token, ...sisa] = paket.tokens;
  return {
    paket: { ...paket, tokens: sisa },
    token,
    elapsed_wall: now - paket.wall_at,
    elapsed_mono: paket.origin === originNow && monoNow >= paket.mono_at ? monoNow - paket.mono_at : null,
  };
}

/** Bentuk paket yang disimpan dari jawaban server. null bila jawaban tidak masuk akal. */
export function paketDariJawaban(j: unknown, akunId: number, now: number, monoNow: number, originNow: number): PaketHp | null {
  const x = j as { t?: unknown; tokens?: unknown } | null;
  if (!x || typeof x.t !== "number" || !Number.isFinite(x.t) || !Array.isArray(x.tokens)) return null;
  const tokens = x.tokens.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 400);
  if (tokens.length === 0) return null;
  return { akun_id: akunId, t: x.t, tokens, wall_at: now, mono_at: monoNow, origin: originNow };
}
