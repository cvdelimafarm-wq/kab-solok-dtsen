// app/api/sigap/keu/baca/route.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- GET ?tampilan=<keu_v_...>&<kolom>=<nilai>&urut=&batas= membaca data keu_ (hanya baca)
// untuk pegawai organik yang masuk (Authorization: Bearer <sesi>). Daftar putih tampilan dan kolom: lib/keu/tampilan.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { tanganiBaca } from "@/lib/keu/baca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
  const r = await tanganiBaca(db, sesiLengkapDariHeader(req.headers), params);
  return NextResponse.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
