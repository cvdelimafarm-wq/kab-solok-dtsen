// app/api/penyisiran/spj/kwitansi/route.ts
//
// GET  -> daftar Surat Tugas milik petugas yg login, masing2 disertai
//         DAFTAR Kwitansi-nya -- SEJAK 23 Sep 2026 BISA LEBIH DARI SATU per
//         ST (1 baris per SET tanggal, lihat lib/spjSetHariTugas.ts & migrasi
//         20260923_spj_dokumen_per_set_hari_tugas.sql; dulu tepat 1 baris/ST).
//         Tetap disertakan `untuk_perjalanan_dinas_pada_otomatis` (jenis
//         "penyisiran" saja -- lihat hitungKecamatanTugas di
//         lib/spjWilayahTugas.ts) supaya form bisa MENAMPILKAN nilai yg akan
//         dipakai SEBELUM disimpan.
// POST -> buat/perbarui SATU SET Kwitansi utk SATU ST miliknya sendiri.
//         - Kalau body kirim `id` -> EDIT baris SET itu (nominal/tanggal
//           boleh diganti, sesuai permintaan user "mungkin bisa tambahkan
//           pilihan ganti nilai jika perlu"), TANPA mengubah SET lain.
//         - Kalau TIDAK kirim `id` -> upsert berdasar kunci alami
//           (surat_tugas_id, petugas_jenis, petugas_id, tanggal_mulai_set):
//           kalau SET dgn tanggal_mulai_set itu sudah ada, jadi EDIT; kalau
//           belum, jadi SET BARU. Cara TERCEPAT bikin banyak SET sekaligus
//           tetap lewat POST /api/penyisiran/spj/buat-otomatis (dari data yg
//           sudah ada di sistem) -- endpoint ini utk isi/ubah manual 1 SET.
//         Nominal WAJIB diisi (boleh hasil saran "Buat Otomatis" yg lalu
//         diedit, boleh manual penuh).
//
// (28 Sep 2026, laporan user -- kasus B-1259/13030/SS.330/2026: Nominal
// "Rp. 170.000" tp Terbilang "Satu juta lima ratus tiga puluh ribu rupiah",
// alias ANGKA & TERBILANG TIDAK KONSISTEN) `terbilang` KIRIMAN CLIENT
// SEKARANG DIABAIKAN TOTAL -- field itu dulu boleh "ditimpa manual" (lihat
// riwayat di atas), yg berarti kalau form frontend (KwitansiSetForm)
// meng-otomatis-ulang `nominal` (mis. krn rentang tanggal SET diubah, atau
// tombol "isi tarif x hari" diklik) TANPA ikut meng-update state `terbilang`
// yg terpisah, nilai lama yg SUDAH TIDAK NYAMBUNG dgn nominal baru itu
// tetap terkirim & DIPERCAYA APA ADANYA oleh server (`terbilangInput ||
// terbilangRupiah(nominal)` -- terbilangInput menang kalau tidak kosong).
// SEKARANG `terbilang` SELALU dihitung ulang di server dari `nominal` yg
// SAMA yg disimpan pada baris itu (SATU sumber angka, sesuai prinsip yg
// sama dgn perbaikan tanggal_spd Kwitansi sebelumnya: "tidak mungkin
// menjelaskan trik ke berbagai user" -- jangan andalkan disiplin manual utk
// menjaga 2 field tetap sinkron, buat SISTEM yg TIDAK BISA membuatnya lepas
// sinkron). Field "Terbilang" di form SEKARANG jadi PREVIEW read-only
// (dihitung live di client dari nominal, fungsi SAMA persis), bukan input
// yg dikirim ke server.
//
// `untuk_perjalanan_dinas_pada` (kecamatan wilayah tugas) -- utk jenis
// "penyisiran" DIHITUNG OTOMATIS dari data yg SUDAH ADA di sistem (lewat
// hitungKecamatanTugas, SATU sumber logic yg SAMA dgn Visum -- lihat
// komentar di lib/spjWilayahTugas.ts), permintaan user 22 Sep 2026 spy tidak
// beda2/salah ketik antar dokumen. Utk jenis "tetangga" TETAP manual dari
// body (tidak ada sumber data wilayah tugas utk jenis ini).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, tabelAkun } from "@/lib/spjAuth";
import { terbilangRupiah } from "@/lib/spjFormat";
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

  const [{ data: stList, error: errSt }, { data: kwitansiList, error: errKwitansi }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_kwitansi")
      .select("*")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids)
      .order("tanggal_mulai_set", { ascending: true }),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errKwitansi) return NextResponse.json({ error: errKwitansi.message }, { status: 500 });

  const petaKwitansi = new Map<number, unknown[]>();
  for (const k of (kwitansiList ?? []) as { surat_tugas_id: number }[]) {
    const arr = petaKwitansi.get(k.surat_tugas_id) ?? [];
    arr.push(k);
    petaKwitansi.set(k.surat_tugas_id, arr);
  }
  const kecamatan = await hitungKecamatanTugas(supabase, session);
  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    kwitansi: petaKwitansi.get(st.id) ?? [],
    untuk_perjalanan_dinas_pada_otomatis: kecamatan.wilayahTugas,
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
  const nominal = Number(body?.nominal);
  const tanggalMulaiSet = String(body?.tanggal_mulai_set || "").trim();
  const tanggalSelesaiSet = String(body?.tanggal_selesai_set || tanggalMulaiSet || "").trim();
  const tanggalSpd = String(body?.tanggal_spd || tanggalMulaiSet || "").trim();
  const tanggalKwitansi = String(body?.tanggal_kwitansi || "").trim() || new Date().toISOString().slice(0, 10);
  // (28 Sep 2026) `body.terbilang` SENGAJA TIDAK DIBACA lagi -- lihat
  // komentar besar di atas file ini kenapa (kasus B-1259/13030/SS.330/2026,
  // nominal & terbilang lepas sinkron krn client bisa kirim terbilang lama
  // yg tidak lagi cocok dgn nominal baru). `terbilang` SEKARANG SELALU
  // dihitung ulang dari `nominal` yg baris ini SIMPAN (lihat di bawah).

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!Number.isFinite(nominal) || nominal < 0) return NextResponse.json({ error: "Nominal tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalMulaiSet) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalSelesaiSet) || tanggalSelesaiSet < tanggalMulaiSet) {
    return NextResponse.json({ error: "Rentang tanggal SET tidak valid (tanggal selesai harus >= tanggal mulai)." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalSpd)) return NextResponse.json({ error: "Tanggal SPD wajib diisi." }, { status: 400 });

  const jumlahHari = Math.round((new Date(tanggalSelesaiSet + "T00:00:00Z").getTime() - new Date(tanggalMulaiSet + "T00:00:00Z").getTime()) / 86400000) + 1;
  const nominalPerHari = jumlahHari > 0 ? nominal / jumlahHari : nominal;

  // untuk_perjalanan_dinas_pada: utk jenis "penyisiran" DIHITUNG DI SINI
  // (abaikan apa pun yg dikirim client utk field itu -- lihat komentar
  // hitungKecamatanTugas di atas). Utk jenis "tetangga" TETAP manual dari
  // body (tidak ada sumber data wilayah tugas utk jenis ini).
  let untukPerjalananDinasPada: string;
  if (session.jenis === "penyisiran") {
    const kecamatan = await hitungKecamatanTugas(supabase, session);
    if (!kecamatan.wilayahTugas) {
      return NextResponse.json(
        {
          error:
            "Kecamatan wilayah tugas Anda belum tercatat -- minta pengelola menautkan wilayah SLS Anda dulu di menu Perencanaan Lapangan sebelum mengisi Kwitansi.",
        },
        { status: 400 }
      );
    }
    untukPerjalananDinasPada = kecamatan.wilayahTugas;
  } else {
    untukPerjalananDinasPada = String(body?.untuk_perjalanan_dinas_pada || "").trim();
    if (!untukPerjalananDinasPada) {
      return NextResponse.json({ error: "Tujuan perjalanan dinas dalam kota wajib diisi." }, { status: 400 });
    }
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

  const terbilang = terbilangRupiah(nominal);
  const { data: akun } = await supabase.from(tabelAkun(session.jenis)).select("nama").eq("id", session.petugasId).maybeSingle();

  const kolom = {
    surat_tugas_id: suratTugasId,
    petugas_jenis: session.jenis,
    petugas_id: session.petugasId,
    nominal,
    terbilang,
    untuk_perjalanan_dinas_pada: untukPerjalananDinasPada,
    tanggal_spd: tanggalSpd,
    tanggal_kwitansi: tanggalKwitansi,
    created_by: akun?.nama ?? null,
    tanggal_mulai_set: tanggalMulaiSet,
    tanggal_selesai_set: tanggalSelesaiSet,
    nominal_per_hari: nominalPerHari,
    jumlah_hari: jumlahHari,
  };

  // Edit SET yg SUDAH ADA (dipilih via `id`, mis. dari daftar SET di
  // administrasi-spj.tsx) -- ownership dipastikan lewat eq petugas_jenis/id
  // di query update-nya sendiri, BUKAN select terpisah dulu.
  if (Number.isFinite(idEdit) && idEdit > 0) {
    const { data: updated, error: errUpdate } = await supabase
      .from("spj_kwitansi")
      .update(kolom)
      .eq("id", idEdit)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .select("id")
      .maybeSingle();
    if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Kwitansi (SET) ini tidak ditemukan / bukan milik Anda." }, { status: 404 });
    return NextResponse.json({ ok: true, id: updated.id });
  }

  // Tanpa `id` -- upsert berdasar kunci alami (SET baru kalau
  // tanggal_mulai_set belum pernah ada, edit kalau sudah).
  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_kwitansi")
    .upsert(kolom, { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal_mulai_set" })
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan Kwitansi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
