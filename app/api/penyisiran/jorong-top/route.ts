// app/api/penyisiran/jorong-top/route.ts
//
// Daftar TOP N kombinasi Nagari+Jorong (Sub SLS) dgn jumlah potensi kasus
// TERBANYAK, DI DALAM satu kecamatan (param `kec`, wajib) -- dipakai utk
// banner "saran Target Konfirmasi Jorong" di tab Identifikasi Jorong &
// Identifikasi Tetangga/Lainnya (app/penyisiran/identifikasi-jorong.tsx &
// identifikasi-tetangga.tsx): begitu Kecamatan dipilih, daftar ini
// dimunculkan supaya petugas/tetangga tahu Jorong mana yg diprioritaskan
// dulu -- klik salah satu baris langsung mengisi filter Nagari+Sub SLS
// sekaligus (lihat handleLoncatJorong di kedua file tsx tsb).
//
// Diagregasi di JS (bukan RPC/group-by SQL), pola sama dgn
// /api/penyisiran/identifikasi-subsls -- jumlah baris per kecamatan masih
// wajar (ribuan, bukan puluhan ribu), jadi tidak perlu fungsi database baru
// cuma utk ini.
//
// Role gate SAMA PERSIS dgn /api/penyisiran/subsls (dipakai bersama
// beberapa tab), krn endpoint ini juga dipakai lintas tab Identifikasi
// Jorong & Identifikasi Tetangga.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Jumlah Jorong/Sub SLS yg disarankan jadi target konfirmasi -- diminta
// user 8 (revisi dari usulan awal 5). Ganti nilai ini kalau kebutuhannya
// berubah lagi -- teks banner di kedua file tsx (JUMLAH_TARGET_JORONG)
// ikut disesuaikan manual krn cuma dipakai utk teks, bukan baca dari sini.
const TOP_N = 8;

export async function GET(req: NextRequest) {
  if (
    !verifySession(extractBearer(req), [
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

  const { data, error } = await supabase
    .from("penyisiran_usaha")
    .select("idsubsls, nagari_kode, nagari_nama, sls_nama, subsls_kode")
    .eq("kec_kode", kec);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = new Map<
    string,
    { idsubsls: string; nagari_kode: string | null; nagari_nama: string | null; label: string; jumlah: number }
  >();
  for (const row of data ?? []) {
    const key = row.idsubsls;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.jumlah += 1;
    } else {
      map.set(key, {
        idsubsls: key,
        nagari_kode: row.nagari_kode ?? null,
        nagari_nama: row.nagari_nama ?? null,
        // Kombinasi "Nama Nagari · Nama Jorong-nomor" -- sesuai permintaan
        // user (saran diambil dari kombinasi nama nagari & jorong, bukan
        // idsubsls mentah).
        label: `${row.nagari_nama ?? ""} · ${row.sls_nama ?? ""}-${row.subsls_kode ?? ""}`,
        jumlah: 1,
      });
    }
  }

  const hasil = Array.from(map.values())
    .sort((a, b) => b.jumlah - a.jumlah)
    .slice(0, TOP_N);

  return NextResponse.json(hasil);
}
