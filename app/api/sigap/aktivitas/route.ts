// app/api/sigap/aktivitas/route.ts
//
// (6 Okt 2026) Detak aktivitas SIGAP (log login & durasi) -- permintaan user.
// POST { halaman, token? }  + header Authorization: Bearer <sesi>  (admin/portal)
//                          atau body.token = token akun (halaman petugas)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { akunDariToken } from "@/lib/sigap";
import { catatAudit, sesiDariHeader } from "@/lib/sigapAkses";
import { catatAktivitas, ringkasPerangkat } from "@/lib/sigapLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ ok: false }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  try {
    const body = await req.json().catch(() => ({}));
    let akunId = sesiDariHeader(req.headers);
    if (!akunId && typeof body?.token === "string") akunId = (await akunDariToken(db, body.token))?.id ?? null;
    if (!akunId) return NextResponse.json({ ok: false }, { status: 401 });
    const halaman = typeof body?.halaman === "string" ? body.halaman.slice(0, 80) : null;
    const perangkat = ringkasPerangkat(req.headers.get("user-agent"));
    await catatAktivitas(db, akunId, { halaman, perangkat });
    // (17 Okt 2026) Catatan keluar paksa dari HP: sebelum sesi dihapus karena 401, apiPortal (app/portal/sesi.ts) menyimpan alasan di HP;
    // sesudah masuk lagi dan satu permintaan berhasil, catatan itu dilaporkan ke sini -> sigap_audit (aksi "keluar_paksa") agar penyebabnya bisa ditelusuri.
    const c = body?.catatan_keluar;
    if (c && typeof c === "object") {
      const t = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
      const b = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
      try {
        await catatAudit(db, akunId, "keluar_paksa", {
          waktu: t(c.waktu, 40),
          halaman: t(c.halaman, 80),
          api: t(c.api, 80),
          metode: t(c.metode, 8),
          pesan_server: t(c.pesan, 120),
          status: b(c.status),
          akun_sesi_lama: b(c.akun),
          sisa_menit: b(c.sisa_menit),
          sebagai: c.sebagai === true,
          online: typeof c.online === "boolean" ? c.online : null,
          build: t(c.build, 40),
          perangkat,
        });
      } catch {
        /* pencatatan gagal tidak boleh mengganggu detak */
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
