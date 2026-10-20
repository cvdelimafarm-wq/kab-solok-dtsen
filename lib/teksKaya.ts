// lib/teksKaya.ts  (murni, tanpa React/DOM sungguhan)
//
// (21 Okt 2026) Editor isi modal bergaya Word (tombol Tebal / Miring / Sorot / Subjudul / Daftar / Nomor / Tautan) tanpa mengubah cara isi disimpan: yang tersimpan
// dan dikirim ke petugas tetap teks dengan penanda sederhana yang sama (lib/sigapPengumuman.ts):
//   **tebal**  __miring__  ==sorot==  [teks](https://tautan)  baris "- " = daftar, "1. " = daftar bernomor, "## " = subjudul.
// File ini menerjemahkan dua arah:
//   markup  -> pohon/HTML untuk diisikan ke editor (htmlDariMarkup)
//   editor  -> markup (markupDariSimpul), membaca hasil contentEditable apa adanya (b/strong, span bergaya, mark, p/div, br, ul/li, a).
// Aturan yang mengikuti pengurai: penanda TIDAK bersarang, jadi bila satu teks bergaya ganda yang dipakai hanya satu: SOROT > TEBAL > MIRING.
// Teks biasa yang kebetulan memuat penanda ("**", "==", "__", "](" atau awal baris "- ", "1. ", "## ") dinetralkan dengan karakter lebar-nol agar tidak berubah arti.

import { uraiIsi, urlAman, type Sebaris } from "@/lib/sigapPengumuman";

/** Bentuk minimum simpul DOM yang dibutuhkan (Node/Element sungguhan memenuhinya; uji memakai pohon buatan). */
export type Simpul = {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<Simpul>;
  style?: { fontWeight?: string; backgroundColor?: string; fontStyle?: string } | null;
  getAttribute?: (nama: string) => string | null;
};

export const WARNA_SOROT = "#FFE680";
const LEBAR_NOL = "​";

// ------------------------------------------------------------------ editor -> markup
type Gaya = { tebal: boolean; sorot: boolean; miring: boolean };
const POLOS: Gaya = { tebal: false, sorot: false, miring: false };
type Lari = { teks: string; url: string | null } & Gaya;
type Blok = { tipe: "p"; lari: Lari[] } | { tipe: "judul"; lari: Lari[] } | { tipe: "daftar"; nomor: boolean; butir: Lari[][] };

const NAMA_JUDUL = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const NAMA_BLOK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SECTION", "PRE", "LI"]);
const NAMA_DAFTAR = new Set(["UL", "OL"]);
const ABAIKAN = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);

function tebalDari(el: Simpul, induk: boolean): boolean {
  const nama = el.nodeName.toUpperCase();
  if (nama === "B" || nama === "STRONG") return true;
  const fw = (el.style?.fontWeight ?? "").trim().toLowerCase();
  if (fw) {
    if (fw === "bold" || fw === "bolder") return true;
    if (fw === "normal" || fw === "lighter") return false;
    const n = Number(fw);
    if (Number.isFinite(n)) return n >= 600;
  }
  return induk;
}

function miringDari(el: Simpul, induk: boolean): boolean {
  const nama = el.nodeName.toUpperCase();
  if (nama === "I" || nama === "EM") return true;
  const fs = (el.style?.fontStyle ?? "").trim().toLowerCase();
  if (fs) {
    if (fs === "italic" || fs === "oblique") return true;
    if (fs === "normal") return false;
  }
  return induk;
}

function sorotDari(el: Simpul, induk: boolean): boolean {
  const bg = (el.style?.backgroundColor ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (bg) {
    if (bg === "inherit") return induk;
    return !(bg === "transparent" || bg === "initial" || bg === "none" || /^rgba\(0,0,0,0\)$/.test(bg));
  }
  if (el.nodeName.toUpperCase() === "MARK") return true;
  return induk;
}

function kumpulLari(simpul: ArrayLike<Simpul>, g: Gaya, keluar: Lari[]): void {
  for (let i = 0; i < simpul.length; i++) {
    const n = simpul[i];
    if (n.nodeType === 3) {
      const t = (n.nodeValue ?? "").replace(/\u00a0/g, " ");
      if (t) keluar.push({ teks: t, ...g, url: null });
      continue;
    }
    if (n.nodeType !== 1) continue;
    const nama = n.nodeName.toUpperCase();
    if (ABAIKAN.has(nama)) continue;
    if (nama === "BR") {
      keluar.push({ teks: "\n", ...POLOS, url: null });
    } else if (nama === "A") {
      const sub: Lari[] = [];
      kumpulLari(n.childNodes, POLOS, sub);
      const teks = sub.map((x) => x.teks).join("");
      const href = (n.getAttribute?.("href") ?? "").trim();
      if (urlAman(href) && teks.trim()) keluar.push({ teks: teks.replace(/\s*\n\s*/g, " "), ...POLOS, url: href });
      else if (teks) keluar.push({ teks, ...g, url: null });
    } else {
      kumpulLari(n.childNodes, { tebal: tebalDari(n, g.tebal), sorot: sorotDari(n, g.sorot), miring: miringDari(n, g.miring) }, keluar);
    }
  }
}

function adaBlokAnak(el: Simpul): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    const a = el.childNodes[i];
    if (a.nodeType !== 1) continue;
    const nama = a.nodeName.toUpperCase();
    if (NAMA_BLOK.has(nama) || NAMA_DAFTAR.has(nama)) return true;
  }
  return false;
}

function kumpulBlok(anak: ArrayLike<Simpul>, keluar: Blok[]): void {
  let tunda: Simpul[] = [];
  const tutup = () => {
    if (!tunda.length) return;
    const lari: Lari[] = [];
    kumpulLari(tunda, POLOS, lari);
    keluar.push({ tipe: "p", lari });
    tunda = [];
  };
  for (let i = 0; i < anak.length; i++) {
    const n = anak[i];
    if (n.nodeType === 1) {
      const nama = n.nodeName.toUpperCase();
      if (ABAIKAN.has(nama)) continue;
      if (NAMA_DAFTAR.has(nama)) {
        tutup();
        const butir: Lari[][] = [];
        for (let j = 0; j < n.childNodes.length; j++) {
          const li = n.childNodes[j];
          if (li.nodeType !== 1) continue;
          const lari: Lari[] = [];
          kumpulLari(li.childNodes, POLOS, lari);
          butir.push(lari);
        }
        keluar.push({ tipe: "daftar", nomor: nama === "OL", butir });
        continue;
      }
      if (NAMA_BLOK.has(nama)) {
        tutup();
        if (adaBlokAnak(n)) kumpulBlok(n.childNodes, keluar);
        else {
          const lari: Lari[] = [];
          kumpulLari(n.childNodes, POLOS, lari);
          keluar.push({ tipe: NAMA_JUDUL.has(nama) ? "judul" : "p", lari });
        }
        continue;
      }
    }
    tunda.push(n);
  }
  tutup();
}

/** Penanda yang tidak boleh muncul apa adanya di dalam teks biasa. */
function netral(t: string): string {
  return t.replace(/\*\*/g, `*${LEBAR_NOL}*`).replace(/==/g, `=${LEBAR_NOL}=`).replace(/__/g, `_${LEBAR_NOL}_`).replace(/\]\(/g, `]${LEBAR_NOL}(`);
}

/** Satu gaya saja yang berlaku: sorot > tebal > miring. */
function efektif(g: Gaya): Gaya {
  if (g.sorot) return { sorot: true, tebal: false, miring: false };
  if (g.tebal) return { sorot: false, tebal: true, miring: false };
  return { sorot: false, tebal: false, miring: g.miring };
}

function gabung(lari: Lari[], tanpaTebal = false): Lari[] {
  const out: Lari[] = [];
  for (const r of lari) {
    // bandingkan setelah gaya diratakan supaya potongan bertetangga ikut menyatu
    const e = efektif(tanpaTebal ? { ...r, tebal: false } : r);
    const akhir = out[out.length - 1];
    if (akhir && akhir.url === r.url && akhir.sorot === e.sorot && akhir.tebal === e.tebal && akhir.miring === e.miring) akhir.teks += r.teks;
    else out.push({ teks: r.teks, url: r.url, ...e });
  }
  return out;
}

function bungkus(baris: string, r: Lari): string {
  const m = /^(\s*)(.*?)(\s*)$/.exec(baris);
  if (!m || !m[2]) return baris;
  const [, depan, isi, belakang] = m;
  const t = netral(isi);
  if (r.url) return `${depan}[${t.replace(/[[\]]/g, "")}](${r.url.replace(/\)/g, "%29")})${belakang}`;
  if (r.sorot) return `${depan}==${t}==${belakang}`;
  if (r.tebal) return `${depan}**${t}**${belakang}`;
  if (r.miring) return `${depan}__${t}__${belakang}`;
  return `${depan}${t}${belakang}`;
}

function tulisLari(lari: Lari[], tanpaTebal = false): string {
  let s = "";
  for (const r of gabung(lari, tanpaTebal)) {
    const baris = r.teks.split("\n");
    for (let i = 0; i < baris.length; i++) {
      if (i > 0) s += "\n";
      s += bungkus(baris[i], r);
    }
  }
  return s;
}

/** Awal baris yang akan dibaca pengurai sebagai daftar / subjudul: di paragraf biasa harus dinetralkan. */
const AWAL_KHUSUS = /^\s*([-•]\s|\d{1,3}[.)]\s|##\s)/;

/** Isi editor (anak-anak elemen contentEditable) -> teks dengan penanda yang dipahami modal. */
export function markupDariSimpul(anak: ArrayLike<Simpul>): string {
  const blok: Blok[] = [];
  kumpulBlok(anak, blok);
  const bagian: string[] = [];
  for (const b of blok) {
    if (b.tipe === "p") {
      const t = tulisLari(b.lari)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!t) continue;
      bagian.push(t.split("\n").map((l) => (AWAL_KHUSUS.test(l) ? LEBAR_NOL + l : l)).join("\n"));
    } else if (b.tipe === "judul") {
      // subjudul sudah tebal dari bentuknya, dan hanya satu baris
      const t = tulisLari(b.lari, true).replace(/\s*\n\s*/g, " ").trim();
      if (t) bagian.push(`## ${t}`);
    } else {
      const butir = b.butir.map((x) => tulisLari(x).replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
      if (butir.length) bagian.push(butir.map((x, i) => (b.nomor ? `${i + 1}. ${x}` : `- ${x}`)).join("\n"));
    }
  }
  return bagian.join("\n\n");
}

// ------------------------------------------------------------------ markup -> pohon -> HTML
const teks = (s: string): Simpul => ({ nodeType: 3, nodeName: "#text", nodeValue: s, childNodes: [] });
const el = (nama: string, anak: Simpul[], opsi?: { latar?: string; href?: string }): Simpul => ({
  nodeType: 1,
  nodeName: nama,
  nodeValue: null,
  childNodes: anak,
  style: opsi?.latar ? { backgroundColor: opsi.latar } : {},
  getAttribute: (n: string) => (n === "href" ? opsi?.href ?? null : null),
});

function dariSebaris(s: Sebaris[]): Simpul[] {
  const out: Simpul[] = [];
  for (const p of s) {
    const bagian = p.teks.split("\n");
    const buat = (t: string): Simpul =>
      p.t === "tebal" ? el("B", [teks(t)]) : p.t === "miring" ? el("I", [teks(t)]) : p.t === "sorot" ? el("MARK", [teks(t)], { latar: WARNA_SOROT }) : p.t === "tautan" ? el("A", [teks(t)], { href: p.url }) : teks(t);
    bagian.forEach((t, i) => {
      if (i > 0) out.push(el("BR", []));
      if (t) out.push(buat(t));
    });
  }
  return out;
}

/** Isi (penanda) -> pohon simpul editor: <p> per paragraf, <br> untuk baris baru, <h3> subjudul, <ul>/<ol><li> untuk daftar. */
export function pohonDariMarkup(isi: string): Simpul[] {
  const blok = uraiIsi(isi);
  if (!blok.length) return [el("P", [el("BR", [])])];
  return blok.map((b) => (b.tipe === "p" ? el("P", dariSebaris(b.baris)) : b.tipe === "judul" ? el("H3", dariSebaris(b.baris)) : el(b.bernomor ? "OL" : "UL", b.butir.map((x) => el("LI", dariSebaris(x))))));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function htmlDariPohon(simpul: ArrayLike<Simpul>): string {
  let h = "";
  for (let i = 0; i < simpul.length; i++) {
    const n = simpul[i];
    if (n.nodeType === 3) {
      h += esc(n.nodeValue ?? "");
      continue;
    }
    const tag = n.nodeName.toLowerCase();
    if (tag === "br") {
      h += "<br>";
      continue;
    }
    let atribut = "";
    const href = n.getAttribute?.("href");
    if (href) atribut += ` href="${esc(href)}"`;
    const latar = n.style?.backgroundColor;
    if (latar) atribut += ` style="background-color:${esc(latar)}"`;
    h += `<${tag}${atribut}>${htmlDariPohon(n.childNodes)}</${tag}>`;
  }
  return h;
}

export const htmlDariMarkup = (isi: string): string => htmlDariPohon(pohonDariMarkup(isi));

/** Bentuk baku isi (hasil bolak-balik lewat editor): dipakai untuk membandingkan "apakah isinya benar-benar berubah". */
export const bakukanMarkup = (isi: string): string => markupDariSimpul(pohonDariMarkup(isi));

/** Penanda yang tampak pada teks yang ditempel (mis. dari templat lama)? Bila ya, ditempel sebagai isi bergaya, bukan teks mentah. */
export const memuatPenanda = (t: string): boolean => /\*\*.+?\*\*|==.+?==|__.+?__|\[[^\]]+?\]\(\S+?\)|(^|\n)\s*([-•]|\d{1,3}[.)]|##)\s+/.test(t);
