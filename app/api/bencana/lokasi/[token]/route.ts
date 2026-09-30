// app/api/bencana/lokasi/[token]/route.ts
//
// Halaman self-service "Tetapkan Lokasi Rumah Saya" utk petugas Alokasi
// Petugas Pasca Bencana -- TANPA LOGIN, cukup lewat link unik bertoken
// (bencana_petugas.token) yang dibagikan ke masing2 petugas (mis. lewat
// WA). Token berfungsi sbg kapabilitas: siapa saja yg pegang link itu
// boleh menetapkan lokasi utk baris petugas tsb, tidak lebih.
//
// GET  -> info petugas (nama, status lokasi saat ini) utk ditampilkan di
//         halaman sebelum petugas menekan tombol.
// POST -> simpan lat/lng dari Geolocation API browser petugas,
//         lokasi_status='riil' (real GPS, bukan perkiraan/tanpa data).

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

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("bencana_petugas")
    .select("nama, status_kepegawaian, aktif, lokasi_status, lokasi_diperbarui_at")
    .eq("token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "Koordinat tidak valid." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bencana_petugas")
    .update({
      lat,
      lng,
      lokasi_status: "riil",
      lokasi_diperbarui_at: new Date().toISOString(),
    })
    .eq("token", token)
    .select("nama")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  return NextResponse.json({ ok: true, nama: data.nama });
}
