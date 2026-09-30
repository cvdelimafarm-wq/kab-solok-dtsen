// app/api/bencana/alokasi/sampel/route.ts
//
// Langkah 1 alokasi petugas: admin memilih Sub SLS terdampak mana yang
// benar-benar akan dijadikan wilayah sampel pendataan (tidak semua Sub SLS
// terdampak otomatis masuk kertas kerja plotting).
//
// GET  -> daftar seluruh calon Sub SLS terdampak + status centang saat ini
//         (RPC bencana_daftar_calon_sampel).
// POST { idsubsls: string, termasuk_sampel: boolean }
//      -> centang/lepas SATU Sub SLS.
// POST { idsubsls: string[], termasuk_sampel: boolean }
//      -> centang/lepas BEBERAPA Sub SLS sekaligus (dipakai utk multi-select).
// POST { semua: true, termasuk_sampel: boolean, kecamatan?: string }
//      -> tombol "Centang Semua" / "Lepas Semua" -- berlaku utk seluruh
//         calon, atau hanya satu kecamatan kalau parameter kecamatan diisi.
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.

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
  const { data, error } = await supabase.rpc("bencana_daftar_calon_sampel");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const termasukSampel = body?.termasuk_sampel === true;

  try {
    let daftarId: string[] = [];

    if (body?.semua === true) {
      const { data: calon, error: errCalon } = await supabase.rpc("bencana_daftar_calon_sampel");
      if (errCalon) return NextResponse.json({ error: errCalon.message }, { status: 500 });
      const kecamatan = typeof body?.kecamatan === "string" && body.kecamatan.trim() ? body.kecamatan.trim() : null;
      daftarId = ((calon ?? []) as { idsubsls: string; kecamatan: string }[])
        .filter((r) => !kecamatan || r.kecamatan === kecamatan)
        .map((r) => r.idsubsls);
    } else if (Array.isArray(body?.idsubsls)) {
      daftarId = (body.idsubsls as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    } else if (typeof body?.idsubsls === "string" && body.idsubsls.trim()) {
      daftarId = [body.idsubsls.trim()];
    }

    if (daftarId.length === 0) {
      return NextResponse.json({ error: "idsubsls (atau semua:true) wajib diisi." }, { status: 400 });
    }

    const rows = daftarId.map((idsubsls) => ({
      idsubsls,
      termasuk_sampel: termasukSampel,
      diperbarui_at: new Date().toISOString(),
    }));

    const { error: errUpsert } = await supabase.from("bencana_sampel_subsls").upsert(rows, { onConflict: "idsubsls" });
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });

    return NextResponse.json({ ok: true, jumlah: daftarId.length, termasuk_sampel: termasukSampel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
