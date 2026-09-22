// app/api/penyisiran/spj/surat-keterangan/route.ts
//
// GET  -> daftar Surat Tugas milik petugas yg login, disertai Surat
//         Keterangan Tidak Menggunakan Kendaraan Dinas-nya kalau sudah
//         pernah diisi (satu per ST), DITAMBAH `tanggal_pelaksanaan_otomatis`
//         (lihat hitungTanggalPelaksanaan di bawah) supaya form bisa
//         MENAMPILKAN tanggal yg akan dipakai SEBELUM disimpan.
// POST -> buat/perbarui (upsert) utk SATU ST miliknya sendiri. Semua field
//         (nama/NIP, & SEKARANG tanggal_pelaksanaan) terisi OTOMATIS --
//         petugas TIDAK LAGI mengetik/memilih tanggal sendiri.
//
// `tanggal_pelaksanaan` DIHITUNG OTOMATIS (bukan input manual lagi,
// permintaan user 22 Sep 2026 -- default lama `st.tanggal_mulai` sering
// SALAH krn 1 Surat Tugas translok biasa mencakup rentang BANYAK hari
// [mis. 2 minggu], padahal Surat Pernyataan ini menerangkan SATU hari
// pelaksanaan spesifik): diambil dari tanggal Laporan (spj_laporan)
// TERAKHIR yg sudah dibuat petugas utk Surat Tugas ini -- Laporan adalah
// bukti hari kerja RIIL yg sudah tercatat sistem (bukan cuma rencana),
// jadi tanggal terakhirnya adalah representasi paling akurat & terkini
// dari "hari tugas" yg sedang disebut petugas saat mengisi surat ini.
// Kalau petugas belum pernah membuat Laporan sama sekali utk ST ini,
// belum ada tanggal yg bisa dihitung -- POST akan ditolak (lihat pesan
// error di bawah) sampai minimal 1 Laporan dibuat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, SpjSession } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// supabase diketik "any" -- lihat catatan yg sama di lib/spjAuth.ts kenapa.
async function hitungTanggalPelaksanaan(
  supabase: any,
  session: SpjSession,
  suratTugasIds: number[]
): Promise<Map<number, string>> {
  const peta = new Map<number, string>();
  if (suratTugasIds.length === 0) return peta;
  const { data: rows } = await supabase
    .from("spj_laporan")
    .select("surat_tugas_id, tanggal")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .in("surat_tugas_id", suratTugasIds);
  for (const r of (rows ?? []) as { surat_tugas_id: number; tanggal: string }[]) {
    const skrg = peta.get(r.surat_tugas_id);
    if (!skrg || r.tanggal > skrg) peta.set(r.surat_tugas_id, r.tanggal);
  }
  return peta;
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
      .in("surat_tugas_id", ids),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errSk) return NextResponse.json({ error: errSk.message }, { status: 500 });

  const peta = new Map((skList ?? []).map((s: { surat_tugas_id: number }) => [s.surat_tugas_id, s]));
  const petaTanggalOtomatis = await hitungTanggalPelaksanaan(supabase, session, ids);
  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    surat_keterangan: peta.get(st.id) ?? null,
    tanggal_pelaksanaan_otomatis: petaTanggalOtomatis.get(st.id) ?? null,
  }));

  return NextResponse.json({ daftar });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const suratTugasId = Number(body?.surat_tugas_id);

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });

  // tanggal_pelaksanaan DIHITUNG DI SINI (abaikan apa pun yg dikirim client
  // -- lihat komentar hitungTanggalPelaksanaan di atas), bukan lagi dipilih
  // manual oleh petugas.
  const petaTanggal = await hitungTanggalPelaksanaan(supabase, session, [suratTugasId]);
  const tanggalPelaksanaan = petaTanggal.get(suratTugasId);
  if (!tanggalPelaksanaan) {
    return NextResponse.json(
      {
        error:
          "Anda belum membuat Laporan Perjalanan Dinas utk Surat Tugas ini -- buat Laporan dulu (menu Laporan) sebelum mengisi Surat Pernyataan, supaya tanggal pelaksanaan bisa dihitung otomatis.",
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

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_surat_pernyataan_kendaraan")
    .upsert(
      {
        surat_tugas_id: suratTugasId,
        petugas_jenis: session.jenis,
        petugas_id: session.petugasId,
        tanggal_pelaksanaan: tanggalPelaksanaan,
      },
      { onConflict: "surat_tugas_id,petugas_jenis,petugas_id" }
    )
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
