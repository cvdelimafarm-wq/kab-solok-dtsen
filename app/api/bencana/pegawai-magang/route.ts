// app/api/bencana/pegawai-magang/route.ts
//
// GET  -> daftar nama pegawai magang yang pernah ditambahkan (utk dropdown
//         datalist di form Identifikasi, supaya nama konsisten & bebas typo).
// POST { nama } -> tambahkan nama baru jika belum ada (case-insensitive,
//         dicocokkan setelah di-trim). Dipanggil dari form saat mitra
//         mengetik nama pegawai magang yang belum pernah tercatat.
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.
// Tidak ada data sensitif (hanya nama).

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

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("bencana_pegawai_magang")
    .select("id, nama")
    .order("nama");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const nama = typeof body?.nama === "string" ? body.nama.trim() : "";
    if (!nama) {
      return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
    }

    // Cek dulu apakah sudah ada (case-insensitive) -- hindari duplikat spt
    // "Budi" vs "budi" vs " Budi ".
    const { data: existing, error: cekError } = await supabase
      .from("bencana_pegawai_magang")
      .select("id, nama")
      .ilike("nama", nama)
      .limit(1)
      .maybeSingle();
    if (cekError) return NextResponse.json({ error: cekError.message }, { status: 500 });
    if (existing) return NextResponse.json({ data: existing });

    const { data, error } = await supabase
      .from("bencana_pegawai_magang")
      .insert({ nama })
      .select("id, nama")
      .single();

    if (error) {
      // Kemungkinan race condition kena unique index -- ambil yg sudah ada.
      const { data: fallback } = await supabase
        .from("bencana_pegawai_magang")
        .select("id, nama")
        .ilike("nama", nama)
        .limit(1)
        .maybeSingle();
      if (fallback) return NextResponse.json({ data: fallback });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
