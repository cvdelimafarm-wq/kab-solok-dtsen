// app/api/portal/pendataan/tag/route.ts
//
// (7 Nov 2026) Tag sampel stage 2 + jendela rilis -- sisi admin (Kelola Pendataan, tab Persiapan). Izin menu `bencana.admin` PADA KEGIATAN itu ("kelola" untuk
// membuka/menutup jendela dan mengunggah; Ketua dan Wakil memegang izin yang sama). Mode "masuk sebagai" hanya melihat. Perubahan dicatat di sigap_audit,
// dan jendela serta tag punya riwayat sendiri di basis data.
// GET  ?k=<kegiatan>               -> DataTagAdmin (jendela, riwayat, progres per sub SLS)
// GET  ?k=<kegiatan>&templat=1     -> { baris: BarisTemplatTag[] } (semua KK sub SLS beralokasi + tag sekarang, untuk templat Excel)
// POST { aksi: "buka", k, alasan? }                         -> { ok, jendela, buka_kembali }  (alasan wajib bila jendela sudah pernah terkunci)
// POST { aksi: "tutup", k }                                 -> { ok, jendela }
// POST { aksi: "pratinjau", k, baris, mode }                -> PratinjauTag (tidak menyimpan)
// POST { aksi: "impor", k, baris, mode, nama_berkas }       -> { ok, ditambah, diganti, dilepas, sama }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatSampel } from "@/lib/portal/sampel";
import { bukaJendela, dataTagAdmin, imporTag, pratinjauTag, templatTagData, tutupJendela } from "@/lib/portal/tagSampel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });
const MENU = "bencana.admin";
const kegiatanDari = (v: unknown): number | null => {
  const k = Number(v);
  return Number.isInteger(k) && k > 0 ? k : null;
};

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
    if (req.nextUrl.searchParams.get("templat") === "1") {
      if (!boleh(izin, MENU, "kelola", k)) return galat("Tidak punya akses kelola untuk kegiatan ini.", 403);
      return NextResponse.json({ baris: await templatTagData(db, k) });
    }
    return NextResponse.json(await dataTagAdmin(db, k, boleh(izin, MENU, "kelola", k)));
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status);
    return galatServer("[api/portal/pendataan/tag GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah tag sampel.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const k = kegiatanDari(body?.k);
    if (!body || !k || typeof body.aksi !== "string") return galat("Permintaan tidak valid.");
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU, "kelola", k)) return galat("Tidak punya akses kelola untuk kegiatan ini.", 403);

    if (body.aksi === "buka") {
      const h = await bukaJendela(db, akun, k, body.alasan);
      await catatAudit(db, akun.id, h.buka_kembali ? "sampel_jendela_buka_kembali" : "sampel_jendela_buka", { kegiatan_id: k, alasan: typeof body.alasan === "string" ? body.alasan.slice(0, 500) : null });
      return NextResponse.json({ ok: true, ...h });
    }
    if (body.aksi === "tutup") {
      const jendela = await tutupJendela(db, akun, k);
      await catatAudit(db, akun.id, "sampel_jendela_tutup", { kegiatan_id: k });
      return NextResponse.json({ ok: true, jendela });
    }
    const mode = body.mode === "ganti" ? "ganti" : "tambah";
    if (body.aksi === "pratinjau") return NextResponse.json(await pratinjauTag(db, k, body.baris, mode));
    if (body.aksi === "impor") {
      const nama = typeof body.nama_berkas === "string" ? body.nama_berkas : "";
      const hasil = await imporTag(db, akun, k, nama, body.baris, mode);
      await catatAudit(db, akun.id, "sampel_tag_impor", { kegiatan_id: k, berkas: nama.slice(0, 200), mode, ...hasil });
      return NextResponse.json({ ok: true, ...hasil });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSampel) return galat(e.message, e.status, e.kode ? { kode: e.kode, ...(e.rinci ?? {}) } : {});
    return galatServer("[api/portal/pendataan/tag POST]", e);
  }
}
