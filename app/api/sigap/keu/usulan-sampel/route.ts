// app/api/sigap/keu/usulan-sampel/route.ts
//
// (8 Nov 2026, D4) GET ?ident=<id> -> SumberSampel: jumlah sub SLS/objek dan sampel pada kegiatan yang tertaut ke identifikasi itu, dasar usulan "Jumlah petugas per peran".
// Hanya baca; hak sama dengan membaca data keu_ (pegawai organik dan akun super). Mengubah isian tetap lewat penyimpanan identifikasi lanjutan.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { akunBolehBaca } from "@/lib/keu/baca";
import { sumberSampelIdent } from "@/lib/portal/usulanSampel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  if (!(await akunBolehBaca(db, sesi.akunId))) return NextResponse.json({ error: "Hanya pegawai organik yang boleh melihat data ini." }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get("ident"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Identifikasi tidak sah." }, { status: 400 });
  return NextResponse.json(await sumberSampelIdent(db, id), { headers: { "Cache-Control": "no-store" } });
}
