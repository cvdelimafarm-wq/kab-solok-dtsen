// app/api/sigap/translok/[token]/dokumen/route.ts
//
// (5 Okt 2026) Unduh SPJ SIGAP Transport Lokal oleh petugas -- permintaan user.
// GET ?penugasan_id=&jenis=kwitansi,visum,...&kelompok=<tanggal_mulai>|semua&format=gabungan|zip
//   -> file PDF gabungan / ZIP per file (Content-Disposition attachment).
// Token = sigap_akun.token; penugasan harus milik akun tsb (penugasanAkun: aktif & kegiatan aktif).
// Dokumen dirakit dari data saat diminta (lib/sigapDokumen.ts); bila sudah dikunci admin, unduhan
// lengkap memakai berkas beku.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { akunDariToken, penugasanAkun, tanggalValid } from "@/lib/sigap";
import { GalatSpj, buatSpjPdf, headerBerkas, parseJenis } from "@/lib/sigapDokumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });

    const sp = req.nextUrl.searchParams;
    const penugasanId = Number(sp.get("penugasan_id"));
    const pen = (await penugasanAkun(db, akun.id)).find((p) => p.id === penugasanId);
    if (!pen) return NextResponse.json({ error: "Anda tidak terdaftar pada kegiatan ini." }, { status: 403 });

    const jenis = parseJenis(sp.get("jenis"));
    if (jenis.length === 0) return NextResponse.json({ error: "Pilih minimal 1 jenis dokumen." }, { status: 400 });
    const kel = sp.get("kelompok");
    if (kel && kel !== "semua" && !tanggalValid(kel)) return NextResponse.json({ error: "Kelompok tanggal tidak valid." }, { status: 400 });
    const format = sp.get("format") === "zip" ? "zip" : "gabungan";

    const hasil = await buatSpjPdf(db, penugasanId, { jenis, kelompokMulai: kel && kel !== "semua" ? kel : undefined, format });
    return new NextResponse(Buffer.from(hasil.bytes), { status: 200, headers: headerBerkas(hasil, "attachment") });
  } catch (err) {
    if (err instanceof GalatSpj) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga" }, { status: 500 });
  }
}
