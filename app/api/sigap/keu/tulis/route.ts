// app/api/sigap/keu/tulis/route.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- POST { tabel, op: "insert"|"update", data, kunci? } menulis satu baris tabel `keu_`
// atas nama akun yang masuk (Authorization: Bearer <sesi>). Penjaga tabel di basis data tetap berlaku (keu_tulis). Tanpa hapus.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { tanganiTulis } from "@/lib/keu/gerbang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  const r = await tanganiTulis(db, sesiLengkapDariHeader(req.headers), body);
  return NextResponse.json(r.json, { status: r.status });
}
