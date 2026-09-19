// app/api/penyisiran/summary/route.ts
//
// Stat tile (total/belum/ditemukan/tidak_ditemukan/tidak_bisa) + daftar
// kecamatan (utk dropdown filter tahap 1). Dipakai bersama oleh tab
// "Penyisiran Usaha", "Identifikasi PPL", "Identifikasi Jorong", maupun
// "Identifikasi Tetangga/Lainnya" (cuma daftar wilayah + jumlah, tidak
// ada nama/alamat), jadi role token itu semua diterima.
//
// KHUSUS role "penyisiran_petugas" (login personal tab Penyisiran Usaha):
// otomatis DIBATASI ke SLS/Sub SLS yang sudah dipilih petugas ybs sendiri
// di kartu "Identifikasi Wilayah Sampel SLS" (RPC penyisiran_summary_wilayah,
// lihat lib/wilayahAlokasiPetugas.ts) -- role LAIN (penyisiran/PIN admin,
// identifikasi_jorong, identifikasi_tetangga) TIDAK disentuh, tetap lihat
// semua kecamatan spt sebelumnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionRole, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { ambilWilayahAlokasi, wilayahKeJsonb } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (
    !verifySession(token, [
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

  if (getSessionRole(token) === "penyisiran_petugas") {
    const petugasId = Number(getSessionSubject(token));
    if (!Number.isFinite(petugasId) || petugasId <= 0) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    let pilihan;
    try {
      pilihan = await ambilWilayahAlokasi(supabase, petugasId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memuat wilayah alokasi." }, { status: 500 });
    }
    const { data, error } = await supabase.rpc("penyisiran_summary_wilayah", {
      p_wilayah: wilayahKeJsonb(pilihan),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc("penyisiran_summary");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
