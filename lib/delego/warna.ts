// lib/delego/warna.ts
//
// (26 Okt 2026) Skala warna sel beban kerja (tabel "Beban per hari" di Delego). Murni, tanpa tampilan.
// Tiga ruas yang tidak menyambung (sengaja, supaya batas sasaran terbaca sekilas):
//   di bawah sasaran (1% .. <min)  : biru pucat -> biru (makin pekat makin mendekati sasaran)
//   sasaran (min .. max)           : hijau muda -> hijau tua
//   di atas sasaran (>max .. puncak): kuning -> jingga -> merah tua (jenuh di `puncak`, mis. 150%)
// Teks otomatis gelap atau putih mana yang kontrasnya lebih tinggi.

export type WarnaSel = { latar: string; teks: string };

type Rgb = [number, number, number];
const hexKeRgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbKeHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const campur = (a: string, b: string, t: number): string => {
  const x = hexKeRgb(a);
  const y = hexKeRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbKeHex([x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u, x[2] + (y[2] - x[2]) * u]);
};

const kanal = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminans(hex: string): number {
  const [r, g, b] = hexKeRgb(hex);
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}
/** Rasio kontras WCAG antara dua warna. */
export function kontras(a: string, b: string): number {
  const la = luminans(a);
  const lb = luminans(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const GELAP = "#14212B";
const PUTIH = "#FFFFFF";
const teksUntuk = (latar: string) => (kontras(latar, PUTIH) >= kontras(latar, GELAP) ? PUTIH : GELAP);

const BIRU: [string, string] = ["#EAF1F7", "#9DBFDD"];
const HIJAU: [string, string, string] = ["#D3EBE6", "#6DB8AA", "#1F7F70"];
const KUNING = "#F7E3A0";
const JINGGA = "#EE9A52";
const MERAH = "#A82A2A";

/** Warna sel untuk beban `persen` (% dari kapasitas). null bila tidak ada beban (sel kosong). */
export function warnaBeban(persen: number, min = 80, max = 100, puncak = 150): WarnaSel | null {
  if (!Number.isFinite(persen) || persen <= 0) return null;
  let latar: string;
  if (persen < min) latar = campur(BIRU[0], BIRU[1], persen / min);
  else if (persen <= max) {
    const t = max > min ? (persen - min) / (max - min) : 1;
    latar = t < 0.5 ? campur(HIJAU[0], HIJAU[1], t * 2) : campur(HIJAU[1], HIJAU[2], (t - 0.5) * 2);
  } else {
    const t = puncak > max ? Math.min(1, (persen - max) / (puncak - max)) : 1;
    latar = t < 0.5 ? campur(KUNING, JINGGA, t * 2) : campur(JINGGA, MERAH, (t - 0.5) * 2);
  }
  return pastikanTerbaca(latar);
}

/** Bila kontras teks terbaik kurang dari 4.5 (zona tengah), geser latar sedikit ke terang atau gelap sampai terbaca. */
function pastikanTerbaca(awal: string): WarnaSel {
  let latar = awal;
  let teks = teksUntuk(latar);
  for (let i = 0; i < 40 && kontras(latar, teks) < 4.5; i++) {
    latar = teks === GELAP ? campur(latar, "#FFFFFF", 0.04) : campur(latar, "#000000", 0.04);
    teks = teksUntuk(latar);
  }
  return { latar, teks };
}

/** Gradien CSS untuk legenda (sumbu 0 .. puncak%), dengan batas keras di `min` dan `max`. */
export function gradienLegenda(min = 80, max = 100, puncak = 150): string {
  const pos = (p: number) => `${((p / puncak) * 100).toFixed(2)}%`;
  const w = (p: number) => (warnaBeban(p, min, max, puncak) as WarnaSel).latar;
  const eps = 0.01;
  const titik = [
    `${w(1)} ${pos(1)}`, `${w(min - eps)} ${pos(min)}`,
    `${w(min)} ${pos(min)}`, `${w(max)} ${pos(max)}`,
    `${w(max + eps)} ${pos(max)}`, `${w(puncak)} 100%`,
  ];
  return `linear-gradient(to right, ${titik.join(", ")})`;
}
