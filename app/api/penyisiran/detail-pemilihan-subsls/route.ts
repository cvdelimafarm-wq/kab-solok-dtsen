// app/api/penyisiran/detail-pemilihan-subsls/route.ts
//
// Detail per petugas untuk seksi "Monitoring Status Pemilihan Sub-SLS" di
// tab Monitoring (terpadu) -- dipanggil saat kolom "Jumlah Sub-SLS Ditag"
// pada tabel ringkasan diklik. Mengembalikan dua daftar dari RPC
// penyisiran_detail_pemilihan_subsls(p_petugas_id):
//   - ditag: Sub SLS yg tercakup alokasi petugas ybs (kec/nagari/SLS/Sub
//     SLS + jumlah KK + jumlah sudah ditemukan/didata)
//   - belum_ditag: Sub SLS aktif lain di kecamatan yg SAMA dgn wilayah
//     tugas petugas ybs, tapi belum ada alokasi ke petugas manapun.
//
// Role sama dgn /api/penyisiran/monitoring-terpadu (view agregat internal
// staf): "penyisiran" (PIN admin) atau "penyisiran_petugas" (login personal).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const petugasId = Number(req.nextUrl.searchParams.get("petugas_id"));
  if (!Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "petugas_id tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_detail_pemilihan_subsls", {
    p_petugas_id: petugasId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
