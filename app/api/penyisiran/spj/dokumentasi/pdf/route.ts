// app/api/penyisiran/spj/dokumentasi/pdf/route.ts
//
// GET ?surat_tugas_id=&tanggal= -> hasilkan & alirkan PDF "Lampiran
// Dokumentasi Kegiatan" utk kombinasi ST+tanggal itu, mengunduh SEMUA
// foto yg sudah diupload (Supabase Storage) lalu di-*embed* langsung ke
// PDF via pdf-lib (lib/pdf/dokumentasi.ts) -- BUKAN cuma menaruh link,
// supaya file PDF-nya berdiri sendiri (bisa dilampirkan ke SPJ fisik/
// email tanpa bergantung akses Storage lagi).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfDokumentasi, DokumentasiFotoInput } from "@/lib/pdf/dokumentasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABEL_PERAN: Record<SpjPetugasJenis, string> = {
  penyisiran: "Petugas Penyisiran (Identifikasi Jorong)",
  tetangga: "Petugas Tetangga/Informan (Identifikasi Tetangga/Lainnya)",
};

function tebakContentType(path: string, blobType: string | undefined): string {
  if (blobType === "image/png" || blobType === "image/jpeg") return blobType;
  return path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });

  const suratTugasId = Number(req.nextUrl.searchParams.get("surat_tugas_id"));
  const tanggal = req.nextUrl.searchParams.get("tanggal") || "";
  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // MVP: Dokumentasi cuma bisa diunduh oleh pemiliknya sendiri (BEDA dgn
  // Visum/Laporan yg jg mengizinkan pengelola) -- krn 1 ST bisa ditautkan
  // ke banyak petugas & endpoint ini hanya menerima 1 kombinasi tanggal
  // per request, pengelola yg perlu memeriksa dokumentasi org lain utk
  // sementara diarahkan koordinasi langsung dgn petugas ybs.
  const { data: taut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });
  const jenisPemilik: SpjPetugasJenis = session.jenis;
  const petugasIdPemilik = session.petugasId;

  const { data: rows, error: errRows } = await supabase
    .from("spj_dokumentasi_foto")
    .select("slot, file_path")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", jenisPemilik)
    .eq("petugas_id", petugasIdPemilik)
    .eq("tanggal", tanggal)
    .order("slot", { ascending: true });
  if (errRows) return NextResponse.json({ error: errRows.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Belum ada foto yang diupload utk tanggal ini." }, { status: 400 });
  }

  const foto: DokumentasiFotoInput[] = [];
  for (const r of rows as { slot: number; file_path: string }[]) {
    const { data: blob, error: errDownload } = await supabase.storage.from("spj-files").download(r.file_path);
    if (errDownload || !blob) continue; // lewati foto yg gagal diunduh, jangan gagalkan seluruh PDF
    const bytes = new Uint8Array(await blob.arrayBuffer());
    foto.push({ slot: r.slot, bytes, contentType: tebakContentType(r.file_path, blob.type) });
  }

  const [{ data: st }, { data: akun }, { data: laporan }] = await Promise.all([
    supabase.from("spj_surat_tugas").select("nomor_st").eq("id", suratTugasId).maybeSingle(),
    supabase.from(tabelAkun(jenisPemilik)).select("nama").eq("id", petugasIdPemilik).maybeSingle(),
    supabase
      .from("spj_laporan")
      .select("rekap_snapshot")
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", jenisPemilik)
      .eq("petugas_id", petugasIdPemilik)
      .eq("tanggal", tanggal)
      .maybeSingle(),
  ]);

  let lokasi = "-";
  const lokasiArr = (laporan?.rekap_snapshot as { lokasi?: { kecNama: string | null; nagariNama: string | null }[] } | null)
    ?.lokasi;
  if (lokasiArr && lokasiArr.length > 0) {
    const nagariUnik = [...new Set(lokasiArr.map((l) => l.nagariNama).filter(Boolean))];
    const kecUnik = [...new Set(lokasiArr.map((l) => l.kecNama).filter(Boolean))];
    lokasi = `Nagari ${nagariUnik.join(", ")}, Kec. ${kecUnik.join(", ")}`;
  }

  const pdfBytes = await buatPdfDokumentasi({
    nomorSt: st?.nomor_st ?? "-",
    namaPetugas: akun?.nama ?? "-",
    peranLabel: LABEL_PERAN[jenisPemilik],
    tanggal,
    lokasi,
    foto,
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Dokumentasi-${st?.nomor_st ?? suratTugasId}-${tanggal}.pdf"`,
    },
  });
}
