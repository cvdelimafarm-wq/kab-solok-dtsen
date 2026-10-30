// app/api/portal/pendataan/konfig/route.ts
//
// (27 Okt 2026) Pengaturan Lembar Pendataan per kegiatan -- sisi admin (Kelola Pendataan > tab "Persiapan"). Izin menu `bencana.admin`:
// "lihat" = melihat, "kelola" = mengubah. Perubahan dicatat di sigap_audit. Yang diubah hanya TAMPILAN (nama/warna/bentuk/alasan, radar); data lapangan tidak tersentuh.
// GET                                         -> { boleh_kelola, kegiatan[], konfig{ [kegiatan_id]: KonfigLembar } }
// POST { kegiatan_id, konfig: {...} | null }  -> simpan; konfig null = kembali ke tampilan bawaan
// (PPL membaca pengaturan lewat GET /api/portal/pendataan?sub=..., bidang `konfig`.)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, catatAudit, izinAkun, bolehPsp } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatKonfig, dataAdminKonfig, simpanKonfig } from "@/lib/portal/lembarKonfig";

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
  if (!bolehPsp(izin, tulis ? "kelola" : "lihat")) return { err: galat("Tidak punya akses admin pendataan.", 403) } as const;
  return { db, akun, bisaKelola: bolehPsp(izin, "kelola") } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req, false);
    if ("err" in p) return p.err;
    return NextResponse.json({ boleh_kelola: p.bisaKelola, ...(await dataAdminKonfig(p.db)) });
  } catch (e) {
    return galatServer("[api/portal/pendataan/konfig GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req, true);
    if ("err" in p) return p.err;
    const body = (await req.json().catch(() => null)) as { kegiatan_id?: unknown; konfig?: unknown } | null;
    const kid = Number(body?.kegiatan_id);
    if (!body || !Number.isInteger(kid) || kid <= 0 || !("konfig" in body)) return galat("Permintaan tidak valid.");
    const hasil = await simpanKonfig(p.db, kid, body.konfig, p.akun.nama);
    await catatAudit(p.db, p.akun.id, body.konfig === null ? "lembar_konfig_bawaan" : "lembar_konfig_simpan", { kegiatan_id: kid, konfig: body.konfig });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    if (e instanceof GalatKonfig) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/konfig POST]", e);
  }
}
