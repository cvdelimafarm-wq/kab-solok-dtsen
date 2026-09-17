// app/api/penyisiran/subsls/route.ts
//
// Daftar Sub SLS (Jorong-<nomor>, mis. "JORONG USAK-01") + jumlah keluarga,
// dropdown filter tahap 3 -- dimunculkan setelah kecamatan & nagari
// dipilih. Nilai yang dikembalikan (`idsubsls`, 16 digit) langsung dipakai
// sbg filter presisi di /api/penyisiran/list & /api/penyisiran/markers.
//
// WAJIB kirim kec+nagari sekaligus (bukan nagari saja) -- nagari_kode
// ternyata TIDAK unik lintas kecamatan (polanya berulang, sama seperti
// sls_kode/subsls_kode), jadi kalau cuma difilter nagari_kode saja bisa
// salah gabung Sub SLS dari kecamatan lain yang kebetulan nagari_kode-nya
// sama persis -- lihat RPC penyisiran_subsls_list(p_kec, p_nagari).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "identifikasi"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const kec = req.nextUrl.searchParams.get("kec") || "";
  const nagari = req.nextUrl.searchParams.get("nagari") || "";
  if (!kec || !nagari) return NextResponse.json([]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_subsls_list", { p_kec: kec, p_nagari: nagari });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
