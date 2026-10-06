// lib/kontrak/docx.ts
//
// (6 Okt 2026) Mesin isi template kontrak (.docx) -- permintaan user: template dari file mail merge
// "Paket Meeting", diisi otomatis lalu dipecah per nama dokumen.
//
// Konvensi template (lib/kontrak/template/*.docx, hasil konversi MERGEFIELD -> tag):
//   {Nama_Tag}            -> nilai teks (XML di-escape, "\n" jadi baris baru)
//   {#items} ... {/items} -> baris tabel diulang per item (boleh melintasi beberapa baris <w:tr>)
//   bookmark DOK_01..DOK_21 -> awal tiap dokumen, dipakai utk memecah per dokumen
// Tabel survei harga: bila pembanding = 3, pasangan kolom terakhir (Survei_2) diklon jadi Survei_3
// dan lebar kolom diskalakan supaya tetap muat di halaman.
// Tidak memakai pustaka templating baru (cukup jszip yg sudah ada di package.json).

import JSZip from "jszip";

export type NilaiTag = Record<string, string>;
export type Item = Record<string, string>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ganti {Tag} di dalam setiap <w:t>. Tag tak dikenal dibiarkan apa adanya (kecuali `kosongkan`). */
function isiTag(xml: string, nilai: NilaiTag, kosongkan: boolean): string {
  return xml.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (asli, teks: string) => {
    if (!teks.includes("{")) return asli;
    let ada = false;
    const baru = teks.replace(/\{([A-Za-z0-9_]+)\}/g, (m, k: string) => {
      if (k in nilai) {
        ada = true;
        return esc(String(nilai[k] ?? "")).replace(/\r?\n/g, "\u0000");
      }
      if (kosongkan) {
        ada = true;
        return "";
      }
      return m;
    });
    if (!ada) return asli;
    return baru
      .split("\u0000")
      .map((b) => `<w:t xml:space="preserve">${b}</w:t>`)
      .join("<w:br/>");
  });
}

/** Posisi awal tag <w:tr> (bukan <w:trPr>) terakhir sebelum `i`. */
function awalBaris(xml: string, i: number): number {
  let j = i;
  for (;;) {
    j = xml.lastIndexOf("<w:tr", j - 1);
    if (j < 0) return -1;
    const c = xml[j + 5];
    if (c === " " || c === ">") return j;
  }
}

/** Ulang blok baris tabel {#items}..{/items} sebanyak item. */
function ulangItems(xml: string, items: Item[]): string {
  for (let aman = 0; aman < 50; aman++) {
    const iBuka = xml.indexOf("{#items}");
    if (iBuka < 0) break;
    const iTutup = xml.indexOf("{/items}", iBuka);
    if (iTutup < 0) throw new Error("Template rusak: {#items} tanpa {/items}");
    const mulai = awalBaris(xml, iBuka);
    const selesai = xml.indexOf("</w:tr>", iTutup) + "</w:tr>".length;
    if (mulai < 0 || selesai < 7) throw new Error("Template: {#items} harus berada di dalam baris tabel");
    const blok = xml.slice(mulai, selesai).replace("{#items}", "").replace("{/items}", "");
    const isi = items.map((it) => isiTag(blok, it, true)).join("");
    xml = xml.slice(0, mulai) + isi + xml.slice(selesai);
  }
  return xml;
}

/** Klon pasangan kolom Survei_2 menjadi Survei_3 pada tabel survei harga. */
function tambahKolomSurvei3(xml: string): string {
  const i = xml.indexOf("{harga_survei_2}");
  if (i < 0) return xml;
  const ts = xml.lastIndexOf("<w:tbl>", i);
  const te = xml.indexOf("</w:tbl>", i) + "</w:tbl>".length;
  let t = xml.slice(ts, te);
  const ganti = (s: string) => s.replace(/_survei_2\}/g, "_survei_3}").replace(/_Survei_2\}/g, "_Survei_3}");

  // gridCol: klon dua kolom terakhir
  const grid = t.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/);
  if (!grid) return xml;
  const cols = grid[1].match(/<w:gridCol [^>]*\/>/g) ?? [];
  const lebar = cols.map((c) => Number(c.match(/w:w="(\d+)"/)?.[1] ?? 0));
  const totalLama = lebar.reduce((a, b) => a + b, 0);
  const tambah = lebar.slice(-2).reduce((a, b) => a + b, 0);
  const faktor = totalLama / (totalLama + tambah);
  t = t.replace(grid[0], `<w:tblGrid>${[...cols, ...cols.slice(-2)].join("")}</w:tblGrid>`);

  // tiap baris: sel terakhir ber-gridSpan 2 -> klon 1 sel; selain itu klon 2 sel terakhir
  t = t.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
    const sel = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g);
    if (!sel || !sel.length) return tr;
    const akhir = sel[sel.length - 1];
    const klon = /<w:gridSpan w:val="2"\/>/.test(akhir) ? [akhir] : sel.slice(-2);
    const pos = tr.lastIndexOf("</w:tr>");
    return tr.slice(0, pos) + klon.map((x) => ganti(x).replace(/\{[#/]items\}/g, "")).join("") + tr.slice(pos);
  });

  // skala semua lebar supaya total tetap
  t = t
    .replace(/(<w:gridCol w:w=")(\d+)/g, (_, a, n) => a + Math.round(Number(n) * faktor))
    .replace(/(<w:tcW w:w=")(\d+)/g, (_, a, n) => a + Math.round(Number(n) * faktor));
  return xml.slice(0, ts) + t + xml.slice(te);
}

// ---------------------------------------------------------------- pecah per dokumen

type Anak = { mulai: number; selesai: number; xml: string };

/** Anak langsung <w:body> (paragraf, tabel, sectPr, dll). */
function anakBody(xml: string): { kepala: string; anak: Anak[]; ekor: string } {
  const b = xml.indexOf("<w:body>");
  const e = xml.lastIndexOf("</w:body>");
  const isi0 = b + "<w:body>".length;
  const anak: Anak[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  re.lastIndex = isi0;
  let kedalaman = 0;
  let awal = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < e) {
    const tutup = m[1] === "/";
    const tunggal = m[4] === "/";
    if (!tutup) {
      if (kedalaman === 0) awal = m.index;
      if (tunggal) {
        if (kedalaman === 0) anak.push({ mulai: awal, selesai: re.lastIndex, xml: xml.slice(awal, re.lastIndex) });
      } else kedalaman++;
    } else {
      kedalaman--;
      if (kedalaman === 0) anak.push({ mulai: awal, selesai: re.lastIndex, xml: xml.slice(awal, re.lastIndex) });
    }
  }
  return { kepala: xml.slice(0, isi0), anak, ekor: xml.slice(e) };
}

const RE_SECT = /<w:sectPr[ >][\s\S]*?<\/w:sectPr>/;

/** Paragraf "kosong" (tanpa teks/gambar/field) -- boleh berisi pemisah halaman atau sectPr. */
function paragrafKosong(p: string): boolean {
  if (!p.startsWith("<w:p")) return false;
  const teks = (p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).join("").replace(/<[^>]+>/g, "").trim();
  return teks === "" && !/<w:drawing|<w:pict|<w:object|<w:fldChar|<w:instrText|<w:bookmarkStart [^>]*w:name="DOK_/.test(p);
}

export type BagianDok = { kode: string; xml: string };

/** Pecah document.xml (sudah terisi) menjadi document.xml per dokumen berdasarkan bookmark DOK_xx. */
export function pecahDokumen(xml: string): BagianDok[] {
  const { kepala, anak, ekor } = anakBody(xml);
  const sectAkhir = anak.length && anak[anak.length - 1].xml.startsWith("<w:sectPr") ? anak.pop()!.xml : "";
  const awal: { kode: string; idx: number }[] = [];
  anak.forEach((a, idx) => {
    for (const m of a.xml.matchAll(/<w:bookmarkStart [^>]*w:name="(DOK_\d+)"/g)) awal.push({ kode: m[1], idx });
  });
  awal.sort((a, b) => a.idx - b.idx || a.kode.localeCompare(b.kode));
  if (awal.length && awal[0].idx > 0) awal[0].idx = 0;

  return awal.map((a, k) => {
    // buang paragraf kosong / pemisah halaman di ujung potongan (mencegah halaman kosong)
    let sampai = k + 1 < awal.length ? awal[k + 1].idx : anak.length;
    while (sampai - 1 > a.idx && paragrafKosong(anak[sampai - 1].xml)) sampai--;
    const potong = anak.slice(a.idx, sampai).map((x) => x.xml);
    // sectPr yg berlaku utk anak terakhir: sectPr pertama di/sesudahnya
    let sect = sectAkhir;
    for (let j = sampai - 1; j < anak.length; j++) {
      const m = anak[j].xml.match(RE_SECT);
      if (m) {
        sect = m[0];
        if (j === sampai - 1) potong[potong.length - 1] = potong[potong.length - 1].replace(m[0], "");
        break;
      }
    }
    // pemisah halaman di run terakhir paragraf terakhir
    const ak = potong.length - 1;
    potong[ak] = potong[ak].replace(/<w:br w:type="page"\/>(?=(?:(?!<w:t[ >])[\s\S])*$)/, "");
    return { kode: a.kode, xml: kepala + potong.join("") + sect + ekor };
  });
}

// ---------------------------------------------------------------- API utama

export type OpsiIsi = { nilai: NilaiTag; items: Item[]; survei3?: boolean };

/** Isi template, kembalikan JSZip berisi dokumen lengkap (belum dipecah). */
export async function isiTemplate(template: Uint8Array | Buffer, o: OpsiIsi): Promise<JSZip> {
  const zip = await JSZip.loadAsync(template);
  const nama = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  for (const n of nama) {
    let xml = await zip.file(n)!.async("string");
    if (n === "word/document.xml") {
      if (o.survei3) xml = tambahKolomSurvei3(xml);
      xml = ulangItems(xml, o.items);
    }
    xml = isiTag(xml, o.nilai, true);
    zip.file(n, xml);
  }
  return zip;
}

async function keBuffer(zip: JSZip): Promise<Buffer> {
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/** Satu docx utuh (semua dokumen). */
export async function docxLengkap(zip: JSZip): Promise<Buffer> {
  return keBuffer(zip);
}

/** docx per dokumen: { kode -> Buffer }. `hanya` = batasi ke kode tertentu. */
export async function docxPerDokumen(zip: JSZip, hanya?: string[]): Promise<Record<string, Buffer>> {
  const xml = await zip.file("word/document.xml")!.async("string");
  const bagian = pecahDokumen(xml).filter((b) => !hanya || hanya.includes(b.kode));
  const out: Record<string, Buffer> = {};
  for (const b of bagian) {
    zip.file("word/document.xml", b.xml);
    out[b.kode] = await keBuffer(zip);
  }
  zip.file("word/document.xml", xml);
  return out;
}
