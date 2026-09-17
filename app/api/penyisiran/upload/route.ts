// app/api/penyisiran/upload/route.ts
//
// Terima satu BATCH baris dari data_checklist_penyisiran.json (hasil ekspor
// penyisiran_undercoverage_usaha.py, TANPA NIK/Nomor KK) dan upsert ke
// Supabase lewat RPC penyisiran_upsert_batch. Client (tab UI) yang memecah
// file JSON jadi beberapa batch kecil sebelum memanggil endpoint ini
// berkali-kali -- supaya satu request tidak terlalu besar (lihat catatan
// OOM di app/api/anomali-kp/upload/route.ts utk kenapa ini penting di
// Railway). Butuh token sesi valid.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS_PER_REQUEST = 5000;

export async function POST(req: NextRequest) {
  if (!verifySession(extractBearer(req))) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Tidak ada baris data yang dikirim." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_ROWS_PER_REQUEST} baris per batch. Pecah jadi beberapa request.` },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_upsert_batch", { p_rows: rows });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasil = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ baru: hasil?.baru ?? 0, diperbarui: hasil?.diperbarui ?? 0 });
}
