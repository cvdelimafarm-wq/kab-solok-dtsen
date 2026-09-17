// app/api/penyisiran/summary/route.ts
//
// Stat tile (total/belum/ditemukan/tidak_ditemukan/tidak_bisa) + daftar
// kecamatan (utk dropdown filter tahap 1). Dipakai bersama oleh tab
// "Penyisiran Usaha", "Identifikasi PPL", "Identifikasi Jorong", maupun
// "Identifikasi Tetangga/Lainnya" (cuma daftar wilayah + jumlah, tidak
// ada nama/alamat), jadi role token itu semua diterima.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (
    !verifySession(extractBearer(req), [
      "penyisiran",
      "penyisiran_petugas",
      "identifikasi",
      "identifikasi_jorong",
      "identifikasi_tetangga",
    ])
  ) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_summary");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
