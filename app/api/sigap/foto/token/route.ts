// app/api/sigap/foto/token/route.ts
//
// (19 Okt 2026) Token potret: diminta klien saat kamera dibuka (online). Server mencatat WAKTU SERVER di dalam token bertanda tangan;
// waktu resmi foto = waktu token + jam monotonik HP sampai tombol potret ditekan (lihat lib/sigapFoto.waktuResmi).
// GET -> { token, t }.

import { NextRequest, NextResponse } from "next/server";
import { buatTokenPotret } from "@/lib/sigapFotoServer";
import { masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { token, t } = buatTokenPotret(m.akunId);
  return NextResponse.json({ token, t }, { headers: { "Cache-Control": "no-store" } });
}
