// app/api/portal/objek/route.ts
//
// (8 Nov 2026, D1+D2) Sampel model 2/3 -- sisi petugas (HP). PPL melihat sampel miliknya dan mencatat hasil; PML melihat sampel semua PPL-nya (hanya baca).
// GET  ?k=<kegiatan>                                                    -> DataObjekSaya
// POST { aksi: "hasil", k, objek, hasil: "didata"|"menolak"|"tidak_ditemukan"|null, jumlah_didata? } -> { ok, hasil, jumlah_didata }   (PPL pemilik sampel)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { catatHasilObjek, dataObjekSaya } from "@/lib/portal/sampelObjek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });
const kegiatanDari = (v: unknown): number | null => {
  const k = Number(v);
  return Number.isInteger(k) && k > 0 ? k : null;
};

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const k = kegiatanDari(req.nextUrl.searchParams.get("k"));
    if (!k) return galat("Kegiatan tidak sah.");
    return NextResponse.json(await dataObjekSaya(db, akun, k));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode } : {});
    return galatServer("[api/portal/objek GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mencatat hasil.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k || typeof body.aksi !== "string") return galat("Permintaan tidak valid.");
    if (body.aksi === "hasil") {
      const h = await catatHasilObjek(db, akun, k, body.objek, body.hasil === undefined ? null : body.hasil, body.jumlah_didata);
      return NextResponse.json({ ok: true, ...h });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode } : {});
    return galatServer("[api/portal/objek POST]", e);
  }
}
