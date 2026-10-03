// app/api/bencana/alokasi/route.ts
//
// GET -> data utama tab "Alokasi Petugas": kertas kerja per Sub SLS -- HANYA
// yang sudah dikonfirmasi sbg wilayah sampel (RPC bencana_kertas_kerja_alokasi),
// ringkasan beban per PPL/PML/Korwil (utk visualisasi keseimbangan tim),
// kebutuhan petugas per kecamatan (RPC bencana_kebutuhan_petugas,
// parametrized oleh query ?hari_kerja=, ikut terbatas ke wilayah sampel),
// dan daftar ringkas seluruh petugas (utk dropdown assign manual PPL/PML/Korwil).
//
// Daftar petugas ini juga disertai pendaftaran_bencana_konfirmasi (apakah nama
// ybs match dgn daftar self-report "sudah mengajukan diri ikut pendataan
// bencana") dan kegiatan_lain (daftar kegiatan/survei LAIN yg sudah menandai
// petugas ini bertugas) -- dipakai FE utk ikon warning "belum konfirmasi" /
// "beban ganda" di kolom PPL, Langkah 4 kertas kerja plotting.
//
// (2 Okt 2026) lat/lng petugas + titik_subsls (RPC bencana_subsls_titik_jarak,
// ~191 baris) ditambahkan -- permintaan user: popover "Saran" di kolom PPL
// Langkah 4 diurutkan berdasarkan JARAK (garis lurus/haversine, dihitung di
// FE) dari lokasi rumah tiap kandidat PPL ke Sub SLS baris itu, BUKAN beban
// kerja lagi. Sengaja garis lurus (bukan OSRM) krn popover ini bisa dibuka
// berkali-kali sambil admin mem-plot banyak baris -- konsisten dgn alasan tab
// "Penyisiran Usaha" jg pakai haversine utk jarak yg sering dihitung ulang
// (lihat komentar di lib/jarakJalan.ts). Jarak akhir SESUDAH PPL benar2
// diplot (disimpan di bencana_alokasi_subsls.jarak_km) tetap pakai OSRM kalau
// tersedia -- popover Saran ini murni bantuan memilih, bukan nilai resmi.
//
// (3 Okt 2026) rekomendasi_pml & red_flag_kinerja ditambahkan ke daftar
// petugas -- dua flag manual (diisi admin di tab Kegiatan Petugas) dipakai
// FE utk MENGECUALIKAN mitra ybs dari popover "Saran" Tier 1/2 & fitur
// "Auto Plot" di Langkah 4 (tetap bisa diplot manual lewat dropdown).
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya di
// aplikasi ini (tidak ada sistem login sama sekali di /bencana).

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const hariKerjaRaw = Number(req.nextUrl.searchParams.get("hari_kerja"));
  const hariKerja = Number.isFinite(hariKerjaRaw) && hariKerjaRaw > 0 ? Math.min(Math.round(hariKerjaRaw), 24) : 24;

  try {
    const [
      kertasRes,
      ringkasanPplRes,
      ringkasanPmlRes,
      ringkasanKorwilRes,
      kebutuhanRes,
      petugasRes,
      sampelRes,
      kegiatanLainRes,
      titikSubslsRes,
    ] = await Promise.all([
        supabase.rpc("bencana_kertas_kerja_alokasi"),
        supabase.rpc("bencana_ringkasan_beban_ppl"),
        supabase.rpc("bencana_ringkasan_beban_pml"),
        supabase.rpc("bencana_ringkasan_beban_korwil"),
        supabase.rpc("bencana_kebutuhan_petugas", { hari_kerja: hariKerja }),
        supabase
          .from("bencana_petugas")
          .select(
            "id, nama, peran, status_kepegawaian, sumber_roster, atasan_id, lokasi_status, aktif, alamat_kecamatan, pendaftaran_bencana_konfirmasi, rekomendasi_pml, red_flag_kinerja, lat, lng"
          )
          .order("nama"),
        supabase.rpc("bencana_daftar_calon_sampel"),
        supabase.from("bencana_petugas_kegiatan_lain").select("petugas_id, kegiatan"),
        // (3 Okt 2026) rpcSemua, BUKAN supabase.rpc() langsung -- RPC ini
        // mengembalikan 1084 baris, melewati batas 1000 baris/request
        // PostgREST (lihat lib/supabaseRpc.ts utk kronologi bug-nya).
        rpcSemua(supabase, "bencana_subsls_titik_jarak"),
      ]);

    if (kertasRes.error) return NextResponse.json({ error: kertasRes.error.message }, { status: 500 });
    if (ringkasanPplRes.error) return NextResponse.json({ error: ringkasanPplRes.error.message }, { status: 500 });
    if (ringkasanPmlRes.error) return NextResponse.json({ error: ringkasanPmlRes.error.message }, { status: 500 });
    if (ringkasanKorwilRes.error) return NextResponse.json({ error: ringkasanKorwilRes.error.message }, { status: 500 });
    if (kebutuhanRes.error) return NextResponse.json({ error: kebutuhanRes.error.message }, { status: 500 });
    if (petugasRes.error) return NextResponse.json({ error: petugasRes.error.message }, { status: 500 });
    if (sampelRes.error) return NextResponse.json({ error: sampelRes.error.message }, { status: 500 });
    if (kegiatanLainRes.error) return NextResponse.json({ error: kegiatanLainRes.error.message }, { status: 500 });
    if (titikSubslsRes.error) return NextResponse.json({ error: titikSubslsRes.error.message }, { status: 500 });

    const sampelData = (sampelRes.data ?? []) as { termasuk_sampel: boolean }[];

    const kegiatanLainByPetugas = new Map<number, string[]>();
    for (const row of (kegiatanLainRes.data ?? []) as { petugas_id: number; kegiatan: string }[]) {
      const arr = kegiatanLainByPetugas.get(row.petugas_id) ?? [];
      arr.push(row.kegiatan);
      kegiatanLainByPetugas.set(row.petugas_id, arr);
    }
    const petugasDenganKegiatanLain = (petugasRes.data ?? []).map((p) => ({
      ...p,
      kegiatan_lain: kegiatanLainByPetugas.get(p.id) ?? [],
    }));

    return NextResponse.json({
      kertas_kerja: kertasRes.data ?? [],
      ringkasan_ppl: ringkasanPplRes.data ?? [],
      ringkasan_pml: ringkasanPmlRes.data ?? [],
      ringkasan_korwil: ringkasanKorwilRes.data ?? [],
      kebutuhan_petugas: kebutuhanRes.data ?? [],
      petugas: petugasDenganKegiatanLain,
      jumlah_calon_sampel: sampelData.length,
      jumlah_sampel_terpilih: sampelData.filter((r) => r.termasuk_sampel).length,
      hari_kerja: hariKerja,
      titik_subsls: titikSubslsRes.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
