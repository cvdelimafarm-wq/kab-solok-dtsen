// app/api/penyisiran/riwayat/route.ts
//
// Ambil timeline riwayat perubahan (penyisiran_riwayat) utk SATU keluarga
// -- dipakai panel "🕘 Riwayat Perubahan" di kartu tab Penyisiran Usaha
// (app/seruti/penyisiran-usaha.tsx). Dimuat ON DEMAND (baru fetch pas
// panelnya dibuka pertama kali), sama pola dgn /api/penyisiran/ppl-info.
//
// Dibatasi role "penyisiran"/"penyisiran_petugas" (sama dgn endpoint lain
// di tab ini) -- riwayat ini murni utk keperluan QC/audit internal BPS,
// BUKAN utk dibagikan ke PPL/tetangga di tab Identifikasi.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RIWAYAT = 100;

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ riwayat: [] });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("penyisiran_riwayat")
    .select("jenis, nilai_lama, nilai_baru, oleh_nama, oleh_role, created_at")
    .eq("kode_identitas", id)
    .order("created_at", { ascending: false })
    .limit(MAX_RIWAYAT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ riwayat: data ?? [] });
}
