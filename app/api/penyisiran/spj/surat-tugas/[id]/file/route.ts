// app/api/penyisiran/spj/surat-tugas/[id]/file/route.ts
//
// GET -> signed URL sementara (60 detik) ke file Surat Tugas asli di
// Supabase Storage (bucket privat "spj-files") supaya user bisa
// lihat/unduh kembali. Pengelola boleh buka ST siapa saja; petugas/
// tetangga biasa cuma boleh buka ST yang MEMANG ditautkan ke dirinya
// (dicek lewat spj_surat_tugas_petugas) -- mencegah satu petugas menebak
// ID lalu membuka Surat Tugas milik petugas lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";

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
