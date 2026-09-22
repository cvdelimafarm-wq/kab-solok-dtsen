// app/api/penyisiran/spj/visum/route.ts
//
// GET  -> daftar Surat Tugas MILIK petugas yang sedang login (ditautkan
//         lewat spj_surat_tugas_petugas), masing2 disertai data visum-nya
//         kalau sudah pernah diisi (null kalau belum). Beda dgn Surat
//         Tugas, Visum TIDAK ada mode "pengelola lihat semua" -- tiap
//         petugas cuma mengisi visum miliknya sendiri. Juga mengembalikan
//         `kecamatan_domisili`/`kecamatan_wilayah_tugas` (lihat
//         hitungKecamatanTugas di lib/spjWilayahTugas.ts) supaya form bisa MENAMPILKAN nilai
//         yang akan dipakai SEBELUM disimpan.
// POST -> simpan/perbarui (upsert) visum utk SATU Surat Tugas miliknya
//         sendiri. Datanya RENCANA (bukan realisasi) -- lihat catatan di
//         lib/pdf/visum.ts. Utk MVP, form di sisi client cuma minta SATU
//         "Tanggal Pelaksanaan" (dipetakan ke keempat kolom tanggal krn
//         perjalanan dinas dalam kota biasanya berangkat & pulang di hari
//         yang sama) -- kolom tanggal_berangkat_kembali/tiba_kembali di
//         skema tetap terpisah utk fleksibilitas di masa depan kalau perlu
//         beda hari.
//
// `rencana_tujuan` (kecamatan WILAYAH TUGAS) & `tempat_kedudukan` (kecamatan
// ALAMAT/DOMISILI petugas) -- utk jenis "penyisiran" (PPL/PML) KEDUANYA
// dihitung OTOMATIS dari data yg SUDAH ADA di sistem lewat
// hitungKecamatanTugas (lib/spjWilayahTugas.ts, DIPAKAI BERSAMA dgn
// Kwitansi -- lihat komentar di file itu) -- bukan input manual lagi,
// permintaan user 22 Sep 2026 supaya Visum tidak salah ketik/beda dgn data
// Perencanaan Lapangan yg sebenarnya. Utk jenis "tetangga" TIDAK ada sumber
// data itu (tabel tetangga_akun tidak py alamat & tidak pernah nge-tag
// wilayah SLS), jadi TETAP manual spt sebelumnya (client kirim
// rencana_tujuan/tempat_kedudukan di body).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession } from "@/lib/spjAuth";
import { TEMPAT_KEDUDUKAN_DEFAULT } from "@/lib/spjPejabat";
import { hitungKecamatanTugas } from "@/lib/spjWilayahTugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) {
    const kecamatanKosong = await hitungKecamatanTugas(supabase, session);
    return NextResponse.json({
      daftar: [],
      kecamatan_domisili: kecamatanKosong.domisili,
      kecamatan_wilayah_tugas: kecamatanKosong.wilayahTugas,
    });
  }

  const [{ data: stList, error: errSt }, { data: visumList, error: errVisum }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_visum")
      .select("*")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errVisum) return NextResponse.json({ error: errVisum.message }, { status: 500 });

  const petaVisum = new Map((visumList ?? []).map((v: { surat_tugas_id: number }) => [v.surat_tugas_id, v]));

  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    visum: petaVisum.get(st.id) ?? null,
  }));

  const kecamatan = await hitungKecamatanTugas(supabase, session);

  return NextResponse.json({
    daftar,
    kecamatan_domisili: kecamatan.domisili,
    kecamatan_wilayah_tugas: kecamatan.wilayahTugas,
  });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const suratTugasId = Number(body?.surat_tugas_id);
  const tanggalPelaksanaan = String(body?.tanggal_pelaksanaan || "").trim();

  if (!Number.isFinite(suratTugasId)) {
    return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalPelaksanaan)) {
    return NextResponse.json({ error: "Tanggal pelaksanaan wajib diisi." }, { status: 400 });
  }

  // rencana_tujuan/tempat_kedudukan: utk jenis "penyisiran" DIHITUNG DI SINI
  // (abaikan apa pun yg dikirim client utk 2 field itu -- lihat komentar
  // hitungKecamatanTugas). Utk jenis "tetangga" TETAP manual dari
  // body (tidak ada sumber data domisili/wilayah tugas utk jenis ini).
  let rencanaTujuan: string;
  let tempatKedudukan: string;
  if (session.jenis === "penyisiran") {
    const kecamatan = await hitungKecamatanTugas(supabase, session);
    if (!kecamatan.wilayahTugas) {
      return NextResponse.json(
        {
          error:
            "Kecamatan wilayah tugas Anda belum tercatat -- minta pengelola menautkan wilayah SLS Anda dulu di menu Perencanaan Lapangan sebelum mengisi Visum.",
        },
        { status: 400 }
      );
    }
    rencanaTujuan = kecamatan.wilayahTugas;
    tempatKedudukan = kecamatan.domisili || TEMPAT_KEDUDUKAN_DEFAULT;
  } else {
    rencanaTujuan = String(body?.rencana_tujuan || "").trim();
    tempatKedudukan = String(body?.tempat_kedudukan || "").trim() || TEMPAT_KEDUDUKAN_DEFAULT;
    if (!rencanaTujuan) {
      return NextResponse.json({ error: "Rencana tujuan wajib diisi." }, { status: 400 });
    }
  }

  // Pastikan Surat Tugas ini memang ditautkan ke petugas yang sedang login
  // -- mencegah petugas mengisi visum utk ST milik orang lain.
  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_visum")
    .upsert(
      {
        surat_tugas_id: suratTugasId,
        petugas_jenis: session.jenis,
        petugas_id: session.petugasId,
        rencana_tujuan: rencanaTujuan,
        tempat_kedudukan: tempatKedudukan,
        tanggal_berangkat: tanggalPelaksanaan,
        tanggal_tiba_tujuan: tanggalPelaksanaan,
        tanggal_berangkat_kembali: tanggalPelaksanaan,
        tanggal_tiba_kembali: tanggalPelaksanaan,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "surat_tugas_id,petugas_jenis,petugas_id" }
    )
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan Visum." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
