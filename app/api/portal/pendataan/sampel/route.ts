// app/api/portal/pendataan/sampel/route.ts
//
// (30 Okt 2026) Alokasi sampel per SLS -- sisi admin (Kelola Pendataan > tab 1 · Persiapan). Izin menu `bencana.admin` PADA KEGIATAN itu:
// "lihat" = melihat, "kelola" = mengunggah/mengubah. Mode "masuk sebagai" hanya melihat. Perubahan dicatat di sigap_audit.
// GET  ?k=<kegiatan>                                      -> DataSampelAdmin
// POST { aksi: "pratinjau", k, baris: [...] }              -> PratinjauSampel (tidak menyimpan; baris = baris mentah dari sheet_to_json)
// POST { aksi: "impor", k, baris, nama_berkas, paksa? }    -> { ok, unggah_id, jumlah, utama, cadangan } (409 ADA_PENGGANTIAN bila ada penggantian tercatat dan paksa tidak diset)
// POST { aksi: "konfig", k, konfig }                       -> { ok, konfig }
// POST { aksi: "batal_ganti", k, cadangan_id }             -> { ok } (admin membatalkan penggantian)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel, batalGantiSampel, dataAdminSampel, imporSampel, pratinjauSampel, simpanKonfigSampel } from "@/lib/portal/sampel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });
const MENU = "bencana.admin";

function kegiatanDari(mentah: unknown): number | null {
  const k = Number(mentah);
  return Number.isInteger(k) && k > 0 ? k : null;
}

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const k = kegiatanDari(req.nextUrl.searchParams.get("k"));
    if (!k) return galat("Kegiatan tidak sah.");
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU, "lihat", k)) return galat("Tidak punya akses admin untuk kegiatan ini.", 403);
    return NextResponse.json(await dataAdminSampel(db, k, boleh(izin, MENU, "kelola", k)));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/sampel GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah alokasi.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k || typeof body.aksi !== "string") return galat("Permintaan tidak valid.");
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU, "kelola", k)) return galat("Tidak punya akses kelola untuk kegiatan ini.", 403);

    if (body.aksi === "pratinjau") return NextResponse.json(await pratinjauSampel(db, k, body.baris));
    if (body.aksi === "impor") {
      const nama = typeof body.nama_berkas === "string" ? body.nama_berkas : "";
      const hasil = await imporSampel(db, akun, k, nama, body.baris, body.paksa === true);
      await catatAudit(db, akun.id, "sampel_sls_impor", { kegiatan_id: k, berkas: nama.slice(0, 200), ...hasil, paksa: body.paksa === true });
      return NextResponse.json({ ok: true, ...hasil });
    }
    if (body.aksi === "konfig") {
      const konfig = await simpanKonfigSampel(db, k, body.konfig, akun.nama);
      await catatAudit(db, akun.id, "sampel_sls_konfig", { kegiatan_id: k, ...konfig });
      return NextResponse.json({ ok: true, konfig });
    }
    if (body.aksi === "batal_ganti") {
      await batalGantiSampel(db, akun, k, Number(body.cadangan_id), true);
      await catatAudit(db, akun.id, "sampel_sls_batal_ganti", { kegiatan_id: k, cadangan_id: Number(body.cadangan_id) });
      return NextResponse.json({ ok: true });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode, ...(e.rinci ?? {}) } : {});
    return galatServer("[api/portal/pendataan/sampel POST]", e);
  }
}
