// app/api/portal/kegiatan/route.ts
//
// (8 Okt 2026) Struktur 3 layer -- ringkasan kegiatan bertahapan (Transport Lokal) untuk Beranda (Layer 1) dan halaman tahapan (Layer 2).
// GET (Authorization: Bearer <sesi>) [?id=translok-12] -> { sekarang, kegiatan: RingkasKegiatan[] }

import { NextRequest, NextResponse } from "next/server";
import { penugasanAkun } from "@/lib/sigap";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { kegiatanTranslok } from "@/lib/portal/kegiatan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const now = Date.now();
    const pen = await penugasanAkun(db, akun.id);
    let kegiatan = await kegiatanTranslok(db, akun.id, akun.token, pen, now);
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      kegiatan = kegiatan.filter((k) => k.id === id);
      if (kegiatan.length === 0) return NextResponse.json({ error: "Kegiatan tidak ditemukan atau sudah diarsipkan." }, { status: 404 });
    }
    return NextResponse.json({ sekarang: new Date(now).toISOString(), kegiatan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat kegiatan." }, { status: 500 });
  }
}
