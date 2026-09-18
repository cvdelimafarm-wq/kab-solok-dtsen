// app/api/penyisiran/alokasi/matrix/route.ts
//
// Matriks gabungan SEMUA petugas x SLS/Jorong x Nagari x Kecamatan yang
// SUDAH disubmit (tab "Alokasi Sampel") -- SLS yang belum dipilih siapa pun
// tidak akan muncul sama sekali (RPC penyisiran_alokasi_matrix() JOIN dari
// tabel pilihan, bukan daftar semua SLS -- lihat migrasi
// 20260918_alokasi_sampel.sql).
//
// Boleh dilihat SEMUA petugas penyisiran yang login (bukan cuma pengelola
// spt tab Manajemen Target) -- ini memang dimaksudkan sbg info bersama
// ("siapa kebagian jorong mana") sesudah tiap orang submit checklist-nya.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_alokasi_matrix");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
