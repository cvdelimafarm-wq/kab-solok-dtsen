// app/api/sigap/kontrak/[id]/unduh/route.ts
//
// (6 Okt 2026) Unduh dokumen kontrak -- permintaan user: "generate pdf/word dipecah sesuai nama dokumen".
// GET ?dok=DOK_01..DOK_21 | semua (1 file .docx gabungan) | zip (21 file .docx terpisah)
//     &format=docx (bawaan) | pdf
// PDF butuh LibreOffice (soffice) di server. Bila tidak ada -> 501 dgn pesan jelas (Word tetap bisa).

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import JSZip from "jszip";
import { aksesKontrak } from "@/lib/kontrak/akses";
import { DAFTAR_DOKUMEN, hitung, type Isian, type Penyedia } from "@/lib/kontrak/isi";
import { docxLengkap, docxPerDokumen, isiTemplate } from "@/lib/kontrak/docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function amanNama(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function jalankan(cmd: string, args: string[], timeout = 90_000): Promise<void> {
  return new Promise((ok, gagal) => execFile(cmd, args, { timeout }, (e) => (e ? gagal(e) : ok())));
}

/** Konversi beberapa docx -> pdf sekaligus (satu proses soffice). null bila soffice tak tersedia. */
async function kePdf(berkas: { nama: string; data: Buffer }[]): Promise<{ nama: string; data: Buffer }[] | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kontrak-"));
  try {
    const masuk: string[] = [];
    for (const [i, b] of berkas.entries()) {
      const p = path.join(dir, `f${String(i).padStart(2, "0")}.docx`);
      await fs.writeFile(p, b.data);
      masuk.push(p);
    }
    const profil = `-env:UserInstallation=file://${path.join(dir, "profil")}`;
    let ok = false;
    for (const cmd of ["soffice", "libreoffice"]) {
      try {
        await jalankan(cmd, [profil, "--headless", "--convert-to", "pdf", "--outdir", dir, ...masuk]);
        ok = true;
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    if (!ok) return null;
    return Promise.all(berkas.map(async (b, i) => ({ nama: b.nama.replace(/\.docx$/, ".pdf"), data: await fs.readFile(path.join(dir, `f${String(i).padStart(2, "0")}.pdf`)) })));
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function kirim(data: Buffer, nama: string, mime: string) {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nama)}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await aksesKontrak(req);
  if ("gagal" in s) return s.gagal;
  const { db } = s;
  const { id } = await ctx.params;
  const dok = req.nextUrl.searchParams.get("dok") ?? "zip";
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";

  const { data: p } = await db.from("kontrak_paket").select("*").eq("id", Number(id)).maybeSingle();
  if (!p) return galat("Paket tidak ditemukan.", 404);
  const [{ data: m }, { data: pen }] = await Promise.all([
    db.from("kontrak_master_tahun").select("data").eq("tahun", p.tahun).maybeSingle(),
    p.penyedia_id ? db.from("kontrak_penyedia").select("*").eq("id", p.penyedia_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const h = hitung((m?.data ?? {}) as Record<string, string>, (pen as Penyedia | null) ?? null, { ...(p.isian as Isian), tahun: p.tahun }, (p.timpa ?? {}) as Record<string, string>);

  const jenis = String(p.jenis_template || "paket_meeting").replace(/[^a-z0-9_]/gi, "");
  let template: Buffer;
  try {
    template = await fs.readFile(path.join(process.cwd(), "lib", "kontrak", "template", `${jenis}.docx`));
  } catch {
    return galat(`Template "${jenis}" tidak ditemukan di server.`, 500);
  }
  const zip = await isiTemplate(template, { nilai: h.nilai, items: h.items, survei3: h.survei3 });
  const awalan = `${p.nomor_urut ?? p.id}_${amanNama(p.nama || "Paket")}`.slice(0, 60);

  let berkas: { nama: string; data: Buffer }[];
  if (dok === "semua") berkas = [{ nama: `${awalan}_Lengkap.docx`, data: await docxLengkap(zip) }];
  else {
    const kode = dok === "zip" ? undefined : [dok];
    if (kode && !DAFTAR_DOKUMEN.some((d) => d.kode === dok)) return galat("Kode dokumen tidak dikenal.");
    const per = await docxPerDokumen(zip, kode);
    berkas = DAFTAR_DOKUMEN.filter((d) => per[d.kode]).map((d) => ({ nama: `${d.nama}.docx`, data: per[d.kode] }));
  }

  if (format === "pdf") {
    const pdf = await kePdf(berkas);
    if (!pdf) return galat("PDF belum bisa dibuat: LibreOffice belum terpasang di server. Silakan unduh versi Word dulu.", 501);
    berkas = pdf;
  }

  if (berkas.length === 1 && dok !== "zip") {
    const b = berkas[0];
    return kirim(b.data, dok === "semua" ? b.nama : `${awalan}_${b.nama}`, format === "pdf" ? "application/pdf" : MIME_DOCX);
  }
  const z = new JSZip();
  for (const b of berkas) z.file(b.nama, b.data);
  const isi = await z.generateAsync({ type: "nodebuffer", compression: format === "pdf" ? "STORE" : "DEFLATE" });
  return kirim(isi, `${awalan}_${format.toUpperCase()}.zip`, "application/zip");
}
