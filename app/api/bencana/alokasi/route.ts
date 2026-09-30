// app/api/bencana/alokasi/route.ts
//
// GET -> data utama tab "Alokasi Petugas": kertas kerja per Sub SLS (RPC
// bencana_kertas_kerja_alokasi), ringkasan beban per PPL (RPC
// bencana_ringkasan_beban_ppl), kebutuhan petugas per kecamatan (RPC
// bencana_kebutuhan_petugas, parametrized oleh query ?hari_kerja=),
// dan daftar ringkas seluruh petugas (utk dropdown assign manual).
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya di
// aplikasi ini (tidak ada sistem login sama sekali di /bencana).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const hariKerjaRaw = Number(req.nextUrl.searchParams.get("hari_kerja"));
  const hariKerja = Number.isFinite(hariKerjaRaw) && hariKerjaRaw > 0 ? Math.min(Math.round(hariKerjaRaw), 24) : 24;

  try {
    const [kertasRes, ringkasanRes, kebutuhanRes, petugasRes] = await Promise.all([
      supabase.rpc("bencana_kertas_kerja_alokasi"),
      supabase.rpc("bencana_ringkasan_beban_ppl"),
      supabase.rpc("bencana_kebutuhan_petugas", { hari_kerja: hariKerja }),
      supabase
        .from("bencana_petugas")
        .select("id, nama, peran, status_kepegawaian, sumber_roster, atasan_id, lokasi_status, aktif, alamat_kecamatan")
        .order("nama"),
    ]);

    if (kertasRes.error) return NextResponse.json({ error: kertasRes.error.message }, { status: 500 });
    if (ringkasanRes.error) return NextResponse.json({ error: ringkasanRes.error.message }, { status: 500 });
    if (kebutuhanRes.error) return NextResponse.json({ error: kebutuhanRes.error.message }, { status: 500 });
    if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });

    return NextResponse.json({
      kertas_kerja: kertasRes.data ?? [],
      ringkasan_ppl: ringkasanRes.data ?? [],
      kebutuhan_petugas: kebutuhanRes.data ?? [],
      petugas: petugasRes.data ?? [],
      hari_kerja: hariKerja,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
