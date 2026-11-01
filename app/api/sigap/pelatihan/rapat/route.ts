// app/api/sigap/pelatihan/rapat/route.ts
//
// (1 Nov 2026) Rapat Zoom untuk PESERTA PELATIHAN pada langkah Presensi (kelas Daring): rapat aktif milik pelatihan peserta (?kegiatan=ID dari urlPelatihan), token wajib,
// dan hadir otomatis menjadi presensi sesi yang jendelanya beririsan dengan jam rapat. Mesin sama dengan /api/sigap/rapat (lib/portal/rapatPeserta.ts).
// GET -> { rapat | null, sekarang }   POST { rapat_id, token } -> { ok, hadir_at, presensi_sesi }

import { NextRequest, NextResponse } from "next/server";
import { ambilRapatPeserta, hadirRapatPeserta } from "@/lib/portal/rapatPeserta";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId || !(await pesertaPelatihan(db, akun.id, kegiatanId))) return NextResponse.json({ rapat: null, sekarang: new Date().toISOString() });
    const j = await ambilRapatPeserta(db, akun.id, kegiatanId);
    return NextResponse.json(j.json, { status: j.status });
  } catch (e) {
    return NextResponse.json({ rapat: null, sekarang: new Date().toISOString(), catatan: e instanceof Error ? e.message : "galat" });
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId || !(await pesertaPelatihan(db, akun.id, kegiatanId))) return galat("Akun Anda tidak terdaftar sebagai peserta pelatihan.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const j = await hadirRapatPeserta(db, akun.id, body, kegiatanId);
    return NextResponse.json(j.json, { status: j.status });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
