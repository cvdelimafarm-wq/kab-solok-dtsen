// app/api/penyisiran/monitoring-ppl/route.ts
//
// Tab "Monitoring Pengisian Identifikasi PPL" -- rekap SELURUH progres
// pengisian tab "Identifikasi PPL" (app/penyisiran/identifikasi-ppl.tsx),
// per PPL/mantan pendata, supaya staf BPS bisa memantau siapa yang belum
// mengisi / masih banyak sisa tanpa harus login sebagai tiap-tiap PPL.
//
// Ini VIEW AGREGAT internal staf -- dikunci role "penyisiran" (PIN yang
// sama dgn tab Penyisiran Usaha), BUKAN role "identifikasi_ppl" (login
// personal PPL). Datanya cuma rekap angka + nama/kontak PPL (data internal
// BPS), tidak memuat NIK/Nomor KK/alamat detail warga.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_monitoring_ppl");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
