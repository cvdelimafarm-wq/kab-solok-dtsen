// app/api/penyisiran/auth/route.ts
//
// Tukar PIN (env var PENYISIRAN_PIN, server-side saja) dengan token sesi.
// Lihat lib/penyisiranAuth.ts utk penjelasan kenapa ini beda dari pola PIN
// client-side yang sudah dipakai di tab lain.

import { NextRequest, NextResponse } from "next/server";
import { checkPin, signSession } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.PENYISIRAN_PIN) {
    return NextResponse.json(
      { error: "PENYISIRAN_PIN belum diset di environment variable server." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!pin || !checkPin(pin)) {
    return NextResponse.json({ error: "PIN salah." }, { status: 401 });
  }

  return NextResponse.json({ token: signSession() });
}
