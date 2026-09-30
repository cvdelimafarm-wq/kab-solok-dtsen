// app/api/bencana/master-petugas/route.ts
//
// GET -> daftar lengkap "Master Petugas": data identitas + demografi semua
// petugas (organik & mitra), dipakai oleh tab "Master Petugas" di halaman
// /bencana untuk browsing & filter (read-only, tidak ada aksi tulis di sini).
//
// Domisili (alamat_kecamatan/alamat_nagari) ditampilkan dari kolom self-report
// yang sudah ada di bencana_petugas. Kolom alamat_jorong TIDAK disimpan
// langsung -- di-JOIN LIVE dari bencana_wilayah lewat idsubsls_1303 (Sub SLS
// hasil matching koordinat mitra saat rekrutmen), supaya konsisten dengan
// data koordinat & tidak drift kalau bencana_wilayah diperbarui. Kalau
// idsubsls_1303 tidak ada / tidak match, alamat_jorong dikembalikan null dan
// kecamatan/nagari HASIL JOIN (kecamatan_wilayah/nagari_wilayah) juga null --
// frontend lalu fallback ke alamat_kecamatan/alamat_nagari self-report.
//
// Demografi (umur, jenis_kelamin, pendidikan, pekerjaan,
// bisa_mengendarai_motor, punya_kendaraan_bermotor) berasal dari data
// rekrutmen mitra (xlsx "Data Mitra dengan Koordinat"), di-backfill sekali
// lewat matching nama -- lihat kolom komentar di migrasi
// bencana_petugas_master_data_demografi. Untuk petugas organik (BPS), field
// ini kosong (bukan bagian rekrutmen mitra).
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.

import { NextResponse } from "next/server";
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

  const { data: petugas, error } = await supabase
    .from("bencana_petugas")
    .select(
      "id, nama, status_kepegawaian, peran, aktif, alamat_kecamatan, alamat_nagari, no_hp, idsubsls_1303, umur, jenis_kelamin, pendidikan, pekerjaan, bisa_mengendarai_motor, punya_kendaraan_bermotor, lokasi_status"
    )
    .order("nama");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const idsubslsList = Array.from(
    new Set((petugas ?? []).map((p) => p.idsubsls_1303).filter((v): v is string => !!v))
  );

  let wilayahMap = new Map<string, { kecamatan: string; nagari: string; sls: string }>();
  if (idsubslsList.length > 0) {
    const { data: wilayah, error: errWilayah } = await supabase
      .from("bencana_wilayah")
      .select("idsubsls, kecamatan, nagari, sls")
      .in("idsubsls", idsubslsList);
    if (errWilayah) return NextResponse.json({ error: errWilayah.message }, { status: 500 });
    wilayahMap = new Map((wilayah ?? []).map((w) => [w.idsubsls as string, w]));
  }

  const data = (petugas ?? []).map((p) => {
    const w = p.idsubsls_1303 ? wilayahMap.get(p.idsubsls_1303) : undefined;
    return {
      id: p.id,
      nama: p.nama,
      status_kepegawaian: p.status_kepegawaian,
      peran: p.peran,
      aktif: p.aktif,
      no_hp: p.no_hp,
      alamat_kecamatan: p.alamat_kecamatan,
      alamat_nagari: p.alamat_nagari,
      // hasil join koordinat (Sub SLS domisili) -- null kalau tidak match
      kecamatan_wilayah: w?.kecamatan ?? null,
      nagari_wilayah: w?.nagari ?? null,
      alamat_jorong: w?.sls ?? null,
      idsubsls_1303: p.idsubsls_1303,
      lokasi_status: p.lokasi_status,
      umur: p.umur,
      jenis_kelamin: p.jenis_kelamin,
      pendidikan: p.pendidikan,
      pekerjaan: p.pekerjaan,
      bisa_mengendarai_motor: p.bisa_mengendarai_motor,
      punya_kendaraan_bermotor: p.punya_kendaraan_bermotor,
    };
  });

  return NextResponse.json({ data });
}
