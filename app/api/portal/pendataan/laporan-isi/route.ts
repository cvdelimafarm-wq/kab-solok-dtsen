// app/api/portal/pendataan/laporan-isi/route.ts
//
// (28 Okt 2026) Pengaturan "Isi laporan SPJ" per kegiatan -- sisi admin (Kelola Pendataan > tab "Persiapan"). Izin menu `bencana.admin`: "lihat" = melihat,
// "kelola" = mengubah. Perubahan dicatat di sigap_audit. Hanya mengubah isi PDF Laporan SPJ; data lapangan tidak tersentuh.
// GET                                         -> { boleh_kelola, tabel_ada, kegiatan[], konfig{ [kegiatan_id]: KonfigLaporan } }
// POST { kegiatan_id, konfig: {...} | null }  -> simpan; konfig null = kembali ke bawaan

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatKonfig } from "@/lib/portal/lembarKonfig";
import { dataAdminLaporan, simpanLaporan } from "@/lib/portal/laporanIsiKonfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest, tulis: boolean) {
  const db = dbPortal();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  if (tulis && aktorDariHeader(req.headers)) return { err: galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah pengaturan.', 403) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "bencana.admin", tulis ? "kelola" : "lihat")) return { err: galat("Tidak punya akses admin pendataan.", 403) } as const;
  return { db, akun, bisaKelola: boleh(izin, "bencana.admin", "kelola") } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req, false);
    if ("err" in p) return p.err;
    return NextResponse.json({ boleh_kelola: p.bisaKelola, ...(await dataAdminLaporan(p.db)) });
  } catch (e) {
    return galatServer("[api/portal/pendataan/laporan-isi GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req, true);
    if ("err" in p) return p.err;
    const body = (await req.json().catch(() => null)) as { kegiatan_id?: unknown; konfig?: unknown } | null;
    const kid = Number(body?.kegiatan_id);
    if (!body || !Number.isInteger(kid) || kid <= 0 || !("konfig" in body)) return galat("Permintaan tidak valid.");
    const hasil = await simpanLaporan(p.db, kid, body.konfig, p.akun.nama);
    await catatAudit(p.db, p.akun.id, body.konfig === null ? "laporan_isi_bawaan" : "laporan_isi_simpan", { kegiatan_id: kid, konfig: body.konfig });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    if (e instanceof GalatKonfig) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/laporan-isi POST]", e);
  }
}
