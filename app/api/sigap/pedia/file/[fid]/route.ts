// app/api/sigap/pedia/file/[fid]/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- akses file bukti (khusus pengelola) -- permintaan user.
// GET              -> { url } signed URL 60 detik (unduh asli), tercatat di audit
// GET ?mode=lihat  -> isi utk viewer: eml (header + teks + html utk disanitasi di browser), html (teks), pdf/gambar (signed URL)
// GET ?mode=tsr    -> signed URL token .tsr
// POST             -> coba ulang timestamp (bila masih tertunda)

import { NextRequest, NextResponse } from "next/server";
import { aksesPedia, audit, cobaUlangTsa, galat, unduhStorage } from "@/lib/pedia/server";
import { uraiEml } from "@/lib/pedia/eml";
import { BUCKET_PEDIA } from "@/lib/pedia/umum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ fid: string }> }) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("File bukti asli hanya bisa dibuka pengelola (Admin Anggaran).", 403);
  const { fid } = await ctx.params;
  const { data: f } = await s.db.from("pedia_file").select("id, entri_id, jenis, nama_asli, mime, path, tsa_path, ukuran").eq("id", Number(fid)).maybeSingle();
  if (!f) return galat("File tidak ditemukan.", 404);
  const mode = req.nextUrl.searchParams.get("mode") ?? "unduh";

  if (mode === "lihat") {
    await audit(s, "lihat_file", f.entri_id, f.id);
    if (f.jenis === "eml" || f.mime === "message/rfc822") {
      const u = await uraiEml(await unduhStorage(s.db, f.path));
      return NextResponse.json({ jenis: "eml", header: u.header, teks: u.teks, html: u.html });
    }
    if (f.mime === "text/html" || f.mime === "multipart/related") {
      const b = await unduhStorage(s.db, f.path);
      if (f.mime === "multipart/related") return NextResponse.json({ jenis: "mhtml", teks: b.toString("utf8").slice(0, 2_000_000) });
      return NextResponse.json({ jenis: "html", html: b.toString("utf8") });
    }
    const { data } = await s.db.storage.from(BUCKET_PEDIA).createSignedUrl(f.path, 120);
    return NextResponse.json({ jenis: f.mime === "application/pdf" ? "pdf" : f.mime?.startsWith("image/") ? "gambar" : "lain", url: data?.signedUrl ?? null });
  }

  const path = mode === "tsr" ? f.tsa_path : f.path;
  if (!path) return galat("Token timestamp belum ada.", 404);
  const nama = mode === "tsr" ? `${f.nama_asli}.tsr` : f.nama_asli;
  const { data, error } = await s.db.storage.from(BUCKET_PEDIA).createSignedUrl(path, 60, { download: nama });
  if (error || !data) return galat("Gagal membuat tautan unduh.", 500);
  await audit(s, mode === "tsr" ? "unduh_tsr" : "unduh_file", f.entri_id, f.id, { nama });
  return NextResponse.json({ url: data.signedUrl, nama });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ fid: string }> }) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Hanya pengelola.", 403);
  const { fid } = await ctx.params;
  try {
    return NextResponse.json(await cobaUlangTsa(s, Number(fid)));
  } catch (e) {
    return galat(e instanceof Error ? e.message : String(e), 500);
  }
}
