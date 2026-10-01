// app/api/bencana/jorong/route.ts
//
// POST -> simpan jawaban tingkat JORONG: "apakah seluruh Sub SLS di jorong
// ini terdampak?" (ya, seluruhnya / tidak, sebagian / tidak ada yang
// terdampak) + (jika sebagian) daftar sub SLS yang ditandai TERDAMPAK atau
// RAGU + perkiraan jumlah keluarga terdampak per Sub SLS + indikator dampak
// (jorong-level) opsional + catatan. Publik, tanpa login.
//
// Saat seluruh_subsls_terdampak === true, server (bukan client) yang
// mengisi subsls_terdampak dengan SELURUH idsubsls milik idsls tsb --
// diambil segar dari bencana_wilayah -- agar agregasi di Monitoring
// konsisten walau daftar sub SLS berubah di kemudian hari.
//
// tidak_ada_terdampak === true -> TIDAK ADA Sub SLS yang terdampak di Jorong
// ini sama sekali (subsls_terdampak & subsls_ragu dikosongkan paksa). Baris
// ini tetap disimpan (bukan di-skip) supaya tercatat sbg respons mitra utk
// Jorong tsb di Monitoring -- lihat bencana_monitoring_jorong().
//
// subsls_ragu: Sub SLS yg mitra RAGU apakah terdampak atau tidak -- SENGAJA
// TIDAK dimasukkan ke subsls_terdampak (jadi tidak ikut dihitung "terdampak"
// di agregasi/skor beban otomatis manapun) supaya tetap perlu ditinjau
// manual, bukan diasumsikan terdampak.
//
// perkiraan_kk_subsls: perkiraan jumlah KELUARGA terdampak PER Sub SLS (utk
// Sub SLS yg ada di subsls_terdampak ATAU subsls_ragu) -- lebih presisi
// drpd indikator_dampak_kk yg levelnya per-Jorong, dipakai di Kertas Kerja
// Beban utk atribusi per Sub SLS yg akurat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

const INDIKATOR_DAMPAK_VALID = new Set([
  "korban",
  "hunian_rusak",
  "lahan_ternak",
  "aset_usaha",
  "efek_berantai",
]);

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      idsls,
      iddesa,
      kecamatan,
      nagari,
      jorong,
      mitra_id,
      nama_mitra,
      seluruh_subsls_terdampak,
      tidak_ada_terdampak,
      subsls_terdampak,
      subsls_ragu,
      perkiraan_kk_subsls,
      indikator_dampak,
      indikator_dampak_kk,
      catatan,
    } = body ?? {};

    const tidakAdaTerdampak = tidak_ada_terdampak === true;

    if (
      typeof idsls !== "string" || !idsls.trim() ||
      typeof iddesa !== "string" || !iddesa.trim() ||
      typeof kecamatan !== "string" || !kecamatan.trim() ||
      typeof nagari !== "string" || !nagari.trim() ||
      typeof jorong !== "string" || !jorong.trim() ||
      typeof nama_mitra !== "string" || !nama_mitra.trim() ||
      typeof seluruh_subsls_terdampak !== "boolean"
    ) {
      return NextResponse.json({ error: "Data tidak lengkap atau tidak valid." }, { status: 400 });
    }

    let subslsFinal: string[] = [];
    let subslsRaguFinal: string[] = [];

    if (tidakAdaTerdampak) {
      // Tidak ada Sub SLS yang terdampak di Jorong ini -- baris tetap
      // disimpan (sbg respons mitra), subsls_terdampak & subsls_ragu paksa
      // kosong apa pun yg dikirim client.
      subslsFinal = [];
      subslsRaguFinal = [];
    } else if (seluruh_subsls_terdampak) {
      // Ambil segar seluruh idsubsls milik idsls ini dari tabel referensi.
      const { data: subslsRows, error: subslsError } = await supabase
        .from("bencana_wilayah")
        .select("idsubsls")
        .eq("idsls", idsls.trim());

      if (subslsError) {
        return NextResponse.json({ error: subslsError.message }, { status: 500 });
      }
      subslsFinal = (subslsRows ?? []).map((r) => r.idsubsls as string);
    } else {
      const subslsRaguMentah = Array.isArray(subsls_ragu)
        ? subsls_ragu.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      if (
        (!Array.isArray(subsls_terdampak) || subsls_terdampak.length === 0) &&
        subslsRaguMentah.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Pilih minimal satu Sub SLS (terdampak atau ragu), atau tandai seluruh Sub SLS terdampak / tidak ada yang terdampak.",
          },
          { status: 400 }
        );
      }
      subslsFinal = Array.isArray(subsls_terdampak)
        ? subsls_terdampak.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      // Ragu TIDAK boleh overlap dgn terdampak -- kalau ada, terdampak menang.
      subslsRaguFinal = subslsRaguMentah.filter((s) => !subslsFinal.includes(s));
    }

    // Perkiraan jumlah KELUARGA terdampak PER Sub SLS -- hanya utk Sub SLS
    // yg memang ditandai terdampak atau ragu, nilai harus bilangan bulat >= 0.
    const subslsBolehDiisi = new Set([...subslsFinal, ...subslsRaguFinal]);
    const perkiraanKkSubslsFinal: Record<string, number> = {};
    if (
      perkiraan_kk_subsls &&
      typeof perkiraan_kk_subsls === "object" &&
      !Array.isArray(perkiraan_kk_subsls)
    ) {
      for (const key of Object.keys(perkiraan_kk_subsls as Record<string, unknown>)) {
        if (!subslsBolehDiisi.has(key)) continue;
        const raw = (perkiraan_kk_subsls as Record<string, unknown>)[key];
        const num = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(num) && Number.isInteger(num) && num >= 0) {
          perkiraanKkSubslsFinal[key] = num;
        }
      }
    }

    let indikatorFinal: string[] = [];
    if (Array.isArray(indikator_dampak)) {
      indikatorFinal = indikator_dampak.filter(
        (s): s is string => typeof s === "string" && INDIKATOR_DAMPAK_VALID.has(s)
      );
    }

    // Perkiraan jumlah KK terdampak per indikator -- hanya untuk indikator
    // yang memang dicentang (indikatorFinal), nilai harus bilangan bulat >= 0.
    const indikatorKkFinal: Record<string, number> = {};
    if (indikator_dampak_kk && typeof indikator_dampak_kk === "object" && !Array.isArray(indikator_dampak_kk)) {
      for (const key of Object.keys(indikator_dampak_kk as Record<string, unknown>)) {
        if (!INDIKATOR_DAMPAK_VALID.has(key) || !indikatorFinal.includes(key)) continue;
        const raw = (indikator_dampak_kk as Record<string, unknown>)[key];
        const num = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(num) && Number.isInteger(num) && num >= 0) {
          indikatorKkFinal[key] = num;
        }
      }
    }

    const { data, error } = await supabase
      .from("bencana_identifikasi_jorong")
      .insert({
        idsls: idsls.trim(),
        iddesa: iddesa.trim(),
        kecamatan: kecamatan.trim(),
        nagari: nagari.trim(),
        jorong: jorong.trim(),
        mitra_id: typeof mitra_id === "number" ? mitra_id : null,
        nama_mitra: nama_mitra.trim(),
        seluruh_subsls_terdampak,
        tidak_ada_terdampak: tidakAdaTerdampak,
        subsls_terdampak: subslsFinal,
        subsls_ragu: subslsRaguFinal,
        perkiraan_kk_subsls: perkiraanKkSubslsFinal,
        indikator_dampak: indikatorFinal,
        indikator_dampak_kk: indikatorKkFinal,
        catatan: typeof catatan === "string" && catatan.trim() ? catatan.trim() : null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
