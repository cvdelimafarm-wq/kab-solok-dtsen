// lib/undangan.ts
//
// (4 Okt 2026) Pembantu "Undangan Konfirmasi Bersama" (1 link utk WA grup, lihat
// app/bencana/undangan/page.tsx): verifikasi identitas (nama + NIK + email +
// tanggal lahir), akun PIN 4 digit, pembatas percobaan salah, dan penentuan
// halaman tujuan (konfirmasi biasa vs tawaran menginap).
//
// SUMBER DATA PEMBANDING (tidak menyalin data pribadi ke tabel baru):
//   - NIK & email  : bencana_mitra (dicocokkan lewat nama yg sudah dinormalisasi).
//   - Tanggal lahir: DITURUNKAN dari NIK (digit 7-12 = hhbbtt, perempuan hh+40).
//     Abad tidak tersimpan di NIK, jadi yg dicek hanya hari, bulan, dan 2 digit
//     tahun -- cukup utk verifikasi, & tidak butuh tabel tanggal lahir terpisah.
//   - Kalau NIK petugas TIDAK ADA di sumber, kolom NIK & tanggal lahir tidak bisa
//     dicek -> statusnya 'belum_ada': diisi sendiri oleh petugas & disimpan di
//     bencana_undangan (tabel RLS-on, hanya service role), tanpa dinilai benar/salah.
//
// PEMBATAS: tiap percobaan verifikasi / login PIN yg salah dihitung per kunci
// (nama ternormalisasi). MAKS_GAGAL kali salah -> terkunci KUNCI_MENIT menit.
// Admin bisa membuka kunci dari tab Alokasi Petugas.

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

// Grup WhatsApp koordinasi petugas -- baru ditampilkan SETELAH petugas bersedia & membuat akun.
export const WA_GROUP_URL = "https://chat.whatsapp.com/FAvu1HMdKh15QhhhxRy4Ki";

export const MAKS_GAGAL = 5;
export const KUNCI_MENIT = 30;

export function normNama(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // apostrof/titik/tanda baca dibuang di kedua sisi
    .replace(/\s+/g, " ")
    .trim();
}

export function normNik(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

export function normEmail(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

export function nikValid(nik: string): boolean {
  return /^\d{16}$/.test(nik);
}

export function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function tanggalValid(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1930 && y <= 2012;
}

/** Hari, bulan, tahun(2 digit) dari NIK; perempuan = hari + 40. */
export function tanggalDariNik(nik: string): { d: number; m: number; yy: number } | null {
  if (!nikValid(nik)) return null;
  let d = Number(nik.slice(6, 8));
  if (d > 40) d -= 40;
  const m = Number(nik.slice(8, 10));
  const yy = Number(nik.slice(10, 12));
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  return { d, m, yy };
}

export function cocokTanggalDenganNik(nik: string, iso: string): boolean {
  const t = tanggalDariNik(nik);
  if (!t || !tanggalValid(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  return d === t.d && m === t.m && y % 100 === t.yy;
}

// ---------- PIN ----------
export function pinValid(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return { hash, salt };
}

export function cekPin(pin: string, hash: string, salt: string): boolean {
  try {
    const calc = scryptSync(pin, salt, 32);
    const asli = Buffer.from(hash, "hex");
    return calc.length === asli.length && timingSafeEqual(calc, asli);
  } catch {
    return false;
  }
}

// ---------- pembatas percobaan ----------
export async function cekKunci(db: Db, kunci: string): Promise<{ terkunci: boolean; sampai: string | null; gagal: number }> {
  const { data } = await db.from("bencana_undangan_percobaan").select("gagal, terkunci_sampai").eq("kunci", kunci).maybeSingle();
  if (!data) return { terkunci: false, sampai: null, gagal: 0 };
  const sampai = data.terkunci_sampai as string | null;
  if (sampai && new Date(sampai).getTime() > Date.now()) return { terkunci: true, sampai, gagal: data.gagal as number };
  // kunci sudah lewat -> hitung mulai dari nol
  if (sampai) {
    await db.from("bencana_undangan_percobaan").update({ gagal: 0, terkunci_sampai: null, diperbarui_at: new Date().toISOString() }).eq("kunci", kunci);
    return { terkunci: false, sampai: null, gagal: 0 };
  }
  return { terkunci: false, sampai: null, gagal: data.gagal as number };
}

export async function catatGagal(db: Db, kunci: string): Promise<{ gagal: number; sisa: number; terkunci: boolean; sampai: string | null }> {
  const sebelum = await cekKunci(db, kunci);
  const gagal = sebelum.gagal + 1;
  const terkunci = gagal >= MAKS_GAGAL;
  const sampai = terkunci ? new Date(Date.now() + KUNCI_MENIT * 60_000).toISOString() : null;
  await db
    .from("bencana_undangan_percobaan")
    .upsert({ kunci, gagal, terkunci_sampai: sampai, diperbarui_at: new Date().toISOString() }, { onConflict: "kunci" });
  return { gagal, sisa: Math.max(0, MAKS_GAGAL - gagal), terkunci, sampai };
}

export async function resetGagal(db: Db, kunci: string): Promise<void> {
  await db.from("bencana_undangan_percobaan").delete().eq("kunci", kunci);
}

// ---------- pencarian petugas ----------
export type PetugasUndangan = { id: number; nama: string; token: string };

/** Petugas mitra aktif yg namanya (ternormalisasi) sama persis. */
export async function cariPetugasByNama(db: Db, nama: string): Promise<PetugasUndangan[]> {
  const kunci = normNama(nama);
  if (!kunci) return [];
  const { data } = await db.from("bencana_petugas").select("id, nama, token").eq("aktif", true).eq("status_kepegawaian", "mitra");
  return ((data ?? []) as PetugasUndangan[]).filter((p) => normNama(p.nama) === kunci);
}

export type Tujuan =
  | { tipe: "menginap"; path: string }
  | { tipe: "biasa"; path: string }
  | { tipe: "belum"; path: null };

/** Halaman yg dibuka setelah masuk: tawaran menginap kalau ada, selain itu konfirmasi biasa kalau sudah diplot. */
export async function tentukanTujuan(db: Db, petugas: PetugasUndangan): Promise<Tujuan> {
  const { data: kand } = await db
    .from("bencana_tawaran_menginap_kandidat")
    .select("token")
    .eq("petugas_id", petugas.id)
    .order("dibuat_pada", { ascending: false })
    .limit(1);
  if (kand && kand.length > 0) return { tipe: "menginap", path: `/bencana/menginap/${kand[0].token}` };
  const { count } = await db.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("ppl_id", petugas.id);
  if (count && count > 0) return { tipe: "biasa", path: `/bencana/konfirmasi/${petugas.token}` };
  return { tipe: "belum", path: null };
}

/** Sudah membuat akun (PIN) lewat BuatAkunPanel? */
export async function punyaAkun(db: Db, petugasId: number): Promise<boolean> {
  const { data } = await db.from("bencana_undangan").select("pin_hash").eq("petugas_id", petugasId).maybeSingle();
  return !!data?.pin_hash;
}
