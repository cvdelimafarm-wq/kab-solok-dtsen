// app/api/penyisiran/list/route.ts
//
// Daftar keluarga (dipaginasi) utk panel kiri lembar pengecekan, dgn
// filter kecamatan/nagari/status/pencarian teks. Butuh token sesi valid.
// TIDAK PERNAH mengembalikan NIK/Nomor KK -- kolom itu memang tidak ada
// sama sekali di tabel penyisiran_usaha (sudah dibuang sejak di script
// Python), jadi tidak mungkin kebocor lewat sini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const KOLOM =
  "kode_identitas, idsubsls, kec_kode, kec_nama, nagari_kode, nagari_nama, " +
  "sls_kode, sls_nama, subsls_kode, nama_kk, alamat, lat, lng, " +
  "bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor, " +
  "dtsen_lapangan_usaha, catatan_sensus, status_kunjungan, catatan_petugas, updated_at";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req))) {
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
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  if (!kec && !nagari && !q) {
    // Jangan biarkan query tanpa filter sama sekali menyapu SEMUA baris --
    // panel filter di client mewajibkan pilih kecamatan dulu, tapi dijaga
    // juga di sini kalau-kalau dipanggil langsung.
    return NextResponse.json(
      { error: "Pilih kecamatan (atau isi pencarian) terlebih dahulu." },
      { status: 400 }
    );
  }

  let query = supabase.from("penyisiran_usaha").select(KOLOM, { count: "exact" });
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (status) query = query.eq("status_kunjungan", status);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(`nama_kk.ilike.${like},alamat.ilike.${like},kode_identitas.ilike.${like}`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order("nagari_nama", { ascending: true }).order("nama_kk", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
