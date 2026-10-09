// app/api/portal/induk/route.ts
//
// (9 Okt 2026) Kegiatan induk + tahap proses bisnis untuk Beranda (Layer 1) dan halaman tahapan (Layer 2).
// GET (Authorization: Bearer <sesi>) [?kode=pascabencana] -> { sekarang, induk: Induk[] }
// Induk yang tampil = yang relevan bagi akun (petugas bencana atau punya penugasan pada kegiatan-kegiatannya).

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { indukUntukAkun } from "@/lib/portal/induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const kode = req.nextUrl.searchParams.get("kode");
    const induk = await indukUntukAkun(db, akun, kode);
    if (kode && induk.length === 0) return NextResponse.json({ error: "Kegiatan tidak ditemukan atau bukan untuk akun ini." }, { status: 404 });
    return NextResponse.json({ sekarang: new Date().toISOString(), induk });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat kegiatan." }, { status: 500 });
  }
}
