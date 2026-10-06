// app/api/portal/sso/route.ts
//
// (7 Okt 2026) Portal satu login -- jembatan ke aplikasi lama tanpa login ulang (keputusan user:
// "Semua aplikasi langsung 1 login").
// POST { app:"penyisiran" } (Authorization: Bearer <sesi>)
//   -> { token, jorong_token|null, nama, lat, lng, petugas_id, is_pml }  (disimpan klien di localStorage penyisiran)

import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/penyisiranAuth";
import { daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";
import { akunDariSesi, cocokPenyisiran, dbPortal } from "@/lib/portal/server";
import { catatAudit } from "@/lib/sigapAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  const body = await req.json().catch(() => null);

  if (body?.app === "penyisiran") {
    const ps = await cocokPenyisiran(db, akun.nama);
    if (!ps) return NextResponse.json({ error: "Nama Anda belum terdaftar sebagai petugas penyisiran. Hubungi admin penyisiran." }, { status: 403 });
    let isPml = false;
    try {
      ({ isPml } = await daftarIdUntukSesi(db, ps.id));
    } catch {
      /* sama dgn login lama: kegagalan cek PML tidak menggagalkan login */
    }
    const token = signSession("penyisiran_petugas", String(ps.id));
    // Token turunan "identifikasi_jorong" (tabel akun sama) -- PML tidak dapat, sama dgn login lama.
    const jorong = isPml ? null : signSession("identifikasi_jorong", String(ps.id));
    await catatAudit(db, akun.id, "portal.sso", { app: "penyisiran", petugas_penyisiran_id: ps.id }).catch(() => {});
    return NextResponse.json({ token, jorong_token: jorong, nama: ps.nama, lat: ps.lat, lng: ps.lng, petugas_id: ps.id, is_pml: isPml });
  }

  return NextResponse.json({ error: "Aplikasi tidak dikenal." }, { status: 400 });
}
