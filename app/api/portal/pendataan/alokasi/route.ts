// app/api/portal/pendataan/alokasi/route.ts
//
// (7 Nov 2026) Alokasi per sub SLS -- sisi admin (Kelola Pendataan > tab 1 · Persiapan). Izin menu `bencana.admin` PADA KEGIATAN itu:
// "lihat" = melihat, "kelola" = mengunggah/mengubah. Mode "masuk sebagai" hanya melihat. Perubahan dicatat di sigap_audit.
// GET  ?k=<kegiatan>                                      -> DataAlokasiAdmin
// POST { aksi: "pratinjau", k, baris: [...], otomatis? }   -> PratinjauAlokasi (tidak menyimpan)
// POST { aksi: "impor", k, baris, nama_berkas, otomatis? } -> { ok, unggah_id, jumlah, dengan_petugas, penugasan_baru, tim }
// POST { aksi: "model", k, dengan_updating }               -> { ok, konfig }  (model 1 dengan/tanpa updating)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { dataAdminAlokasi, imporAlokasi, pratinjauAlokasi, simpanModelAlokasi } from "@/lib/portal/alokasiWilayah";

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
    return NextResponse.json(await dataAdminAlokasi(db, k, boleh(izin, MENU, "kelola", k)));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/alokasi GET]", e);
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

    if (body.aksi === "pratinjau") return NextResponse.json(await pratinjauAlokasi(db, k, body.baris, body.otomatis === true));
    if (body.aksi === "impor") {
      const nama = typeof body.nama_berkas === "string" ? body.nama_berkas : "";
      const hasil = await imporAlokasi(db, akun, k, nama, body.baris, body.otomatis === true);
      await catatAudit(db, akun.id, "alokasi_subsls_impor", { kegiatan_id: k, berkas: nama.slice(0, 200), ...hasil, otomatis: body.otomatis === true });
      return NextResponse.json({ ok: true, ...hasil });
    }
    if (body.aksi === "model") {
      const konfig = await simpanModelAlokasi(db, k, body.dengan_updating, akun.nama);
      await catatAudit(db, akun.id, "alokasi_subsls_model", { kegiatan_id: k, dengan_updating: konfig.dengan_updating });
      return NextResponse.json({ ok: true, konfig });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode, ...(e.rinci ?? {}) } : {});
    return galatServer("[api/portal/pendataan/alokasi POST]", e);
  }
}
