// app/api/penyisiran/spj/hari-kerja-saya/route.ts
//
// GET -- daftar TANGGAL "hari kerja" yg sudah ditag akun SPJ yg login,
// dipakai kartu monitoring "Kelengkapan per Jenis Dokumen" (Administrasi,
// non-pengelola, lihat app/penyisiran/spj-monitoring.tsx
// KelengkapanDokumenSaya()) sbg PENYEBUT (denominator) kelengkapan --
// lihat lib/spjMatriks.ts hitungKelengkapanPerJenis().
//
// - jenis "penyisiran" (akun petugas_penyisiran_akun): tanggal diambil
//   LANGSUNG dari penyisiran_alokasi_hari_tugas (kartu 🗓 Identifikasi Hari
//   Tugas di tab Perencanaan Lapangan) milik akun ybs -- HANYA baris yg
//   masih aktif (belum dibatalkan_oleh super user) & masih dlm periode
//   monitoring (tanggalDalamPeriodeHariTugas, seharusnya selalu true krn
//   PATCH endpoint itu sudah membatasinya begitu, tapi dicek ulang di sini
//   sbg defense in depth).
// - jenis "tetangga" (akun tetangga_akun): TIDAK PERNAH BISA mengisi
//   penyisiran_alokasi_hari_tugas sama sekali -- tabel itu py FK KHUSUS ke
//   petugas_penyisiran_akun(id) & rute PATCH-nya
//   (.../alokasi/hari-tugas/route.ts) cuma menerima role
//   "penyisiran_petugas", jadi akun tetangga scr FISIK/FK tidak py cara
//   menandai hari kerja di sana sampai kapan pun. Sbg FALLBACK (spy kartu
//   kelengkapan tetap bisa dihitung, bukan selalu kosong/NaN), tanggalnya
//   diturunkan dari rentang Surat Tugas yg ditautkan ke akun ybs (SEMUA
//   tanggal kalender dlm tanggal_mulai..tanggal_selesai tiap ST yg
//   ditautkan). Per skrg (2026-09) belum ada satu pun akun tetangga yg py
//   data SPJ apa pun (dipastikan lewat investigasi arsitektur), jadi
//   fallback ini murni jaga2 & belum teruji di data nyata -- kalau nanti
//   ternyata tdk sesuai kebutuhan sebenarnya, cukup ganti bagian ini saja.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession } from "@/lib/spjAuth";
import { tanggalDalamPeriodeHariTugas } from "@/lib/penyisiranHari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

function rentangTanggal(mulai: string, selesai: string): string[] {
  const hasil: string[] = [];
  let d = new Date(mulai + "T00:00:00Z");
  const akhir = new Date(selesai + "T00:00:00Z");
  while (d.getTime() <= akhir.getTime()) {
    hasil.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return hasil;
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  if (session.jenis === "penyisiran") {
    const { data, error } = await supabase
      .from("penyisiran_alokasi_hari_tugas")
      .select("tanggal, dibatalkan_oleh")
      .eq("petugas_id", session.petugasId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const tanggal = (data ?? [])
      .filter((r: { dibatalkan_oleh: string | null }) => !r.dibatalkan_oleh)
      .map((r: { tanggal: string }) => r.tanggal)
      .filter((t: string) => tanggalDalamPeriodeHariTugas(t));

    return NextResponse.json({ tanggal, sumber: "hari_tugas" });
  }

  // jenis "tetangga" -- fallback rentang ST, lihat komentar panjang di atas file ini.
  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) return NextResponse.json({ tanggal: [], sumber: "fallback_st_range" });

  const { data: stList, error: errSt } = await supabase
    .from("spj_surat_tugas")
    .select("tanggal_mulai, tanggal_selesai")
    .in("id", ids);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });

  const set = new Set<string>();
  for (const st of (stList ?? []) as { tanggal_mulai: string; tanggal_selesai: string }[]) {
    for (const t of rentangTanggal(st.tanggal_mulai, st.tanggal_selesai)) set.add(t);
  }

  return NextResponse.json({ tanggal: Array.from(set).sort(), sumber: "fallback_st_range" });
}
