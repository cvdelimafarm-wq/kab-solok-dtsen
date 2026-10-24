// app/sigap/revisi/pok/pdf.ts
//
// (24 Okt 2026) Membaca PDF POK resmi (RINCIAN KERTAS KERJA SATKER) DI BROWSER dengan pdf.js dari CDN (pola sama dengan app/sigap/admin/UnggahSt.tsx:
// tanpa paket npm, tanpa mengirim berkas ke server). Hanya mengambil potongan teks beserta koordinatnya; penguraian ada di lib/keu/rkks.ts (murni, teruji).

import { sha256Hex } from "@/lib/keu/glp039-xlsx";
import { MAKS_BYTE_PDF, type BerkasPdf } from "@/lib/keu/pok";
import { uraiRkks, type ItemPdf } from "@/lib/keu/rkks";

const URL_PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const URL_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

type Teks = { str?: string; width?: number; transform?: number[] };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Teks[] }> }>; destroy?: () => Promise<void> };
type PdfJs = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDoc> } };

let pdfjsCache: PdfJs | null = null;
async function muatPdfJs(): Promise<PdfJs> {
  if (pdfjsCache) return pdfjsCache;
  const mod = (await import(/* webpackIgnore: true */ URL_PDFJS)) as PdfJs;
  mod.GlobalWorkerOptions.workerSrc = URL_WORKER;
  pdfjsCache = mod;
  return mod;
}

/** Membaca satu berkas PDF RKKS. Melempar Error berpesan bahasa Indonesia bila berkas tidak dapat dibaca. */
export async function bacaBerkasPok(file: File): Promise<BerkasPdf> {
  if (file.size === 0) throw new Error("Berkas kosong.");
  if (file.size > MAKS_BYTE_PDF) throw new Error("Berkas terlalu besar (maksimum 40 MB).");
  const buf = await file.arrayBuffer();
  const hash = await sha256Hex(buf); // sebelum diserahkan ke pdf.js (yang dapat mengosongkan buffer)
  let items: ItemPdf[];
  try {
    const pdfjs = await muatPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    items = [];
    for (let h = 1; h <= doc.numPages; h++) {
      const isi = await (await doc.getPage(h)).getTextContent();
      for (const t of isi.items) {
        if (typeof t.str !== "string" || !t.transform) continue;
        items.push({ str: t.str, x: t.transform[4], y: t.transform[5], w: t.width ?? 0, hal: h });
      }
    }
    await doc.destroy?.();
  } catch {
    throw new Error("Berkas tidak dapat dibaca sebagai PDF. Gunakan PDF asli Rincian Kertas Kerja Satker dari SAKTI.");
  }
  if (items.length === 0) throw new Error("PDF tidak memuat teks (mungkin hasil pindai). Gunakan PDF asli dari SAKTI.");
  return { nama: file.name, ukuran: file.size, hash, hasil: uraiRkks(items) };
}
