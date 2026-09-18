// app/api/penyisiran/spj/laporan/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Laporan dari data yg SUDAH TERSIMPAN (baris
// spj_laporan, termasuk rekap_snapshot beku -- lihat catatan panjang di
// app/api/penyisiran/spj/laporan/route.ts kenapa snapshot, bukan hitung
// ulang tiap unduh). Pemilik laporan boleh unduh punya sendiri; pengelola
// SPJ boleh unduh siapa saja.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfLaporan, LaporanRekapSnapshot } from "@/lib/pdf/laporan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL_PERAN: Record<SpjPetugasJenis, string> = {
  penyisiran: "Petugas Penyisiran (Identifikasi Jorong)",
  tetangga: "Petugas Tetangga/Informan (Identifikasi Tetangga/Lainnya)",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const { id } = await params;
  const laporanId = Number(id);
  if (!Number.isFinite(laporanId)) return NextResponse.json({ error: "ID Laporan tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: laporan, error: errLaporan } = await supabase.from("spj_laporan").select("*").eq("id", laporanId).maybeSingle();
  if (errLaporan) return NextResponse.json({ error: errLaporan.message }, { status: 500 });
  if (!laporan) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });

  const pemilik = laporan.petugas_jenis === session.jenis && String(laporan.petugas_id) === String(session.petugasId);
  if (!pemilik) {
    const namaPengelola = await pastikanPengelolaSpj(session, supabase);
    if (!namaPengelola) return NextResponse.json({ error: "Laporan ini bukan milik Anda." }, { status: 403 });
  }

  const [{ data: st }, { data: akun }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", laporan.surat_tugas_id).maybeSingle(),
    supabase
      .from(tabelAkun(laporan.petugas_jenis as SpjPetugasJenis))
      .select("nama")
      .eq("id", laporan.petugas_id)
      .maybeSingle(),
  ]);

  const pdfBytes = await buatPdfLaporan({
    nomorSt: st?.nomor_st ?? "-",
    namaPetugas: akun?.nama ?? "-",
    peranLabel: LABEL_PERAN[laporan.petugas_jenis as SpjPetugasJenis],
    tanggal: laporan.tanggal,
    mode: laporan.mode === "bebas" ? "bebas" : "template",
    narasi: laporan.narasi,
    rekap: (laporan.rekap_snapshot as LaporanRekapSnapshot | null) ?? null,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Laporan-${st?.nomor_st ?? laporanId}-${laporan.tanggal}.pdf"`,
    },
  });
}
