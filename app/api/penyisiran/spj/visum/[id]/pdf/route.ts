// app/api/penyisiran/spj/visum/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Visum (dibuat on-the-fly pakai pdf-lib,
// TIDAK disimpan di Storage -- beda dgn Surat Tugas yang memang file
// asli hasil scan). Pemilik visum boleh unduh punya sendiri; pengelola
// SPJ (lihat lib/manajemenTargetAkses.ts) boleh unduh siapa saja utk
// keperluan pemeriksaan berkas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfVisum } from "@/lib/pdf/visum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const { id } = await params;
  const visumId = Number(id);
  if (!Number.isFinite(visumId)) return NextResponse.json({ error: "ID Visum tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: visum, error: errVisum } = await supabase.from("spj_visum").select("*").eq("id", visumId).maybeSingle();
  if (errVisum) return NextResponse.json({ error: errVisum.message }, { status: 500 });
  if (!visum) return NextResponse.json({ error: "Visum tidak ditemukan." }, { status: 404 });

  const pemilik = visum.petugas_jenis === session.jenis && String(visum.petugas_id) === String(session.petugasId);
  if (!pemilik) {
    const namaPengelola = await pastikanPengelolaSpj(session, supabase);
    if (!namaPengelola) return NextResponse.json({ error: "Visum ini bukan milik Anda." }, { status: 403 });
  }

  const [{ data: st }, { data: akun }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", visum.surat_tugas_id).maybeSingle(),
    supabase
      .from(tabelAkun(visum.petugas_jenis as SpjPetugasJenis))
      .select("nama")
      .eq("id", visum.petugas_id)
      .maybeSingle(),
  ]);

  const pdfBytes = await buatPdfVisum({
    nomorSt: st?.nomor_st ?? "-",
    namaPetugas: akun?.nama ?? "-",
    rencanaTujuan: visum.rencana_tujuan,
    tempatKedudukan: visum.tempat_kedudukan,
    tanggalBerangkat: visum.tanggal_berangkat,
    tanggalTibaTujuan: visum.tanggal_tiba_tujuan,
    tanggalBerangkatKembali: visum.tanggal_berangkat_kembali,
    tanggalTibaKembali: visum.tanggal_tiba_kembali,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Visum-${st?.nomor_st ?? visumId}.pdf"`,
    },
  });
}
