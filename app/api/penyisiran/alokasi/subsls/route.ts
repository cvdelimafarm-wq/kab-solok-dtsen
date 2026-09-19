// app/api/penyisiran/alokasi/subsls/route.ts
//
// GET ?sls_key=<kec-nagari-sls> -> rincian per SUBSLS di DALAM satu SLS/
// Jorong (kode, label, jumlah potensi, skor dasar, sudah dipilih oleh
// berapa petugas) -- dipakai tombol "unhide" (▸) di tabel Identifikasi
// Wilayah Sampel SLS (app/penyisiran/perencanaan-lapangan.tsx,
// WilayahSampelPanel) supaya 1 Jorong yang punya >1 SUBSLS bisa dipecah &
// dibagi ke beberapa PPL berbeda, bukan wajib satu Jorong = satu petugas.
//
// Login PERSONAL role "penyisiran_petugas" (SAMA dgn endpoint rekomendasi
// -- SEMUA petugas yg login boleh lihat rincian ini, bukan cuma
// pengelola, krn ini memang bagian dari form checklist milik semua orang).
//
// RPC: penyisiran_alokasi_dasar_subsls(p_sls_key) -- lihat migrasi
// alokasi_unhide_subsls (diterapkan langsung lewat MCP Supabase).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const slsKey = req.nextUrl.searchParams.get("sls_key") || "";
  if (!slsKey.trim()) {
    return NextResponse.json({ error: "sls_key wajib diisi." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_alokasi_dasar_subsls", { p_sls_key: slsKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
