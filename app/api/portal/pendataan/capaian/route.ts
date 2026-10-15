// app/api/portal/pendataan/capaian/route.ts
//
// (15 Okt 2026) GET -> DataCapaian (lib/skorKinerja.ts): capaian poin hari ini dan realisasi O-K PPL Pendataan Pascabencana.
// Hanya membaca. Akun lain (PML, admin, peran tanpa Lembar Pendataan) mendapat { ada: false } -> tombol float tidak tampil.
// Mode "masuk sebagai" (hanya lihat) memakai sesi akun yang dilihat, sama seperti API pendataan lain.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { ambilCapaian } from "@/lib/portal/skorKinerja";
import { galatServer } from "@/lib/sigapGalat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    return NextResponse.json(await ambilCapaian(db, akun.id));
  } catch (err) {
    return galatServer("[pendataan/capaian]", err);
  }
}
