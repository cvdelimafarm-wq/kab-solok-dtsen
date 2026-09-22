// app/api/penyisiran/pemilihan-subsls/route.ts
//
// Ringkasan "Monitoring Status Pemilihan Sub-SLS" per petugas AKTIF (tab
// Penyisiran Usaha) -- DIPINDAH dari tab Monitoring (terpadu) ke tab
// Perencanaan Lapangan (permintaan user), ditaruh tepat di bawah kartu
// "📋 Identifikasi Wilayah Sampel SLS" -- lihat SeksiPemilihanSubsls di
// app/penyisiran/perencanaan-lapangan.tsx.
//
// Endpoint BERDIRI SENDIRI (bukan lagi bagian dari RPC gabungan
// penyisiran_monitoring_terpadu()) krn sekarang dipanggil dari tab yang
// beda -- RPC-nya sendiri jg sudah dipisah jadi penyisiran_pemilihan_subsls()
// (lihat migrasi pindah_pemilihan_subsls_dan_tambah_jabatan_petugas.sql).
//
// Role sama dgn endpoint lain di tab Perencanaan Lapangan/Monitoring:
// "penyisiran" (PIN admin) atau "penyisiran_petugas" (login personal) --
// TIDAK dibatasi ke pengelola di level server (spt endpoint2 lain di tab
// ini, mis. .../alokasi/rekomendasi), krn panel yg memanggilnya di
// frontend SUDAH digerbang bolehAksesManajemenTarget (data ini agregat
// SEMUA petugas, bukan milik personal).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("penyisiran_pemilihan_subsls");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
