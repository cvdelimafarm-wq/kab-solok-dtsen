// lib/pedia/deteksi.ts
//
// (7 Okt 2026) SIGAP PEDIA -- validasi tipe file berdasarkan ISI (magic bytes / parsing), bukan ekstensi
// -- permintaan user. File tidak diubah sedikit pun; fungsi ini hanya membaca.

export type JenisFile = "eml" | "html" | "pdf" | "dkim_screenshot" | "lampiran";
export type HasilDeteksi = { ok: true; mime: string; bentuk: string } | { ok: false; alasan: string };

const awal = (b: Uint8Array, sig: number[], ofs = 0) => sig.every((v, i) => b[ofs + i] === v);

function teksAwal(b: Uint8Array, n = 65536): string {
  return Buffer.from(b.subarray(0, Math.min(n, b.length))).toString("latin1");
}

/** Bentuk teknis file dari isinya. */
export function bentukFile(b: Uint8Array): { bentuk: string; mime: string } {
  if (awal(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { bentuk: "pdf", mime: "application/pdf" };
  if (awal(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { bentuk: "png", mime: "image/png" };
  if (awal(b, [0xff, 0xd8, 0xff])) return { bentuk: "jpeg", mime: "image/jpeg" };
  if (awal(b, [0x52, 0x49, 0x46, 0x46]) && awal(b, [0x57, 0x45, 0x42, 0x50], 8)) return { bentuk: "webp", mime: "image/webp" };
  if (awal(b, [0x50, 0x4b, 0x03, 0x04])) return { bentuk: "zip", mime: "application/zip" };
  if (awal(b, [0xd0, 0xcf, 0x11, 0xe0])) return { bentuk: "ole", mime: "application/x-ole-storage" };
  const t = teksAwal(b).replace(/^﻿/, "").replace(/^\xEF\xBB\xBF/, "");
  if (/^\s*MIME-Version:/im.test(t.slice(0, 4000)) && /Content-Type:\s*multipart\/related/i.test(t.slice(0, 8000)) && !/^(Received|DKIM-Signature|Message-ID):/im.test(t.slice(0, 8000)))
    return { bentuk: "mhtml", mime: "multipart/related" };
  if (pesanEmail(t)) return { bentuk: "eml", mime: "message/rfc822" };
  if (/<!doctype\s+html|<html[\s>]/i.test(t.slice(0, 20000)) || /<!--\s*\n?\s*Page saved with SingleFile/i.test(t.slice(0, 2000))) return { bentuk: "html", mime: "text/html" };
  return { bentuk: "lain", mime: "application/octet-stream" };
}

/** Email RFC 5322: blok header (Nama: nilai) di awal yg memuat From & (Date|Message-ID), lalu baris kosong. */
function pesanEmail(t: string): boolean {
  const batas = t.search(/\r?\n\r?\n/);
  if (batas < 0) return false;
  const kepala = t.slice(0, batas);
  const baris = kepala.split(/\r?\n/);
  if (!/^[A-Za-z0-9-]+:/.test(baris[0] ?? "")) return false;
  if (!baris.every((l) => /^[A-Za-z0-9-]+:/.test(l) || /^[ \t]/.test(l))) return false;
  return /^From:/im.test(kepala) && (/^Date:/im.test(kepala) || /^Message-ID:/im.test(kepala));
}

/** Validasi kecocokan isi dgn jenis yg dipilih pengguna. */
export function validasiJenis(b: Uint8Array, jenis: JenisFile): HasilDeteksi {
  if (b.length === 0) return { ok: false, alasan: "File kosong." };
  const { bentuk, mime } = bentukFile(b);
  const cocok: Record<JenisFile, string[]> = {
    eml: ["eml"],
    html: ["html", "mhtml"],
    pdf: ["pdf"],
    dkim_screenshot: ["png", "jpeg", "webp", "pdf"],
    lampiran: ["pdf", "png", "jpeg", "webp", "zip", "ole", "html", "mhtml", "eml", "lain"],
  };
  if (!cocok[jenis].includes(bentuk))
    return { ok: false, alasan: `Isi file terdeteksi sebagai "${bentuk}", tidak cocok dengan jenis "${jenis}".` };
  return { ok: true, mime, bentuk };
}

/** Tebak jenis dari isi (dipakai bila pengguna memilih "otomatis"). */
export function tebakJenis(b: Uint8Array): JenisFile {
  const { bentuk } = bentukFile(b);
  if (bentuk === "eml") return "eml";
  if (bentuk === "html" || bentuk === "mhtml") return "html";
  if (bentuk === "pdf") return "pdf";
  return "lampiran";
}
