// app/api/penyisiran/markers/route.ts
//
// Versi RINGAN (cuma kolom yang dibutuhkan peta) dari daftar keluarga yang
// sedang difilter, TIDAK dipaginasi (sampai batas MAX_MARKERS) supaya peta
// menampilkan semua titik yang cocok, bukan cuma satu halaman tabel. Butuh
// role "penyisiran".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKERS = 5000;

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const sp = req.nextUrl.searchParams;
  const kec = sp.get("kec") || "";
  const nagari = sp.get("nagari") || "";
  const status = sp.get("status") || "";

  if (!kec) {
    return NextResponse.json({ error: "Pilih kecamatan terlebih dahulu." }, { status: 400 });
  }

  let query = supabase
    .from("penyisiran_usaha")
    .select("kode_identitas, nama_kk, alamat, nagari_nama, lat, lng, status_kunjungan")
    .eq("kec_kode", kec)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(MAX_MARKERS);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (status) query = query.eq("status_kunjungan", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ markers: data ?? [], capped: (data?.length ?? 0) >= MAX_MARKERS });
}
