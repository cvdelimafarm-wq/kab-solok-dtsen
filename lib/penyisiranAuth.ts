// lib/penyisiranAuth.ts
//
// Gerbang akses KHUSUS untuk menu "Lembar Pengecekan Penyisiran Undercoverage
// Usaha" (/seruti, tab baru). Beda dari pola PIN yang sudah ada di
// rekap-temuan.tsx / kelola-anomali (PIN ditulis LANGSUNG di kode client,
// mis. `const EDIT_PIN = "3333"`, dan cuma dicek di browser) — di sini PIN
// diverifikasi di SERVER (route /api/penyisiran/auth) dan tidak pernah
// dikirim ke client sama sekali. Alasannya: menu-menu lama itu cuma
// melindungi AKSI EDIT (data anomali tetap kebaca publik), sedangkan menu
// ini melindungi BACAAN nama kepala keluarga + alamat + koordinat GPS warga
// -- kalau PIN-nya ikut ada di kode client seperti pola lama, orang tinggal
// buka DevTools utk baca PIN-nya, lalu bisa panggil API datanya langsung.
//
// Setelah PIN benar, server membalas TOKEN SESI (bukan PIN itu sendiri):
// string "<expiredAtMs>.<tandaTanganHMAC>", ditandatangani pakai
// SUPABASE_SERVICE_ROLE_KEY (sudah ada di env server sejak fitur Anomali
// Cepat) sebagai kunci rahasia. Token ini yang disimpan di sessionStorage
// browser & dikirim sbg header Authorization di tiap request API
// berikutnya -- expired otomatis 12 jam, dan tidak bisa dipalsukan tanpa
// tahu SUPABASE_SERVICE_ROLE_KEY.

import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam -- cukup utk 1 hari kerja lapangan

function getSigningSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum diset di environment variable server."
    );
  }
  return s;
}

export function signSession(): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = createHmac("sha256", getSigningSecret()).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifySession(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  let expected: string;
  try {
    expected = createHmac("sha256", getSigningSecret()).update(expStr).digest("hex");
  } catch {
    return false;
  }

  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function checkPin(pinInput: string): boolean {
  const real = process.env.PENYISIRAN_PIN;
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
