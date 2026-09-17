// app/api/penyisiran/set-lokasi-rumah/route.ts
//
// Menyimpan lokasi (lat/lng) rumah seorang petugas penyisiran, diisi
// SENDIRI oleh petugas lewat tombol "📍 Tetapkan Lokasi Rumah Saya" di tab
// Penyisiran Usaha (pakai Geolocation API browser) -- BUKAN dikumpulkan
// manual dari daftar terpisah. Lokasi ini dipakai utk menghitung skor
// prioritas berbasis jarak (semakin jauh dari rumah petugas yang sedang
// login, semakin rendah skornya) -- lihat hitungSkorPrioritas() di
// app/seruti/penyisiran-usaha.tsx.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : null;

  if (!petugasId || lat === null || lng === null) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase
    .from("petugas_penyisiran_akun")
    .update({ lat, lng })
    .eq("id", petugasId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
