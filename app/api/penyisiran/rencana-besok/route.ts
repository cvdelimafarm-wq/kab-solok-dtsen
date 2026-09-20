// app/api/penyisiran/rencana-besok/route.ts
//
// Daftar keluarga berstatus "jadwalkan_besok" DENGAN tanggal_rencana_
// kunjungan = BESOK (WIB) -- isi modal saat kartu StatTile "📅 Dijadwalkan
// Besok" (app/seruti/penyisiran-usaha.tsx) diklik. Cuma kolom yg dibutuhkan
// modal (nama keluarga + kode SLS 16 digit/idsubsls, lihat komentar
// "idsubsls 16 digit" di migrasi 20260917_fix_idsubsls_apostrof_persisten.sql)
// -- TIDAK memuat NIK/Nomor KK sama spt /api/penyisiran/list.
//
// Scoping SAMA PERSIS pola /api/penyisiran/list & /summary:
//  - role "penyisiran_petugas" (login personal): dibatasi wilayah alokasi
//    sendiri (buildOrFilterWilayah) -- utk PPL biasa ini otomatis berarti
//    "yang SAYA jadwalkan" krn alokasi wilayah eksklusif per petugas; utk
//    PML berarti gabungan seluruh PPL yg diawasinya (sama spt StatTile-nya
//    sendiri, konsisten dgn angka yg diklik).
//  - role "penyisiran" (PIN admin, tab Monitoring): tanpa batasan wilayah,
//    lihat SEMUA yg terjadwal besok se-kabupaten.
//
// Dibatasi 500 baris (jauh di atas kuota 8/hari/petugas, cukup lega utk
// kebutuhan admin PIN yg melihat gabungan semua petugas sekaligus) --
// bukan dipaginasi penuh spt /list krn dipakai modal ringkas, bukan tabel
// utama.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionRole, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { ambilWilayahAlokasi, buildOrFilterWilayah, daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATAS_BARIS = 500;
const KOLOM = "kode_identitas, idsubsls, nama_kk, nama_anggota_keluarga, nagari_nama, sls_nama, alamat";

// Tanggal BESOK (WIB) -- formula SAMA dgn tanggalBesokJakarta() di
// /api/penyisiran/update & filter RPC penyisiran_summary(), supaya baris
// yg dikembalikan di sini SELALU cocok dgn angka "direncanakan_besok" yg
// ditampilkan StatTile.
function tanggalBesokJakarta(): string {
  const jakartaMs = Date.now() + 7 * 60 * 60 * 1000;
  const jakarta = new Date(jakartaMs);
  jakarta.setUTCDate(jakarta.getUTCDate() + 1);
  return jakarta.toISOString().slice(0, 10);
}

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

  const tanggalBesok = tanggalBesokJakarta();

  let query = supabase
    .from("penyisiran_usaha")
    .select(KOLOM, { count: "exact" })
    .eq("status_kunjungan", "jadwalkan_besok")
    .eq("tanggal_rencana_kunjungan", tanggalBesok);

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
    const filterWilayah = buildOrFilterWilayah(pilihan);
    if (!filterWilayah) {
      return NextResponse.json({ rows: [], total: 0, tanggal: tanggalBesok });
    }
    query = query.or(filterWilayah);
  }

  query = query.order("nagari_nama", { ascending: true }).order("nama_kk", { ascending: true }).limit(BATAS_BARIS);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, tanggal: tanggalBesok });
}
