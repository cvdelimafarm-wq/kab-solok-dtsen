// app/api/penyisiran/alokasi/submit/route.ts
//
// Menyimpan checklist SLS/Jorong yang dipilih PPL penyisiran (maks 5, tab
// "Alokasi Sampel") -- REPLACE penuh (hapus pilihan lama punya petugas ybs,
// lalu insert yang baru) krn cuma ada SATU set pilihan aktif per petugas,
// bukan riwayat berlapis. SLS BOLEH dipilih lebih dari 1 petugas (sudah
// dikonfirmasi user) -- makanya unique constraint di tabel cuma
// (petugas_id, sls_key), BUKAN sls_key sendirian.
//
// sls_key yang dikirim client di-RESOLVE ulang di server lewat RPC
// penyisiran_alokasi_resolve_sls (bukan percaya nama kec/nagari/sls dari
// body request) -- mencegah data sampah/palsu kalau ada yang iseng
// panggil endpoint ini langsung.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_PILIHAN = 5;

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const slsKeysRaw = Array.isArray(body?.sls_keys) ? body.sls_keys : null;
  if (!slsKeysRaw) {
    return NextResponse.json({ error: "Data pilihan tidak valid." }, { status: 400 });
  }
  const slsKeys = Array.from(
    new Set(slsKeysRaw.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0))
  );
  if (slsKeys.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 SLS/Jorong." }, { status: 400 });
  }
  if (slsKeys.length > MAKS_PILIHAN) {
    return NextResponse.json({ error: `Maksimal ${MAKS_PILIHAN} SLS/Jorong.` }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: resolved, error: resolveErr } = await supabase.rpc("penyisiran_alokasi_resolve_sls", {
    p_sls_keys: slsKeys,
  });
  if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });
  if (!resolved || resolved.length === 0) {
    return NextResponse.json({ error: "SLS/Jorong yang dipilih tidak ditemukan/tidak valid." }, { status: 400 });
  }

  const { error: delErr } = await supabase.from("penyisiran_alokasi_pilihan").delete().eq("petugas_id", petugasId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const rows = resolved.map((r: Record<string, string>) => ({
    petugas_id: petugasId,
    sls_key: r.sls_key,
    kec_kode: r.kec_kode,
    kec_nama: r.kec_nama,
    nagari_kode: r.nagari_kode,
    nagari_nama: r.nagari_nama,
    sls_kode: r.sls_kode,
    sls_nama: r.sls_nama,
  }));
  const { error: insErr } = await supabase.from("penyisiran_alokasi_pilihan").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, jumlah_tersimpan: rows.length });
}
