// lib/sigapPin.ts
//
// (7 Okt 2026) Reset PIN SIGAP -- dua jalur (keputusan user):
//  1. MANDIRI "Lupa PIN?": petugas mengisi ulang nama + NIK + email + tanggal lahir (verifikasi yang sama dengan
//     "Belum punya PIN"), lalu memilih PIN baru. Server memberi TIKET reset bertanda tangan HMAC, berlaku 10 menit
//     dan SEKALI PAKAI (dikaitkan dengan sigap_akun.pin_diubah_at). Token akun permanen (yang ada di tautan translok)
//     TIDAK dipakai untuk reset, supaya tautan yang bocor tidak bisa dipakai membajak PIN.
//  2. ADMIN "Reset PIN": admin menekan tombol, server membuat PIN SEMENTARA 4 digit (tampil sekali ke admin, disimpan
//     hanya sebagai hash). Berlaku 24 jam; saat dipakai masuk, petugas WAJIB mengganti dengan PIN sendiri.
//     Akun admin (Admin Aplikasi / Admin Anggaran) hanya boleh direset Admin Aplikasi (cegah naik hak akses).

import crypto from "crypto";
import { hashPin, normNama } from "@/lib/undangan";
import { catatAudit } from "@/lib/sigapAkses";
import type { Db } from "@/lib/sigap";

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
    .update({ pin_hash: hash, pin_salt: salt, pin_diubah_at: new Date().toISOString(), pin_sementara_sampai: null, akun_dibuat_at: new Date().toISOString() })
    .eq("id", akunId);
  return error ? error.message : null;
}

const PERAN_ADMIN = ["admin_aplikasi", "admin_anggaran"];

/** Reset PIN oleh admin -> PIN sementara. `adminAplikasi` = aktor punya izin portal.kelola (kelola). */
export async function resetPinOlehAdmin(
  db: Db,
  aktor: { akunId: number; nama: string; adminAplikasi: boolean },
  akunId: number
): Promise<{ ok: true; pin: string; nama: string; sampai: string; hp: string | null } | { ok: false; error: string; status: number }> {
  if (!Number.isInteger(akunId) || akunId <= 0) return { ok: false, error: "Akun tidak valid.", status: 400 };
  if (akunId === aktor.akunId) return { ok: false, error: "Untuk PIN Anda sendiri, pakai \"Lupa PIN?\" di halaman masuk.", status: 400 };
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif, petugas_bencana_id").eq("id", akunId).maybeSingle();
  if (!a) return { ok: false, error: "Akun tidak ditemukan.", status: 404 };
  if (!a.aktif) return { ok: false, error: "Akun ini tidak aktif.", status: 409 };
  if (!aktor.adminAplikasi) {
    const { data: ap } = await db.from("sigap_akun_peran").select("peran_id").eq("akun_id", akunId);
    const ids = (ap ?? []).map((x) => x.peran_id as number);
    if (ids.length) {
      const { data: pr } = await db.from("sigap_peran").select("kode").in("id", ids);
      if ((pr ?? []).some((p) => PERAN_ADMIN.includes(p.kode as string)))
        return { ok: false, error: "PIN akun admin hanya dapat direset oleh Admin Aplikasi.", status: 403 };
    }
  }
  const pin = buatPinSementara();
  const { hash, salt } = hashPin(pin);
  const sampai = new Date(Date.now() + PIN_SEMENTARA_JAM * 3_600_000).toISOString();
  const { error } = await db.from("sigap_akun").update({ pin_hash: hash, pin_salt: salt, pin_diubah_at: new Date().toISOString(), pin_sementara_sampai: sampai }).eq("id", akunId);
  if (error) return { ok: false, error: error.message, status: 500 };
  // buka kunci percobaan salah (jika sedang terkunci) supaya PIN sementara langsung bisa dipakai
  await db.from("bencana_undangan_percobaan").delete().eq("kunci", `sigap_pin:${normNama(String(a.nama ?? ""))}`);
  await catatAudit(db, aktor.akunId, "reset_pin_admin", { akun_id: akunId, nama: a.nama, oleh: aktor.nama, sampai }); // PIN tidak ikut dicatat
  let hp: string | null = null;
  if (a.petugas_bencana_id) {
    const { data: bp } = await db.from("bencana_petugas").select("no_hp").eq("id", a.petugas_bencana_id).maybeSingle();
    hp = (bp?.no_hp as string | null) ?? null;
  }
  return { ok: true, pin, nama: a.nama as string, sampai, hp };
}
