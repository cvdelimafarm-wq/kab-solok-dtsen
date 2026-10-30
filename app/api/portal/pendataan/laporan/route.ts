// app/api/portal/pendataan/laporan/route.ts
//
// (30 Okt 2026) Tab "8 · Laporan" di Kelola Pendataan -- hanya pemegang izin bencana.admin (lihat) untuk kegiatan PSP. Hanya-baca.
// GET (Authorization: Bearer <sesi>)[?segar=1] -> DataLaporan (lihat lib/laporanSementara.ts)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { izinAkun, bolehPsp, KEGIATAN_PSP } from "@/lib/sigapAkses";
import { muatLaporanSementara } from "@/lib/portal/laporanSementara";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kegiatan pelatihan PSP Pascabencana (sigap_kegiatan.kode = pelatihan_psp_pascabencana_2026). */
const KEGIATAN_PELATIHAN_PSP = 3;

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!bolehPsp(izin, "lihat")) return NextResponse.json({ error: "Anda tidak punya akses ke laporan ini." }, { status: 403 });
    const d = await muatLaporanSementara(db, KEGIATAN_PSP, KEGIATAN_PELATIHAN_PSP, req.nextUrl.searchParams.get("segar") === "1");
    return NextResponse.json(d);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat laporan sementara." }, { status: 500 });
  }
}
