// lib/sigapFotoRoute.ts  (hanya server) -- pembantu umum route /api/sigap/foto/*

import { NextRequest, NextResponse } from "next/server";
import { dbPortal, akunDariSesi, type AkunPortal } from "@/lib/portal/server";
import type { Db } from "@/lib/sigap";

export const galat = (error: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error, ...ekstra }, { status });

/** Memeriksa sesi (Authorization: Bearer <sesi>) dan akun aktif. Kembalian NextResponse = berhenti dan kirim jawaban itu. */
export async function masukFoto(req: NextRequest): Promise<{ db: Db; akunId: number; akun: AkunPortal } | NextResponse> {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    return { db, akunId: akun.id, akun };
  } catch (e) {
    // galat database bukan "sesi tidak sah" -- jangan membuat HP menghapus sesi (lihat akunDariSesi)
    return galat(e instanceof Error ? e.message : "Gagal memeriksa sesi.", 500);
  }
}

export function angka(v: FormDataEntryValue | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
