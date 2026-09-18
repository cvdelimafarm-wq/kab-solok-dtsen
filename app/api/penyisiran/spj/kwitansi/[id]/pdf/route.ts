// app/api/penyisiran/spj/kwitansi/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Kwitansi. Nama & NIP "Yang menerima"
// diambil dari akun petugas pemilik Kwitansi ini (kolom `nip` baru di
// petugas_penyisiran_akun/tetangga_akun) -- kalau NIP kosong (petugas
// bukan ASN/belum diisi), dicetak "-" (lihat lib/pdf/kwitansi.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfKwitansi } from "@/lib/pdf/kwitansi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const { id } = await params;
  const kwitansiId = Number(id);
  if (!Number.isFinite(kwitansiId)) return NextResponse.json({ error: "ID Kwitansi tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: kwitansi, error: errK } = await supabase.from("spj_kwitansi").select("*").eq("id", kwitansiId).maybeSingle();
  if (errK) return NextResponse.json({ error: errK.message }, { status: 500 });
  if (!kwitansi) return NextResponse.json({ error: "Kwitansi tidak ditemukan." }, { status: 404 });

  const pemilik = kwitansi.petugas_jenis === session.jenis && String(kwitansi.petugas_id) === String(session.petugasId);
  if (!pemilik) {
    const namaPengelola = await pastikanPengelolaSpj(session, supabase);
    if (!namaPengelola) return NextResponse.json({ error: "Kwitansi ini bukan milik Anda." }, { status: 403 });
  }

  const [{ data: st }, { data: akun }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", kwitansi.surat_tugas_id).maybeSingle(),
    supabase
      .from(tabelAkun(kwitansi.petugas_jenis as SpjPetugasJenis))
      .select("nama, nip")
      .eq("id", kwitansi.petugas_id)
      .maybeSingle(),
  ]);

  const pdfBytes = await buatPdfKwitansi({
    nomorSt: st?.nomor_st ?? "-",
    tanggalSpd: kwitansi.tanggal_spd,
    nominal: Number(kwitansi.nominal),
    terbilang: kwitansi.terbilang,
    untukPerjalananDinasPada: kwitansi.untuk_perjalanan_dinas_pada,
    tanggalKwitansi: kwitansi.tanggal_kwitansi,
    namaPenerima: akun?.nama ?? "-",
    nipPenerima: akun?.nip ?? null,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Kwitansi-${st?.nomor_st ?? kwitansiId}.pdf"`,
    },
  });
}
