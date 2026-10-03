// app/api/bencana/alokasi/beban/route.ts
//
// "Kertas Kerja Beban": koreksi manual jumlah KK total & KK terdampak per
// Sub SLS terdampak -- ini variabel INPUT yang menentukan skor_beban_pendataan
// (dipakai di Langkah 1-4 tab Alokasi Petugas). Data asal:
//   - KK total default dari Wilkerstat (tabel bencana_kk_subsls)
//   - KK terdampak default dari estimasi rata-rata per Jorong (total KK
//     terdampak hasil identifikasi dibagi rata ke Sub SLS terdampak di
//     Jorong yg sama -- lihat bencana_skor_beban_subsls())
// Kedua angka itu bisa jadi kurang akurat utk Sub SLS tertentu, jadi admin
// bisa menimpanya di sini. Override disimpan di tabel terpisah
// (bencana_kk_subsls_override) supaya nilai ASLI tetap tersimpan &
// bisa dikembalikan kapan saja.
//
// (3 Okt 2026) Tiap baris disertai lat/lng (RPC bencana_subsls_titik_jarak,
// SAMA dgn yg dipakai popover "Saran" & tombol "Lihat Peta" di tab
// Identifikasi) -- dipakai FE utk tombol "Lihat Peta" di sebelah nama
// Jorong, supaya admin bisa cek sekilas citra satelit saat mengoreksi KK.
//
// GET  -> RPC bencana_kertas_kerja_beban() (hanya Sub SLS terdampak).
// POST { idsubsls, kk_total_override: number|null, kk_terdampak_override: number|null }
//      -> upsert override utk SATU Sub SLS. Kalau KEDUANYA null, baris
//         override dihapus (supaya tabel override tetap bersih & badge
//         "manual" akurat).
// POST { reset_semua: true }
//      -> hapus SEMUA override (kembalikan seluruhnya ke data asli/estimasi).
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

function angkaValid(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const [bebanRes, titikRes] = await Promise.all([
    supabase.rpc("bencana_kertas_kerja_beban"),
    supabase.rpc("bencana_subsls_titik_jarak"),
  ]);
  if (bebanRes.error) return NextResponse.json({ error: bebanRes.error.message }, { status: 500 });
  if (titikRes.error) return NextResponse.json({ error: titikRes.error.message }, { status: 500 });

  const titikMap = new Map<string, { lat: number; lng: number }>();
  for (const t of (titikRes.data ?? []) as { idsubsls: string; lat: number | null; lng: number | null }[]) {
    if (typeof t.lat === "number" && typeof t.lng === "number") titikMap.set(t.idsubsls, { lat: t.lat, lng: t.lng });
  }

  const data = ((bebanRes.data ?? []) as { idsubsls: string }[]).map((r) => {
    const titik = titikMap.get(r.idsubsls) ?? null;
    return { ...r, lat: titik?.lat ?? null, lng: titik?.lng ?? null };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);

  try {
    if (body?.reset_semua === true) {
      const { error } = await supabase.from("bencana_kk_subsls_override").delete().neq("idsubsls", "");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, direset: true });
    }

    const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls.trim() : "";
    if (!idsubsls) {
      return NextResponse.json({ error: "idsubsls wajib diisi." }, { status: 400 });
    }

    const kkTotalRaw = body?.kk_total_override;
    const kkTerdampakRaw = body?.kk_terdampak_override;
    const kkTotal = kkTotalRaw === null || kkTotalRaw === undefined ? null : kkTotalRaw;
    const kkTerdampak = kkTerdampakRaw === null || kkTerdampakRaw === undefined ? null : kkTerdampakRaw;

    if (kkTotal !== null && !angkaValid(kkTotal)) {
      return NextResponse.json({ error: "KK Total harus berupa angka >= 0." }, { status: 400 });
    }
    if (kkTerdampak !== null && !angkaValid(kkTerdampak)) {
      return NextResponse.json({ error: "KK Terdampak harus berupa angka >= 0." }, { status: 400 });
    }

    if (kkTotal === null && kkTerdampak === null) {
      const { error } = await supabase.from("bencana_kk_subsls_override").delete().eq("idsubsls", idsubsls);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, dihapus: true });
    }

    const { error } = await supabase.from("bencana_kk_subsls_override").upsert(
      {
        idsubsls,
        kk_total_override: kkTotal,
        kk_terdampak_override: kkTerdampak,
        diperbarui_at: new Date().toISOString(),
      },
      { onConflict: "idsubsls" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
