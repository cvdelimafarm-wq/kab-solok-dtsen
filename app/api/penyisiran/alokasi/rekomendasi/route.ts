// app/api/penyisiran/alokasi/rekomendasi/route.ts
//
// Daftar rekomendasi SLS/Jorong (diurutkan skor akhir tertinggi) + pilihan
// yang SUDAH tersimpan sebelumnya (kalau petugas pernah submit) utk tab
// "Perencanaan Lapangan" -- login personal role "penyisiran_petugas" (SAMA
// dengan tab "Penyisiran Usaha", lihat lib/penyisiranAuth.ts & token
// localStorage "penyisiran-petugas-login-*" di app/seruti/penyisiran-usaha.tsx
// -- sengaja dipakai bersama supaya petugas yang sudah login di tab itu
// TIDAK perlu login ulang di tab ini).
//
// Rumus skor (Layer 1 Skor Dasar + Layer 2 Skor Akhir personal per jarak)
// dipecah dua tempat:
//  - RPC penyisiran_alokasi_dasar_sls() (SQL, lihat migrasi
//    20260918_alokasi_dasar_sls_tanpa_jarak.sql) -- bagian yg TIDAK
//    bergantung jarak: Skor Dasar rata-rata, Bonus Volume, centroid SLS.
//  - DI SINI (Next.js) -- jarak dari lokasi rumah petugas ke centroid tiap
//    SLS, pakai jarak JALAN (OSRM self-hosted, lihat lib/jarakJalan.ts)
//    dgn fallback OTOMATIS ke haversine (garis lurus) kalau OSRM belum
//    di-deploy/gagal/timeout -- lalu Penalti Jarak & Skor Akhir digabung
//    di sini jg (rumus SAMA PERSIS dgn versi SQL lama: least(20,
//    jarak_km*2), skor_akhir = skor_dasar_rata + bonus_volume - penalti).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { haversineKm, hitungJarakJalanMassal } from "@/lib/jarakJalan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DasarSlsRow {
  sls_key: string;
  kec_kode: string;
  kec_nama: string;
  nagari_kode: string;
  nagari_nama: string;
  sls_kode: string;
  sls_nama: string;
  jumlah_potensi: number;
  skor_dasar_rata: number;
  bonus_volume: number;
  lat_c: number | null;
  lng_c: number | null;
  sudah_dipilih_oleh: number;
  jumlah_subsls: number;
}

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [petugasRes, dasarRes, pilihanRes] = await Promise.all([
    supabase.from("petugas_penyisiran_akun").select("nama, lat, lng").eq("id", petugasId).maybeSingle(),
    supabase.rpc("penyisiran_alokasi_dasar_sls"),
    supabase.from("penyisiran_alokasi_pilihan").select("sls_key, subsls_kode_list").eq("petugas_id", petugasId),
  ]);

  if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });
  if (dasarRes.error) return NextResponse.json({ error: dasarRes.error.message }, { status: 500 });
  if (pilihanRes.error) return NextResponse.json({ error: pilihanRes.error.message }, { status: 500 });

  const petugasLat = typeof petugasRes.data?.lat === "number" ? petugasRes.data.lat : null;
  const petugasLng = typeof petugasRes.data?.lng === "number" ? petugasRes.data.lng : null;
  const dasar = (dasarRes.data ?? []) as DasarSlsRow[];

  // Baris dgn centroid valid (lat_c/lng_c terisi) -- SLS tanpa satu pun
  // baris usaha berkoordinat (jarang, tapi bisa terjadi) tetap ditampilkan
  // dgn jarak_km null spt sebelumnya.
  const idxCentroidValid: number[] = [];
  const titikCentroid: { lat: number; lng: number }[] = [];
  dasar.forEach((r, i) => {
    if (r.lat_c != null && r.lng_c != null) {
      idxCentroidValid.push(i);
      titikCentroid.push({ lat: r.lat_c, lng: r.lng_c });
    }
  });

  const jarakArr: (number | null)[] = new Array(dasar.length).fill(null);
  if (petugasLat != null && petugasLng != null && titikCentroid.length > 0) {
    const asal = { lat: petugasLat, lng: petugasLng };
    const jalan = await hitungJarakJalanMassal(asal, titikCentroid);
    if (jalan) {
      idxCentroidValid.forEach((origIdx, k) => {
        jarakArr[origIdx] = jalan[k];
      });
    } else {
      // OSRM belum diset / gagal / timeout -- fallback haversine utk SEMUA.
      idxCentroidValid.forEach((origIdx, k) => {
        const t = titikCentroid[k];
        jarakArr[origIdx] = haversineKm(asal.lat, asal.lng, t.lat, t.lng);
      });
    }
  }

  const hasil = dasar.map((r, i) => {
    const jarak = jarakArr[i];
    const penalti = jarak != null ? Math.min(20, jarak * 2) : null;
    const skorAkhir = r.skor_dasar_rata + r.bonus_volume - (penalti ?? 0);
    return {
      sls_key: r.sls_key,
      kec_kode: r.kec_kode,
      kec_nama: r.kec_nama,
      nagari_kode: r.nagari_kode,
      nagari_nama: r.nagari_nama,
      sls_kode: r.sls_kode,
      sls_nama: r.sls_nama,
      jumlah_potensi: r.jumlah_potensi,
      skor_dasar_rata: r.skor_dasar_rata,
      bonus_volume: r.bonus_volume,
      jarak_km: jarak != null ? Math.round(jarak * 100) / 100 : null,
      penalti_jarak: penalti != null ? Math.round(penalti * 10) / 10 : null,
      skor_akhir: Math.round(skorAkhir * 10) / 10,
      sudah_dipilih_oleh: r.sudah_dipilih_oleh,
      jumlah_subsls: r.jumlah_subsls,
    };
  });

  hasil.sort((a, b) => {
    if (b.skor_akhir !== a.skor_akhir) return b.skor_akhir - a.skor_akhir;
    return b.jumlah_potensi - a.jumlah_potensi;
  });

  return NextResponse.json({
    nama: petugasRes.data?.nama ?? null,
    lat: petugasLat,
    lng: petugasLng,
    data: hasil,
    // Bentuk kaya (bukan cuma array sls_key) supaya FE bisa merehidrasi
    // pilihan SEBAGIAN SUBSLS (fitur "unhide") -- subsls_kode null/kosong
    // berarti pilih SELURUH SLS, spt sebelumnya.
    pilihan: (pilihanRes.data ?? []).map((r) => ({
      sls_key: r.sls_key,
      subsls_kode: Array.isArray(r.subsls_kode_list) && r.subsls_kode_list.length > 0 ? r.subsls_kode_list : null,
    })),
  });
}
