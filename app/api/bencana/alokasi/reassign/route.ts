// app/api/bencana/alokasi/reassign/route.ts
//
// Plotting PPL manual per Sub SLS (bagian dari kertas kerja "Alokasi
// Petugas"). TIDAK ADA algoritma otomatis lagi -- setiap baris Sub SLS
// diplot satu per satu oleh admin lewat dropdown nama petugas, sesudah
// melihat skor beban awal & kedekatan wilayah di kertas kerja.
//
// POST { idsubsls, ppl_id }
//   -> tugaskan SATU Sub SLS (yg sudah termasuk wilayah sampel) ke petugas
//      pilihan admin. Petugas WAJIB berstatus mitra (aturan: "PPL wajib
//      mitra") dan belum berperan lain (PML/Korwil). Peran petugas itu
//      otomatis diset 'ppl' sesaat sebelum baris ditugaskan -- tidak lagi
//      mensyaratkan peran sudah 'ppl' sebelumnya (dulu itu hanya bisa
//      terjadi lewat auto-plotting, yg sekarang dihapus).
//
// POST { idsubsls, buka_kunci: true }
//   -> batalkan plotting Sub SLS ini (baris dihapus dari
//      bencana_alokasi_subsls). Kalau ini adalah plot TERAKHIR utk petugas
//      tsb, perannya dilepas lagi (peran=null) supaya nama itu bisa dipilih
//      ulang utk peran lain (PPL/PML/Korwil) di panel "Susunan Tim".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hitungJarakJalanMassal, haversineKm } from "@/lib/jarakJalan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls.trim() : "";
  if (!idsubsls) {
    return NextResponse.json({ error: "idsubsls wajib diisi." }, { status: 400 });
  }

  try {
    if (body?.buka_kunci === true) {
      const { data: existing } = await supabase
        .from("bencana_alokasi_subsls")
        .select("ppl_id")
        .eq("idsubsls", idsubsls)
        .maybeSingle();

      const { error } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (existing?.ppl_id) {
        const { count } = await supabase
          .from("bencana_alokasi_subsls")
          .select("id", { count: "exact", head: true })
          .eq("ppl_id", existing.ppl_id);
        if (!count) {
          await supabase.from("bencana_petugas").update({ peran: null }).eq("id", existing.ppl_id);
        }
      }

      return NextResponse.json({ ok: true, dibuka: true });
    }

    const pplId = typeof body?.ppl_id === "number" ? body.ppl_id : null;
    if (!pplId) {
      return NextResponse.json({ error: "ppl_id wajib diisi." }, { status: 400 });
    }

    const { data: sampel, error: errSampel } = await supabase
      .from("bencana_sampel_subsls")
      .select("termasuk_sampel")
      .eq("idsubsls", idsubsls)
      .maybeSingle();
    if (errSampel) return NextResponse.json({ error: errSampel.message }, { status: 500 });
    if (!sampel?.termasuk_sampel) {
      return NextResponse.json(
        { error: "Sub SLS ini belum dicentang sebagai wilayah sampel. Centang dulu di langkah 1." },
        { status: 400 }
      );
    }

    const { data: ppl, error: errPpl } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran, status_kepegawaian, aktif, lat, lng, lokasi_status")
      .eq("id", pplId)
      .maybeSingle();
    if (errPpl) return NextResponse.json({ error: errPpl.message }, { status: 500 });
    if (!ppl) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });
    if (!ppl.aktif) {
      return NextResponse.json({ error: `${ppl.nama} berstatus tidak aktif.` }, { status: 400 });
    }
    if (ppl.status_kepegawaian !== "mitra") {
      return NextResponse.json(
        { error: `${ppl.nama} berstatus ${ppl.status_kepegawaian}. Aturan: PPL wajib mitra.` },
        { status: 400 }
      );
    }
    if (ppl.peran && ppl.peran !== "ppl") {
      return NextResponse.json(
        { error: `${ppl.nama} sudah berperan sebagai ${ppl.peran}. Tidak bisa merangkap sebagai PPL.` },
        { status: 400 }
      );
    }

    if (ppl.peran !== "ppl") {
      const { error: errPeran } = await supabase.from("bencana_petugas").update({ peran: "ppl" }).eq("id", pplId);
      if (errPeran) return NextResponse.json({ error: errPeran.message }, { status: 500 });
    }

    let jarak_km: number | null = null;
    let jarak_metode: string | null = null;
    let jarak_status = "tanpa_data";

    if (ppl.lokasi_status === "riil" && typeof ppl.lat === "number" && typeof ppl.lng === "number") {
      const { data: centroidRows } = await supabase.rpc("bencana_subsls_titik_jarak");
      const titik = ((centroidRows ?? []) as { idsubsls: string; lat: number | null; lng: number | null }[]).find(
        (c) => c.idsubsls === idsubsls
      );
      if (titik && typeof titik.lat === "number" && typeof titik.lng === "number") {
        const asal = { lat: ppl.lat, lng: ppl.lng };
        const tujuan = { lat: titik.lat, lng: titik.lng };
        const hasilOsrm = await hitungJarakJalanMassal(asal, [tujuan]);
        if (hasilOsrm) {
          jarak_km = Math.round(hasilOsrm[0] * 100) / 100;
          jarak_metode = "osrm";
        } else {
          jarak_km = Math.round(haversineKm(asal.lat, asal.lng, tujuan.lat, tujuan.lng) * 100) / 100;
          jarak_metode = "haversine_fallback";
        }
        jarak_status = "riil";
      }
    }

    const { error: errUpsert } = await supabase
      .from("bencana_alokasi_subsls")
      .upsert(
        { idsubsls, ppl_id: pplId, jarak_km, jarak_metode, jarak_status, terkunci: true },
        { onConflict: "idsubsls" }
      );
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });

    return NextResponse.json({ ok: true, ppl_nama: ppl.nama });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
