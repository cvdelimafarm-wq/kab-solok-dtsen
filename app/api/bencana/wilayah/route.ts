// app/api/bencana/wilayah/route.ts
//
// GET -> daftar wilayah (kecamatan -> nagari -> jorong -> sub SLS) untuk
// fitur publik "Identifikasi SLS/Jorong Terdampak Bencana Hidrometeorologi".
// Tidak ada gate autentikasi -- endpoint ini SENGAJA publik (mitra mengisi
// tanpa login).
//
// (3 Okt 2026) Tiap Sub SLS disertai lat/lng (RPC bencana_subsls_titik_jarak,
// SAMA PERSIS dgn yg dipakai popover "Saran" di tab Alokasi Petugas) --
// dipakai FE utk tombol "Lihat Peta" per baris Sub SLS di tab Identifikasi,
// supaya mitra bisa cek sekilas di peta (citra satelit) apakah lokasi itu
// masuk akal terdampak banjir (dekat sungai/dataran rendah) sebelum
// menandai status. null kalau titik Sub SLS itu belum tersedia -> tombol
// disembunyikan baris ybs (lihat SubslsList di FE).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rpcSemua } from "@/lib/supabaseRpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

type WilayahRow = {
  idsubsls: string;
  iddesa: string;
  idsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  daftar_awal: boolean;
};

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  try {
    // Ambil SEMUA baris lewat paginasi .range() -- proyek Supabase ini
    // membatasi max rows per request (defaultnya 1000), sedangkan
    // bencana_wilayah sudah > 1000 baris (satu baris per Sub SLS). Tanpa
    // paginasi, baris-baris di ekor urutan (abjad kecamatan/nagari
    // terakhir, mis. sebagian Nagari di Kec. X Koto Singkarak) terpotong
    // diam-diam dan hilang dari dropdown form Identifikasi.
    const PAGE_SIZE = 1000;
    const rows: WilayahRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("bencana_wilayah")
        .select("idsubsls, iddesa, idsls, kecamatan, nagari, sls, sub_sls, daftar_awal")
        .order("kecamatan", { ascending: true })
        .order("nagari", { ascending: true })
        .order("idsls", { ascending: true })
        .order("sub_sls", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const page = (data ?? []) as WilayahRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    // (3 Okt 2026) rpcSemua, BUKAN supabase.rpc() langsung -- PERSIS bug yg
    // sama dgn bencana_wilayah di atas (lihat komentar paginasi .range()
    // di atas) tapi sempat lolos di baris ini: RPC ini jg > 1000 baris
    // (1084), jadi tanpa paging ~84 Sub SLS kehilangan titiknya di SETIAP
    // request -- ini yg bikin tombol "Lihat Peta" & popover "Saran" di tab
    // Alokasi Petugas tampil "belum tersedia" utk sebagian Sub SLS scr terus-
    // menerus. Lihat lib/supabaseRpc.ts utk kronologi lengkap.
    const { data: titikData, error: titikError } = await rpcSemua(supabase, "bencana_subsls_titik_jarak");
    if (titikError) {
      return NextResponse.json({ error: titikError.message }, { status: 500 });
    }
    const titikMap = new Map<string, { lat: number; lng: number }>();
    for (const t of (titikData ?? []) as { idsubsls: string; lat: number | null; lng: number | null }[]) {
      if (typeof t.lat === "number" && typeof t.lng === "number") titikMap.set(t.idsubsls, { lat: t.lat, lng: t.lng });
    }

    // Susun pohon: kecamatan -> nagari -> jorong (idsls) -> daftar sub SLS
    type SubslsItem = { idsubsls: string; sub_sls: string; lat: number | null; lng: number | null };
    type JorongItem = { idsls: string; jorong: string; subsls: SubslsItem[] };
    type NagariItem = {
      iddesa: string;
      nagari: string;
      daftar_awal: boolean;
      jorong: JorongItem[];
    };
    type KecamatanItem = { kecamatan: string; nagari: NagariItem[] };

    const kecMap = new Map<string, KecamatanItem>();

    for (const row of rows) {
      let kec = kecMap.get(row.kecamatan);
      if (!kec) {
        kec = { kecamatan: row.kecamatan, nagari: [] };
        kecMap.set(row.kecamatan, kec);
      }

      let nag = kec.nagari.find((n) => n.iddesa === row.iddesa);
      if (!nag) {
        nag = { iddesa: row.iddesa, nagari: row.nagari, daftar_awal: row.daftar_awal, jorong: [] };
        kec.nagari.push(nag);
      }

      let jor = nag.jorong.find((j) => j.idsls === row.idsls);
      if (!jor) {
        jor = { idsls: row.idsls, jorong: row.sls, subsls: [] };
        nag.jorong.push(jor);
      }

      const titik = titikMap.get(row.idsubsls) ?? null;
      jor.subsls.push({ idsubsls: row.idsubsls, sub_sls: row.sub_sls, lat: titik?.lat ?? null, lng: titik?.lng ?? null });
    }

    return NextResponse.json({ data: Array.from(kecMap.values()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
