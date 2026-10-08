// app/api/sigap/browser-darurat/route.ts
//
// (8 Okt 2026) Pintu darurat gerbang "wajib lewat aplikasi": peserta yang benar-benar tidak bisa memasang aplikasi (HP lama, browser
// tertanam, dll) menerima KODE dari panitia. Kode diatur di Railway: SIGAP_KODE_BROWSER. Benar -> browser itu boleh dipakai 12 jam
// (disimpan di browser, bukan di server). Tanpa variabel itu pintu darurat tertutup.
//
// POST { kode } -> { ok: true }

import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const sha = (x: string) => createHash("sha256").update(x).digest();

// batas percobaan per IP: 8 kali per menit (memori proses; cukup untuk menahan tebak-tebakan kode)
const percobaan = new Map<string, number[]>();
function terlaluSering(ip: string): boolean {
  const now = Date.now();
  const l = (percobaan.get(ip) ?? []).filter((t) => now - t < 60_000);
  l.push(now);
  percobaan.set(ip, l);
  if (percobaan.size > 2000) for (const [k, v] of percobaan) if (!v.some((t) => now - t < 60_000)) percobaan.delete(k);
  return l.length > 8;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "tak-dikenal";
    if (terlaluSering(ip)) return galat("Terlalu sering mencoba. Tunggu semenit lalu coba lagi.", 429);
    const rahasia = (process.env.SIGAP_KODE_BROWSER ?? "").trim();
    if (!rahasia) return galat("Kode darurat belum diatur panitia.", 404);
    const body = await req.json().catch(() => null);
    const kode = typeof body?.kode === "string" ? body.kode.trim() : "";
    if (!kode || kode.length > 100) return galat("Kode belum diisi.");
    if (!timingSafeEqual(sha(kode), sha(rahasia))) return galat("Kode salah.", 403);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
