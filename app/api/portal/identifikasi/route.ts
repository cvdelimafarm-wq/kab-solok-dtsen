// app/api/portal/identifikasi/route.ts
//
// (10 Okt 2026) Lembar Identifikasi SLS untuk PML (permintaan user).
//  GET  (Authorization: Bearer <sesi>) -> { pml, sub: SubIdentifikasi[], ringkas }   khusus akun yang terhubung ke PML
//  POST { idsubsls, kk_terdampak, tidak_terdampak, rusak_berat, ..., catatan }       simpan hasil satu Sub SLS (upsert)
// "Masuk sebagai" (akun super menguji tampilan) hanya boleh MELIHAT: menyimpan ditolak supaya data PML tidak terisi tanpa sengaja.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { ambilPml, daftarIdentifikasi, simpanIdentifikasi } from "@/lib/portal/identifikasi";
import { periksaIsian } from "@/lib/identifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const pml = await ambilPml(db, akun.petugas_bencana_id);
    if (!pml) return NextResponse.json({ error: "Lembar Identifikasi SLS khusus untuk PML." }, { status: 403 });
    const { sub, ringkas } = await daftarIdentifikasi(db, pml.id);
    return NextResponse.json({ sekarang: new Date().toISOString(), pml, sub, ringkas });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat lembar identifikasi." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  if (aktorDariHeader(req.headers)) {
    return NextResponse.json({ error: "Mode \"masuk sebagai\" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menyimpan." }, { status: 403 });
  }
  try {
    const pml = await ambilPml(db, akun.petugas_bencana_id);
    if (!pml) return NextResponse.json({ error: "Lembar Identifikasi SLS khusus untuk PML." }, { status: 403 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls : "";
    const cek = periksaIsian(body);
    if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 400 });
    const r = await simpanIdentifikasi(db, pml.id, akun.id, idsubsls, cek.isi);
    if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: 400 });
    return NextResponse.json({ ok: true, idsubsls, hasil: r.hasil });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan." }, { status: 500 });
  }
}
