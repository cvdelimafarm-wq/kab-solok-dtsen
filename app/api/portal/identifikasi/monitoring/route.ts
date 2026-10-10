// app/api/portal/identifikasi/monitoring/route.ts
//
// (10 Okt 2026) Monitoring Lembar Identifikasi SLS seluruh PML -- hanya pemegang izin bencana.admin (Admin Bencana, Pengelola PSP, Admin Aplikasi).
// GET (Authorization: Bearer <sesi>) -> { sekarang, pml: BarisMonitoring[], status, total }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { monitoringIdentifikasi } from "@/lib/portal/identifikasi";

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
    const m = await monitoringIdentifikasi(db);
    return NextResponse.json({ sekarang: new Date().toISOString(), ...m });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring." }, { status: 500 });
  }
}
