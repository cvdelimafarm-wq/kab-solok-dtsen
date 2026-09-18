// app/api/penyisiran/spj/laporan/route.ts
//
// GET  -> daftar Surat Tugas milik petugas yg login, masing2 disertai
//         daftar Laporan (per tanggal) yg sudah pernah dibuat utknya.
// POST -> buat/perbarui (upsert, kunci: surat_tugas_id+petugas_jenis+
//         petugas_id+tanggal) SATU Laporan utk SATU tanggal dlm rentang
//         Surat Tugas tsb. Dua mode:
//   - "template": rekap ditarik OTOMATIS dari penyisiran_usaha, sumbernya
//     kolom identifikasi_ppl/identifikasi_ppl_at/identifikasi_ppl_oleh/
//     identifikasi_ppl_role yg ditulis tab Identifikasi Jorong/Tetangga
//     (BUKAN status_kunjungan/penyisiran_oleh_id tab "Penyisiran Usaha" --
//     itu role & tabel akun yg beda konteksnya, walau utk jenis
//     "penyisiran" kebetulan sama2 mengacu ke petugas_penyisiran_akun;
//     dipilih identifikasi_ppl krn itulah aktivitas yg BENAR2 dilakukan
//     lewat akun yg dipakai login menu SPJ ini, dan satu2nya yg tersedia
//     jg utk jenis "tetangga"). Hasil tarikannya DISIMPAN sbg snapshot
//     (kolom rekap_snapshot, jsonb) supaya laporan yg sudah jadi tidak
//     berubah diam2 kalau datanya diedit belakangan di tab Identifikasi.
//   - "bebas": narasi bebas dari petugas, rekap_snapshot null.
//
// Kalau mode "template" tapi TIDAK ADA aktivitas tercatat pada tanggal
// itu, request DITOLAK dgn pesan yg mengarahkan petugas mengoreksi data
// di tab Identifikasi Jorong/Tetangga dulu (sesuai permintaan user) atau
// pakai mode "bebas" -- BUKAN diam2 menyimpan laporan kosong.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, tabelAkun, roleUntukJenis } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

function tanggalBerikutnya(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
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

  const [{ data: stList, error: errSt }, { data: laporanList, error: errLaporan }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_laporan")
      .select("id, surat_tugas_id, tanggal, mode, narasi, rekap_snapshot, created_at")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids)
      .order("tanggal", { ascending: false }),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errLaporan) return NextResponse.json({ error: errLaporan.message }, { status: 500 });

  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    laporan: (laporanList ?? []).filter((l: { surat_tugas_id: number }) => l.surat_tugas_id === st.id),
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
  const tanggal = String(body?.tanggal || "").trim();
  const mode = body?.mode === "bebas" ? "bebas" : "template";
  const narasi = typeof body?.narasi === "string" ? body.narasi.trim() : "";

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return NextResponse.json({ error: "Tanggal wajib diisi." }, { status: 400 });
  if (mode === "bebas" && !narasi) {
    return NextResponse.json({ error: "Narasi wajib diisi utk mode Narasi Bebas." }, { status: 400 });
  }

  // Pastikan ST ini memang milik petugas yg login.
  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });

  // Tanggal laporan wajib dlm rentang tanggal_mulai..tanggal_selesai ST ini.
  const { data: stRow, error: errStRow } = await supabase
    .from("spj_surat_tugas")
    .select("tanggal_mulai, tanggal_selesai")
    .eq("id", suratTugasId)
    .maybeSingle();
  if (errStRow) return NextResponse.json({ error: errStRow.message }, { status: 500 });
  if (!stRow) return NextResponse.json({ error: "Surat Tugas tidak ditemukan." }, { status: 404 });
  if (tanggal < stRow.tanggal_mulai || tanggal > stRow.tanggal_selesai) {
    return NextResponse.json(
      { error: `Tanggal laporan harus dlm rentang ${stRow.tanggal_mulai} s/d ${stRow.tanggal_selesai} sesuai Surat Tugas.` },
      { status: 400 }
    );
  }

  let rekapSnapshot: unknown = null;

  if (mode === "template") {
    const { data: akun } = await supabase.from(tabelAkun(session.jenis)).select("nama").eq("id", session.petugasId).maybeSingle();
    const nama = akun?.nama ?? null;
    if (!nama) return NextResponse.json({ error: "Akun petugas tidak ditemukan." }, { status: 404 });

    const batasAtas = tanggalBerikutnya(tanggal);
    const { data: rows, error: errRows } = await supabase
      .from("penyisiran_usaha")
      .select("kec_nama, nagari_nama, sls_nama, subsls_kode, identifikasi_ppl, identifikasi_ppl_at")
      .eq("identifikasi_ppl_role", roleUntukJenis(session.jenis))
      .eq("identifikasi_ppl_oleh", nama)
      .gte("identifikasi_ppl_at", `${tanggal}T00:00:00+07:00`)
      .lt("identifikasi_ppl_at", `${batasAtas}T00:00:00+07:00`);
    if (errRows) return NextResponse.json({ error: errRows.message }, { status: 500 });

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Tidak ada aktivitas identifikasi yang tercatat pada tanggal ini di tab Identifikasi Jorong/Tetangga. " +
            "Silakan koreksi/lengkapi data di tab tersebut dulu, atau gunakan mode Narasi Bebas.",
        },
        { status: 400 }
      );
    }

    type Lokasi = {
      kecNama: string | null;
      nagariNama: string | null;
      slsNama: string | null;
      subslsKode: string | null;
      waktuMulai: string | null;
      waktuSelesai: string | null;
      jumlah: number;
    };
    const peta = new Map<string, Lokasi>();
    const rekapIdentifikasi = { ada: 0, tidak_ada: 0, ragu: 0, belum: 0 };
    for (const r of rows as {
      kec_nama: string | null;
      nagari_nama: string | null;
      sls_nama: string | null;
      subsls_kode: string | null;
      identifikasi_ppl: string | null;
      identifikasi_ppl_at: string | null;
    }[]) {
      const key = `${r.kec_nama ?? ""}|${r.nagari_nama ?? ""}|${r.sls_nama ?? ""}|${r.subsls_kode ?? ""}`;
      const at = r.identifikasi_ppl_at;
      const ada = peta.get(key);
      if (ada) {
        ada.jumlah += 1;
        if (at && (!ada.waktuMulai || at < ada.waktuMulai)) ada.waktuMulai = at;
        if (at && (!ada.waktuSelesai || at > ada.waktuSelesai)) ada.waktuSelesai = at;
      } else {
        peta.set(key, {
          kecNama: r.kec_nama,
          nagariNama: r.nagari_nama,
          slsNama: r.sls_nama,
          subslsKode: r.subsls_kode,
          waktuMulai: at,
          waktuSelesai: at,
          jumlah: 1,
        });
      }
      if (r.identifikasi_ppl && r.identifikasi_ppl in rekapIdentifikasi) {
        (rekapIdentifikasi as Record<string, number>)[r.identifikasi_ppl] += 1;
      }
    }
    const lokasi = [...peta.values()].sort((a, b) => (a.waktuMulai ?? "").localeCompare(b.waktuMulai ?? ""));

    const { count: jumlahDokumentasi } = await supabase
      .from("spj_dokumentasi_foto")
      .select("id", { count: "exact", head: true })
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .eq("tanggal", tanggal);

    rekapSnapshot = {
      lokasi,
      rekapIdentifikasi,
      totalAktivitas: rows.length,
      jumlahDokumentasi: jumlahDokumentasi ?? 0,
    };
  }

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_laporan")
    .upsert(
      {
        surat_tugas_id: suratTugasId,
        petugas_jenis: session.jenis,
        petugas_id: session.petugasId,
        tanggal,
        mode,
        narasi: narasi || null,
        rekap_snapshot: rekapSnapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal" }
    )
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan Laporan." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
