// app/api/portal/peta/route.ts
//
// (10 Okt 2026) Tautan peta WA (desa) & peta SLS dari Storage (bucket peta-wilayah, diunggah admin belakangan) -- permintaan user.
// GET ?desa=<10 digit>[,..]&sub=<16 digit>[,..] (Authorization: Bearer <sesi>)
//   -> { wa: { <kode desa>: BerkasPeta[] }, sls: { <idsubsls>: BerkasPeta[] } }   yang belum diunggah tidak ada. Tautan berlaku 1 jam.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { petaTersedia } from "@/lib/portal/identifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const daftar = (v: string | null, pola: RegExp, maks: number): string[] =>
  Array.from(new Set((v ?? "").split(",").map((x) => x.trim()).filter((x) => pola.test(x)))).slice(0, maks);

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const u = new URL(req.url);
    const desa = daftar(u.searchParams.get("desa"), /^\d{10}$/, 20);
    const sub = daftar(u.searchParams.get("sub"), /^\d{16}$/, 80);
    return NextResponse.json(await petaTersedia(db, desa, sub));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat peta." }, { status: 500 });
  }
}
