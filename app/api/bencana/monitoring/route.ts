// app/api/bencana/monitoring/route.ts
//
// GET -> ringkasan hasil identifikasi untuk tab Monitoring: agregat per
// nagari (dari RPC bencana_monitoring_nagari), per jorong (dari RPC
// bencana_monitoring_jorong), termasuk penanda konflik antar mitra, dan
// per pegawai magang (dari RPC bencana_monitoring_magang) -- jumlah hasil
// identifikasi yang masuk HARI INI per pegawai magang.
// Publik, tanpa login (read-only, tidak ada data sensitif).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  try {
    const [nagariRes, jorongRes, magangRes] = await Promise.all([
      supabase.rpc("bencana_monitoring_nagari"),
      supabase.rpc("bencana_monitoring_jorong"),
      supabase.rpc("bencana_monitoring_magang"),
    ]);

    if (nagariRes.error) {
      return NextResponse.json({ error: nagariRes.error.message }, { status: 500 });
    }
    if (jorongRes.error) {
      return NextResponse.json({ error: jorongRes.error.message }, { status: 500 });
    }
    if (magangRes.error) {
      return NextResponse.json({ error: magangRes.error.message }, { status: 500 });
    }

    return NextResponse.json({
      nagari: nagariRes.data ?? [],
      jorong: jorongRes.data ?? [],
      magang: magangRes.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
