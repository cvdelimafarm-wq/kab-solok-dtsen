// lib/sigapAbsenLuring.ts
//
// (14 Nov 2026, luring 3d) ABSEN SESI TANPA SINYAL. Peserta tanpa sinyal tidak tahu sesi mana yang sedang dibuka, jadi KODE yang dibacakan instruktur
// menjadi penunjuk sesinya: HP mencatat kode + jam HP + selisih jam server; saat tersambung server mencari sesi hari itu (kelas peserta) yang kodenya
// cocok dan jendelanya mencakup jam ketik (jam HP diterjemahkan ke jam server, toleransi 2 menit). Diterima paling lambat 24 jam sesudah diketik.
// Batas salah ketik yang sama dengan absen bersinyal (5x -> tunggu) tetap berlaku lewat tabel salah ketik.
// Murni (tanpa basis data).

import { BATAS_TERTAHAN_JAM } from "./sigapTesLuring";

export const TOLERANSI_ABSEN_LURING_MS = 2 * 60_000;

export type KodeLuring = { kode: string; hp_ms: number; selisih_ms: number; kirim_hp_ms: number };

export function bacaKodeLuring(x: unknown): KodeLuring | null {
  if (!x || typeof x !== "object") return null;
  const b = x as Record<string, unknown>;
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (typeof b.kode !== "string" || !n(b.hp_ms) || !n(b.selisih_ms) || !n(b.kirim_hp_ms)) return null;
  return { kode: b.kode.replace(/\s+/g, "").slice(0, 12), hp_ms: b.hp_ms as number, selisih_ms: b.selisih_ms as number, kirim_hp_ms: b.kirim_hp_ms as number };
}

type SesiMinimal = { id: number; kelas: number | null; kode: string | null; metode: string[]; dibuka_at: string; tutup_at: string; ditutup_at: string | null };

export type PutusanKodeLuring =
  | { ok: true; sesi_id: number; t: number; catatan: string[] }
  | { ok: false; pesan: string; status: number; salah_kode?: boolean };

/** Pilih sesi untuk kode tanpa sinyal. `sekarangMs` = jam server saat diterima. */
export function putuskanKodeLuring<S extends SesiMinimal>(daftar: readonly S[], k: KodeLuring, kelasPeserta: number | null, sekarangMs: number): PutusanKodeLuring {
  const t = k.hp_ms + k.selisih_ms;
  if (t > sekarangMs + 10 * 60_000) return { ok: false, pesan: "Jam absen lebih baru dari jam server; periksa jam HP.", status: 409 };
  if (sekarangMs > t + BATAS_TERTAHAN_JAM * 3_600_000) return { ok: false, pesan: `Absen tanpa sinyal hanya diterima paling lambat ${BATAS_TERTAHAN_JAM} jam sesudah kode diketik.`, status: 409 };
  const untukku = daftar.filter((s) => s.kelas === null || kelasPeserta === null || Number(s.kelas) === Number(kelasPeserta));
  const cocok = untukku.filter((s) => !!s.kode && s.kode === k.kode && s.metode.includes("kode"));
  if (cocok.length === 0) return { ok: false, pesan: "Kode tidak cocok dengan sesi absen mana pun hari itu.", status: 422, salah_kode: true };
  for (const s of cocok) {
    const buka = Date.parse(s.dibuka_at);
    const tutup = Math.min(Date.parse(s.tutup_at), s.ditutup_at ? Date.parse(s.ditutup_at) : Infinity);
    if (t >= buka - TOLERANSI_ABSEN_LURING_MS && t <= tutup + TOLERANSI_ABSEN_LURING_MS) {
      const catatan: string[] = [];
      const geser = sekarangMs - (k.kirim_hp_ms + k.selisih_ms);
      if (Math.abs(geser) > 10 * 60_000) catatan.push(`jam HP bergeser ${Math.round(geser / 60_000)} menit`);
      return { ok: true, sesi_id: s.id, t: Math.min(Math.max(t, buka), tutup), catatan };
    }
  }
  return { ok: false, pesan: "Kode cocok, tetapi diketik di luar waktu absen sesi itu.", status: 409 };
}
