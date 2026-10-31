// app/api/sigap/admin/beban-calon/route.ts
//
// (1 Nov 2026) Peringatan beban calon petugas untuk penunjukan langsung (Penugasan > Tambah petugas). HANYA BACA.
// GET ?akun_id=&kegiatan_id= -> { akun, hari, minggu[], delegasi_aktif, penugasan_lain[], peringatan }
// Izin: kelola Penugasan pada kegiatan itu (translok.penugasan), atau Kelola Peran & Akses; sama dengan izin menambah petugas.
// Logika: lib/sigapBebanCalon.ts, lib/portal/bebanCalon.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { bebanCalon } from "@/lib/portal/bebanCalon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) as unknown as Db;
  const saya = sesiDariHeader(req.headers);
  if (!saya) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", saya).maybeSingle();
  if (!a || !a.aktif) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const sp = req.nextUrl.searchParams;
  const akunId = Number(sp.get("akun_id"));
  const kegiatanId = Number(sp.get("kegiatan_id"));
  if (!Number.isInteger(akunId) || akunId <= 0 || !Number.isInteger(kegiatanId) || kegiatanId <= 0) return galat("Parameter tidak sah.");
  const { izin } = await izinAkun(db, saya);
  if (!(boleh(izin, "translok.penugasan", "kelola", kegiatanId) || boleh(izin, "akses.kelola", "kelola"))) return galat("Tidak punya izin.", 403);
  const hasil = await bebanCalon(db, akunId, kegiatanId);
  if (!hasil) return galat("Akun tidak ditemukan.", 404);
  return NextResponse.json(hasil);
}
