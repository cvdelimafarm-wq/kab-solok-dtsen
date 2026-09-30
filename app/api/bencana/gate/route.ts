// app/api/bencana/gate/route.ts
//
// POST -> simpan jawaban gate tingkat NAGARI: "apakah ada jorong di nagari
// ini yang bapak/ibu ketahui terdampak bencana hidrometeorologi akhir
// 2025?" (ya/tidak). Publik, tanpa login. Setiap submit disimpan sebagai
// baris baru (tidak menimpa jawaban mitra lain) -- konflik antar mitra
// diselesaikan di tab Monitoring, bukan di sini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      iddesa,
      kecamatan,
      nagari,
      mitra_id,
      nama_mitra,
      ada_jorong_terdampak,
      catatan,
    } = body ?? {};

    if (
      typeof iddesa !== "string" || !iddesa.trim() ||
      typeof kecamatan !== "string" || !kecamatan.trim() ||
      typeof nagari !== "string" || !nagari.trim() ||
      typeof nama_mitra !== "string" || !nama_mitra.trim() ||
      typeof ada_jorong_terdampak !== "boolean"
    ) {
      return NextResponse.json({ error: "Data tidak lengkap atau tidak valid." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("bencana_identifikasi_nagari_gate")
      .insert({
        iddesa: iddesa.trim(),
        kecamatan: kecamatan.trim(),
        nagari: nagari.trim(),
        mitra_id: typeof mitra_id === "number" ? mitra_id : null,
        nama_mitra: nama_mitra.trim(),
        ada_jorong_terdampak,
        catatan: typeof catatan === "string" && catatan.trim() ? catatan.trim() : null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
