// app/api/penyisiran/alokasi/submit/route.ts
//
// Menyimpan checklist SLS/Jorong yang dipilih PPL penyisiran (maks 5, tab
// "Alokasi Sampel") -- REPLACE penuh (hapus pilihan lama punya petugas ybs,
// lalu insert yang baru) krn cuma ada SATU set pilihan aktif per petugas,
// bukan riwayat berlapis. SLS BOLEH dipilih lebih dari 1 petugas (sudah
// dikonfirmasi user) -- makanya unique constraint di tabel cuma
// (petugas_id, sls_key), BUKAN sls_key sendirian.
//
// Body: { pilihan: [{ sls_key: string, subsls_kode?: string[] }] } -- maks
// 5 ENTRI (dihitung per sls_key, BUKAN per subsls) krn fitur "unhide" per
// SUBSLS (lihat perencanaan-lapangan.tsx, WilayahSampelPanel) memecah 1
// Jorong jadi beberapa SUBSLS TAPI itu tetap dihitung 1 slot dari maks 5 --
// subsls_kode kosong/tidak dikirim = pilih SELURUH SLS/Jorong (perilaku
// lama). Kalau subsls_kode dikirim, tiap kodenya divalidasi ulang di server
// lewat RPC penyisiran_alokasi_dasar_subsls (memastikan kode itu benar
// milik SLS tsb) -- BUKAN percaya begitu saja dari client.
//
// sls_key sendiri jg di-RESOLVE ulang lewat RPC penyisiran_alokasi_resolve_sls
// (bukan percaya nama kec/nagari/sls dari body request) -- mencegah data
// sampah/palsu kalau ada yang iseng panggil endpoint ini langsung.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_PILIHAN = 5;

interface PilihanBodyEntry {
  sls_key: string;
  subsls_kode?: string[];
}

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

  // Terima bentuk baru { pilihan: [...] } -- fallback ke bentuk lama
  // { sls_keys: string[] } (kalau ada pemanggil lama yg belum diperbarui)
  // supaya tetap kompatibel, diperlakukan sbg pilih SELURUH SLS semua.
  let pilihanRaw: PilihanBodyEntry[] | null = null;
  if (Array.isArray(body?.pilihan)) {
    pilihanRaw = body.pilihan;
  } else if (Array.isArray(body?.sls_keys)) {
    pilihanRaw = body.sls_keys
      .filter((s: unknown): s is string => typeof s === "string")
      .map((sls_key: string) => ({ sls_key }));
  }
  if (!pilihanRaw) {
    return NextResponse.json({ error: "Data pilihan tidak valid." }, { status: 400 });
  }

  // Dedup by sls_key (entri terakhir menang kalau ada duplikat).
  const bySlsKey = new Map<string, string[] | undefined>();
  for (const p of pilihanRaw) {
    if (typeof p?.sls_key !== "string" || !p.sls_key.trim()) continue;
    const subsls = Array.isArray(p.subsls_kode)
      ? Array.from(
          new Set(p.subsls_kode.filter((s): s is string => typeof s === "string" && s.trim().length > 0))
        )
      : undefined;
    bySlsKey.set(p.sls_key, subsls && subsls.length > 0 ? subsls : undefined);
  }
  if (bySlsKey.size === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 SLS/Jorong." }, { status: 400 });
  }
  if (bySlsKey.size > MAKS_PILIHAN) {
    return NextResponse.json({ error: `Maksimal ${MAKS_PILIHAN} SLS/Jorong.` }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const slsKeys = Array.from(bySlsKey.keys());
  const { data: resolved, error: resolveErr } = await supabase.rpc("penyisiran_alokasi_resolve_sls", {
    p_sls_keys: slsKeys,
  });
  if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });
  if (!resolved || resolved.length === 0) {
    return NextResponse.json({ error: "SLS/Jorong yang dipilih tidak ditemukan/tidak valid." }, { status: 400 });
  }
  const resolvedBySlsKey = new Map((resolved as { sls_key: string }[]).map((r) => [r.sls_key, r]));

  // Validasi ulang subsls_kode (kalau ada) lewat RPC dasar_subsls -- pastikan
  // tiap kode BENAR milik sls_key tsb, jangan percaya array dari client.
  const rows: Record<string, unknown>[] = [];
  for (const [slsKey, subslsDiminta] of bySlsKey) {
    const r = resolvedBySlsKey.get(slsKey) as Record<string, string> | undefined;
    if (!r) continue; // sls_key tidak valid/tidak ditemukan -- lewati diam2 (spt versi lama)

    let subslsKodeList: string[] | null = null;
    if (subslsDiminta && subslsDiminta.length > 0) {
      const { data: subslsValid, error: subslsErr } = await supabase.rpc("penyisiran_alokasi_dasar_subsls", {
        p_sls_key: slsKey,
      });
      if (subslsErr) return NextResponse.json({ error: subslsErr.message }, { status: 500 });
      const kodeValid = new Set((subslsValid ?? []).map((s: { subsls_kode: string }) => s.subsls_kode));
      const cocok = subslsDiminta.filter((k) => kodeValid.has(k));
      if (cocok.length === 0) {
        return NextResponse.json(
          { error: `Sub SLS yang dipilih tidak valid untuk ${r.sls_nama}.` },
          { status: 400 }
        );
      }
      // Kalau semua SUBSLS di SLS ini kebetulan tercentang semua, simpan
      // sbg NULL (pilih seluruh SLS) -- setara secara data, lebih rapi &
      // konsisten dgn baris hasil Alokasi Otomatis/pilihan lama.
      subslsKodeList = cocok.length >= kodeValid.size ? null : cocok;
    }

    rows.push({
      petugas_id: petugasId,
      sls_key: r.sls_key,
      kec_kode: r.kec_kode,
      kec_nama: r.kec_nama,
      nagari_kode: r.nagari_kode,
      nagari_nama: r.nagari_nama,
      sls_kode: r.sls_kode,
      sls_nama: r.sls_nama,
      subsls_kode_list: subslsKodeList,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "SLS/Jorong yang dipilih tidak ditemukan/tidak valid." }, { status: 400 });
  }

  const { error: delErr } = await supabase.from("penyisiran_alokasi_pilihan").delete().eq("petugas_id", petugasId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("penyisiran_alokasi_pilihan").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, jumlah_tersimpan: rows.length });
}
