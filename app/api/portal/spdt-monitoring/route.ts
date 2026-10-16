// app/api/portal/spdt-monitoring/route.ts
//
// (16 Okt 2026) Monitoring Lembar Pendataan SPDT NTP -- permintaan user: kolom nama PPL, nama PML, status login hari ini, jumlah koordinat
// yang dibuka hari ini (translok per hari menyusul di Fase 2). Supervisor: semua PML & PPL; PML: timnya sendiri; PPL: ditolak.
//  GET -> { sekarang, tanggal, peran, grup[{pml, ppl[]}], ringkas }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { bacaMonitoring, peranSpdt } from "@/lib/portal/spdt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const peran = await peranSpdt(db, akun.id);
    if (peran !== "supervisor" && peran !== "pml") return NextResponse.json({ error: "Monitoring khusus Supervisor dan PML SPDT NTP." }, { status: 403 });
    return NextResponse.json(await bacaMonitoring(db, akun, peran));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring." }, { status: 500 });
  }
}
