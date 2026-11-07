// app/api/portal/master/orang/route.ts
//
// (7 Nov 2026, tahap C4) Master > Mitra dan Pegawai: panel kesehatan master orang, HANYA BACA. Izin `master.wilayah` level 'lihat' (admin Master). Tanpa data pribadi.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { MENU_MASTER_WILAYAH } from "@/lib/masterWilayah";
import { dataMasterOrang } from "@/lib/portal/masterOrang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU_MASTER_WILAYAH, "lihat")) return galat("Menu Master hanya untuk admin Master (Ketua).", 403);
    return NextResponse.json(await dataMasterOrang(db), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return galatServer("[api/portal/master/orang GET]", e);
  }
}
