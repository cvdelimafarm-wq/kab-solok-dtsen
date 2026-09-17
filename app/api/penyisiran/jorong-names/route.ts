// app/api/penyisiran/jorong-names/route.ts
//
// Endpoint TANPA autentikasi (sengaja publik) yang HANYA mengembalikan
// daftar nama petugas penyisiran -- dipakai utk datalist/autocomplete di
// layar login "Identifikasi Jorong" (sama pola dgn
// /api/penyisiran/identifikasi-ppl-names, sumbernya tabel BEDA yaitu
// petugas_penyisiran_akun). Kolom lain (tanggal lahir, no HP, dst) TIDAK
// pernah diekspos lewat endpoint ini.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .order("nama", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ names: (data ?? []).map((r: { nama: string }) => r.nama) });
}
