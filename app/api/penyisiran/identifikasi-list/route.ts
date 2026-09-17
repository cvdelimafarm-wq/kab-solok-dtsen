// app/api/penyisiran/identifikasi-list/route.ts
//
// Daftar keluarga versi RINGAN utk tab "Identifikasi PPL" -- kolom
// dibatasi (nama, alamat, wilayah, status identifikasi) supaya PIN yang
// dibagikan ke PPL/mantan pendata tidak ikut membuka rincian bukti
// DUTP/DTSEN/PNM Mekar atau koordinat GPS (itu tetap khusus tab
// Penyisiran Usaha, PIN yang beda). Menerima ketiga role token, sama
// seperti /api/penyisiran/identifikasi.
//
// Role "identifikasi_ppl" (login personal nama+tanggal lahir) TIDAK perlu
// filter kec/nagari manual -- daftar keluarga otomatis dibatasi ke ID Sub
// SLS yang memang dialokasikan ke PPL yang sedang login (tabel
// ppl_alokasi_idsls), diambil dari "subject" (id ppl_akun) yang terbawa
// di token. Kolom idsubsls pada penyisiran_usaha sempat mengandung
// awalan tanda kutip satu (artefak ekspor Excel, mis. "'130305...") --
// sudah dibersihkan langsung di database (lihat migrasi terkait), jadi
// perbandingan di sini memakai nilai idsubsls apa adanya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const KOLOM =
  "kode_identitas, kec_kode, kec_nama, nagari_kode, nagari_nama, sls_nama, " +
  "nama_kk, alamat, identifikasi_ppl, identifikasi_ppl_at";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "identifikasi", "identifikasi_ppl"])) {
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
  const status = sp.get("status") || ""; // filter nilai identifikasi_ppl, opsional
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const pplId = getSessionSubject(token); // hanya terisi utk role identifikasi_ppl

  let idsList: string[] = [];
  const scopedToPpl = Boolean(pplId);
  if (pplId) {
    const { data: alokasi, error: alokasiErr } = await supabase
      .from("ppl_alokasi_idsls")
      .select("idsubsls")
      .eq("ppl_id", pplId);
    if (alokasiErr) return NextResponse.json({ error: alokasiErr.message }, { status: 500 });
    idsList = (alokasi ?? []).map((r: { idsubsls: string }) => r.idsubsls);
    if (idsList.length === 0) {
      // PPL login sah, tapi tidak (lagi) punya alokasi ID Sub SLS apa pun.
      return NextResponse.json({ rows: [], total: 0, page, pageSize: PAGE_SIZE });
    }
  }

  if (!scopedToPpl && !kec && !nagari && !q) {
    return NextResponse.json(
      { error: "Pilih kecamatan (atau isi pencarian) terlebih dahulu." },
      { status: 400 }
    );
  }

  let query = supabase.from("penyisiran_usaha").select(KOLOM, { count: "exact" });
  if (scopedToPpl) query = query.in("idsubsls", idsList);
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (status) query = query.eq("identifikasi_ppl", status);
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
