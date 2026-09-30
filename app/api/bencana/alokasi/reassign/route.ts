// app/api/bencana/alokasi/reassign/route.ts
//
// POST { idsubsls, ppl_id } -> pindahkan SATU Sub SLS ke PPL lain secara
// manual (mis. supervisor menyeimbangkan beban hasil auto-plotting, atau
// menangani daerah terpisah yg sengaja tidak dibagi rata). Baris yang
// diubah lewat sini ditandai terkunci=true, sehingga TIDAK akan ditimpa
// lagi kalau auto-plotting dijalankan ulang di kemudian hari.
//
// POST { idsubsls, buka_kunci: true } -> lepas kembali Sub SLS ini supaya
// auto-plotting boleh menugaskannya lagi (baris dihapus dari
// bencana_alokasi_subsls; auto-plotting akan mengisinya ulang saat
// dijalankan berikutnya).

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
      const { error } = await supabase.from("bencana_alokasi_subsls").delete().eq("idsubsls", idsubsls);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, dibuka: true });
    }

    const pplId = typeof body?.ppl_id === "number" ? body.ppl_id : null;
    if (!pplId) {
      return NextResponse.json({ error: "ppl_id wajib diisi." }, { status: 400 });
    }

    const { data: ppl, error: errPpl } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran, lat, lng, lokasi_status")
      .eq("id", pplId)
      .maybeSingle();
    if (errPpl) return NextResponse.json({ error: errPpl.message }, { status: 500 });
    if (!ppl) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });
    if (ppl.peran !== "ppl") {
      return NextResponse.json(
        {
          error: `${ppl.nama} berperan sebagai ${ppl.peran ?? "belum diplot"}, bukan PPL. Sub SLS hanya boleh ditugaskan ke petugas berperan PPL.`,
        },
        { status: 400 }
      );
    }

    let jarak_km: number | null = null;
    let jarak_metode: string | null = null;
    let jarak_status = "tanpa_data";

    if (ppl.lokasi_status === "riil" && typeof ppl.lat === "number" && typeof ppl.lng === "number") {
      const { data: centroidRows } = await supabase.rpc("bencana_subsls_centroid");
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
