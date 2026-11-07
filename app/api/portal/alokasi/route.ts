// app/api/portal/alokasi/route.ts
//
// (7 Nov 2026) Alokasi per sub SLS -- sisi petugas (HP). PPL melihat sub SLS miliknya; PML melihat sub SLS semua PPL-nya.
// GET ?k=<kegiatan>                 -> DataAlokasiSaya (tanpa daftar KK, supaya ringan)
// GET ?k=<kegiatan>&s=<idsubsls>    -> { kk: KkMaster[] } daftar KK master satu sub SLS (hanya pemegang sub SLS itu)
// Hanya baca; penandaan sampel menyusul pada tahap A2.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { dataAlokasiSaya, kkSubslsSaya } from "@/lib/portal/alokasiWilayah";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const k = Number(req.nextUrl.searchParams.get("k"));
    if (!Number.isInteger(k) || k <= 0) return galat("Kegiatan tidak sah.");
    const s = req.nextUrl.searchParams.get("s");
    if (s) return NextResponse.json({ kk: await kkSubslsSaya(db, akun, k, s) });
    return NextResponse.json(await dataAlokasiSaya(db, akun, k));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/alokasi GET]", e);
  }
}
