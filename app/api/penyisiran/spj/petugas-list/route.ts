// app/api/penyisiran/spj/petugas-list/route.ts
//
// Daftar petugas yang bisa ditautkan ke Surat Tugas -- dipakai
// dropdown/checklist "tautkan ke petugas" di form upload Surat Tugas & di
// Langkah 1 Print Builder (Cetak SPJ). HANYA bisa diakses pengelola (lihat
// pastikanPengelolaSpj di lib/spjAuth.ts), krn daftar ini menyingkap nama
// SEMUA petugas, bukan cuma milik sendiri.
//
// SENGAJA di-dedupe per NAMA (bukan sekadar gabung petugas_penyisiran_akun
// + tetangga_akun apa adanya) -- setiap petugas TERNYATA punya akun di
// KEDUA tabel dgn nama identik (30/30 tumpang tindih persis, dicek lgs ke
// DB), tapi SELURUH data SPJ (surat_tugas_petugas, visum, kwitansi,
// laporan, dokumentasi, surat keterangan) SELALU tercatat di bawah jenis
// "penyisiran" -- jenis "tetangga" nihil sama sekali utk SPJ. Kalau
// dibiarkan apa adanya, tiap nama muncul 2x di checklist (lihat screenshot
// laporan user: "Lidya Rahmawati Amsah (Petugas Penyisiran)" DAN
// "(Tetangga/Lainnya)" utk orang yg SAMA) -- membingungkan & berisiko
// pengelola menautkan ST ke akun "tetangga" yg keliru (memecah SPJ 1 orang
// jadi 2 identitas). Jadi utk keperluan SPJ, akun "tetangga" praktis tidak
// relevan -- daftar ini HANYA mengembalikan akun penyisiran; kalau
// (secara teori) ada nama yg CUMA py akun tetangga (tidak py padanan
// penyisiran), tetap disertakan (drpd org itu hilang total dari daftar)
// tapi ini belum pernah terjadi pada data yg ada.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    return NextResponse.json(
      { error: "Fitur ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }

  const [{ data: penyisiran, error: errPenyisiran }, { data: tetangga, error: errTetangga }] = await Promise.all([
    supabase.from("petugas_penyisiran_akun").select("id, nama").eq("aktif", true).order("nama", { ascending: true }),
    supabase.from("tetangga_akun").select("id, nama").eq("aktif", true).order("nama", { ascending: true }),
  ]);
  if (errPenyisiran) return NextResponse.json({ error: errPenyisiran.message }, { status: 500 });
  if (errTetangga) return NextResponse.json({ error: errTetangga.message }, { status: 500 });

  // Dedupe per nama -- utamakan akun penyisiran (satu2nya yg benar2
  // dipakai utk SPJ), akun tetangga cuma dipakai kalau nama itu TIDAK py
  // padanan penyisiran sama sekali.
  const namaSudahAda = new Set<string>();
  const hasil: { jenis: "penyisiran" | "tetangga"; id: number; nama: string; label: string }[] = [];
  for (const p of penyisiran ?? []) {
    namaSudahAda.add(p.nama);
    hasil.push({ jenis: "penyisiran", id: p.id, nama: p.nama, label: p.nama });
  }
  for (const p of tetangga ?? []) {
    if (namaSudahAda.has(p.nama)) continue;
    hasil.push({ jenis: "tetangga", id: p.id, nama: p.nama, label: p.nama });
  }
  hasil.sort((a, b) => a.nama.localeCompare(b.nama));

  return NextResponse.json({ petugas: hasil });
}
