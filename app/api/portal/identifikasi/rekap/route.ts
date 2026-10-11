// app/api/portal/identifikasi/rekap/route.ts
//
// (11 Okt 2026) Rekap hasil identifikasi (Sub SLS + status terdampak/tidak) untuk seluruh PML/PPL -- permintaan user. Hanya-baca.
// GET (Authorization: Bearer <sesi>) -> { sekarang, baris: [{ idsubsls, kecamatan, nagari, sls, sub_sls, status }], pml: [{ id, nama, target, realisasi, terdampak, tidak, target_pendamping, realisasi_pendamping }] }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { bolehLihatRekap, rekapIdentifikasi, rekapPml } from "@/lib/portal/rekapIdentifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    if (!(await bolehLihatRekap(db, akun))) return NextResponse.json({ error: "Rekap identifikasi khusus petugas lapangan (PML/PPL) dan admin." }, { status: 403 });
    const [baris, pml] = await Promise.all([rekapIdentifikasi(db), rekapPml(db)]);
    return NextResponse.json({ sekarang: new Date().toISOString(), baris, pml });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat rekap identifikasi." }, { status: 500 });
  }
}
