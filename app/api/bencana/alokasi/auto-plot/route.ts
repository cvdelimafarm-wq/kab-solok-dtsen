// app/api/bencana/alokasi/auto-plot/route.ts
//
// POST { hari_kerja?: number } -> jalankan algoritma auto-plotting petugas
// (PPL/PML/Korwil) lewat RPC bencana_auto_plotting(p_hari_kerja), lalu
// hitung skor jarak SUNGGUHAN (OSRM jarak jalan, fallback haversine kalau
// OSRM tidak tersedia/gagal) dari lokasi rumah tiap PPL -- yang sudah
// ditetapkan sendiri lewat link publik /bencana/lokasi/[token] -- ke titik
// tengah (centroid) tiap Sub SLS yang dialokasikan ke PPL tsb. Hasil jarak
// disimpan ke bencana_alokasi_subsls.jarak_km/jarak_metode/jarak_status.
//
// PPL yang BELUM menetapkan lokasi rumah -> jarak_status='tanpa_data',
// jarak_km=null (skor jarak = 0, tanpa penalti/bonus) -- sesuai keputusan:
// TIDAK ADA perkiraan Tier-2 dari centroid nagari, langsung tanpa data.
//
// Baris kertas kerja yang 'terkunci' (pernah di-assign manual admin lewat
// /api/bencana/alokasi/reassign) TIDAK ditimpa PENUGASANNYA oleh RPC
// bencana_auto_plotting (itu tanggung jawab RPC-nya sendiri), tapi jarak
// baris terkunci TETAP dihitung ulang di sini mengikuti PPL yg sedang
// menanganinya saat ini (jarak bukan bagian yang "dikunci").

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hitungJarakJalanMassal, haversineKm, type Titik } from "@/lib/jarakJalan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

type CentroidRow = { idsubsls: string; lat: number | null; lng: number | null; sumber: string };

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const hariKerjaRaw = body?.hari_kerja;
  const hariKerja =
    typeof hariKerjaRaw === "number" && Number.isFinite(hariKerjaRaw)
      ? Math.min(Math.max(Math.round(hariKerjaRaw), 1), 24)
      : 24;

  try {
    const { data: hasilPlotting, error: errPlotting } = await supabase.rpc("bencana_auto_plotting", {
      p_hari_kerja: hariKerja,
    });
    if (errPlotting) {
      return NextResponse.json({ error: `Gagal menjalankan auto-plotting: ${errPlotting.message}` }, { status: 500 });
    }

    // --- Hitung skor jarak sungguhan utk seluruh baris alokasi ---
    const [alokasiRes, centroidRes, petugasRes] = await Promise.all([
      supabase.from("bencana_alokasi_subsls").select("id, idsubsls, ppl_id"),
      supabase.rpc("bencana_subsls_centroid"),
      supabase.from("bencana_petugas").select("id, lat, lng, lokasi_status").eq("peran", "ppl"),
    ]);

    if (alokasiRes.error || centroidRes.error || petugasRes.error) {
      const pesan = alokasiRes.error?.message ?? centroidRes.error?.message ?? petugasRes.error?.message;
      return NextResponse.json(
        {
          tahap_plotting: hasilPlotting,
          peringatan: `Auto-plotting berhasil, tapi gagal membaca data utk hitung jarak: ${pesan}`,
        },
        { status: 207 }
      );
    }

    const centroidMap = new Map<string, Titik>();
    for (const c of (centroidRes.data ?? []) as CentroidRow[]) {
      if (typeof c.lat === "number" && typeof c.lng === "number") {
        centroidMap.set(c.idsubsls, { lat: c.lat, lng: c.lng });
      }
    }
    const petugasMap = new Map<number, Titik | null>();
    for (const p of petugasRes.data ?? []) {
      petugasMap.set(
        p.id,
        p.lokasi_status === "riil" && typeof p.lat === "number" && typeof p.lng === "number"
          ? { lat: p.lat, lng: p.lng }
          : null
      );
    }

    const byPpl = new Map<number, { id: number; idsubsls: string }[]>();
    for (const a of alokasiRes.data ?? []) {
      if (a.ppl_id === null) continue;
      if (!byPpl.has(a.ppl_id)) byPpl.set(a.ppl_id, []);
      byPpl.get(a.ppl_id)!.push({ id: a.id, idsubsls: a.idsubsls });
    }

    type UpdateRow = { id: number; jarak_km: number | null; jarak_metode: string | null; jarak_status: string };
    const updates: UpdateRow[] = [];
    let jumlahOsrm = 0;
    let jumlahHaversine = 0;
    let jumlahTanpaData = 0;

    for (const [pplId, baris] of byPpl.entries()) {
      const asal = petugasMap.get(pplId) ?? null;
      if (!asal) {
        for (const b of baris) updates.push({ id: b.id, jarak_km: null, jarak_metode: null, jarak_status: "tanpa_data" });
        jumlahTanpaData += baris.length;
        continue;
      }

      const punyaTitik = baris.map((b) => centroidMap.has(b.idsubsls));
      const tujuan: Titik[] = baris.map((b) => centroidMap.get(b.idsubsls) ?? asal);
      const hasilOsrm = await hitungJarakJalanMassal(asal, tujuan);

      baris.forEach((b, i) => {
        if (!punyaTitik[i]) {
          updates.push({ id: b.id, jarak_km: null, jarak_metode: null, jarak_status: "tanpa_data" });
          jumlahTanpaData++;
          return;
        }
        if (hasilOsrm) {
          updates.push({ id: b.id, jarak_km: Math.round(hasilOsrm[i] * 100) / 100, jarak_metode: "osrm", jarak_status: "riil" });
          jumlahOsrm++;
        } else {
          const km = haversineKm(asal.lat, asal.lng, tujuan[i].lat, tujuan[i].lng);
          updates.push({ id: b.id, jarak_km: Math.round(km * 100) / 100, jarak_metode: "haversine_fallback", jarak_status: "riil" });
          jumlahHaversine++;
        }
      });
    }

    // supabase-js tidak mendukung bulk update dgn nilai berbeda per baris
    // dlm 1 request -- dieksekusi per-chunk paralel (bukan 1000+ request
    // berurutan) supaya tetap wajar utk ~1000an baris.
    const CHUNK = 40;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const hasil = await Promise.all(
        chunk.map((u) =>
          supabase
            .from("bencana_alokasi_subsls")
            .update({ jarak_km: u.jarak_km, jarak_metode: u.jarak_metode, jarak_status: u.jarak_status })
            .eq("id", u.id)
        )
      );
      const gagal = hasil.find((h) => h.error);
      if (gagal?.error) {
        return NextResponse.json(
          {
            tahap_plotting: hasilPlotting,
            peringatan: `Auto-plotting berhasil, tapi sebagian jarak gagal disimpan: ${gagal.error.message}`,
          },
          { status: 207 }
        );
      }
    }

    return NextResponse.json({
      tahap_plotting: hasilPlotting,
      jarak: { osrm: jumlahOsrm, haversine_fallback: jumlahHaversine, tanpa_data: jumlahTanpaData },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
