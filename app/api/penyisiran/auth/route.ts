// app/api/penyisiran/auth/route.ts
//
// Tukar PIN dengan token sesi. Ada 2 peran (lihat lib/penyisiranAuth.ts):
// "penyisiran" (default, env PENYISIRAN_PIN) dan "identifikasi" (env
// PENYISIRAN_IDENTIFIKASI_PIN, dibagikan ke PPL/mantan pendata).

import { NextRequest, NextResponse } from "next/server";
import { checkPin, signSession, type PenyisiranRole } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const role: PenyisiranRole = body?.role === "identifikasi" ? "identifikasi" : "penyisiran";
  const envVar = role === "identifikasi" ? "PENYISIRAN_IDENTIFIKASI_PIN" : "PENYISIRAN_PIN";

  if (!process.env[envVar]) {
    return NextResponse.json(
      { error: `${envVar} belum diset di environment variable server.` },
      { status: 500 }
    );
  }

  if (!pin || !checkPin(pin, role)) {
    return NextResponse.json({ error: "PIN salah." }, { status: 401 });
  }

  return NextResponse.json({ token: signSession(role) });
}
