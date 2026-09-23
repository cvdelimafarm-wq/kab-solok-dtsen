// app/api/penyisiran/spj/surat-keterangan/route.ts
//
// GET  -> daftar Surat Tugas milik petugas yg login, disertai DAFTAR Surat
//         Keterangan Tidak Menggunakan Kendaraan Dinas-nya -- SEJAK 23 Sep
//         2026 BISA LEBIH DARI SATU per ST (1 baris per SET tanggal Hari
//         Tugas, lihat lib/spjSetHariTugas.ts & migrasi
//         20260923_spj_dokumen_per_set_hari_tugas.sql; dulu tepat 1/ST,
//         tanggalnya dari Laporan terakhir).
// POST -> buat/perbarui SATU SET Surat Pernyataan utk SATU ST miliknya
//         sendiri.
//         - Kirim `id` -> EDIT baris SET itu.
//         - Tanpa `id` -> upsert berdasar kunci alami (surat_tugas_id,
//           petugas_jenis, petugas_id, tanggal_mulai_set); body WAJIB kirim
//           tanggal_mulai_set/tanggal_selesai_set (client biasanya
//           menyalin dari SET Kwitansi/Visum yg sudah ada, atau dari hasil
//           "Buat Otomatis" yg lalu diedit).
//
// PERUBAHAN 23 Sep 2026: tanggal SET (bukan lagi "tanggal Laporan
// terakhir") -- sumbernya SEKARANG SAMA dgn Kwitansi/Visum (tanggal ditag
// di 🗓 Identifikasi Hari Tugas), permintaan user "Surat Pernyataan
// Kendaraan, Hari Tugas dari tagging Tanggal 🗓 Identifikasi Hari Tugas".
// Cara TERCEPAT bikin SET otomatis dari Hari Tugas tetap lewat POST
// /api/penyisiran/spj/buat-otomatis -- endpoint ini utk isi/ubah manual 1
// SET (mis. kalau tanggal Hari Tugas belum lengkap tp SET perlu segera
// dibuat).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession } from "@/lib/spjAuth";

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
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) return NextResponse.json({ daftar: [] });

  const [{ data: stList, error: errSt }, { data: skList, error: errSk }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_surat_pernyataan_kendaraan")
      .select("*")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids)
      .order("tanggal_mulai_set", { ascending: true }),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errSk) return NextResponse.json({ error: errSk.message }, { status: 500 });

  const peta = new Map<number, unknown[]>();
  for (const s of (skList ?? []) as { surat_tugas_id: number }[]) {
    const arr = peta.get(s.surat_tugas_id) ?? [];
    arr.push(s);
    peta.set(s.surat_tugas_id, arr);
  }
  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    surat_keterangan: peta.get(st.id) ?? [],
  }));

  return NextResponse.json({ daftar });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const idEdit = Number(body?.id);
  const suratTugasId = Number(body?.surat_tugas_id);
  const tanggalMulaiSet = String(body?.tanggal_mulai_set || "").trim();
  const tanggalSelesaiSet = String(body?.tanggal_selesai_set || tanggalMulaiSet || "").trim();

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMulaiSet) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalSelesaiSet) || tanggalSelesaiSet < tanggalMulaiSet) {
    return NextResponse.json(
      {
        error:
          "Rentang tanggal SET wajib diisi (tanggal selesai harus >= tanggal mulai) -- salin dari tanggal 🗓 Identifikasi Hari Tugas atau dari SET Kwitansi/Visum yang sudah dibuat.",
      },
      { status: 400 }
    );
  }

  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });

  // tanggal_pelaksanaan (kolom lama, tetap disimpan utk kompatibilitas
  // tampilan) = tanggal AKHIR SET, konsisten dgn migrasi
  // 20260923_spj_dokumen_per_set_hari_tugas.sql.
  const kolom = {
    surat_tugas_id: suratTugasId,
    petugas_jenis: session.jenis,
    petugas_id: session.petugasId,
    tanggal_pelaksanaan: tanggalSelesaiSet,
    tanggal_mulai_set: tanggalMulaiSet,
    tanggal_selesai_set: tanggalSelesaiSet,
  };

  if (Number.isFinite(idEdit) && idEdit > 0) {
    const { data: updated, error: errUpdate } = await supabase
      .from("spj_surat_pernyataan_kendaraan")
      .update(kolom)
      .eq("id", idEdit)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .select("id")
      .maybeSingle();
    if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Surat Pernyataan (SET) ini tidak ditemukan / bukan milik Anda." }, { status: 404 });
    return NextResponse.json({ ok: true, id: updated.id });
  }

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_surat_pernyataan_kendaraan")
    .upsert(kolom, { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal_mulai_set" })
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
