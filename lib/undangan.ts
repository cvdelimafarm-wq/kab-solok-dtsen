// lib/undangan.ts
//
// (4 Okt 2026) Pembantu "Undangan Konfirmasi Bersama" (1 link utk WA grup, lihat
// app/bencana/undangan/page.tsx): verifikasi identitas (nama + NIK + email +
// tanggal lahir), akun PIN 4 digit, pembatas percobaan salah, dan penentuan
// halaman tujuan (konfirmasi biasa vs tawaran menginap).
//
// SUMBER DATA PEMBANDING (tidak menyalin data pribadi ke tabel baru):
//   - NIK & email  : bencana_mitra (dicocokkan lewat nama yg sudah dinormalisasi).
//   - Tanggal lahir: bencana_mitra.tanggal_lahir -- tanggal EKSPLISIT dari data yg
//     dikirim admin (4 Okt 2026), BUKAN diturunkan dari NIK (tanggal di NIK bisa
//     berbeda dgn tanggal lahir riil).
//   - Kalau NIK / email / tanggal lahir petugas TIDAK ADA di sumber, kolom itu tidak
//     bisa dicek -> statusnya 'belum_ada': diisi sendiri oleh petugas & disimpan di
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
export const WA_GROUP_URL = "https://chat.whatsapp.com/Hf1noxD5zhUDNZQ02P7CVo?s=cl&p=a&mlu=0";

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
  | { tipe: "pml"; path: string }
  | { tipe: "menginap"; path: string }
  | { tipe: "biasa"; path: string }
  | { tipe: "belum"; path: null }
  // (5 Okt 2026) Plotting dibatalkan admin (mis. PPL SPDT NTP 2026 tidak boleh rangkap bencana) --
  // petugas tidak diarahkan ke mana pun, cukup ditampilkan pesan pembatalan.
  | { tipe: "dibatalkan"; path: null; pesan: string };

/** (5 Okt 2026) Pesan pembatalan plotting (tabel bencana_pembatalan_plot), null kalau tidak dibatalkan. */
export async function pesanPembatalan(db: Db, petugasId: number): Promise<string | null> {
  const { data } = await db.from("bencana_pembatalan_plot").select("pesan").eq("petugas_id", petugasId).maybeSingle();
  return (data?.pesan as string | undefined) ?? null;
}

/** Halaman yg dibuka setelah masuk: tawaran menginap kalau ada, selain itu konfirmasi biasa kalau sudah diplot. */
export async function tentukanTujuan(db: Db, petugas: PetugasUndangan): Promise<Tujuan> {
  // (5 Okt 2026) Dicek PALING AWAL: petugas yg plotting-nya dibatalkan hanya melihat pesan pembatalan.
  const pesan = await pesanPembatalan(db, petugas.id);
  if (pesan) return { tipe: "dibatalkan", path: null, pesan };
  const { data: kand } = await db
    .from("bencana_tawaran_menginap_kandidat")
    .select("token")
    .eq("petugas_id", petugas.id)
    .order("dibuat_pada", { ascending: false })
    .limit(1);
  if (kand && kand.length > 0) return { tipe: "menginap", path: `/bencana/menginap/${kand[0].token}` };
  // (4 Okt 2026) PML: tidak memegang Sub SLS sebagai PPL, tapi membawahi PPL -> halaman konfirmasi PML.
  const { data: peran } = await db.from("bencana_petugas").select("peran").eq("id", petugas.id).maybeSingle();
  if (peran?.peran === "pml") {
    const { count: bawahan } = await db.from("bencana_petugas").select("id", { count: "exact", head: true }).eq("atasan_id", petugas.id);
    if (bawahan && bawahan > 0) return { tipe: "pml", path: `/bencana/pml/${petugas.token}` };
    // (5 Okt 2026) Plotting dua lapis: PML yg sudah punya wilayah tim (walau belum ada PPL) juga diarahkan ke halaman PML.
    const { count: wilTim } = await db.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("pml_id", petugas.id);
    if (wilTim && wilTim > 0) return { tipe: "pml", path: `/bencana/pml/${petugas.token}` };
  }
  const { count } = await db.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("ppl_id", petugas.id);
  if (count && count > 0) return { tipe: "biasa", path: `/bencana/konfirmasi/${petugas.token}` };
  // (5 Okt 2026) PPL NON-PLOT yg sudah bergabung ke tim (punya PML): tetap dapat halaman konfirmasi,
  // yg menampilkan seluruh Sub SLS sampel timnya.
  if (peran?.peran === "ppl") {
    const { data: tim } = await db.from("bencana_petugas").select("atasan_id").eq("id", petugas.id).maybeSingle();
    if (tim?.atasan_id) return { tipe: "biasa", path: `/bencana/konfirmasi/${petugas.token}` };
  }
  return { tipe: "belum", path: null };
}

/** Sudah membuat akun (PIN) lewat BuatAkunPanel? */
export async function punyaAkun(db: Db, petugasId: number): Promise<boolean> {
  const { data } = await db.from("bencana_undangan").select("pin_hash").eq("petugas_id", petugasId).maybeSingle();
  return !!data?.pin_hash;
}

/** Masih ada data yg dibutuhkan utk analisis wilayah tugas yg belum diisi? (lokasi GPS riil, HP, profil, kendaraan, dll.) */
export async function dataBelumLengkap(db: Db, petugasId: number): Promise<boolean> {
  const { data } = await db
    .from("bencana_petugas")
    .select(
      "no_hp, lokasi_status, umur, jenis_kelamin, pendidikan, pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor, punya_hp_android, pernah_capi"
    )
    .eq("id", petugasId)
    .maybeSingle();
  if (!data) return false;
  const d = data as Record<string, unknown>;
  if (d.lokasi_status !== "riil") return true;
  return ["no_hp", "umur", "jenis_kelamin", "pendidikan", "pekerjaan", "bisa_mengendarai_motor", "punya_kendaraan_bermotor", "punya_hp_android", "pernah_capi"].some(
    (k) => d[k] === null || d[k] === undefined || d[k] === ""
  );
}
