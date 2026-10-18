// app/api/portal/pendataan/monitoring/route.ts
//
// (18 Okt 2026) Tab Monitoring di Kelola Pendataan -- hanya pemegang izin bencana.admin (lihat). Hanya-baca.
// GET (Authorization: Bearer <sesi>)[?segar=1] -> DataMonitoringPendataan { sekarang, tim[], ppl[], total }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { monitoringPendataan } from "@/lib/portal/pendataanMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "lihat")) return NextResponse.json({ error: "Anda tidak punya akses ke monitoring ini." }, { status: 403 });
    const d = await monitoringPendataan(db, req.nextUrl.searchParams.get("segar") === "1");
    return NextResponse.json(d);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring pendataan." }, { status: 500 });
  }
}
