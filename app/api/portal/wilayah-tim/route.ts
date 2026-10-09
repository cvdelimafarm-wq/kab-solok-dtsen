// app/api/portal/wilayah-tim/route.ts
//
// (9 Okt 2026) Wilayah tugas PER TIM untuk tahap Pendataan: tim (PML + semua PPL) dan Sub SLS yang didata bersama (skema keroyokan),
// dengan perkiraan KK dan KK terdampak. GET (Authorization: Bearer <sesi>) -> { tim: WilayahTim | null }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { wilayahTim } from "@/lib/portal/induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const tim = akun.petugas_bencana_id ? await wilayahTim(db, akun.petugas_bencana_id) : null;
    return NextResponse.json({ sekarang: new Date().toISOString(), tim });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat wilayah tim." }, { status: 500 });
  }
}
