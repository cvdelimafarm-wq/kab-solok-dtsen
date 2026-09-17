// lib/penyisiranAuth.ts
//
// Gerbang akses KHUSUS untuk fitur "Penyisiran Undercoverage Usaha" (kini
// di /penyisiran, dulu tab di /seruti). Beda dari pola PIN yang sudah ada
// di rekap-temuan.tsx / kelola-anomali (PIN ditulis LANGSUNG di kode
// client, mis. `const EDIT_PIN = "3333"`, dan cuma dicek di browser) --
// di sini PIN diverifikasi di SERVER (route /api/penyisiran/auth) dan
// tidak pernah dikirim ke client sama sekali.
//
// Ada DUA PERAN (role) dengan PIN masing-masing yang TERPISAH:
//  - "penyisiran"   -> tab "Penyisiran Usaha", PIN internal BPS
//                      (env PENYISIRAN_PIN). Bisa lihat nama+alamat+GPS+
//                      bukti DUTP/DTSEN/PNM, dan mengedit checklist.
//  - "identifikasi" -> tab "Identifikasi PPL", PIN INI yang dibagikan ke
//                      PPL/mantan pendata SE2026 (env
//                      PENYISIRAN_IDENTIFIKASI_PIN). Sengaja PIN BEDA
//                      supaya kalau PIN ini bocor/dibagikan lebih luas,
//                      yang bisa dibuka cuma nama+alamat+wilayah (tanpa
//                      GPS/bukti) dan cuma bisa isi Ada/Tidak Ada/Ragu --
//                      TIDAK bisa buka/mengedit tab Penyisiran Usaha.
//
// Token sesi berbentuk "<role>.<expiredAtMs>.<tandaTanganHMAC>",
// ditandatangani pakai SUPABASE_SERVICE_ROLE_KEY (sudah ada di env server
// sejak fitur Anomali Cepat) sebagai kunci rahasia. Token ini yang
// disimpan di sessionStorage browser & dikirim sbg header Authorization
// di tiap request API berikutnya -- expired otomatis 12 jam, dan setiap
// endpoint mensyaratkan role tertentu supaya token satu peran tidak bisa
// dipakai membuka endpoint peran lain.
//
// PERAN KETIGA -- "identifikasi_ppl": login personal PPL (nama + tanggal
// lahir, lihat /api/penyisiran/identifikasi-login) supaya tiap PPL cuma
// melihat daftar keluarga di ID Sub SLS yang memang dialokasikan ke
// dirinya (tanpa perlu pilih kecamatan/nagari manual). Token peran ini
// PUNYA BAGIAN KE-4 yaitu "subject" (id baris ppl_akun, di-base64url-kan)
// supaya identitas PPL ikut terbawa di token: format jadi
// "<role>.<subjectB64>.<expiredAtMs>.<tandaTanganHMAC>". Untuk role lama
// ("penyisiran"/"identifikasi") format 3-bagian lama TETAP didukung apa
// adanya -- verifySession() mendeteksi jumlah bagian token utk memilih
// cara parse yang sesuai, jadi token lama yang masih tersimpan di
// sessionStorage pengguna tidak mendadak invalid.
//
// TTL utk "identifikasi_ppl" sengaja jauh lebih panjang (bukan 12 jam)
// supaya PPL yang sudah login hari ini TIDAK perlu login ulang besok
// (sesuai permintaan: "besoknya otomatis login") -- token disimpan di
// localStorage (bukan sessionStorage) oleh halaman client.

import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam -- cukup utk 1 hari kerja lapangan
const PPL_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 hari -- login PPL persisten lintas hari

export type PenyisiranRole = "penyisiran" | "identifikasi" | "identifikasi_ppl";

function getSigningSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum diset di environment variable server."
    );
  }
  return s;
}

function pinEnvVar(role: PenyisiranRole): string | undefined {
  return role === "identifikasi" ? process.env.PENYISIRAN_IDENTIFIKASI_PIN : process.env.PENYISIRAN_PIN;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string | null {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Menandatangani sesi. `subject` HANYA dipakai (dan wajib diisi) utk role
 * "identifikasi_ppl" -- membawa id baris ppl_akun supaya endpoint bisa tahu
 * PPL mana yang sedang login tanpa perlu parameter tambahan dari client.
 */
export function signSession(role: PenyisiranRole = "penyisiran", subject?: string): string {
  const ttl = role === "identifikasi_ppl" ? PPL_SESSION_TTL_MS : SESSION_TTL_MS;
  const exp = Date.now() + ttl;
  if (role === "identifikasi_ppl") {
    const subB64 = b64urlEncode(subject || "");
    const payload = `${role}.${subB64}.${exp}`;
    const sig = createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
    return `${payload}.${sig}`;
  }
  const payload = `${role}.${exp}`;
  const sig = createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(
  token: string | null | undefined,
  allowedRoles: PenyisiranRole | PenyisiranRole[] = ["penyisiran", "identifikasi"]
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (parts.length === 4) {
    // Format baru: role.subjectB64.exp.sig (dipakai "identifikasi_ppl")
    const [role, subB64, expStr, sig] = parts;
    if (!allowed.includes(role as PenyisiranRole)) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const payload = `${role}.${subB64}.${expStr}`;
    let expected: string;
    try {
      expected = createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
    } catch {
      return false;
    }
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  }

  if (parts.length !== 3) return false;
  const [role, expStr, sig] = parts;

  if (!allowed.includes(role as PenyisiranRole)) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const payload = `${role}.${expStr}`;
  let expected: string;
  try {
    expected = createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
  } catch {
    return false;
  }

  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * Ambil "subject" (id ppl_akun) dari token role "identifikasi_ppl" yang
 * SUDAH divalidasi oleh verifySession(). Mengembalikan null kalau token
 * bukan format 4-bagian atau tidak valid -- jadi selalu panggil
 * verifySession() dulu sebelum mengandalkan nilai ini.
 */
export function getSessionSubject(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const subject = b64urlDecode(parts[1]);
  return subject && subject.length > 0 ? subject : null;
}

export function checkPin(pinInput: string, role: PenyisiranRole = "penyisiran"): boolean {
  const real = pinEnvVar(role);
  if (!real) return false;
  const a = Buffer.from(pinInput);
  const b = Buffer.from(real);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];
  // fallback: token via query string (dipakai link unduh CSV, yg dibuka
  // langsung oleh browser sbg navigasi -- tidak bisa menyertakan header).
  try {
    const url = new URL(req.url);
    return url.searchParams.get("token");
  } catch {
    return null;
  }
}
