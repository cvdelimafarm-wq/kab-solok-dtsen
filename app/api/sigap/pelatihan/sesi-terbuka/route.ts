// app/api/sigap/pelatihan/sesi-terbuka/route.ts
//
// (9 Nov 2026) SIGAP > Pelatihan: sesi yang sedang menunggu peserta (Pretest/Posttest dimulai instruktur, roleplay Vanguard, ruang Adu Sigap), dipoll pemblokir layar
// (app/sigap/PemblokirSesi.tsx). Hanya baca. Bukan peserta / tidak ada sesi / galat apa pun = { sesi: [] } (modal tidak pernah muncul karena galat).
//   GET [?kegiatan=ID] -> { kegiatan_id, sesi: SesiTerbuka[] }

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { muatSesiTerbuka } from "@/lib/sigapSesiTerbukaDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = dbAdmin();
    if (!db) return NextResponse.json({ sesi: [] });
    const akun = await akunDariRequest(req, db);
    if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return NextResponse.json({ sesi: [] });
    return NextResponse.json({ kegiatan_id: kegiatanId, sesi: await muatSesiTerbuka(db as Db, akun.id, kegiatanId, new Date()) });
  } catch {
    return NextResponse.json({ sesi: [] });
  }
}
