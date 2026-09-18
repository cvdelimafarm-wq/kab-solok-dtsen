// app/api/penyisiran/alokasi/rekomendasi/route.ts
//
// Daftar rekomendasi SLS/Jorong (diurutkan skor akhir tertinggi) + pilihan
// yang SUDAH tersimpan sebelumnya (kalau petugas pernah submit) utk tab
// "Alokasi Sampel" -- login personal role "penyisiran_petugas" (SAMA
// dengan tab "Penyisiran Usaha", lihat lib/penyisiranAuth.ts & token
// localStorage "penyisiran-petugas-login-*" di app/seruti/penyisiran-usaha.tsx
// -- sengaja dipakai bersama supaya petugas yang sudah login di tab itu
// TIDAK perlu login ulang di tab ini).
//
// Rumus skor (Layer 1 Skor Dasar + Layer 2 Skor Akhir personal per jarak)
// sepenuhnya dihitung di RPC penyisiran_alokasi_rekomendasi(p_petugas_id)
// -- lihat migrasi 20260918_alokasi_sampel.sql utk detail & justifikasi
// tiap parameter (sudah dikonfirmasi user).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [petugasRes, rekomendasiRes, pilihanRes] = await Promise.all([
    supabase.from("petugas_penyisiran_akun").select("nama, lat, lng").eq("id", petugasId).maybeSingle(),
    supabase.rpc("penyisiran_alokasi_rekomendasi", { p_petugas_id: petugasId }),
    supabase.from("penyisiran_alokasi_pilihan").select("sls_key").eq("petugas_id", petugasId),
  ]);

  if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });
  if (rekomendasiRes.error) return NextResponse.json({ error: rekomendasiRes.error.message }, { status: 500 });
  if (pilihanRes.error) return NextResponse.json({ error: pilihanRes.error.message }, { status: 500 });

  return NextResponse.json({
    nama: petugasRes.data?.nama ?? null,
    lat: petugasRes.data?.lat ?? null,
    lng: petugasRes.data?.lng ?? null,
    data: rekomendasiRes.data ?? [],
    pilihan: (pilihanRes.data ?? []).map((r) => r.sls_key),
  });
}
