// app/api/sigap/pedia/[id]/verifikasi/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- tombol "Verifikasi Ulang": hitung ulang SHA-256 file di storage, cocokkan dgn
// hash tersimpan, validasi token TSA terhadap file, jalankan ulang DKIM (DNS sekarang + snapshot kunci).
// Hasil dicatat di pedia_verifikasi & audit log -- permintaan user.

import { NextRequest, NextResponse } from "next/server";
import { aksesPedia, galat, verifikasiUlangEntri } from "@/lib/pedia/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Hanya pengelola.", 403);
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await verifikasiUlangEntri(s, Number(id)));
  } catch (e) {
    return galat(e instanceof Error ? e.message : String(e), 500);
  }
}
