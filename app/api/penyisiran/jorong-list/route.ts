// app/api/penyisiran/jorong-list/route.ts
//
// Daftar keluarga versi RINGAN utk tab "Identifikasi Jorong" -- sama
// kolomnya dgn /api/penyisiran/identifikasi-list (nama, alamat, wilayah,
// status identifikasi -- TANPA bukti DUTP/DTSEN/PNM atau koordinat GPS),
// bedanya di sini filter wilayahnya MANUAL (kec/nagari/subsls dari
// dropdown, sama pola dgn /api/penyisiran/list), BUKAN auto-scope ke
// alokasi pribadi -- krn petugas penyisiran tidak punya tabel alokasi
// wilayah spt PPL (lihat komentar lib/penyisiranAuth.ts soal role
// "identifikasi_jorong").
//
// Ikut mengembalikan identifikasi_ppl_oleh (nama yg terakhir mengisi)
// supaya petugas bisa lihat apakah keluarga ini sudah pernah diidentifikasi
// petugas lain sebelumnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const KOLOM =
  "kode_identitas, kec_kode, kec_nama, nagari_kode, nagari_nama, sls_nama, " +
  "nama_kk, nama_anggota_keluarga, alamat, identifikasi_ppl, identifikasi_ppl_at, identifikasi_ppl_oleh";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "identifikasi_jorong"])) {
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
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  if (!kec && !nagari && !q) {
    return NextResponse.json(
      { error: "Pilih kecamatan (atau isi pencarian) terlebih dahulu." },
      { status: 400 }
    );
  }

  // Baris nonaktif (hasil sisir HGBB Sep 2026, lihat kolom `aktif` di
  // migrasi terkait) tidak lagi ditampilkan sbg target -- reversibel,
  // bukan hapus permanen.
  let query = supabase.from("penyisiran_usaha").select(KOLOM, { count: "exact" }).eq("aktif", true);
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (subsls) query = query.eq("idsubsls", subsls);
  if (status) query = query.eq("identifikasi_ppl", status);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `nama_kk.ilike.${like},nama_anggota_keluarga.ilike.${like},alamat.ilike.${like},kode_identitas.ilike.${like}`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order("nagari_nama", { ascending: true }).order("nama_kk", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
