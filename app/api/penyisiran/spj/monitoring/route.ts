// app/api/penyisiran/spj/monitoring/route.ts
//
// GET -> matriks kelengkapan SPJ, dipakai DUA audiens beda lewat SATU
// route+RPC yg sama (spj_matriks_kelengkapan(), lihat
// supabase/migrations/20260919_spj_matriks_kelengkapan.sql -- satu baris
// per (petugas, tanggal dlm rentang Surat Tugas)):
//  - Pengelola: dapat SEMUA baris (semua petugas) -- dasar Dashboard &
//    Monitoring SPJ (matriks lintas petugas).
//  - Petugas/tetangga biasa: baris DISARING cuma miliknya sendiri --
//    dasar "Administrasi Saya" (progress hari ini + riwayat per tanggal),
//    supaya tidak perlu bikin RPC/endpoint kedua cuma utk versi
//    personalnya sendiri.
//
// Frontend yang menyusun baris mentah ini jadi bentuk tampilan (Dashboard,
// matriks Per Tanggal/Per Petugas, atau ringkasan personal) -- endpoint
// ini sengaja cuma "data mentah terfilter", bukan sudah teragregasi,
// supaya gampang dipakai ulang di banyak tempat (termasuk validasi Print
// Builder: cek apakah kombinasi petugas+tanggal+dokumen yg dipilih memang
// ada datanya sebelum digenerate jadi PDF).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BarisMatriks {
  petugas_jenis: string;
  petugas_id: number;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);

  const { data, error } = await supabase.rpc("spj_matriks_kelengkapan");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const semua = (data ?? []) as BarisMatriks[];
  if (namaPengelola) {
    return NextResponse.json({ pengelola: true, baris: semua });
  }

  const milikSaya = semua.filter(
    (b) => b.petugas_jenis === session.jenis && String(b.petugas_id) === String(session.petugasId)
  );
  return NextResponse.json({ pengelola: false, baris: milikSaya });
}
