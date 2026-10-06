// app/api/sigap/aktivitas/route.ts
//
// (6 Okt 2026) Detak aktivitas SIGAP (log login & durasi) -- permintaan user.
// POST { halaman, token? }  + header Authorization: Bearer <sesi>  (admin/portal)
//                          atau body.token = token akun (halaman petugas)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { akunDariToken } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { catatAktivitas, ringkasPerangkat } from "@/lib/sigapLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ ok: false }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  try {
    const body = await req.json().catch(() => ({}));
    let akunId = sesiDariHeader(req.headers);
    if (!akunId && typeof body?.token === "string") akunId = (await akunDariToken(db, body.token))?.id ?? null;
    if (!akunId) return NextResponse.json({ ok: false }, { status: 401 });
    const halaman = typeof body?.halaman === "string" ? body.halaman.slice(0, 80) : null;
    await catatAktivitas(db, akunId, { halaman, perangkat: ringkasPerangkat(req.headers.get("user-agent")) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
