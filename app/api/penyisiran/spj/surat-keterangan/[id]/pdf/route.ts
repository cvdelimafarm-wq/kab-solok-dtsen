// app/api/penyisiran/spj/surat-keterangan/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Surat Pernyataan Tidak Menggunakan
// Kendaraan Dinas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfSuratKeterangan } from "@/lib/pdf/suratKeterangan";
import { hitungKecamatanTugas } from "@/lib/spjWilayahTugas";

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

  const jenisPetugas = sk.petugas_jenis as SpjPetugasJenis;
  // "jabatan" HANYA ada di petugas_penyisiran_akun -- tetangga_akun tidak
  // py kolom itu sama sekali (select-nya bakal error kalau ikut diminta).
  // DUA query .select() TERPISAH (bukan 1 ternary di dalam .select()) krn
  // tipe supabase-js mem-parse string select() scr LITERAL -- union dari 2
  // string literal bikin hasilnya ParserError di TypeScript walau valid di
  // runtime (pola sama spt di app/api/penyisiran/spj/cetak/route.ts).
  const [{ data: st }, { data: akunRaw }, kecamatan] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", sk.surat_tugas_id).maybeSingle(),
    jenisPetugas === "penyisiran"
      ? supabase.from(tabelAkun(jenisPetugas)).select("nama, nip, jabatan").eq("id", sk.petugas_id).maybeSingle()
      : supabase.from(tabelAkun(jenisPetugas)).select("nama, nip").eq("id", sk.petugas_id).maybeSingle(),
    hitungKecamatanTugas(supabase, { jenis: jenisPetugas, petugasId: String(sk.petugas_id) }),
  ]);
  const akun = akunRaw as { nama: string | null; nip: string | null; jabatan?: string | null } | null;

  const pdfBytes = await buatPdfSuratKeterangan({
    nomorSt: st?.nomor_st ?? "-",
    namaPetugas: akun?.nama ?? "-",
    nip: akun?.nip ?? null,
    jenis: jenisPetugas,
    tanggalMulaiSet: sk.tanggal_mulai_set,
    tanggalSelesaiSet: sk.tanggal_selesai_set,
    jabatan: akun?.jabatan ?? null,
    tempatKedudukan: kecamatan.domisili,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Surat-Keterangan-Kendaraan-${st?.nomor_st ?? skId}.pdf"`,
    },
  });
}
