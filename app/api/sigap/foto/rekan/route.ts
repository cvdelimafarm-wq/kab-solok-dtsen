// app/api/sigap/foto/rekan/route.ts
//
// (19 Okt 2026) Daftar yang bisa di-tag pada sebuah foto.
// GET ?kegiatan_id=N            -> { rekan: [{ akun_id, nama, jenis, peran_di_tim }] }   (satu tim, penugasan aktif sama)
// GET ?kegiatan_id=N&q=nama     -> { luar_tim: [{ akun_id, nama, jenis }] }              (pencarian, maks 10; hanya id/nama/jenis)

import { NextRequest, NextResponse } from "next/server";
import { cariAkun, rekanTim } from "@/lib/sigapFotoServer";
import { angka, galat, masukFoto } from "@/lib/sigapFotoRoute";
import { penugasanAkun } from "@/lib/sigap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const kegiatanId = angka(req.nextUrl.searchParams.get("kegiatan_id"));
  if (!kegiatanId) return galat("kegiatan_id wajib.");
  const pen = await penugasanAkun(db, akunId);
  if (!pen.some((p) => p.kegiatan.id === kegiatanId)) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);
  const q = req.nextUrl.searchParams.get("q");
  if (q !== null) return NextResponse.json({ luar_tim: await cariAkun(db, q, akunId) });
  return NextResponse.json({ rekan: await rekanTim(db, akunId, kegiatanId) });
}
