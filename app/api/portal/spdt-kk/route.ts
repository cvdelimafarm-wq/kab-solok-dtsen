// app/api/portal/spdt-kk/route.ts
//
// (16 Okt 2026) Lembar Pendataan SPDT NTP 2026 -- lembar bantu: daftar KK + koordinat + navigasi. TANPA status pendataan dan TANPA umpan balik petugas.
//  GET   -> { sekarang, peran, saya, kk[], periode }   PPL: KK wilayahnya; PML: KK semua PPL-nya; Supervisor: semua KK.
//  POST  { kk_id, navigasi? } -> mencatat "koordinat KK dibuka hari ini" (bahan kolom Monitoring). Bukan isian data pendataan.
// "Masuk sebagai" (akun super) hanya melihat: pencatatan dilewati supaya Monitoring tidak terisi oleh admin yang sekadar mengintip.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { bacaKkSpdt, catatBuka, peranSpdt } from "@/lib/portal/spdt";
import { PERIODE_SPDT, periksaBuka, type DataKkSpdt } from "@/lib/spdtNtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLAK = "Lembar Pendataan SPDT NTP khusus PPL, PML, dan Supervisor SPDT NTP.";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const peran = await peranSpdt(db, akun.id);
    if (!peran) return NextResponse.json({ error: TOLAK }, { status: 403 });
    const kk = await bacaKkSpdt(db, akun.id, peran);
    const isi: DataKkSpdt = { sekarang: new Date().toISOString(), peran, saya: { id: akun.id, nama: akun.nama }, kk, periode: { ...PERIODE_SPDT } };
    return NextResponse.json(isi);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat lembar pendataan." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const peran = await peranSpdt(db, akun.id);
    if (!peran) return NextResponse.json({ error: TOLAK }, { status: 403 });
    const cek = periksaBuka(await req.json().catch(() => null));
    if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 400 });
    if (aktorDariHeader(req.headers)) return NextResponse.json({ ok: true, dicatat: false });
    const r = await catatBuka(db, akun, peran, cek.kk_id, cek.navigasi);
    if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: r.status });
    return NextResponse.json({ ok: true, dicatat: r.dicatat });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mencatat." }, { status: 500 });
  }
}
