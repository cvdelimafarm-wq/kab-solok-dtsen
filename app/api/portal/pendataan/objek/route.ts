// app/api/portal/pendataan/objek/route.ts
//
// (8 Nov 2026, D1+D2) Sampel model 2/3 -- sisi admin (Kelola Pendataan > tab 1 · Persiapan). Izin menu `bencana.admin` PADA KEGIATAN itu:
// "lihat" = melihat, "kelola" = mengubah. Mode "masuk sebagai" hanya melihat. Perubahan dicatat di sigap_audit.
// GET  ?k=<kegiatan>                                            -> DataObjekAdmin
// POST { aksi: "profil", k, model: 2|3, variabel: [...], label_bebas: {...} } -> { ok, level_plot }
// POST { aksi: "profil_hapus", k }                              -> { ok }   (kembali ke model 1; ditolak bila daftar sampel masih aktif)
// POST { aksi: "kosongkan", k }                                 -> { ok, dikosongkan }
// POST { aksi: "pratinjau", k, baris: [...], otomatis? }        -> PratinjauObjek (tidak menyimpan)
// POST { aksi: "impor", k, baris, nama_berkas, otomatis? }      -> { ok, unggah_id, jumlah, jumlah_sampel, dengan_petugas, penugasan_baru, tim }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { dataAdminObjek, hapusProfil, imporObjek, kosongkanObjek, pratinjauObjek, simpanProfil } from "@/lib/portal/sampelObjek";

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
    return NextResponse.json(await dataAdminObjek(db, k, boleh(izin, MENU, "kelola", k)));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/objek GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah daftar sampel.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k || typeof body.aksi !== "string") return galat("Permintaan tidak valid.");
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU, "kelola", k)) return galat("Tidak punya akses kelola untuk kegiatan ini.", 403);

    if (body.aksi === "profil") {
      const h = await simpanProfil(db, akun, k, { model: body.model, variabel: body.variabel, label_bebas: body.label_bebas });
      await catatAudit(db, akun.id, "sampel_objek_profil", { kegiatan_id: k, model: body.model, variabel: body.variabel, level_plot: h.level_plot });
      return NextResponse.json({ ok: true, ...h });
    }
    if (body.aksi === "profil_hapus") {
      await hapusProfil(db, k);
      await catatAudit(db, akun.id, "sampel_objek_profil_hapus", { kegiatan_id: k });
      return NextResponse.json({ ok: true });
    }
    if (body.aksi === "kosongkan") {
      const n = await kosongkanObjek(db, k);
      await catatAudit(db, akun.id, "sampel_objek_kosongkan", { kegiatan_id: k, dikosongkan: n });
      return NextResponse.json({ ok: true, dikosongkan: n });
    }
    if (body.aksi === "pratinjau") return NextResponse.json(await pratinjauObjek(db, k, body.baris, body.otomatis === true));
    if (body.aksi === "impor") {
      const nama = typeof body.nama_berkas === "string" ? body.nama_berkas : "";
      const hasil = await imporObjek(db, akun, k, nama, body.baris, body.otomatis === true);
      await catatAudit(db, akun.id, "sampel_objek_impor", { kegiatan_id: k, berkas: nama.slice(0, 200), ...hasil, otomatis: body.otomatis === true });
      return NextResponse.json({ ok: true, ...hasil });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode, ...(e.rinci ?? {}) } : {});
    return galatServer("[api/portal/pendataan/objek POST]", e);
  }
}
