// app/api/portal/sampel/route.ts
//
// (30 Okt 2026) Alokasi sampel per SLS -- sisi petugas (HP). PPL melihat sampel SLS-nya; PML melihat sampel semua PPL-nya; admin memakai Kelola Pendataan.
// GET  ?k=<kegiatan>                                   -> DataSampelSaya
// POST { aksi: "ganti", k, utama_id, cadangan_id, alasan }   -> { ok }  (PPL: tandai sampel utama diganti cadangan)
// POST { aksi: "batal", k, cadangan_id }                      -> { ok }  (PPL: batalkan penggantian miliknya)
// "Masuk sebagai" (akun super) hanya melihat: perubahan ditolak.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel, batalGantiSampel, dataSampelSaya, gantiSampel } from "@/lib/portal/sampel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const kegiatanDari = (mentah: unknown): number | null => {
  const k = Number(mentah);
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
    return NextResponse.json(await dataSampelSaya(db, akun, k));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/sampel GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k) return galat("Permintaan tidak valid.");
    if (body.aksi === "ganti") {
      await gantiSampel(db, akun, k, body);
      return NextResponse.json({ ok: true });
    }
    if (body.aksi === "batal") {
      await batalGantiSampel(db, akun, k, Number(body.cadangan_id), false);
      return NextResponse.json({ ok: true });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/sampel POST]", e);
  }
}
