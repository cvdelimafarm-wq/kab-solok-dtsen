// app/api/portal/master/wilayah/route.ts
//
// (7 Nov 2026, tahap C1) Master > Wilayah dan Peta -- sisi admin Master. Izin menu `master.wilayah` (khusus Ketua, peran `admin_master`); level 'lihat' cukup untuk
// membaca. Mode "masuk sebagai" boleh melihat tampilan. GET -> DataMasterWilayah (baris per sub SLS + status, ringkas batas, usulan pembaruan master).

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { MENU_MASTER_WILAYAH } from "@/lib/masterWilayah";
import { dataMasterWilayah } from "@/lib/portal/masterWilayah";

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
    return NextResponse.json(await dataMasterWilayah(db), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return galatServer("[api/portal/master/wilayah GET]", e);
  }
}
