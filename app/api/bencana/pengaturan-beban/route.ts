// app/api/bencana/pengaturan-beban/route.ts
//
// "Kelola Perkiraan Beban Tugas": pengaturan bobot/parameter yang dipakai
// untuk menghitung skor_beban_pendataan, skor_jarak & skor_beban_akhir di
// tab Alokasi Petugas. Nilai disimpan di tabel bencana_pengaturan_beban dan
// dibaca LANGSUNG oleh fungsi bencana_skor_beban_subsls() &
// bencana_kertas_kerja_alokasi() -- jadi begitu disimpan di sini, seluruh
// perhitungan beban (Langkah 1-4, Ringkasan, dsb) otomatis ikut berubah
// tanpa perlu migrasi/deploy ulang.
//
// GET  -> daftar semua baris pengaturan (kunci, nilai, label, keterangan).
// POST { kunci, nilai } -> update SATU baris pengaturan. nilai harus angka > 0.
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

const KUNCI_VALID = new Set([
  "bobot_kk_terdampak",
  "bobot_kk_tidak_terdampak",
  "pembagi_jarak_km",
]);

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const { data, error } = await supabase
    .from("bencana_pengaturan_beban")
    .select("kunci, nilai, label, keterangan, updated_at")
    .order("kunci");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);

  try {
    const kunci = typeof body?.kunci === "string" ? body.kunci.trim() : "";
    if (!kunci || !KUNCI_VALID.has(kunci)) {
      return NextResponse.json({ error: "kunci pengaturan tidak dikenali." }, { status: 400 });
    }

    const nilaiRaw = body?.nilai;
    const nilai = typeof nilaiRaw === "number" ? nilaiRaw : Number(nilaiRaw);
    if (!Number.isFinite(nilai) || nilai <= 0) {
      return NextResponse.json({ error: "Nilai harus berupa angka lebih besar dari 0." }, { status: 400 });
    }

    const { error } = await supabase
      .from("bencana_pengaturan_beban")
      .update({ nilai, updated_at: new Date().toISOString() })
      .eq("kunci", kunci);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
