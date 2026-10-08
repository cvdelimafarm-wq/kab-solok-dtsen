// app/api/portal/beranda/route.ts
//
// (7 Okt 2026) Portal satu login -- kartu beranda sesuai peran & periode (permintaan user).
// GET (Authorization: Bearer <sesi>) -> { nama, jenis, peran[], admin_aplikasi, kartu[], pin_bawaan }
// (8 Okt 2026) pin_bawaan = akun masih memakai PIN awal bersama 1303 -> beranda menampilkan ajakan ganti PIN.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal, susunBeranda } from "@/lib/portal/server";
import { masihPinAwal } from "@/lib/sigapPin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const [b, pinBawaan] = await Promise.all([susunBeranda(db, akun), masihPinAwal(db, akun.id).catch(() => false)]);
    const peran = Array.from(new Map(b.peran.map((p) => [p.kode, p.nama])).values());
    return NextResponse.json({ nama: akun.nama, jenis: akun.jenis, peran, admin_aplikasi: b.admin_aplikasi, kartu: b.kartu, pin_bawaan: pinBawaan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat beranda." }, { status: 500 });
  }
}
