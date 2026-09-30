// app/api/bencana/alokasi/beban/sumber/route.ts
//
// GET ?idsubsls=... -> rincian SUMBER estimasi KK terdampak utk SATU Sub SLS,
// dipakai popover "🔎" di kolom KK Terdampak (Kertas Kerja Beban) supaya
// admin bisa lihat langsung laporan mitra mana saja yang jadi dasar angka
// itu, sebelum memutuskan mengoreksinya.
//
// Data asal: bencana_identifikasi_jorong (laporan per Jorong dari mitra saat
// identifikasi dampak) -- satu baris di situ bisa mencakup BEBERAPA Sub SLS
// sekaligus (kolom subsls_terdampak, array). Endpoint ini menyaring HANYA
// baris yang subsls_terdampak-nya mengandung idsubsls yang diminta (bukan
// seluruh laporan di Jorong itu), supaya rinciannya akurat per Sub SLS --
// beda dgn kk_terdampak_asli di bencana_skor_beban_subsls() yang membagi
// rata total Jorong ke semua Sub SLS terdampak di jorong tsb.
//
// rata_rata & maksimum dihitung dari total KK per laporan (jumlah seluruh
// indikator_dampak_kk pada laporan itu), supaya ada opsi cepat mengisi
// kolom KK Terdampak selain data asli (rata-jorong) atau ketik manual.
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

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const idsubsls = req.nextUrl.searchParams.get("idsubsls")?.trim();
  if (!idsubsls) {
    return NextResponse.json({ error: "idsubsls wajib diisi." }, { status: 400 });
  }

  const { data: wilayah, error: errWilayah } = await supabase
    .from("bencana_wilayah")
    .select("idsls, sls, sub_sls")
    .eq("idsubsls", idsubsls)
    .maybeSingle();
  if (errWilayah) return NextResponse.json({ error: errWilayah.message }, { status: 500 });
  if (!wilayah) return NextResponse.json({ error: "Sub SLS tidak ditemukan." }, { status: 404 });

  const { data: rows, error } = await supabase
    .from("bencana_identifikasi_jorong")
    .select("nama_mitra, indikator_dampak, indikator_dampak_kk, catatan, dibuat_pada")
    .eq("idsls", wilayah.idsls)
    .contains("subsls_terdampak", [idsubsls])
    .order("dibuat_pada", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rincian = (rows ?? []).map((r) => {
    const kk = (r.indikator_dampak_kk ?? {}) as Record<string, unknown>;
    let total = 0;
    for (const v of Object.values(kk)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) total += n;
    }
    return {
      nama_mitra: r.nama_mitra as string,
      indikator_dampak: (r.indikator_dampak ?? []) as string[],
      total_kk: total,
      catatan: (r.catatan as string | null) ?? null,
      dibuat_pada: r.dibuat_pada as string,
    };
  });

  const totals = rincian.map((r) => r.total_kk);
  const rataRata =
    totals.length > 0 ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : 0;
  const maksimum = totals.length > 0 ? Math.max(...totals) : 0;

  return NextResponse.json({
    idsls: wilayah.idsls,
    jorong: wilayah.sls,
    sub_sls: wilayah.sub_sls,
    rincian,
    jumlah_laporan: rincian.length,
    rata_rata: rataRata,
    maksimum,
  });
}
