// app/api/sigap/delego/ringkasan/route.ts
//
// (29 Okt 2026) GET ?bulan=yyyy-mm -- ringkasan bulanan ukuran keberhasilan Delego (hanya baca).
// Hanya akun pemberi delegasi untuk semua RO (Authorization: Bearer <sesi>). Logika di lib/delego/ringkasan.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { tanganiRingkasan } from "@/lib/delego/ringkasan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const r = await tanganiRingkasan(db, sesiLengkapDariHeader(req.headers), req.nextUrl.searchParams.get("bulan"));
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
