// app/api/sigap/keu/wilayah-sampel/route.ts
//
// (7 Nov 2026) GET ?ident=<id> -> DataWilayahSampel: nagari yang memuat sub SLS sampel (alokasi Kelola Pendataan) untuk kegiatan pendataan
// yang tertaut ke Identifikasi itu. Hanya baca; hak sama dengan /api/sigap/keu/baca (pegawai organik atau akun super yang masuk).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { akunBolehBaca } from "@/lib/keu/baca";
import { muatWilayahSampelIdent } from "@/lib/portal/wilayahSampelIdent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEHAT = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500, headers: SEHAT });
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401, headers: SEHAT });
  const id = Number(req.nextUrl.searchParams.get("ident"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Identifikasi tidak sah." }, { status: 400, headers: SEHAT });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  if (!(await akunBolehBaca(db, sesi.akunId))) return NextResponse.json({ error: "Hanya pegawai organik yang boleh melihat data ini." }, { status: 403, headers: SEHAT });
  return NextResponse.json(await muatWilayahSampelIdent(db, id), { headers: SEHAT });
}
