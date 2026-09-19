// app/api/penyisiran/nagari/route.ts
//
// Daftar nagari + jumlah keluarga, difilter per kecamatan (dropdown filter
// tahap 2, dimunculkan setelah kecamatan dipilih). Dipakai bersama oleh
// tab "Penyisiran Usaha", "Identifikasi PPL", "Identifikasi Jorong",
// maupun "Identifikasi Tetangga/Lainnya" (dua yang terakhir filter
// manual, tidak auto-scope) -- jadi role token itu semua diterima.
//
// KHUSUS role "penyisiran_petugas": otomatis DIBATASI ke wilayah alokasi
// petugas ybs (RPC penyisiran_nagari_list_wilayah) -- lihat penjelasan
// lengkap di app/api/penyisiran/summary/route.ts & lib/wilayahAlokasiPetugas.ts.

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

  const kec = req.nextUrl.searchParams.get("kec") || "";
  if (!kec) return NextResponse.json([]);

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
    const { data, error } = await supabase.rpc("penyisiran_nagari_list_wilayah", {
      p_kec: kec,
      p_wilayah: wilayahKeJsonb(pilihan),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.rpc("penyisiran_nagari_list", { p_kec: kec });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
