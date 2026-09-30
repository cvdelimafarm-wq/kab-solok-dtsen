// app/api/bencana/alokasi/route.ts
//
// GET -> data utama tab "Alokasi Petugas": kertas kerja per Sub SLS -- HANYA
// yang sudah dikonfirmasi sbg wilayah sampel (RPC bencana_kertas_kerja_alokasi),
// ringkasan beban per PPL/PML/Korwil (utk visualisasi keseimbangan tim),
// kebutuhan petugas per kecamatan (RPC bencana_kebutuhan_petugas,
// parametrized oleh query ?hari_kerja=, ikut terbatas ke wilayah sampel),
// dan daftar ringkas seluruh petugas (utk dropdown assign manual PPL/PML/Korwil).
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
    const [kertasRes, ringkasanPplRes, ringkasanPmlRes, ringkasanKorwilRes, kebutuhanRes, petugasRes, sampelRes] =
      await Promise.all([
        supabase.rpc("bencana_kertas_kerja_alokasi"),
        supabase.rpc("bencana_ringkasan_beban_ppl"),
        supabase.rpc("bencana_ringkasan_beban_pml"),
        supabase.rpc("bencana_ringkasan_beban_korwil"),
        supabase.rpc("bencana_kebutuhan_petugas", { hari_kerja: hariKerja }),
        supabase
          .from("bencana_petugas")
          .select("id, nama, peran, status_kepegawaian, sumber_roster, atasan_id, lokasi_status, aktif, alamat_kecamatan")
          .order("nama"),
        supabase.rpc("bencana_daftar_calon_sampel"),
      ]);

    if (kertasRes.error) return NextResponse.json({ error: kertasRes.error.message }, { status: 500 });
    if (ringkasanPplRes.error) return NextResponse.json({ error: ringkasanPplRes.error.message }, { status: 500 });
    if (ringkasanPmlRes.error) return NextResponse.json({ error: ringkasanPmlRes.error.message }, { status: 500 });
    if (ringkasanKorwilRes.error) return NextResponse.json({ error: ringkasanKorwilRes.error.message }, { status: 500 });
    if (kebutuhanRes.error) return NextResponse.json({ error: kebutuhanRes.error.message }, { status: 500 });
    if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });
    if (sampelRes.error) return NextResponse.json({ error: sampelRes.error.message }, { status: 500 });

    const sampelData = (sampelRes.data ?? []) as { termasuk_sampel: boolean }[];

    return NextResponse.json({
      kertas_kerja: kertasRes.data ?? [],
      ringkasan_ppl: ringkasanPplRes.data ?? [],
      ringkasan_pml: ringkasanPmlRes.data ?? [],
      ringkasan_korwil: ringkasanKorwilRes.data ?? [],
      kebutuhan_petugas: kebutuhanRes.data ?? [],
      petugas: petugasRes.data ?? [],
      jumlah_calon_sampel: sampelData.length,
      jumlah_sampel_terpilih: sampelData.filter((r) => r.termasuk_sampel).length,
      hari_kerja: hariKerja,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
