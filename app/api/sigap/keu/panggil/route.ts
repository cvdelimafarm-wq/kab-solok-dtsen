// app/api/sigap/keu/panggil/route.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- POST { fungsi, args } memanggil fungsi `keu_` atas nama akun yang masuk
// (Authorization: Bearer <sesi>). Hak ditegakkan basis data (berkas SQL l: keu_jalankan). Logika di lib/keu/gerbang.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { tanganiPanggil } from "@/lib/keu/gerbang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const r = await tanganiPanggil(db, sesiLengkapDariHeader(req.headers), body);
  return NextResponse.json(r.json, { status: r.status });
}
