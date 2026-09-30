// app/api/bencana/mitra/route.ts
//
// GET -> daftar mitra (untuk dropdown nama pengisi) beserta saran nagari
// (iddesa) berdasarkan alamat rumah mitra, dan penanda apakah saran itu
// termasuk dalam 29 nagari yang perlu diidentifikasi. Publik, tanpa login.

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
    const { data, error } = await supabase
      .from("bencana_mitra")
      .select("id, nama, alamat_kecamatan, alamat_desa, no_telp, saran_iddesa, saran_in_scope")
      .order("nama", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
