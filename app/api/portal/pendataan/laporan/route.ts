// app/api/portal/pendataan/laporan/route.ts
//
// (30 Okt 2026) Tab "8 · Laporan" di Kelola Pendataan. Hanya-baca, TERIKAT SATU KEGIATAN.
// GET (Authorization: Bearer <sesi>)[?k=<kegiatan>][&segar=1]
//   k kosong atau Pendataan Pascabencana (PSP) -> DataLaporan PSP (lib/laporanSementara.ts); izin: bencana.admin (lihat) untuk kegiatan PSP.
//   k kegiatan lain                            -> laporan umum bertanda `ragam: "umum"` (lib/laporanUmum.ts); izin: bencana.admin (lihat) pada kegiatan itu,
//                                                 dan fitur "Laporan Sementara" harus menyala pada profil fitur kegiatan itu.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun, bolehPsp, KEGIATAN_PSP } from "@/lib/sigapAkses";
import { muatLaporanSementara } from "@/lib/portal/laporanSementara";
import { GalatLaporanUmum, muatLaporanUmum } from "@/lib/portal/laporanUmum";
import { muatProfilFitur } from "@/lib/portal/fitur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kegiatan pelatihan PSP Pascabencana (sigap_kegiatan.kode = pelatihan_psp_pascabencana_2026). */
const KEGIATAN_PELATIHAN_PSP = 3;

const galat = (pesan: string, status = 500) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.");
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const sp = req.nextUrl.searchParams;
  const segar = sp.get("segar") === "1";
  const mentahK = sp.get("k");
  const k = mentahK === null || mentahK === "" ? KEGIATAN_PSP : Number(mentahK);
  if (!Number.isInteger(k) || k <= 0) return galat("Kegiatan tidak sah.", 400);
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (k === KEGIATAN_PSP) {
      if (!bolehPsp(izin, "lihat")) return galat("Anda tidak punya akses ke laporan ini.", 403);
      return NextResponse.json(await muatLaporanSementara(db, KEGIATAN_PSP, KEGIATAN_PELATIHAN_PSP, segar));
    }
    if (!boleh(izin, "bencana.admin", "lihat", k)) return galat("Anda tidak punya akses ke laporan kegiatan ini.", 403);
    const profil = await muatProfilFitur(db, k);
    if (!profil.efektif.laporan) return galat("Fitur Laporan Sementara tidak dinyalakan untuk kegiatan ini.", 403);
    return NextResponse.json(await muatLaporanUmum(db, k, segar));
  } catch (err) {
    if (err instanceof GalatLaporanUmum) return galat(err.message, err.status);
    return galat(err instanceof Error ? err.message : "Gagal memuat laporan sementara.");
  }
}
