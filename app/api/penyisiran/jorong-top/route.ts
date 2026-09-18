// app/api/penyisiran/jorong-top/route.ts
//
// Daftar kombinasi Nagari+Jorong (Sub SLS) dgn jumlah potensi kasus
// TERBANYAK, DI DALAM satu kecamatan (param `kec`, wajib) -- dipakai utk
// banner "saran Target Konfirmasi Jorong" di tab Identifikasi Jorong &
// Identifikasi Tetangga/Lainnya (app/penyisiran/identifikasi-jorong.tsx &
// identifikasi-tetangga.tsx): begitu Kecamatan dipilih, daftar ini
// dimunculkan supaya petugas/tetangga tahu Jorong mana yg diprioritaskan
// dulu -- klik salah satu baris langsung mengisi filter Nagari+Sub SLS
// sekaligus (lihat handleLoncatJorong di kedua file tsx tsb).
//
// Jumlah baris yg ditampilkan MENYESUAIKAN target petugas (tabel
// petugas_target, kolom target_identifikasi_jumlah -- diisi pengelola di
// tab Manajemen Target, lihat app/penyisiran/manajemen-target.tsx) DITAMBAH
// 3 SLS "opsi lain" sbg cadangan. Mis. target diisi 5 -> daftar yg
// dikembalikan 5+3 = 8 baris, tapi teks banner (dibangun di frontend, bukan
// di sini) tetap bilang "5 Jorong/Sub SLS" krn itu target WAJIB-nya, 3
// sisanya cuma opsi tambahan.
//
// Target petugas HANYA berlaku kalau sesi yg login berperan
// "identifikasi_jorong" (personal login ke tabel petugas_penyisiran_akun --
// tabel yg SAMA dgn foreign key petugas_target.petugas_id, lihat
// supabase/migrations/20260918_petugas_target.sql). Role lain (mis.
// "identifikasi_tetangga", akun personalnya di tabel tetangga_akun yg
// terpisah, tidak match ke petugas_target sama sekali) selalu pakai
// TARGET_DEFAULT.
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
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SLS/Jorong "opsi lain" yg ditambahkan DI LUAR target wajib -- selalu +3
// di atas target, sesuai permintaan user ("misal target 5, maka baris yg
// muncul 5+3 = 8").
const TAMBAHAN_OPSI_LAIN = 3;
// Dipakai kalau petugas yg login belum diberi target sama sekali di tab
// Manajemen Target (target_identifikasi_jumlah masih NULL/0), ATAU sesi
// bukan role "identifikasi_jorong" (mis. dipakai dari tab Identifikasi
// Tetangga) -- supaya banner tetap tampil dgn angka yg masuk akal.
const TARGET_DEFAULT = 5;

// Role token berformat "role.....sig" -- bagian pertama SELALU nama role,
// baik format lama (3 bagian) maupun format personal (4 bagian). Tidak
// perlu fungsi baru di lib/penyisiranAuth.ts cuma utk ini.
function ambilRoleToken(token: string): string {
  return token.split(".")[0] || "";
}

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
  if (!kec) return NextResponse.json({ target: TARGET_DEFAULT, jorong: [] });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Ambil target wajib petugas (kalau berlaku) -- lihat komentar di atas.
  let target = TARGET_DEFAULT;
  if (token && ambilRoleToken(token) === "identifikasi_jorong") {
    const petugasId = getSessionSubject(token);
    if (petugasId) {
      const { data: t } = await supabase
        .from("petugas_target")
        .select("target_identifikasi_jumlah")
        .eq("petugas_id", petugasId)
        .maybeSingle();
      if (t?.target_identifikasi_jumlah != null && t.target_identifikasi_jumlah > 0) {
        target = t.target_identifikasi_jumlah;
      }
    }
  }
  const jumlahDitampilkan = target + TAMBAHAN_OPSI_LAIN;

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
    .slice(0, jumlahDitampilkan);

  return NextResponse.json({ target, jorong: hasil });
}
