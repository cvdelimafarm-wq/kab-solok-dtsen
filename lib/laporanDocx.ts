// lib/laporanDocx.ts
//
// (30 Okt 2026) Berkas Word (.docx) sungguhan untuk Laporan Sementara: judul bab memakai gaya Heading 1, DAFTAR ISI otomatis (field TOC) dan
// NOMOR HALAMAN otomatis ("Halaman X dari Y", field PAGE/NUMPAGES). Dibuat langsung dari struktur Laporan (lib/laporanSementara.ts) tanpa pustaka
// tambahan selain JSZip yang sudah ada di proyek. Bagian XML murni (bangunBerkasDocx) supaya bisa diuji; pengemasan zip memuat JSZip secara dinamis.
//
// Catatan Word: daftar isi baru terisi nomor halamannya setelah diperbarui. Berkas diberi penanda "perbarui field saat dibuka", sehingga Word menanyakan
// "Perbarui field?" satu kali -- jawab Ya. (Di Word: klik kanan daftar isi > Perbarui Field > Perbarui seluruh daftar, atau tekan F9.)

import { fmtAngka, kelompokkanElemen, paragrafDariTeks, panjangBatang, type BatangLaporan, type Elemen, type FotoLaporan, type Laporan, type OpsiLaporan, type TabelLaporan } from "@/lib/laporanSementara";
import { ukuranMuat } from "@/lib/laporanFoto";

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const ISI_TWIP = 9638; // lebar isi: A4 (11906) dikurangi margin 2 x 1134
const WARNA_TUA = "0F2A52";
const WARNA_BIRU = "1F5FD1";

/** Escape XML dan buang karakter yang dilarang di XML 1.0. */
export function xml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Rpr = { tebal?: boolean; miring?: boolean; warna?: string; ukuran?: number; font?: string };
function rpr(p: Rpr): string {
  const a = [
    p.font ? `<w:rFonts w:ascii="${p.font}" w:hAnsi="${p.font}" w:cs="${p.font}"/>` : "",
    p.tebal ? "<w:b/>" : "",
    p.miring ? "<w:i/>" : "",
    p.warna ? `<w:color w:val="${p.warna}"/>` : "",
    p.ukuran ? `<w:sz w:val="${p.ukuran}"/><w:szCs w:val="${p.ukuran}"/>` : "",
  ].join("");
  return a ? `<w:rPr>${a}</w:rPr>` : "";
}
const run = (teks: string, p: Rpr = {}): string => `<w:r>${rpr(p)}<w:t xml:space="preserve">${xml(teks)}</w:t></w:r>`;

type Ppr = { gaya?: string; rata?: "left" | "right" | "center" | "both"; jagaDepan?: boolean };
function ppr(p: Ppr): string {
  const a = [p.gaya ? `<w:pStyle w:val="${p.gaya}"/>` : "", p.jagaDepan ? "<w:keepNext/>" : "", p.rata ? `<w:jc w:val="${p.rata}"/>` : ""].join("");
  return a ? `<w:pPr>${a}</w:pPr>` : "";
}
const para = (isi: string, p: Ppr = {}): string => `<w:p>${ppr(p)}${isi}</w:p>`;
const field = (instr: string, hasil: string, p: Rpr = {}): string =>
  `<w:r>${rpr(p)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr(p)}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${rpr(p)}<w:fldChar w:fldCharType="separate"/></w:r>${run(hasil, p)}<w:r>${rpr(p)}<w:fldChar w:fldCharType="end"/></w:r>`;

// ---------------------------------------------------------------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------------------------------------------------------------

/** Lebar kolom (twip) menurut isi: sebanding panjang teks terpanjang (dibatasi), jumlah = lebar isi. */
export function lebarKolom(kepala: string[], baris: string[][], jumlah?: string[]): number[] {
  const bobot = kepala.map((h, i) => {
    // kepala boleh membungkus antarkata, tetapi satu kata utuh harus muat ("Terdampak", "Persen")
    const kataPanjang = Math.max(...h.split(/\s+/).map((k) => k.length)) + 2;
    const maks = Math.max(kataPanjang, ...baris.map((b) => (b[i] ?? "").length), (jumlah?.[i] ?? "").length);
    return Math.min(28, Math.max(4, maks));
  });
  const total = bobot.reduce((a, b) => a + b, 0) || 1;
  const w = bobot.map((b) => Math.floor((b / total) * ISI_TWIP));
  w[w.length - 1] += ISI_TWIP - w.reduce((a, b) => a + b, 0);
  return w;
}

function sel(teks: string, lebar: number, o: { rata: "left" | "right"; tebal?: boolean; warnaIsi?: string; isi?: string; font?: string; warna?: string }): string {
  const shd = o.isi ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.isi}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${lebar}" w:type="dxa"/>${shd}<w:vAlign w:val="center"/></w:tcPr>${para(run(teks, { tebal: o.tebal, font: o.font, warna: o.warna }), { gaya: "TabelTeks", rata: o.rata })}</w:tc>`;
}

function tabelXml(t: { kepala: string[]; baris: string[][]; jumlah?: string[]; rata: ("k" | "n")[] }, lebar: number[]): string {
  const grid = lebar.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const r = (i: number): "left" | "right" => (t.rata[i] === "n" ? "right" : "left");
  const kepala = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${t.kepala.map((h, i) => sel(h, lebar[i], { rata: r(i), tebal: true, isi: "E8EEF7" })).join("")}</w:tr>`;
  const baris = t.baris.map((b) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.kepala.map((_, i) => sel(b[i] ?? "", lebar[i], { rata: r(i) })).join("")}</w:tr>`).join("");
  const jumlah = t.jumlah ? `<w:tr><w:trPr><w:cantSplit/></w:trPr>${t.kepala.map((_, i) => sel(t.jumlah?.[i] ?? "", lebar[i], { rata: r(i), tebal: true, isi: "F3F6FA" })).join("")}</w:tr>` : "";
  return `<w:tbl><w:tblPr><w:tblStyle w:val="LaporanTabel"/><w:tblW w:w="${ISI_TWIP}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${kepala}${baris}${jumlah}</w:tbl>`;
}

const spacer = (): string => para("", { gaya: "Spacer" });
const caption = (teks: string): string => para(run(teks), { gaya: "Caption", jagaDepan: true });

function tabelLaporanXml(t: TabelLaporan): string {
  return (t.judul ? caption(t.judul) : "") + tabelXml(t, lebarKolom(t.kepala, t.baris, t.jumlah)) + spacer();
}

/** Grafik batang sebagai tabel tiga kolom: tanggal, jumlah, batang dari karakter blok berwarna (tetap bisa disunting di Word). */
function batangXml(b: BatangLaporan): string {
  const maks = Math.max(1, ...b.data.map((x) => x.nilai));
  const lebar = [1500, 1300, ISI_TWIP - 2800];
  const grid = lebar.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const baris = b.data
    .map(
      (x) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>${sel(x.label, lebar[0], { rata: "left" })}${sel(fmtAngka(x.nilai), lebar[1], { rata: "right" })}${sel("█".repeat(panjangBatang(x.nilai, maks, 34)), lebar[2], { rata: "left", warna: WARNA_BIRU, font: "Consolas" })}</w:tr>`,
    )
    .join("");
  const kepala = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${sel("Tanggal", lebar[0], { rata: "left", tebal: true, isi: "E8EEF7" })}${sel("Jumlah", lebar[1], { rata: "right", tebal: true, isi: "E8EEF7" })}${sel("Grafik", lebar[2], { rata: "left", tebal: true, isi: "E8EEF7" })}</w:tr>`;
  return caption(b.judul) + `<w:tbl><w:tblPr><w:tblStyle w:val="LaporanTabel"/><w:tblW w:w="${ISI_TWIP}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${kepala}${baris}</w:tbl>` + spacer();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Foto (Lampiran B)
// ---------------------------------------------------------------------------------------------------------------------------------

/** Gambar yang disematkan: JPEG yang sudah diperkecil beserta ukuran pikselnya. Kunci = FotoLaporan.id. */
export type GambarDocx = { jpeg: Uint8Array; lebar: number; tinggi: number };
export type PetaGambarDocx = Record<number, GambarDocx>;

/** Foto dalam laporan menurut urutan kemunculan (tanpa duplikat); urutan ini menentukan nomor berkas media dan relasi. */
export function daftarFotoDocx(l: Laporan): FotoLaporan[] {
  const lihat = new Set<number>();
  const out: FotoLaporan[] = [];
  for (const b of l.bagian) for (const e of b.elemen) if (e.jenis === "foto") for (const f of e.foto) if (!lihat.has(f.id)) (lihat.add(f.id), out.push(f));
  return out;
}
const jalurMedia = (i: number): string => `media/foto${i + 1}.jpg`;
const idRelFoto = (i: number): string => `rIdFoto${i + 1}`;

/** Berkas gambar untuk dimasukkan ke zip (hanya foto yang gambarnya tersedia). */
export function mediaDocx(l: Laporan, gambar: PetaGambarDocx): { jalur: string; bytes: Uint8Array }[] {
  const out: { jalur: string; bytes: Uint8Array }[] = [];
  daftarFotoDocx(l).forEach((f, i) => {
    const g = gambar[f.id];
    if (g) out.push({ jalur: `word/${jalurMedia(i)}`, bytes: g.jpeg });
  });
  return out;
}

function gambarXml(rid: string, nomor: number, ket: string, cx: number, cy: number): string {
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${nomor}" name="Foto ${nomor}" descr="${xml(ket)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}"><pic:nvPicPr><pic:cNvPr id="${nomor}" name="foto${nomor}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

const TWIP_KE_EMU = 635;
/** Foto dalam tabel tanpa garis, `perBaris` kolom; tiap sel: gambar di tengah lalu keterangan. Foto tanpa gambar diberi tulisan, keterangan tetap ada. */
function fotoXml(e: Extract<Elemen, { jenis: "foto" }>, indeks: Map<number, number>, gambar: PetaGambarDocx): string {
  const lebarSel = Math.floor(ISI_TWIP / e.perBaris);
  const maksCx = (lebarSel - 200) * TWIP_KE_EMU;
  const maksCy = (e.perBaris === 2 ? 8 : 6) * 360000;
  const grid = Array.from({ length: e.perBaris }, () => `<w:gridCol w:w="${lebarSel}"/>`).join("");
  const baris: string[] = [];
  for (let i = 0; i < e.foto.length; i += e.perBaris) {
    const sel: string[] = [];
    for (let j = 0; j < e.perBaris; j++) {
      const f = e.foto[i + j];
      if (!f) {
        sel.push(`<w:tc><w:tcPr><w:tcW w:w="${lebarSel}" w:type="dxa"/></w:tcPr>${para("", { gaya: "Keterangan" })}</w:tc>`);
        continue;
      }
      const g = gambar[f.id];
      const k = indeks.get(f.id);
      const ukuran = g ? ukuranMuat(g.lebar, g.tinggi, maksCx, maksCy) : null;
      const isi =
        g && k !== undefined && ukuran
          ? para(gambarXml(idRelFoto(k), k + 1, f.ket, ukuran.cx, ukuran.cy), { rata: "center", jagaDepan: true })
          : para(run("[Foto tidak tersedia]", { miring: true, warna: "888888" }), { rata: "center", jagaDepan: true });
      sel.push(`<w:tc><w:tcPr><w:tcW w:w="${lebarSel}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${isi}${para(run(f.ket), { gaya: "Keterangan" })}</w:tc>`);
    }
    baris.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${sel.join("")}</w:tr>`);
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${ISI_TWIP}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${baris.join("")}</w:tbl>` + spacer();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Isi dokumen
// ---------------------------------------------------------------------------------------------------------------------------------

function elemenXml(e: Exclude<Elemen, { jenis: "butir" }>, indeks: Map<number, number>, gambar: PetaGambarDocx): string {
  if (e.jenis === "foto") return fotoXml(e, indeks, gambar);
  // uraian pengantar foto ikut halaman yang sama dengan baris foto pertama (judul bab tidak tertinggal sendirian di dasar halaman)
  if (e.jenis === "paragraf") return para(run(e.teks), e.id === "lampiranFoto.pengantar" ? { jagaDepan: true } : {});
  if (e.jenis === "tabel") return tabelLaporanXml(e.tabel);
  if (e.jenis === "batang") return batangXml(e.batang);
  return para(run("Catatan penyusun", { tebal: true }), { gaya: "Catatan", jagaDepan: true }) + paragrafDariTeks(e.teks).map((p) => para(run(p), { gaya: "Catatan" })).join("");
}

function daftarIsiXml(l: Laporan): string {
  const entri = l.bagian.map((b) => b.judulTampil ?? b.judul);
  const judul = para(run("Daftar isi"), { gaya: "JudulDaftarIsi" });
  if (entri.length === 0) return judul + para(run("(Belum ada bab yang dipilih.)"));
  const awal = `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  const akhir = `<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  const baris = entri.map((t, i) => para((i === 0 ? awal : "") + run(t) + (i === entri.length - 1 ? akhir : ""), { gaya: "TOC1" })).join("");
  return judul + baris;
}

export function dokumenXml(l: Laporan, o: OpsiLaporan, gambar: PetaGambarDocx = {}): string {
  const indeks = new Map(daftarFotoDocx(l).map((f, i) => [f.id, i] as const));
  const isi: string[] = [];
  isi.push(para(run(l.judul), { gaya: "Title" }));
  isi.push(para(run(l.subjudul), { gaya: "Subtitle" }));
  if (o.daftarIsi) {
    isi.push(daftarIsiXml(l));
    isi.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  }
  for (const b of l.bagian) {
    isi.push(para(run(b.judulTampil ?? b.judul), { gaya: "Heading1" }));
    for (const k of kelompokkanElemen(b.elemen)) {
      if (k.jenis === "butir") isi.push(k.butir.map((x) => para(run(x), { gaya: "ListBullet" })).join(""));
      else isi.push(elemenXml(k.elemen, indeks, gambar));
    }
    if (b.sumber) isi.push(para(run(`Sumber: ${b.sumber}`), { gaya: "Sumber" }));
  }
  const footer = o.nomorHalaman ? `<w:footerReference w:type="default" r:id="rIdFooter"/>` : "";
  const sect = `<w:sectPr>${footer}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}"><w:body>${isi.join("")}${sect}</w:body></w:document>`;
}

function footerXml(): string {
  const kecil: Rpr = { ukuran: 18, warna: "666666" };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">${para(run("Halaman ", kecil) + field("PAGE", "1", kecil) + run(" dari ", kecil) + field("NUMPAGES", "1", kecil), { gaya: "Footer", rata: "center" })}</w:ftr>`;
}

function stylesXml(): string {
  const gp = (id: string, nama: string, isi: string, o: { dasar?: string; berikut?: string; q?: boolean } = {}) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nama}"/>${o.dasar ? `<w:basedOn w:val="${o.dasar}"/>` : ""}${o.berikut ? `<w:next w:val="${o.berikut}"/>` : ""}${o.q ? "<w:qFormat/>" : ""}${isi}</w:style>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${NS_W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/></w:pPr></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    gp("Title", "Title", `<w:pPr><w:spacing w:before="0" w:after="60"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:color w:val="${WARNA_TUA}"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>`, { dasar: "Normal", berikut: "Normal", q: true }) +
    gp("Subtitle", "Subtitle", `<w:pPr><w:spacing w:after="240"/><w:jc w:val="left"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`, { dasar: "Normal", berikut: "Normal", q: true }) +
    gp("Heading1", "heading 1", `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${WARNA_TUA}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`, { dasar: "Normal", berikut: "Normal", q: true }) +
    gp("Heading2", "heading 2", `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="200" w:after="80"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${WARNA_TUA}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`, { dasar: "Normal", berikut: "Normal", q: true }) +
    gp("JudulDaftarIsi", "TOC Heading", `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:color w:val="${WARNA_TUA}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`, { dasar: "Normal", berikut: "Normal" }) +
    gp("TOC1", "toc 1", `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${ISI_TWIP - 10}"/></w:tabs><w:spacing w:after="60"/><w:jc w:val="left"/></w:pPr>`, { dasar: "Normal", berikut: "Normal" }) +
    gp("TOC2", "toc 2", `<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${ISI_TWIP - 10}"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="240"/><w:jc w:val="left"/></w:pPr>`, { dasar: "Normal", berikut: "Normal" }) +
    gp("Caption", "caption", `<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:jc w:val="left"/></w:pPr><w:rPr><w:b/><w:color w:val="${WARNA_TUA}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`, { dasar: "Normal", berikut: "Normal", q: true }) +
    gp("ListBullet", "List Bullet", `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="80"/></w:pPr>`, { dasar: "Normal" }) +
    gp("TabelTeks", "Teks Tabel", `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr>`, { dasar: "Normal" }) +
    gp("Spacer", "Spasi Tabel", `<w:pPr><w:spacing w:before="0" w:after="0" w:line="160" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="8"/><w:szCs w:val="8"/></w:rPr>`, { dasar: "Normal" }) +
    gp("Sumber", "Sumber", `<w:pPr><w:spacing w:before="40" w:after="120"/><w:jc w:val="left"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`, { dasar: "Normal" }) +
    gp("Catatan", "Catatan Penyusun", `<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="${WARNA_BIRU}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F3F6FA"/><w:spacing w:before="40" w:after="40"/><w:ind w:left="170"/></w:pPr>`, { dasar: "Normal" }) +
    gp("Keterangan", "Keterangan Foto", `<w:pPr><w:spacing w:before="40" w:after="160" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="17"/><w:szCs w:val="17"/><w:color w:val="333333"/></w:rPr>`, { dasar: "Normal" }) +
    gp("Footer", "footer", `<w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`, { dasar: "Normal" }) +
    `<w:style w:type="table" w:styleId="LaporanTabel"><w:name w:val="Tabel Laporan"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFC8D6"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFC8D6"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFC8D6"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFC8D6"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D5DCE6"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D5DCE6"/></w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `</w:styles>`
  );
}

const numberingXml = (): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${NS_W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

function settingsXml(o: OpsiLaporan): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${NS_W}">${o.daftarIsi ? '<w:updateFields w:val="true"/>' : ""}<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

/** Seluruh bagian berkas .docx sebagai teks: jalur di dalam zip -> isi. */
export function bangunBerkasDocx(l: Laporan, o: OpsiLaporan, waktuIso = new Date().toISOString(), gambar: PetaGambarDocx = {}): Record<string, string> {
  const foto = daftarFotoDocx(l);
  const relFoto = foto.map((f, i) => (gambar[f.id] ? `<Relationship Id="${idRelFoto(i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${jalurMedia(i)}"/>` : "")).join("");
  const adaMedia = relFoto.length > 0;
  const rel = (id: string, tipe: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipe}" Target="${target}"/>`;
  const berkas: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      (adaMedia ? `<Default Extension="jpg" ContentType="image/jpeg"/>` : "") +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      (o.nomorHalaman ? `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` : "") +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rel("rId1", "officeDocument", "word/document.xml") +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      rel("rId3", "extended-properties", "docProps/app.xml") +
      `</Relationships>`,
    "word/_rels/document.xml.rels":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rel("rIdStyles", "styles", "styles.xml") +
      rel("rIdSettings", "settings", "settings.xml") +
      rel("rIdNumbering", "numbering", "numbering.xml") +
      (o.nomorHalaman ? rel("rIdFooter", "footer", "footer1.xml") : "") +
      relFoto +
      `</Relationships>`,
    "word/document.xml": dokumenXml(l, o, gambar),
    "word/styles.xml": stylesXml(),
    "word/settings.xml": settingsXml(o),
    "word/numbering.xml": numberingXml(),
    "docProps/core.xml":
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${xml(l.judul)}</dc:title><dc:creator>${xml(o.penyusun.trim() || "SIGAP BPS Kabupaten Solok")}</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${xml(waktuIso.slice(0, 19))}Z</dcterms:created></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SIGAP BPS Kabupaten Solok</Application></Properties>`,
  };
  if (o.nomorHalaman) berkas["word/footer1.xml"] = footerXml();
  return berkas;
}

/** Kemas menjadi .docx. `format` "blob" untuk unduhan di peramban, "uint8array" untuk uji. */
export async function buatDocx(l: Laporan, o: OpsiLaporan, format: "blob" | "uint8array" = "blob", gambar: PetaGambarDocx = {}): Promise<Blob | Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const berkas = bangunBerkasDocx(l, o, undefined, gambar);
  // [Content_Types].xml harus berkas pertama
  for (const jalur of ["[Content_Types].xml", ...Object.keys(berkas).filter((j) => j !== "[Content_Types].xml")]) zip.file(jalur, berkas[jalur], { createFolders: false });
  for (const m of mediaDocx(l, gambar)) zip.file(m.jalur, m.bytes, { createFolders: false, binary: true });
  const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return format === "blob" ? zip.generateAsync({ type: "blob", mimeType, compression: "DEFLATE" }) : zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
