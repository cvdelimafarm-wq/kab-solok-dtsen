// app/api/penyisiran/export/route.ts
//
// Unduh rekap checklist (semua baris yang cocok filter, bukan cuma 1
// halaman tabel) sebagai file CSV. Dibuka lewat navigasi langsung browser
// (bukan fetch), jadi token dikirim lewat query string ?token=... (lihat
// extractBearer di lib/penyisiranAuth.ts) -- bukan header Authorization.
// Butuh role "penyisiran".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 50000;

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_LABEL: Record<string, string> = {
  belum: "Belum Dikunjungi",
  ditemukan: "Usaha Ditemukan",
  tidak_ditemukan: "Usaha Tidak Ditemukan",
  tidak_bisa: "Tidak Bisa Ditemui / Pindah",
  sudah_didata_se2026: "Sudah Didata di SE2026",
};

const IDENTIFIKASI_LABEL: Record<string, string> = {
  belum: "Belum Diisi PPL",
  ada: "PPL: Ada Usaha",
  tidak_ada: "PPL: Tidak Ada Usaha",
  ragu: "PPL: Ragu-ragu",
  tidak_ditemukan: "PPL: Tidak Ditemukan (=Sudah Didata SE2026)",
};

interface ExportRow {
  kode_identitas: string;
  kec_nama: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  nama_kk: string | null;
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  bukti_dutp: boolean;
  bukti_dtsen: boolean;
  bukti_pnm: boolean;
  pnm_sektor: string | null;
  dtsen_lapangan_usaha: string | null;
  status_kunjungan: string;
  info_ppl: boolean;
  info_jorong: boolean;
  info_tetangga: boolean;
  identifikasi_ppl: string;
  identifikasi_ppl_at: string | null;
  catatan_petugas: string | null;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
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
  const status = sp.get("status") || "";

  let query = supabase
    .from("penyisiran_usaha")
    .select(
      "kode_identitas, kec_nama, nagari_nama, sls_nama, nama_kk, alamat, lat, lng, " +
        "bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, dtsen_lapangan_usaha, " +
        "status_kunjungan, info_ppl, info_jorong, info_tetangga, identifikasi_ppl, " +
        "identifikasi_ppl_at, catatan_petugas, updated_at"
    )
    .order("nagari_nama")
    .order("nama_kk")
    .limit(MAX_ROWS);
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (status) query = query.eq("status_kunjungan", status);

  const { data, error } = await query.returns<ExportRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "ID",
    "Kecamatan",
    "Nagari",
    "SLS/Jorong",
    "Nama Kepala Keluarga",
    "Alamat",
    "Latitude",
    "Longitude",
    "Bukti DUTP",
    "Bukti DTSEN",
    "Bukti PNM Mekar",
    "Sektor PNM",
    "Lapangan Usaha DTSEN",
    "Status Pengecekan",
    "Info PPL",
    "Info Jorong",
    "Info Tetangga",
    "Identifikasi PPL",
    "Identifikasi PPL Diisi Pada",
    "Catatan Petugas",
    "Terakhir Diperbarui",
  ];
  const lines = [header.join(",")];
  for (const r of data ?? []) {
    lines.push(
      [
        r.kode_identitas,
        r.kec_nama,
        r.nagari_nama,
        r.sls_nama,
        r.nama_kk,
        r.alamat,
        r.lat,
        r.lng,
        r.bukti_dutp ? "Ya" : "Tidak",
        r.bukti_dtsen ? "Ya" : "Tidak",
        r.bukti_pnm ? "Ya" : "Tidak",
        r.pnm_sektor,
        r.dtsen_lapangan_usaha,
        STATUS_LABEL[r.status_kunjungan as string] ?? r.status_kunjungan,
        r.info_ppl ? "Ada" : "Tidak",
        r.info_jorong ? "Ada" : "Tidak",
        r.info_tetangga ? "Ada" : "Tidak",
        IDENTIFIKASI_LABEL[r.identifikasi_ppl as string] ?? r.identifikasi_ppl,
        r.identifikasi_ppl_at,
        r.catatan_petugas,
        r.updated_at,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM biar Excel baca UTF-8 dgn benar

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checklist_penyisiran_usaha.csv"`,
    },
  });
}
