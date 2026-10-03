// app/api/bencana/kegiatan-petugas/route.ts
//
// GET -> daftar lengkap "Kegiatan Petugas": seluruh petugas (organik & mitra)
// beserta status kesediaan & keterlibatannya di kegiatan-kegiatan lain, dipakai
// tab "Kegiatan Petugas" di /bencana. Berisi:
// - pendaftaran_bencana_konfirmasi: flag "mengajukan diri" ikut pendataan
//   bencana (self-report, SAMA seperti kolom "Status Pendaftaran" di Master
//   Petugas) -- dibuat BISA DIEDIT di sini (lihat PATCH), beda dgn Master
//   Petugas yang read-only.
// - sudah_plotting: dihitung LIVE dari bencana_alokasi_subsls (jumlah Sub SLS
//   yang sudah di-plot ke petugas ini sbg PPL) -- MURNI INFORMASI, bukan
//   kontrol/tombol di sini. Admin tetap memplot lewat tab "Alokasi Petugas"
//   (Langkah 4); tab ini cuma menampilkan HASIL-nya supaya kelihatan sekilas
//   siapa yang sudah/belum kebagian wilayah.
// - kegiatan_lain: daftar kegiatan lain yang sedang diikuti petugas ini, dari
//   bencana_petugas_kegiatan_lain -- BISA DIEDIT (centang/hilangkan) di sini
//   lewat PUT, divalidasi terhadap whitelist KEGIATAN_LAIN_VALID di bawah.
// - status_kepegawaian: "organik"/"mitra" -- BISA DIEDIT di sini (PATCH),
//   padahal field ini TIDAK bisa diedit di endpoint manapun sebelumnya.
// - rekomendasi_pml & red_flag_kinerja (3 Okt 2026): 2 flag manual -- BISA
//   DIEDIT di sini (PATCH). Dipakai FE (tab Alokasi Petugas) utk
//   MENGECUALIKAN mitra ybs dari popover "Saran" Tier 1/2 & fitur
//   "Auto Plot" di Langkah 4 (tetap bisa diplot manual lewat dropdown).
//   Ditampilkan read-only di Master Petugas.
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daftar resmi "kegiatan lain" yang dikenal aplikasi -- HARUS sama persis
// dengan nilai kolom `kegiatan` yang sudah ada di bencana_petugas_kegiatan_lain
// (dikonfirmasi lewat query langsung: 'GC Mix Method', 'PES SE2026',
// 'SITASI 2026', 'SKSPPI/SKLNPT/SKTNP/SKNP', 'SPDT NTP 2026').
const KEGIATAN_LAIN_VALID = [
  "PES SE2026",
  "SPDT NTP 2026",
  "SITASI 2026",
  "SKSPPI/SKLNPT/SKTNP/SKNP",
  "GC Mix Method",
] as const;

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  // (3 Okt 2026) Kolom tambahan -- permintaan user: tampilan default tabel
  // "Kegiatan Petugas" di FE TETAP seperti semula, tapi ditambah pilihan
  // centang kolom opsional (alamat, no HP, peran & PML atasan, dst.) kalau
  // admin mau lihat lebih detail. Field2 ini SEKALIAN diambil di sini
  // (bukan request terpisah) supaya togglenya instan, tanpa fetch ulang.
  const { data: petugas, error } = await supabase
    .from("bencana_petugas")
    .select(
      "id, nama, status_kepegawaian, peran, atasan_id, aktif, pendaftaran_bencana_konfirmasi, rekomendasi_pml, red_flag_kinerja, alamat_kecamatan, alamat_nagari, no_hp, umur, jenis_kelamin, pendidikan, pekerjaan, status_kontak_pendaftaran_bencana"
    )
    .order("nama");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nama PML atasan (kolom tambahan "Peran & PML Atasan") -- dicari dari
  // daftar petugas yg SAMA (tidak perlu query terpisah), konsisten dgn pola
  // lookup atasan_id di tempat lain (mis. Langkah 3 Susunan Tim).
  const namaById = new Map((petugas ?? []).map((p) => [p.id, p.nama as string]));

  const { data: kegiatanRows, error: errKegiatan } = await supabase
    .from("bencana_petugas_kegiatan_lain")
    .select("petugas_id, kegiatan");
  if (errKegiatan) return NextResponse.json({ error: errKegiatan.message }, { status: 500 });

  const kegiatanMap = new Map<number, string[]>();
  for (const k of kegiatanRows ?? []) {
    const arr = kegiatanMap.get(k.petugas_id as number) ?? [];
    arr.push(k.kegiatan as string);
    kegiatanMap.set(k.petugas_id as number, arr);
  }

  const { data: alokasiRows, error: errAlokasi } = await supabase
    .from("bencana_alokasi_subsls")
    .select("ppl_id")
    .not("ppl_id", "is", null);
  if (errAlokasi) return NextResponse.json({ error: errAlokasi.message }, { status: 500 });

  const plottingCount = new Map<number, number>();
  for (const a of alokasiRows ?? []) {
    const id = a.ppl_id as number;
    plottingCount.set(id, (plottingCount.get(id) ?? 0) + 1);
  }

  const data = (petugas ?? []).map((p) => ({
    id: p.id,
    nama: p.nama,
    status_kepegawaian: p.status_kepegawaian as "organik" | "mitra",
    peran: p.peran,
    aktif: p.aktif,
    pendaftaran_bencana_konfirmasi: p.pendaftaran_bencana_konfirmasi,
    rekomendasi_pml: p.rekomendasi_pml,
    red_flag_kinerja: p.red_flag_kinerja,
    kegiatan_lain: kegiatanMap.get(p.id) ?? [],
    sudah_plotting: (plottingCount.get(p.id) ?? 0) > 0,
    jumlah_subsls_diplot: plottingCount.get(p.id) ?? 0,
    // (3 Okt 2026) Field "kolom tambahan" -- lihat komentar di atas.
    alamat_kecamatan: p.alamat_kecamatan,
    alamat_nagari: p.alamat_nagari,
    no_hp: p.no_hp,
    pml_nama: p.atasan_id ? namaById.get(p.atasan_id) ?? null : null,
    umur: p.umur,
    jenis_kelamin: p.jenis_kelamin,
    pendidikan: p.pendidikan,
    pekerjaan: p.pekerjaan,
    status_kontak_pendaftaran_bencana: p.status_kontak_pendaftaran_bencana,
  }));

  return NextResponse.json({ data, kegiatan_valid: KEGIATAN_LAIN_VALID });
}

// PATCH { petugas_id, status_kepegawaian?, pendaftaran_bencana_konfirmasi? }
// -> ubah satu/dua field pada bencana_petugas. Whitelist field secara eksplisit
// (tidak menerima field lain) -- endpoint generik utk bencana_petugas belum
// ada di manapun sebelum ini.
export async function PATCH(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.petugas_id !== "number") {
    return NextResponse.json({ error: "petugas_id wajib diisi (angka)." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status_kepegawaian !== undefined) {
    if (body.status_kepegawaian !== "organik" && body.status_kepegawaian !== "mitra") {
      return NextResponse.json(
        { error: "status_kepegawaian harus 'organik' atau 'mitra'." },
        { status: 400 }
      );
    }
    update.status_kepegawaian = body.status_kepegawaian;
  }

  if (body.pendaftaran_bencana_konfirmasi !== undefined) {
    if (typeof body.pendaftaran_bencana_konfirmasi !== "boolean") {
      return NextResponse.json(
        { error: "pendaftaran_bencana_konfirmasi harus true/false." },
        { status: 400 }
      );
    }
    update.pendaftaran_bencana_konfirmasi = body.pendaftaran_bencana_konfirmasi;
  }

  if (body.rekomendasi_pml !== undefined) {
    if (typeof body.rekomendasi_pml !== "boolean") {
      return NextResponse.json({ error: "rekomendasi_pml harus true/false." }, { status: 400 });
    }
    update.rekomendasi_pml = body.rekomendasi_pml;
  }

  if (body.red_flag_kinerja !== undefined) {
    if (typeof body.red_flag_kinerja !== "boolean") {
      return NextResponse.json({ error: "red_flag_kinerja harus true/false." }, { status: 400 });
    }
    update.red_flag_kinerja = body.red_flag_kinerja;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
  }

  const { error } = await supabase.from("bencana_petugas").update(update).eq("id", body.petugas_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PUT { petugas_id, kegiatan, aktif } -> toggle keikutsertaan satu kegiatan
// lain. aktif=true -> upsert (insert kalau belum ada, abaikan kalau sudah
// ada, pakai constraint UNIQUE(petugas_id, kegiatan)). aktif=false -> delete
// baris itu. `kegiatan` divalidasi ketat terhadap KEGIATAN_LAIN_VALID supaya
// tidak ada nilai nyasar yang tidak dikenal UI manapun.
export async function PUT(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.petugas_id !== "number" || typeof body.kegiatan !== "string") {
    return NextResponse.json({ error: "petugas_id dan kegiatan wajib diisi." }, { status: 400 });
  }
  if (typeof body.aktif !== "boolean") {
    return NextResponse.json({ error: "aktif harus true/false." }, { status: 400 });
  }
  if (!(KEGIATAN_LAIN_VALID as readonly string[]).includes(body.kegiatan)) {
    return NextResponse.json({ error: `kegiatan tidak dikenal: ${body.kegiatan}` }, { status: 400 });
  }

  if (body.aktif) {
    const { error } = await supabase
      .from("bencana_petugas_kegiatan_lain")
      .upsert({ petugas_id: body.petugas_id, kegiatan: body.kegiatan }, { onConflict: "petugas_id,kegiatan" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("bencana_petugas_kegiatan_lain")
      .delete()
      .eq("petugas_id", body.petugas_id)
      .eq("kegiatan", body.kegiatan);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
