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

import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam -- cukup utk 1 hari kerja lapangan

export type PenyisiranRole = "penyisiran" | "identifikasi";

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

export function signSession(role: PenyisiranRole = "penyisiran"): string {
  const exp = Date.now() + SESSION_TTL_MS;
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
  if (parts.length !== 3) return false;
  const [role, expStr, sig] = parts;

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
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
