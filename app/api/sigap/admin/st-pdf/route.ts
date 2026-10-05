// app/api/sigap/admin/st-pdf/route.ts
//
// (5 Okt 2026) Unggah PDF Surat Tugas GABUNGAN -- permintaan user: admin cukup mengunggah 1 PDF berisi
// semua ST, sistem memotong per ST dan menautkan ke petugasnya lewat NOMOR ST.
// Teks tiap halaman dibaca di browser (pdf.js), lalu dikirim peta { nomor -> halaman[] } bersama file aslinya.
// Server memotong dgn pdf-lib dan menyimpan ke bucket privat sigap-files: st/<kegiatan>/<surat_tugas_id>.pdf
//
// POST multipart { kegiatan_id, file (PDF), peta (JSON: [{nomor, halaman:[0-based]}]) }
//   -> { ok, disimpan:[{nomor, nama}], tidak_dikenal:[nomor], belum_berfile:[{nomor, nama}] }
// GET ?kegiatan_id=&surat_tugas_id=  -> URL bertanda tangan (1 jam) utk melihat file ST

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_BYTE = 40 * 1024 * 1024;
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, "");

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    const form = await req.formData();
    const kegiatanId = Number(form.get("kegiatan_id"));
    const { izin } = await izinAkun(db, akunId);
    if (!boleh(izin, "translok.penugasan", "kelola", kegiatanId)) return NextResponse.json({ error: "Tidak punya izin mengelola Surat Tugas." }, { status: 403 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "File PDF tidak ditemukan." }, { status: 400 });
    if (file.size > MAKS_BYTE) return NextResponse.json({ error: "Ukuran PDF maksimal 40 MB." }, { status: 400 });
    let peta: { nomor: string; halaman: number[] }[];
    try {
      peta = JSON.parse(String(form.get("peta") ?? "[]"));
    } catch {
      return NextResponse.json({ error: "Peta halaman tidak valid." }, { status: 400 });
    }

    const sumber = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const jmlHal = sumber.getPageCount();
    const { data: stRows } = await db
      .from("sigap_surat_tugas")
      .select("id, nomor_st, nama_tertera, penugasan_id, file_path")
      .eq("kegiatan_id", kegiatanId);
    const byNomor = new Map((stRows ?? []).map((r) => [norm(r.nomor_st as string), r]));

    const disimpan: { nomor: string; nama: string | null }[] = [];
    const tidakDikenal: string[] = [];
    for (const p of peta) {
      const st = byNomor.get(norm(String(p.nomor ?? "")));
      const hal = (Array.isArray(p.halaman) ? p.halaman : []).filter((h) => Number.isInteger(h) && h >= 0 && h < jmlHal);
      if (!st || hal.length === 0) {
        tidakDikenal.push(String(p.nomor ?? "?"));
        continue;
      }
      const baru = await PDFDocument.create();
      const salin = await baru.copyPages(sumber, hal);
      salin.forEach((pg) => baru.addPage(pg));
      const bytes = await baru.save();
      const path = `st/${kegiatanId}/${st.id}.pdf`;
      const { error } = await db.storage.from(BUCKET_SIGAP).upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
      if (error) return NextResponse.json({ error: `Gagal menyimpan ST ${st.nomor_st}: ${error.message}` }, { status: 500 });
      await db.from("sigap_surat_tugas").update({ file_path: path }).eq("id", st.id);
      st.file_path = path;
      disimpan.push({ nomor: st.nomor_st as string, nama: (st.nama_tertera as string | null) ?? null });
    }
    const belum = (stRows ?? []).filter((r) => !r.file_path).map((r) => ({ nomor: r.nomor_st as string, nama: (r.nama_tertera as string | null) ?? null }));
    await catatAudit(db, akunId, "unggah_st_gabungan", { kegiatan_id: kegiatanId, file: file.name, halaman: jmlHal, disimpan: disimpan.length, tidak_dikenal: tidakDikenal });
    return NextResponse.json({ ok: true, disimpan, tidak_dikenal: tidakDikenal, belum_berfile: belum });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  const stId = Number(req.nextUrl.searchParams.get("surat_tugas_id"));
  const { data: st } = await db.from("sigap_surat_tugas").select("kegiatan_id, file_path").eq("id", stId).maybeSingle();
  if (!st?.file_path) return NextResponse.json({ error: "File ST belum ada." }, { status: 404 });
  const { izin } = await izinAkun(db, akunId);
  if (!boleh(izin, "translok.penugasan", "lihat", st.kegiatan_id as number)) return NextResponse.json({ error: "Tidak punya izin." }, { status: 403 });
  const { data } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(st.file_path as string, 3600);
  return NextResponse.json({ url: data?.signedUrl ?? null });
}
