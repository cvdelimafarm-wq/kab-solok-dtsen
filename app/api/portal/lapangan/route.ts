// app/api/portal/lapangan/route.ts
//
// (11 Okt 2026) Monitoring Lapangan -- hanya pemegang izin bencana.admin (lihat). Hanya-baca.
// GET (Authorization: Bearer <sesi>)[?dari=YYYY-MM-DD&sampai=YYYY-MM-DD] -> { sekarang, hari_ini, aturan, kegiatan, baris[] }
// Tanpa rentang: dari aktivitas pertama sampai hari ini (WIB); database membatasi maksimal 92 hari.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { hariIniWib } from "@/lib/sigap";
import { periksaRentang } from "@/lib/lapangan";
import { monitoringLapangan } from "@/lib/portal/lapangan";

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
    const r = periksaRentang(req.nextUrl.searchParams.get("dari"), req.nextUrl.searchParams.get("sampai"));
    if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: 400 });
    const d = await monitoringLapangan(db, r.dari, r.sampai);
    return NextResponse.json({ sekarang: new Date().toISOString(), hari_ini: hariIniWib(), ...d });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring lapangan." }, { status: 500 });
  }
}
