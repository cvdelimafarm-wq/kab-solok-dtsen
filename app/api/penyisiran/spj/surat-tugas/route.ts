// app/api/penyisiran/spj/surat-tugas/route.ts
//
// GET  -> daftar Surat Tugas. Pengelola (lihat pastikanPengelolaSpj) lihat
//         SEMUA ST + siapa saja yang ditautkan; petugas/tetangga biasa
//         cuma lihat ST miliknya sendiri (ditautkan lewat
//         spj_surat_tugas_petugas).
// POST -> upload Surat Tugas ASLI (multipart/form-data) + tautkan ke
//         satu/lebih petugas sekaligus -- HANYA pengelola. File disimpan
//         di Supabase Storage bucket privat "spj-files" (dibuat di migrasi
//         20260918_spj_translok.sql), path-nya saja yang disimpan di
//         kolom file_path -- selalu diakses lewat signed URL, lihat
//         app/api/penyisiran/spj/surat-tugas/[id]/file/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const UKURAN_MAKS_BYTE = 15 * 1024 * 1024; // 15MB -- cukup lega utk scan PDF/foto ST

export function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Nama file dibersihkan dari karakter yang bisa bermasalah di path Storage
// -- spasi & karakter aneh diganti "_", tapi ekstensi & sebagian besar
// nama asli tetap kelihatan (memudahkan penelusuran manual di dashboard
// Supabase kalau perlu).
export function bersihkanNamaFile(nama: string): string {
  return nama.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);

  if (namaPengelola) {
    // Pengelola: semua ST + daftar petugas yang ditautkan ke masing2.
    const { data: semuaSt, error: errSt } = await supabase
      .from("spj_surat_tugas")
      .select(
        "id, nomor_st, tanggal_mulai, tanggal_selesai, keterangan, file_nama_asli, uploaded_by, created_at, menunggu_file"
      )
      .order("tanggal_mulai", { ascending: false });
    if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });

    const ids = (semuaSt ?? []).map((s: { id: number }) => s.id);
    let tautan: { surat_tugas_id: number; petugas_jenis: string; petugas_id: number }[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from("spj_surat_tugas_petugas")
        .select("surat_tugas_id, petugas_jenis, petugas_id")
        .in("surat_tugas_id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      tautan = data ?? [];
    }
    // Ambil nama tiap petugas yang ditautkan -- dua query terpisah (bukan
    // JOIN SQL) krn petugas_id polimorfik (dua kemungkinan tabel sumber).
    const idPenyisiran = [...new Set(tautan.filter((t) => t.petugas_jenis === "penyisiran").map((t) => t.petugas_id))];
    const idTetangga = [...new Set(tautan.filter((t) => t.petugas_jenis === "tetangga").map((t) => t.petugas_id))];
    const [{ data: namaPenyisiran }, { data: namaTetangga }] = await Promise.all([
      idPenyisiran.length > 0
        ? supabase.from("petugas_penyisiran_akun").select("id, nama").in("id", idPenyisiran)
        : Promise.resolve({ data: [] as { id: number; nama: string }[] }),
      idTetangga.length > 0
        ? supabase.from("tetangga_akun").select("id, nama").in("id", idTetangga)
        : Promise.resolve({ data: [] as { id: number; nama: string }[] }),
    ]);
    const petaNama = new Map<string, string>();
    for (const p of namaPenyisiran ?? []) petaNama.set(`penyisiran:${p.id}`, p.nama);
    for (const p of namaTetangga ?? []) petaNama.set(`tetangga:${p.id}`, p.nama);

    const suratTugas = (semuaSt ?? []).map((s: { id: number; [k: string]: unknown }) => ({
      ...s,
      petugas: tautan
        .filter((t) => t.surat_tugas_id === s.id)
        .map((t) => ({
          jenis: t.petugas_jenis,
          id: t.petugas_id,
          nama: petaNama.get(`${t.petugas_jenis}:${t.petugas_id}`) ?? "(tidak ditemukan)",
        })),
    }));

    return NextResponse.json({ pengelola: true, surat_tugas: suratTugas });
  }

  // Petugas/tetangga biasa: cuma ST yang ditautkan ke dirinya sendiri.
  const { data: tautanSaya, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const idSaya = (tautanSaya ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (idSaya.length === 0) return NextResponse.json({ pengelola: false, surat_tugas: [] });

  const { data: stSaya, error: errStSaya } = await supabase
    .from("spj_surat_tugas")
    .select("id, nomor_st, tanggal_mulai, tanggal_selesai, keterangan, file_nama_asli, created_at, menunggu_file")
    .in("id", idSaya)
    .order("tanggal_mulai", { ascending: false });
  if (errStSaya) return NextResponse.json({ error: errStSaya.message }, { status: 500 });

  return NextResponse.json({ pengelola: false, surat_tugas: stSaya ?? [] });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    return NextResponse.json(
      { error: "Upload Surat Tugas hanya dapat dilakukan oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Data form tidak valid." }, { status: 400 });

  const nomorSt = String(form.get("nomor_st") || "").trim();
  const tanggalMulai = String(form.get("tanggal_mulai") || "").trim();
  const tanggalSelesai = String(form.get("tanggal_selesai") || "").trim();
  const keterangan = String(form.get("keterangan") || "").trim() || null;
  const petugasRaw = String(form.get("petugas") || "[]");
  const file = form.get("file");

  if (!nomorSt || !tanggalMulai || !tanggalSelesai) {
    return NextResponse.json({ error: "Nomor ST, tanggal mulai, dan tanggal selesai wajib diisi." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Surat Tugas wajib diupload." }, { status: 400 });
  }
  if (file.size > UKURAN_MAKS_BYTE) {
    return NextResponse.json({ error: "Ukuran file maksimal 15MB." }, { status: 400 });
  }

  let petugasList: { jenis: string; id: number }[] = [];
  try {
    const parsed = JSON.parse(petugasRaw);
    if (Array.isArray(parsed)) {
      petugasList = parsed.filter(
        (p) => p && (p.jenis === "penyisiran" || p.jenis === "tetangga") && Number.isFinite(Number(p.id))
      );
    }
  } catch {
    return NextResponse.json({ error: "Data petugas yang ditautkan tidak valid." }, { status: 400 });
  }
  if (petugasList.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 petugas untuk ditautkan ke Surat Tugas ini." }, { status: 400 });
  }

  const namaFileBersih = bersihkanNamaFile(file.name || "surat-tugas");
  const path = `surat-tugas/${Date.now()}-${namaFileBersih}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: errUpload } = await supabase.storage
    .from("spj-files")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (errUpload) return NextResponse.json({ error: `Gagal upload file: ${errUpload.message}` }, { status: 500 });

  const { data: stBaru, error: errInsert } = await supabase
    .from("spj_surat_tugas")
    .insert({
      nomor_st: nomorSt,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      keterangan,
      file_path: path,
      file_nama_asli: file.name || null,
      uploaded_by: namaPengelola,
    })
    .select("id")
    .single();
  if (errInsert || !stBaru) {
    // Bersihkan file yang terlanjur terupload kalau insert metadatanya gagal.
    await supabase.storage.from("spj-files").remove([path]);
    return NextResponse.json({ error: errInsert?.message || "Gagal menyimpan Surat Tugas." }, { status: 500 });
  }

  const rowsTautan = petugasList.map((p) => ({
    surat_tugas_id: stBaru.id,
    petugas_jenis: p.jenis,
    petugas_id: Number(p.id),
  }));
  const { error: errTautanBaru } = await supabase.from("spj_surat_tugas_petugas").insert(rowsTautan);
  if (errTautanBaru) return NextResponse.json({ error: errTautanBaru.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: stBaru.id });
}
