// app/api/penyisiran/spj/surat-keterangan/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Surat Pernyataan Tidak Menggunakan
// Kendaraan Dinas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfSuratKeterangan } from "@/lib/pdf/suratKeterangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const { id } = await params;
  const skId = Number(id);
  if (!Number.isFinite(skId)) return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: sk, error: errSk } = await supabase
    .from("spj_surat_pernyataan_kendaraan")
    .select("*")
    .eq("id", skId)
    .maybeSingle();
  if (errSk) return NextResponse.json({ error: errSk.message }, { status: 500 });
  if (!sk) return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });

  const pemilik = sk.petugas_jenis === session.jenis && String(sk.petugas_id) === String(session.petugasId);
  if (!pemilik) {
    const namaPengelola = await pastikanPengelolaSpj(session, supabase);
    if (!namaPengelola) return NextResponse.json({ error: "Data ini bukan milik Anda." }, { status: 403 });
  }

  const [{ data: st }, { data: akun }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", sk.surat_tugas_id).maybeSingle(),
    supabase
      .from(tabelAkun(sk.petugas_jenis as SpjPetugasJenis))
      .select("nama, nip")
      .eq("id", sk.petugas_id)
      .maybeSingle(),
  ]);

  const pdfBytes = await buatPdfSuratKeterangan({
    nomorSt: st?.nomor_st ?? "-",
    namaPetugas: akun?.nama ?? "-",
    nip: akun?.nip ?? null,
    jenis: sk.petugas_jenis as SpjPetugasJenis,
    tanggalPelaksanaan: sk.tanggal_pelaksanaan,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Surat-Keterangan-Kendaraan-${st?.nomor_st ?? skId}.pdf"`,
    },
  });
}
