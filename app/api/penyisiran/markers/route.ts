// app/api/penyisiran/markers/route.ts
//
// Versi RINGAN (cuma kolom yang dibutuhkan peta) dari daftar keluarga yang
// sedang difilter, TIDAK dipaginasi (sampai batas MAX_MARKERS) supaya peta
// menampilkan semua titik yang cocok, bukan cuma satu halaman tabel. Butuh
// role "penyisiran" atau "penyisiran_petugas".
//
// KHUSUS role "penyisiran_petugas": SELALU ditambah filter wilayah alokasi
// petugas ybs, sama persis polanya dgn /api/penyisiran/list/route.ts --
// lihat komentar lengkap & lib/wilayahAlokasiPetugas.ts di sana.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionRole, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { ambilWilayahAlokasi, buildOrFilterWilayah, daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKERS = 5000;

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const sp = req.nextUrl.searchParams;
  const kec = sp.get("kec") || "";
  const nagari = sp.get("nagari") || "";
  const subsls = sp.get("subsls") || ""; // idsubsls (16 digit), dropdown filter tahap 3
  const status = sp.get("status") || "";

  let filterWilayah: string | null = null;
  if (getSessionRole(token) === "penyisiran_petugas") {
    const petugasId = Number(getSessionSubject(token));
    if (!Number.isFinite(petugasId) || petugasId <= 0) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    let daftarId: number[];
    try {
      ({ ids: daftarId } = await daftarIdUntukSesi(supabase, petugasId));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memuat data pengawasan." }, { status: 500 });
    }
    let pilihan;
    try {
      pilihan = await ambilWilayahAlokasi(supabase, daftarId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memuat wilayah alokasi." }, { status: 500 });
    }
    filterWilayah = buildOrFilterWilayah(pilihan);
    if (!filterWilayah) {
      return NextResponse.json({ markers: [], capped: false, belumAdaWilayah: true });
    }
  } else if (!kec) {
    return NextResponse.json({ error: "Pilih kecamatan terlebih dahulu." }, { status: 400 });
  }

  // Baris nonaktif (hasil sisir HGBB Sep 2026, lihat kolom `aktif` di
  // migrasi terkait) tidak lagi ditampilkan sbg target -- reversibel,
  // bukan hapus permanen.
  let query = supabase
    .from("penyisiran_usaha")
    .select("kode_identitas, nama_kk, alamat, nagari_nama, lat, lng, status_kunjungan")
    .eq("aktif", true)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .limit(MAX_MARKERS);
  if (filterWilayah) query = query.or(filterWilayah);
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (subsls) query = query.eq("idsubsls", subsls);
  if (status) query = query.eq("status_kunjungan", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ markers: data ?? [], capped: (data?.length ?? 0) >= MAX_MARKERS });
}
