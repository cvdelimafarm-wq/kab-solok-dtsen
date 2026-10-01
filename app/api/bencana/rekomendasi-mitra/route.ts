// app/api/bencana/rekomendasi-mitra/route.ts
//
// GET ?iddesa=...&kecamatan=... -> rekomendasi nama mitra utk mengisi
// Identifikasi di Nagari tsb, dipakai tombol bantuan (?) di samping kolom
// "Nama Mitra". HANYA rekomendasi/bantuan keputusan -- tidak menugaskan
// atau mengunci apa pun, admin/mitra tetap bebas pilih/ketik nama lain.
//
// Sumber: bencana_mitra -- daftar mitra hasil rekrutmen Sensus 2026
// ("kegiatan lain" di luar bencana ini), kolom status_seleksi menandai
// apakah mereka DITERIMA sbg PPL/PML Sensus (artinya sudah berpengalaman
// & kemungkinan tersedia).
//
// Skala prioritas (sesuai permintaan):
//   1) tier1 -- Nagari yang sama (via saran_iddesa hasil geocoding alamat)
//      DAN berstatus Diterima di kegiatan lain (Sensus 2026).
//   2) tier2 -- Kecamatan yang sama DAN berstatus Diterima di kegiatan
//      lain (tidak termasuk yg sudah masuk tier1).
//   3) tier3 -- Nagari yang sama TAPI TIDAK/BELUM berstatus Diterima di
//      kegiatan lain (fallback, mitra lokal yang belum tentu aktif).
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.
// alamat_kecamatan di bencana_mitra formatnya tidak seragam (ada yg
// berawalan kode "(130) X Koto Singkarak", ada yg polos) sehingga
// dicocokkan dgn menghilangkan awalan kode + disamakan huruf besar/kecil.

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

type MitraCalon = {
  id: number;
  nama: string;
  no_telp: string | null;
  alamat_kecamatan: string | null;
  alamat_desa: string | null;
  posisi: string | null;
  status_seleksi: string | null;
};

const KOLOM = "id, nama, no_telp, alamat_kecamatan, alamat_desa, posisi, status_seleksi";

function bersihkanKecamatan(s: string | null): string {
  if (!s) return "";
  return s
    .replace(/^\s*\(\d+\)\s*/, "")
    .trim()
    .toUpperCase();
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const iddesa = req.nextUrl.searchParams.get("iddesa")?.trim();
  const kecamatan = req.nextUrl.searchParams.get("kecamatan")?.trim();
  if (!iddesa || !kecamatan) {
    return NextResponse.json({ error: "iddesa dan kecamatan wajib diisi." }, { status: 400 });
  }
  const kecamatanBersih = kecamatan.trim().toUpperCase();

  try {
    // tier1 + tier3: semua kandidat yg saran_iddesa-nya cocok dgn nagari
    // ini (geocoding alamat), dipisah ke tier1/tier3 berdasarkan status.
    const { data: dataNagari, error: errNagari } = await supabase
      .from("bencana_mitra")
      .select(KOLOM)
      .eq("saran_iddesa", iddesa)
      .order("nama");
    if (errNagari) return NextResponse.json({ error: errNagari.message }, { status: 500 });

    const rowsNagari = (dataNagari ?? []) as MitraCalon[];
    const tier1 = rowsNagari.filter((m) => m.status_seleksi === "Diterima");
    const tier3 = rowsNagari.filter((m) => m.status_seleksi !== "Diterima");
    const idTier1 = new Set(tier1.map((m) => m.id));

    // tier2: kandidat Diterima di kecamatan yg sama (bisa beda nagari),
    // disaring manual krn format alamat_kecamatan tidak seragam.
    const { data: dataKec, error: errKec } = await supabase
      .from("bencana_mitra")
      .select(KOLOM)
      .eq("status_seleksi", "Diterima")
      .order("nama")
      .limit(2000);
    if (errKec) return NextResponse.json({ error: errKec.message }, { status: 500 });

    const tier2 = ((dataKec ?? []) as MitraCalon[]).filter(
      (m) => !idTier1.has(m.id) && bersihkanKecamatan(m.alamat_kecamatan) === kecamatanBersih
    );

    return NextResponse.json({
      tier1,
      tier2,
      tier3,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
