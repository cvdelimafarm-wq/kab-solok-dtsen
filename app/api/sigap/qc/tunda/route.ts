// app/api/sigap/qc/tunda/route.ts
//
// (28 Okt 2026) Tombol "Tunda 2 jam" pada notifikasi push QC Pemahaman (Android/komputer). Dipanggil service worker (public/sw.js), yang tidak punya
// sesi portal: petugas dikenali dari alamat langganan push perangkatnya (lib/portal/qc.ts#tundaDariEndpoint). Hanya menunda NOTIFIKASI pengingat;
// modal QC tetap memblokir sampai nilai 100. Tombol di modal (iPhone dan semua perangkat) memakai /api/portal/qc {aksi:"tunda"} dengan sesi.
//   POST { endpoint } -> { ok, sampai, ke, sampai_batas, ulang, pesan }

import { NextRequest, NextResponse } from "next/server";
import { dbPortal } from "@/lib/portal/server";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc, tundaDariEndpoint } from "@/lib/portal/qc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const h = await tundaDariEndpoint(db, body?.endpoint);
    return NextResponse.json({ ok: true, ...h });
  } catch (e) {
    if (e instanceof GalatQc) return galat(e.message, e.status);
    return galatServer("[api/sigap/qc/tunda]", e);
  }
}
