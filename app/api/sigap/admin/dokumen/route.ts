// app/api/sigap/admin/dokumen/route.ts
//
// (5 Okt 2026) Pratinjau / unduh SPJ SIGAP Transport Lokal oleh admin -- permintaan user.
// GET ?penugasan_id=&jenis=(default semua)&kelompok=<tanggal_mulai>|semua&format=gabungan|zip&unduh=1
// Header wajib: Authorization: Bearer <sesi> (lib/sigapAkses). Izin: translok.verifikasi level
// "lihat" pada kegiatan penugasan tsb. Default: semua jenis, PDF gabungan, ditampilkan inline
// (pratinjau); unduh=1 -> attachment.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tanggalValid } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { GalatSpj, buatSpjPdf, headerBerkas, parseJenis } from "@/lib/sigapDokumen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
    if (!a || !a.aktif) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const penugasanId = Number(sp.get("penugasan_id"));
    if (!Number.isInteger(penugasanId) || penugasanId <= 0) return NextResponse.json({ error: "penugasan_id tidak valid." }, { status: 400 });
    const { data: pen } = await db.from("sigap_penugasan").select("id, kegiatan_id").eq("id", penugasanId).maybeSingle();
    if (!pen) return NextResponse.json({ error: "Penugasan tidak ditemukan." }, { status: 404 });

    const { izin } = await izinAkun(db, akunId);
    if (!boleh(izin, "translok.verifikasi", "lihat", pen.kegiatan_id as number)) return NextResponse.json({ error: "Tidak punya izin melihat SPJ kegiatan ini." }, { status: 403 });

    const jenis = parseJenis(sp.get("jenis"));
    if (jenis.length === 0) return NextResponse.json({ error: "Pilih minimal 1 jenis dokumen." }, { status: 400 });
    const kel = sp.get("kelompok");
    if (kel && kel !== "semua" && !tanggalValid(kel)) return NextResponse.json({ error: "Kelompok tanggal tidak valid." }, { status: 400 });
    const format = sp.get("format") === "zip" ? "zip" : "gabungan";

    const hasil = await buatSpjPdf(db, penugasanId, { jenis, kelompokMulai: kel && kel !== "semua" ? kel : undefined, format });
    const disposisi = sp.get("unduh") === "1" || format === "zip" ? "attachment" : "inline";
    return new NextResponse(Buffer.from(hasil.bytes), { status: 200, headers: headerBerkas(hasil, disposisi) });
  } catch (err) {
    if (err instanceof GalatSpj) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga" }, { status: 500 });
  }
}
