// app/api/sigap/pedia/[id]/file/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- unggah file bukti (multipart, beberapa file sekaligus) -- permintaan user.
// Field: file (berulang) + jenis (berulang, sejajar dgn file; "otomatis" = ditebak dari isi).
// Per file: validasi isi -> SHA-256 dari byte asli -> storage privat (tanpa timpa) -> TSA RFC 3161 ->
// khusus .eml: parse + DKIM + snapshot kunci DNS + ekstrak lampiran.

import { NextRequest, NextResponse } from "next/server";
import { aksesPedia, galat, simpanBukti } from "@/lib/pedia/server";
import { tebakJenis, type JenisFile } from "@/lib/pedia/deteksi";
import { MAKS_BYTE_FILE } from "@/lib/pedia/umum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JENIS: JenisFile[] = ["eml", "html", "pdf", "dkim_screenshot", "lampiran"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Hanya pengelola yang bisa mengunggah bukti.", 403);
  const { id } = await ctx.params;
  const { data: entri } = await s.db.from("pedia_entri").select("id, nomor_registrasi, tahun, status, nomor_tiket, tgl_dijawab, tgl_diajukan, judul").eq("id", Number(id)).maybeSingle();
  if (!entri) return galat("Entri tidak ditemukan.", 404);
  if (entri.status === "final" || entri.status === "dibatalkan") return galat(`Entri sudah ${entri.status}; file tidak bisa ditambah. Buat koreksi bila perlu.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat("Form unggahan tidak valid.");
  }
  const files = form.getAll("file").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);
  const jenisList = form.getAll("jenis").map(String);
  if (!files.length) return galat("Tidak ada file.");
  if (files.length > 20) return galat("Maksimal 20 file per unggahan.");

  const hasil: Record<string, unknown>[] = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAKS_BYTE_FILE) {
      hasil.push({ nama: f.name, ok: false, galat: "Lebih dari 25 MB." });
      continue;
    }
    // byte asli, tanpa modifikasi apa pun
    const data = Buffer.from(await f.arrayBuffer());
    const pilih = jenisList[i] ?? "otomatis";
    const jenis: JenisFile = JENIS.includes(pilih as JenisFile) ? (pilih as JenisFile) : tebakJenis(data);
    try {
      // entri dibaca ulang (nomor tiket/tanggal bisa terisi otomatis oleh .eml sebelumnya)
      const { data: e2 } = await s.db.from("pedia_entri").select("id, nomor_registrasi, tahun, status, nomor_tiket, tgl_dijawab, tgl_diajukan, judul").eq("id", entri.id).single();
      const r = await simpanBukti(s, e2 ?? entri, { nama: f.name || `file-${i + 1}`, data, jenis });
      hasil.push({ ...r, ok: true });
    } catch (e) {
      hasil.push({ nama: f.name, ok: false, galat: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: hasil.some((h) => h.ok), hasil });
}
