// app/api/penyisiran/spj/kwitansi/[id]/pdf/route.ts
//
// GET -> hasilkan & alirkan PDF Kwitansi. Nama & identitas "Yang menerima"
// diambil dari akun petugas pemilik Kwitansi ini (kolom `nip` baru di
// petugas_penyisiran_akun/tetangga_akun) -- kalau kosong, dicetak "-".
// Label identitas PPL pakai "Nik." (kolom `nip` menyimpan NIK utk PPL),
// selain itu (PML/tetangga/dll) pakai "Nip." -- lihat kolom `jabatan` &
// labelIdentitas() di lib/pdf/kwitansi.ts.

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

  const jenisKwitansi = kwitansi.petugas_jenis as SpjPetugasJenis;
  // Kolom "jabatan" (utk pilih label Nik./Nip.) HANYA ada di
  // petugas_penyisiran_akun -- tetangga_akun tidak py kolom itu, jadi
  // select-nya dibedakan per jenis spy tidak error "column does not exist".
  // DUA query .select() TERPISAH (bukan 1 ternary di dalam .select()) krn
  // tipe supabase-js mem-parse string select() scr LITERAL -- union dari 2
  // string literal bikin hasilnya ParserError di TypeScript walau valid di
  // runtime; hasil gabungannya di-cast manual ke bentuk yg sama (`jabatan`
  // opsional).
  const [{ data: st }, { data: akunRaw }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", kwitansi.surat_tugas_id).maybeSingle(),
    jenisKwitansi === "penyisiran"
      ? supabase.from(tabelAkun(jenisKwitansi)).select("nama, nip, jabatan").eq("id", kwitansi.petugas_id).maybeSingle()
      : supabase.from(tabelAkun(jenisKwitansi)).select("nama, nip").eq("id", kwitansi.petugas_id).maybeSingle(),
  ]);
  const akun = akunRaw as { nama: string | null; nip: string | null; jabatan?: string | null } | null;

  const pdfBytes = await buatPdfKwitansi({
    nomorSt: st?.nomor_st ?? "-",
    tanggalSpd: kwitansi.tanggal_spd,
    nominal: Number(kwitansi.nominal),
    terbilang: kwitansi.terbilang,
    untukPerjalananDinasPada: kwitansi.untuk_perjalanan_dinas_pada,
    tanggalKwitansi: kwitansi.tanggal_kwitansi,
    namaPenerima: akun?.nama ?? "-",
    idPenerima: akun?.nip ?? null,
    jabatanPenerima: akun?.jabatan ?? null,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Kwitansi-${st?.nomor_st ?? kwitansiId}.pdf"`,
    },
  });
}
