// app/api/penyisiran/spj/surat-tugas/[id]/file/route.ts
//
// GET   -> signed URL sementara (60 detik) ke file Surat Tugas asli di
// Supabase Storage (bucket privat "spj-files") supaya user bisa
// lihat/unduh kembali. Pengelola boleh buka ST siapa saja; petugas/
// tetangga biasa cuma boleh buka ST yang MEMANG ditautkan ke dirinya
// (dicek lewat spj_surat_tugas_petugas) -- mencegah satu petugas menebak
// ID lalu membuka Surat Tugas milik petugas lain.
//
// PATCH -> ganti/lengkapi file Surat Tugas pada RECORD YANG SUDAH ADA --
// khusus pengelola. Dibuat utk kasus ST yang nomor/tanggal/petugas-nya
// sudah tercatat (kolom `menunggu_file = true`, misalnya 19 ST no.
// 1246-1264 yang draft-nya dibuatkan Claude 22 Sep 2026 tanpa file asli
// krn sandbox tidak py akses Storage) tapi file aslinya belum diupload --
// SEBELUM ini, satu-satunya jalan pengelola cuma "+ Upload Surat Tugas"
// yang SELALU bikin record baru (bisa dobel nomor). File lama HANYA
// dihapus dari Storage kalau memang pernah benar2 ter-upload (bukan
// placeholder "surat-tugas/PENDING-....pdf" yg sengaja tidak py objek
// nyata di Storage).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";
import { UKURAN_MAKS_BYTE, bersihkanNamaFile } from "../../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const { id } = await params;
  const stId = Number(id);
  if (!Number.isFinite(stId)) return NextResponse.json({ error: "ID Surat Tugas tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    const { data: tautan, error: errTautan } = await supabase
      .from("spj_surat_tugas_petugas")
      .select("id")
      .eq("surat_tugas_id", stId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .maybeSingle();
    if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });
    if (!tautan) {
      return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });
    }
  }

  const { data: st, error: errSt } = await supabase
    .from("spj_surat_tugas")
    .select("file_path, file_nama_asli")
    .eq("id", stId)
    .maybeSingle();
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (!st) return NextResponse.json({ error: "Surat Tugas tidak ditemukan." }, { status: 404 });

  const { data: signed, error: errSigned } = await supabase.storage
    .from("spj-files")
    .createSignedUrl(st.file_path, 60);
  if (errSigned || !signed) {
    return NextResponse.json({ error: errSigned?.message || "Gagal membuat tautan unduh." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, file_nama_asli: st.file_nama_asli });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const { id } = await params;
  const stId = Number(id);
  if (!Number.isFinite(stId)) return NextResponse.json({ error: "ID Surat Tugas tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    return NextResponse.json(
      { error: "Mengganti file Surat Tugas hanya dapat dilakukan oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Data form tidak valid." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Surat Tugas wajib diupload." }, { status: 400 });
  }
  if (file.size > UKURAN_MAKS_BYTE) {
    return NextResponse.json({ error: "Ukuran file maksimal 15MB." }, { status: 400 });
  }

  const { data: stLama, error: errLama } = await supabase
    .from("spj_surat_tugas")
    .select("file_path")
    .eq("id", stId)
    .maybeSingle();
  if (errLama) return NextResponse.json({ error: errLama.message }, { status: 500 });
  if (!stLama) return NextResponse.json({ error: "Surat Tugas tidak ditemukan." }, { status: 404 });

  const namaFileBersih = bersihkanNamaFile(file.name || "surat-tugas");
  const pathBaru = `surat-tugas/${Date.now()}-${namaFileBersih}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: errUpload } = await supabase.storage
    .from("spj-files")
    .upload(pathBaru, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (errUpload) return NextResponse.json({ error: `Gagal upload file: ${errUpload.message}` }, { status: 500 });

  const { error: errUpdate } = await supabase
    .from("spj_surat_tugas")
    .update({
      file_path: pathBaru,
      file_nama_asli: file.name || null,
      menunggu_file: false,
      uploaded_by: namaPengelola,
    })
    .eq("id", stId);
  if (errUpdate) {
    // Bersihkan file baru yg terlanjur terupload kalau update metadata gagal.
    await supabase.storage.from("spj-files").remove([pathBaru]);
    return NextResponse.json({ error: errUpdate.message }, { status: 500 });
  }

  // File lama dihapus dari Storage HANYA kalau memang pernah benar2
  // ter-upload -- placeholder "surat-tugas/PENDING-....pdf" tidak py objek
  // nyata di Storage (dibuat lewat SQL langsung, bukan lewat endpoint
  // upload), jadi tidak ada yg perlu dihapus utk kasus itu. Best-effort,
  // kegagalan sengaja diabaikan (bukan bagian kritikal alur ganti file).
  if (stLama.file_path && !stLama.file_path.startsWith("surat-tugas/PENDING-")) {
    await supabase.storage.from("spj-files").remove([stLama.file_path]);
  }

  return NextResponse.json({ ok: true });
}
