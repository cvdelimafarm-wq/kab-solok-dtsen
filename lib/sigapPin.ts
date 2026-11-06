// lib/sigapPin.ts
//
// (7 Okt 2026) Reset PIN SIGAP -- dua jalur (keputusan user):
//  1. MANDIRI "Lupa PIN?": petugas mengisi ulang nama + NIK + email + tanggal lahir (verifikasi yang sama dengan
//     "Belum punya PIN"), lalu memilih PIN baru. Server memberi TIKET reset bertanda tangan HMAC, berlaku 10 menit
//     dan SEKALI PAKAI (dikaitkan dengan sigap_akun.pin_diubah_at). Token akun permanen (yang ada di tautan translok)
//     TIDAK dipakai untuk reset, supaya tautan yang bocor tidak bisa dipakai membajak PIN.
//  2. ADMIN "Reset PIN": admin menekan tombol, server membuat PIN SEMENTARA 4 digit (tampil sekali ke admin, disimpan
//     hanya sebagai hash). Berlaku 24 jam; saat dipakai masuk, petugas WAJIB mengganti dengan PIN sendiri.
//     Akun admin (Admin Aplikasi / Admin Anggaran) dan pemegang izin `kelola` hanya boleh direset Admin Aplikasi (cegah naik hak akses);
//     admin lain hanya boleh mereset akun yang bertugas di kegiatan yang dikelolanya (aturan: lib/aturanLingkup.ts).

import crypto from "crypto";
import { cekPin, hashPin, normNama } from "@/lib/undangan";
import { PIN_AWAL, kunciPin } from "@/lib/sigapMasukNama";
import { catatAudit } from "@/lib/sigapAkses";
import type { Db } from "@/lib/sigap";
import { PERAN_PIN_TERLINDUNGI, periksaSasaranReset, type LingkupKegiatan, type SasaranReset } from "@/lib/aturanLingkup";

const TIKET_MENIT = 10;
export const PIN_SEMENTARA_JAM = 24;

function tanda(isi: string): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset.");
  return crypto.createHmac("sha256", `sigap-reset-pin:${k}`).update(isi).digest("base64url");
}

/** Tiket reset mandiri: `akunId.kedaluwarsa.terbit.tanda`. */
export function buatTiketReset(akunId: number): string {
  const terbit = Date.now();
  const isi = `${akunId}.${terbit + TIKET_MENIT * 60_000}.${terbit}`;
  return `${isi}.${tanda(isi)}`;
}

/** Baca tiket: { akunId, terbit } bila sah & belum kedaluwarsa, atau null. */
export function bacaTiketReset(tiket: string | null | undefined): { akunId: number; terbit: number } | null {
  if (!tiket) return null;
  const [id, exp, terbit, sig] = tiket.split(".");
  if (!id || !exp || !terbit || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(tanda(`${id}.${exp}.${terbit}`));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const akunId = Number(id);
  return Number.isInteger(akunId) && akunId > 0 ? { akunId, terbit: Number(terbit) } : null;
}

/** PIN 4 digit acak yang tidak terlalu mudah ditebak (bukan 0000, 1234, 4321, 1111, dst.). */
export function buatPinSementara(): string {
  for (let i = 0; i < 100; i++) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    const d = pin.split("").map(Number);
    const sama = d.every((x) => x === d[0]);
    const naik = d.every((x, j) => j === 0 || x === d[j - 1] + 1);
    const turun = d.every((x, j) => j === 0 || x === d[j - 1] - 1);
    if (!sama && !naik && !turun) return pin;
  }
  return "5827";
}

/** Simpan PIN baru milik petugas sendiri (menghapus status PIN sementara). */
export async function simpanPinBaru(db: Db, akunId: number, pin: string): Promise<string | null> {
  const { hash, salt } = hashPin(pin);
  const { error } = await db
    .from("sigap_akun")
    .update({ pin_hash: hash, pin_salt: salt, pin_diubah_at: new Date().toISOString(), pin_sementara_sampai: null, pin_bawaan: false, akun_dibuat_at: new Date().toISOString() })
    .eq("id", akunId);
  return error ? error.message : null;
}

/**
 * (8 Okt 2026) Akun ini MASIH memakai PIN awal bersama (1303)? Penanda sigap_akun.pin_bawaan dicek ulang terhadap hash
 * sebenarnya, jadi penanda yang basi (PIN sudah diganti lewat jalur lain) dibersihkan sendiri.
 */
export async function masihPinAwal(db: Db, akunId: number): Promise<boolean> {
  const { data } = await db.from("sigap_akun").select("pin_hash, pin_salt, pin_bawaan, pin_sementara_sampai").eq("id", akunId).maybeSingle();
  if (!data || !data.pin_bawaan) return false;
  const cocok = !!data.pin_hash && !!data.pin_salt && !data.pin_sementara_sampai && cekPin(PIN_AWAL, data.pin_hash as string, data.pin_salt as string);
  if (!cocok) await db.from("sigap_akun").update({ pin_bawaan: false }).eq("id", akunId);
  return cocok;
}

/**
 * (6 Nov 2026) Memuat data sasaran untuk `periksaSasaranReset`: peran, apakah memegang izin `kelola`, dan kegiatan penugasan aktifnya.
 * Satu akun = beberapa kueri kecil; dipakai juga `akunTerlindungi` untuk banyak akun sekaligus.
 */
export async function muatSasaranReset(db: Db, akunId: number, aktif: boolean, petugasBencanaId: number | null = null): Promise<SasaranReset> {
  const [{ data: ap }, { data: pen }] = await Promise.all([
    db.from("sigap_akun_peran").select("peran_id").eq("akun_id", akunId),
    db.from("sigap_penugasan").select("kegiatan_id").eq("akun_id", akunId).eq("aktif", true),
  ]);
  const ids = Array.from(new Set((ap ?? []).map((x) => x.peran_id as number)));
  let peranKode: string[] = [];
  let punyaIzinKelola = false;
  if (ids.length) {
    const [{ data: pr }, { data: iz }] = await Promise.all([
      db.from("sigap_peran").select("kode").in("id", ids),
      db.from("sigap_peran_izin").select("peran_id").in("peran_id", ids).eq("level", "kelola").limit(1),
    ]);
    peranKode = (pr ?? []).map((p) => p.kode as string);
    punyaIzinKelola = (iz ?? []).length > 0;
  }
  const kegiatanPenugasan = new Set((pen ?? []).map((x) => Number(x.kegiatan_id)));
  // (6 Nov 2026, tahap 3) "Petugas PSP" = penugasan kegiatan 1 yang aktif (sudah ikut terhitung di atas). Daftar petugas lama
  // (`bencana_petugas`, 456 mitra aktif) tidak lagi dibaca di sini: tautan `petugas_bencana_id` tidak berarti bertugas di PSP.
  void petugasBencanaId; // parameter dipertahankan agar pemanggil lama tidak berubah
  return { aktif, peranKode, punyaIzinKelola, kegiatanPenugasan: Array.from(kegiatanPenugasan) };
}

/** Subset `akunIds` yang terlindungi (peran admin atau memegang izin `kelola`). Dipakai pencarian akun agar pengelola tak mudah dijadikan sasaran. */
export async function akunTerlindungi(db: Db, akunIds: number[]): Promise<Set<number>> {
  const hasil = new Set<number>();
  if (!akunIds.length) return hasil;
  const { data: ap } = await db.from("sigap_akun_peran").select("akun_id, peran_id").in("akun_id", akunIds);
  const peranIds = Array.from(new Set((ap ?? []).map((x) => x.peran_id as number)));
  if (!peranIds.length) return hasil;
  const [{ data: pr }, { data: iz }] = await Promise.all([
    db.from("sigap_peran").select("id, kode").in("id", peranIds),
    db.from("sigap_peran_izin").select("peran_id").in("peran_id", peranIds).eq("level", "kelola"),
  ]);
  const peranTerlindungi = new Set<number>();
  for (const p of pr ?? []) if (PERAN_PIN_TERLINDUNGI.includes(p.kode as string)) peranTerlindungi.add(p.id as number);
  for (const i of iz ?? []) peranTerlindungi.add(i.peran_id as number);
  for (const x of ap ?? []) if (peranTerlindungi.has(x.peran_id as number)) hasil.add(x.akun_id as number);
  return hasil;
}

/**
 * Reset PIN oleh admin -> PIN sementara. `adminAplikasi` = aktor punya izin portal.kelola (kelola).
 * (6 Nov 2026) `lingkup` = kegiatan yang boleh dikelola aktor ("semua" atau daftar id). Tanpa `lingkup` dianggap kosong (menolak),
 * jadi pemanggil lama yang belum diperbarui gagal dengan aman, bukan terbuka.
 */
export async function resetPinOlehAdmin(
  db: Db,
  aktor: { akunId: number; nama: string; adminAplikasi: boolean; lingkup?: LingkupKegiatan },
  akunId: number
): Promise<{ ok: true; pin: string; nama: string; sampai: string; hp: string | null } | { ok: false; error: string; status: number }> {
  if (!Number.isInteger(akunId) || akunId <= 0) return { ok: false, error: "Akun tidak valid.", status: 400 };
  if (akunId === aktor.akunId) return { ok: false, error: "Untuk PIN Anda sendiri, pakai \"Lupa PIN?\" di halaman masuk.", status: 400 };
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif, petugas_bencana_id, no_hp").eq("id", akunId).maybeSingle();
  if (!a) return { ok: false, error: "Akun tidak ditemukan.", status: 404 };
  const sasaran = await muatSasaranReset(db, akunId, !!a.aktif, (a.petugas_bencana_id as number | null) ?? null);
  const galat = periksaSasaranReset({ adminAplikasi: aktor.adminAplikasi, lingkup: aktor.lingkup ?? [] }, sasaran);
  if (galat) return { ok: false, error: galat.error, status: galat.status };
  const pin = buatPinSementara();
  const { hash, salt } = hashPin(pin);
  const sampai = new Date(Date.now() + PIN_SEMENTARA_JAM * 3_600_000).toISOString();
  const { error } = await db.from("sigap_akun").update({ pin_hash: hash, pin_salt: salt, pin_diubah_at: new Date().toISOString(), pin_sementara_sampai: sampai, pin_bawaan: false }).eq("id", akunId);
  if (error) return { ok: false, error: error.message, status: 500 };
  // buka kunci percobaan salah (jika sedang terkunci) supaya PIN sementara langsung bisa dipakai
  await db.from("bencana_undangan_percobaan").delete().eq("kunci", kunciPin(akunId));
  await db.from("bencana_undangan_percobaan").delete().eq("kunci", `sigap_pin:${normNama(String(a.nama ?? ""))}`); // kunci lama berbasis nama (sebelum 6 Nov 2026)
  await catatAudit(db, aktor.akunId, "reset_pin_admin", { akun_id: akunId, nama: a.nama, oleh: aktor.nama, sampai }); // PIN tidak ikut dicatat
  // (tahap 3) nomor HP kini di sigap_akun.no_hp (diisi dari daftar lama dan master mitra oleh skema-sql/20261106e)
  const hp: string | null = (a.no_hp as string | null)?.trim() || null;
  return { ok: true, pin, nama: a.nama as string, sampai, hp };
}
