// app/api/portal/pendataan/monitoring/kinerja/route.ts
//
// (19 Okt 2026) Tab Monitoring Kelola Pendataan -- Fase 2-4 (transport lokal, poin harian, perkiraan anggaran). Hanya pemegang izin bencana.admin (lihat). Hanya-baca.
// GET (Authorization: Bearer <sesi>)[?segar=1] -> DataKinerja { sekarang, hari_ini, ..., orang[], tertunda, osrm }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { izinAkun, bolehPsp } from "@/lib/sigapAkses";
import { kinerjaPendataan } from "@/lib/portal/pendataanKinerja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!bolehPsp(izin, "lihat")) return NextResponse.json({ error: "Anda tidak punya akses ke monitoring ini." }, { status: 403 });
    return NextResponse.json(await kinerjaPendataan(db, req.nextUrl.searchParams.get("segar") === "1"));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring kinerja." }, { status: 500 });
  }
}
