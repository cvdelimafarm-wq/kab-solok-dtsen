// app/api/portal/alokasi/route.ts
//
// (7 Nov 2026) Alokasi per sub SLS dan tag sampel stage 2 -- sisi petugas (HP). PPL melihat/menandai sub SLS miliknya; PML melihat sub SLS semua PPL-nya.
// GET  ?k=<kegiatan>                 -> DataAlokasiSaya (+ status jendela rilis dan rekap tag per sub SLS; tanpa daftar KK, supaya ringan)
// GET  ?k=<kegiatan>&s=<idsubsls>    -> { kk, jendela, target, cadangan, tag } daftar KK master + tag aktif satu sub SLS (hanya pemegang sub SLS itu)
// POST { aksi: "tag", k, s, kk, peran: "utama"|"cadangan" }   -> { ok }   (PPL, hanya saat jendela terbuka; ditegakkan di basis data)
// POST { aksi: "lepas", k, kk }                                -> { ok }   (PPL, hanya saat jendela terbuka)
// POST { aksi: "hasil", k, kk, hasil: "didata"|"menolak"|"tidak_ditemukan"|null } -> { ok }  (PPL, sampel utama)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { dataAlokasiSaya, kkSubslsSaya } from "@/lib/portal/alokasiWilayah";
import { dataTagSub, isiHasilTag, lengkapiTagSaya, lepasTag, tandaiTag } from "@/lib/portal/tagSampel";

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
    const s = req.nextUrl.searchParams.get("s");
    if (s) {
      const kk = await kkSubslsSaya(db, akun, k, s);
      return NextResponse.json({ kk, ...(await dataTagSub(db, akun, k, s)) });
    }
    return NextResponse.json(await lengkapiTagSaya(db, await dataAlokasiSaya(db, akun, k)));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/alokasi GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menandai sampel.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k || typeof body.aksi !== "string") return galat("Permintaan tidak valid.");
    if (body.aksi === "tag") {
      await tandaiTag(db, akun, k, body.s, body.kk, body.peran);
      return NextResponse.json({ ok: true });
    }
    if (body.aksi === "lepas") {
      await lepasTag(db, akun, k, body.kk);
      return NextResponse.json({ ok: true });
    }
    if (body.aksi === "hasil") {
      await isiHasilTag(db, akun, k, body.kk, body.hasil === undefined ? null : body.hasil);
      return NextResponse.json({ ok: true });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode } : {});
    return galatServer("[api/portal/alokasi POST]", e);
  }
}
