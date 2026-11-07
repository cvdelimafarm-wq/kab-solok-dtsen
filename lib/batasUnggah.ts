// lib/batasUnggah.ts
//
// (7 Nov 2026, tahap C2) Pembaca shapefile/GeoJSON batas Sub SLS yang MURNI (tanpa DOM, tanpa Node) supaya dijalankan di browser (pratinjau) dan di server
// (pemeriksaan ulang sebelum disimpan) dengan kode yang sama. Tanpa pustaka luar: SHP (poligon), DBF (atribut), PRJ (sistem koordinat) dan perubahan koordinat
// proyeksi Transverse Mercator (UTM, TM-3) ke WGS84 ditulis di sini.
//
// Keluaran akhir sama dengan skrip scripts/peta/gabung-batas-subsls.mjs: per fitur { id (16 digit), nm, kd, bb, g } dengan koordinat WGS84 [bujur, lintang]
// dibulatkan 6 desimal dan garis TIDAK disederhanakan; per kecamatan (7 digit pertama id) satu berkas + manifest berversi (bentuk lib/batasSubsls.ts).

import type { Bb, FiturBatas, ManifestBatas } from "./batasSubsls";

export const KOTAK_SOLOK = { minX: 100.2, maxX: 101.6, minY: -1.9, maxY: -0.2 } as const;
export const DESIMAL_BATAS = 6;
export const MAKS_FITUR_BATAS = 5000;
export const MAKS_TITIK_BATAS = 3_000_000;

export type Poligon = number[][][]; // poligon > cincin > [x, y]
export type Atribut = Record<string, string>;
export type FiturMentah = { atribut: Atribut; g: Poligon[] };
export type TingkatMasalah = "GALAT" | "PERINGATAN" | "INFO";
export type Masalah = { id: string; tingkat: TingkatMasalah; pesan: string };

// ------------------------------------------------------------------ SHP

/** Poligon per rekaman SHP (indeks sama dengan baris DBF); null untuk rekaman kosong (null shape). Melempar Error berbahasa Indonesia untuk berkas yang tidak sah. */
export function bacaShp(buf: ArrayBuffer): (Poligon[] | null)[] {
  if (buf.byteLength < 100) throw new Error("Berkas .shp terlalu pendek (bukan shapefile).");
  const dv = new DataView(buf);
  if (dv.getInt32(0, false) !== 9994) throw new Error("Berkas .shp tidak sah (kode berkas bukan 9994).");
  const jenisBerkas = dv.getInt32(32, true);
  if (![0, 5, 15, 25].includes(jenisBerkas)) throw new Error(`Jenis geometri shapefile ${jenisBerkas} bukan poligon (harus Polygon).`);
  const hasil: (Poligon[] | null)[] = [];
  let o = 100;
  let titikTotal = 0;
  while (o + 12 <= buf.byteLength) {
    const panjang = dv.getInt32(o + 4, false) * 2; // kata 16-bit -> byte
    const isi = o + 8;
    if (panjang < 4 || isi + panjang > buf.byteLength) throw new Error("Berkas .shp terpotong atau rusak.");
    const jenis = dv.getInt32(isi, true);
    if (jenis === 0) {
      hasil.push(null);
    } else if (jenis === 5 || jenis === 15 || jenis === 25) {
      const nBagian = dv.getInt32(isi + 36, true);
      const nTitik = dv.getInt32(isi + 40, true);
      if (nBagian < 1 || nTitik < 4 || nBagian > nTitik) throw new Error("Rekaman poligon rusak (jumlah bagian/titik tidak wajar).");
      titikTotal += nTitik;
      if (titikTotal > MAKS_TITIK_BATAS) throw new Error("Berkas terlalu besar (lebih dari 3 juta titik).");
      const awalBagian = isi + 44;
      const awalTitik = awalBagian + nBagian * 4;
      if (awalTitik + nTitik * 16 > isi + panjang) throw new Error("Rekaman poligon rusak (data titik melebihi panjang rekaman).");
      const indeks: number[] = [];
      for (let i = 0; i < nBagian; i++) indeks.push(dv.getInt32(awalBagian + i * 4, true));
      indeks.push(nTitik);
      const cincin: number[][][] = [];
      for (let i = 0; i < nBagian; i++) {
        const a = indeks[i];
        const b = indeks[i + 1];
        if (a < 0 || b > nTitik || b <= a) throw new Error("Rekaman poligon rusak (indeks bagian tidak urut).");
        const c: number[][] = [];
        for (let k = a; k < b; k++) c.push([dv.getFloat64(awalTitik + k * 16, true), dv.getFloat64(awalTitik + k * 16 + 8, true)]);
        cincin.push(c);
      }
      hasil.push(kelompokkanCincin(cincin));
    } else {
      throw new Error(`Rekaman bergeometri ${jenis} (bukan poligon).`);
    }
    o = isi + panjang;
  }
  return hasil;
}

const luasBertanda = (c: readonly number[][]) => {
  let a = 0;
  for (let i = 0; i < c.length - 1; i++) a += c[i][0] * c[i + 1][1] - c[i + 1][0] * c[i][1];
  return a / 2;
};

function titikDalam(t: readonly number[], c: readonly number[][]): boolean {
  let d = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i];
    const [xj, yj] = c[j];
    if (yi > t[1] !== yj > t[1] && t[0] < ((xj - xi) * (t[1] - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Cincin shapefile: luar searah jarum jam (luas bertanda <= 0), lubang berlawanan. Lubang dipasangkan ke cincin luar yang memuatnya; tanpa cincin luar sama sekali, semua dianggap luar. */
export function kelompokkanCincin(cincin: readonly number[][][]): Poligon[] {
  const luar: number[][][] = [];
  const lubang: number[][][] = [];
  for (const c of cincin) (luasBertanda(c) <= 0 ? luar : lubang).push(c);
  if (luar.length === 0) return cincin.map((c) => [c]);
  const poligon: Poligon[] = luar.map((c) => [c]);
  for (const h of lubang) {
    const induk = poligon.find((p) => titikDalam(h[0], p[0]));
    if (induk) induk.push(h);
    else poligon.push([h]); // lubang yang tidak ada induknya: perlakukan sebagai cincin luar (urutan sudut pandang terbalik)
  }
  return poligon;
}

// ------------------------------------------------------------------ DBF

function dekode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export type HasilDbf = { kolom: string[]; baris: (Atribut | null)[] }; // null = rekaman bertanda hapus

/** Baris DBF sebagai teks (angka tidak diubah menjadi bilangan supaya kode 16 digit tidak rusak). */
export function bacaDbf(buf: ArrayBuffer): HasilDbf {
  if (buf.byteLength < 33) throw new Error("Berkas .dbf terlalu pendek.");
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const nBaris = dv.getUint32(4, true);
  const panjangKepala = dv.getUint16(8, true);
  const panjangBaris = dv.getUint16(10, true);
  if (panjangKepala < 33 || panjangBaris < 2 || panjangKepala > buf.byteLength) throw new Error("Kepala berkas .dbf rusak.");
  const kolom: { nama: string; mulai: number; panjang: number }[] = [];
  let mulai = 1; // byte 0 tiap baris = penanda hapus
  for (let o = 32; o + 32 <= panjangKepala && u8[o] !== 0x0d; o += 32) {
    let akhir = o;
    while (akhir < o + 11 && u8[akhir] !== 0) akhir++;
    const nama = new TextDecoder("windows-1252").decode(u8.subarray(o, akhir)).trim();
    const panjang = u8[o + 16];
    kolom.push({ nama, mulai, panjang });
    mulai += panjang;
  }
  if (kolom.length === 0) throw new Error("Berkas .dbf tanpa kolom.");
  const baris: (Atribut | null)[] = [];
  for (let i = 0; i < nBaris; i++) {
    const o = panjangKepala + i * panjangBaris;
    if (o + panjangBaris > buf.byteLength) break;
    if (u8[o] === 0x2a) {
      baris.push(null);
      continue;
    }
    const a: Atribut = {};
    for (const k of kolom) a[k.nama] = dekode(u8.subarray(o + k.mulai, o + k.mulai + k.panjang)).replace(/\0/g, "").trim();
    baris.push(a);
  }
  return { kolom: kolom.map((k) => k.nama), baris };
}

// ------------------------------------------------------------------ PRJ dan proyeksi

export type SistemKoordinat =
  | { jenis: "geografis"; wgs84: boolean; catatan: string }
  | { jenis: "tm"; fe: number; fn: number; kn: number; k0: number; lamda0: number; wgs84: boolean; catatan: string }
  | { jenis: "tak_dikenal"; catatan: string };

const NAMA_WGS = /WGS[ _]?(19)?84|GRS[ _]?(19)?80|DGN[ _]?95|ID[ _]?74|INDONESIAN[ _]?1995/i;

function ambilParameter(t: string, nama: string): number | null {
  const m = new RegExp(`PARAMETER\\s*\\[\\s*"${nama}"\\s*,\\s*(-?[0-9.eE+-]+)`, "i").exec(t);
  return m ? Number(m[1]) : null;
}

/** Baca isi berkas .prj (WKT). Mendukung geografis (derajat) dan Transverse Mercator berasal lintang 0 (UTM, TM-3 Indonesia); lainnya "tak_dikenal". */
export function bacaPrj(teks: string): SistemKoordinat {
  const t = teks.trim();
  if (!t) return { jenis: "tak_dikenal", catatan: "berkas .prj kosong" };
  const wgs84 = NAMA_WGS.test(t);
  const catatanDatum = wgs84 ? "" : " (datum bukan WGS84/DGN95: posisi bisa bergeser hingga puluhan meter)";
  if (/^\s*(GEOGCS|GEOGCRS)/i.test(t)) return { jenis: "geografis", wgs84, catatan: `koordinat geografis${catatanDatum}` };
  if (/^\s*(PROJCS|PROJCRS)/i.test(t)) {
    const utm = /UTM[ _]ZONE[ _]?(\d{1,2})\s*([NS])?/i.exec(t);
    const epsg = /AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(32[67]\d{2})"?\s*\]\s*\]\s*$/i.exec(t) ?? /EPSG"\s*,\s*"?(32[67]\d{2})"?/i.exec(t);
    if (utm || epsg) {
      let zona: number;
      let selatan: boolean;
      if (epsg) {
        zona = Number(epsg[1].slice(3));
        selatan = epsg[1].startsWith("327");
      } else {
        zona = Number(utm![1]);
        selatan = (utm![2] ?? "").toUpperCase() === "S" || /FALSE_NORTHING"\s*,\s*10000000/i.test(t);
      }
      if (zona < 1 || zona > 60) return { jenis: "tak_dikenal", catatan: `zona UTM ${zona} tidak wajar` };
      return { jenis: "tm", fe: 500000, fn: selatan ? 10_000_000 : 0, kn: 0, k0: 0.9996, lamda0: -183 + 6 * zona, wgs84, catatan: `UTM zona ${zona}${selatan ? "S" : "N"}${catatanDatum}` };
    }
    if (/TRANSVERSE[ _]MERCATOR/i.test(t)) {
      const fe = ambilParameter(t, "False_Easting");
      const fn = ambilParameter(t, "False_Northing");
      const cm = ambilParameter(t, "Central_Meridian");
      const k0 = ambilParameter(t, "Scale_Factor");
      const lat0 = ambilParameter(t, "Latitude_Of_Origin");
      if (fe === null || fn === null || cm === null || k0 === null) return { jenis: "tak_dikenal", catatan: "parameter Transverse Mercator tidak lengkap" };
      if (lat0 !== null && Math.abs(lat0) > 1e-9) return { jenis: "tak_dikenal", catatan: "Transverse Mercator dengan lintang asal bukan 0 belum didukung" };
      return { jenis: "tm", fe, fn, kn: 0, k0, lamda0: cm, wgs84, catatan: `Transverse Mercator (meridian ${cm}, skala ${k0})${catatanDatum}` };
    }
    return { jenis: "tak_dikenal", catatan: "proyeksi bukan UTM/Transverse Mercator" };
  }
  return { jenis: "tak_dikenal", catatan: "isi .prj tidak dikenali" };
}

const A_WGS = 6378137;
const F_WGS = 1 / 298.257223563;

/** Titik proyeksi Transverse Mercator (deret Krüger, galat di bawah 1 mm) -> [bujur, lintang] derajat. */
export function tmKeGeografis(e: number, n: number, s: Extract<SistemKoordinat, { jenis: "tm" }>): [number, number] {
  const nn = F_WGS / (2 - F_WGS);
  const n2 = nn * nn;
  const n3 = n2 * nn;
  const n4 = n3 * nn;
  const A = (A_WGS / (1 + nn)) * (1 + n2 / 4 + n4 / 64);
  const b = [nn / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360, n2 / 48 + n3 / 15 - (437 * n4) / 1440, (17 * n3) / 480 - (37 * n4) / 840, (4397 * n4) / 161280];
  const d = [2 * nn - (2 * n2) / 3 - 2 * n3 + (116 * n4) / 45, (7 * n2) / 3 - (8 * n3) / 5 - (227 * n4) / 45, (56 * n3) / 15 - (136 * n4) / 35, (4279 * n4) / 630];
  const xi = (n - s.fn) / (s.k0 * A);
  const eta = (e - s.fe) / (s.k0 * A);
  let xi1 = xi;
  let eta1 = eta;
  for (let j = 1; j <= 4; j++) {
    xi1 -= b[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta1 -= b[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let lintang = chi;
  for (let j = 1; j <= 4; j++) lintang += d[j - 1] * Math.sin(2 * j * chi);
  const bujur = (s.lamda0 * Math.PI) / 180 + Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  return [(bujur * 180) / Math.PI, (lintang * 180) / Math.PI];
}

/** Kebalikan tmKeGeografis (untuk uji bolak-balik). */
export function geografisKeTm(bujur: number, lintang: number, s: Extract<SistemKoordinat, { jenis: "tm" }>): [number, number] {
  const nn = F_WGS / (2 - F_WGS);
  const n2 = nn * nn;
  const n3 = n2 * nn;
  const n4 = n3 * nn;
  const A = (A_WGS / (1 + nn)) * (1 + n2 / 4 + n4 / 64);
  const al = [nn / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180, (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440, (61 * n3) / 240 - (103 * n4) / 140, (49561 * n4) / 161280];
  const phi = (lintang * Math.PI) / 180;
  const dl = ((bujur - s.lamda0) * Math.PI) / 180;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - ((2 * Math.sqrt(nn)) / (1 + nn)) * Math.atanh(((2 * Math.sqrt(nn)) / (1 + nn)) * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(dl));
  const eta1 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi1;
  let eta = eta1;
  for (let j = 1; j <= 4; j++) {
    xi += al[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += al[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return [s.fe + s.k0 * A * eta, s.fn + s.k0 * A * xi];
}

/** Ubah semua titik ke WGS84 (bujur, lintang). Geografis: titik apa adanya. Melempar Error untuk sistem koordinat yang tidak dikenal. */
export function keWgs84(g: readonly Poligon[], sk: SistemKoordinat): Poligon[] {
  if (sk.jenis === "tak_dikenal") throw new Error(`Sistem koordinat tidak didukung: ${sk.catatan}.`);
  const f = sk.jenis === "geografis" ? (x: number, y: number): [number, number] => [x, y] : (x: number, y: number) => tmKeGeografis(x, y, sk);
  return g.map((p) => p.map((c) => c.map(([x, y]) => f(x, y))));
}

/** Tebak sistem koordinat tanpa .prj dari rentang angka: bujur-lintang yang masuk akal = geografis; selain itu null (tidak bisa ditebak). */
export function tebakTanpaPrj(g: readonly Poligon[]): SistemKoordinat | null {
  for (const p of g) for (const c of p) for (const [x, y] of c) {
    if (Math.abs(x) > 180 || Math.abs(y) > 90) return null;
  }
  return { jenis: "geografis", wgs84: true, catatan: "tanpa berkas .prj; dianggap bujur-lintang WGS84" };
}

// ------------------------------------------------------------------ GeoJSON

/** FeatureCollection/Feature GeoJSON -> fitur mentah (Polygon dan MultiPolygon). `namaBerkas` dipakai sebagai id cadangan bila namanya 16 digit (kebiasaan satu berkas per sub SLS). */
export function dariGeoJson(mentah: unknown, namaBerkas = ""): { fitur: FiturMentah[]; masalah: string[] } {
  const masalah: string[] = [];
  const fitur: FiturMentah[] = [];
  if (!mentah || typeof mentah !== "object") return { fitur, masalah: ["Isi GeoJSON bukan objek."] };
  const d = mentah as Record<string, unknown>;
  const crs = (d.crs as { properties?: { name?: string } } | undefined)?.properties?.name ?? "";
  if (d.crs && !/CRS84|WGS ?84|EPSG[:/]*4326/i.test(crs)) masalah.push(`Sistem koordinat ${crs} bukan WGS84 (CRS84/EPSG:4326).`);
  const daftar = d.type === "FeatureCollection" && Array.isArray(d.features) ? (d.features as unknown[]) : d.type === "Feature" ? [d] : [];
  if (daftar.length === 0) masalah.push("GeoJSON tanpa fitur.");
  const stem = namaBerkas.replace(/^.*[\\/]/, "").replace(/\.(geo)?json$/i, "");
  for (const f of daftar) {
    if (!f || typeof f !== "object") continue;
    const x = f as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
    const g = x.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon") || !Array.isArray(g.coordinates)) {
      masalah.push(`Geometri ${g?.type ?? "kosong"} dilewati (harus Polygon atau MultiPolygon).`);
      continue;
    }
    const atribut: Atribut = {};
    for (const [k, v] of Object.entries(x.properties ?? {})) atribut[k] = v === null || v === undefined ? "" : String(v);
    if (/^\d{16}$/.test(stem) && !Object.values(atribut).some((v) => /^\d{16}$/.test(v))) atribut.idsubsls = stem;
    fitur.push({ atribut, g: (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Poligon[] });
  }
  return { fitur, masalah };
}

// ------------------------------------------------------------------ pemilihan kolom

export type PilihanKolom = { id: string; nama: string; kode: string };

const adalah16 = (v: string) => /^\d{16}$/.test(v);

/** Kolom yang paling mungkin berisi kode sub SLS 16 digit (terbanyak berisi 16 digit; nama kolom yang mirip diutamakan saat sama). */
export function tebakKolom(kolom: readonly string[], baris: readonly Atribut[]): PilihanKolom {
  const contoh = baris.slice(0, 500);
  const skor = (k: string) => contoh.filter((b) => adalah16(b[k] ?? "")).length;
  const urut = [...kolom].sort((a, b) => skor(b) - skor(a) || Number(/id.*sub|idsubsls/i.test(b)) - Number(/id.*sub|idsubsls/i.test(a)));
  const id = urut.length > 0 && skor(urut[0]) > 0 ? urut[0] : "";
  const cari = (re: RegExp) => kolom.find((k) => re.test(k)) ?? "";
  return { id, nama: cari(/^(nm|nama).*sls$|^nmsls$|^nama$/i) || cari(/nama|^nm/i), kode: cari(/^kd.*sub|^kdsubsls$/i) };
}

// ------------------------------------------------------------------ normalisasi dan pemeriksaan

const bulat = (n: number) => Number(n.toFixed(DESIMAL_BATAS));
const KM_PER_DER_Y = 110.57;

/** Luas kira-kira dalam km2 (pendekatan datar lokal, sama dengan skrip), cincin luar dikurangi lubang. */
export function luasPoligonKm2(g: readonly Poligon[]): number {
  let total = 0;
  for (const p of g) {
    p.forEach((c, i) => {
      if (c.length < 4) return;
      const lat = c.reduce((s, t) => s + t[1], 0) / c.length;
      const a = Math.abs(luasBertanda(c)) * 111.32 * Math.cos((lat * Math.PI) / 180) * KM_PER_DER_Y;
      total += i === 0 ? a : -a;
    });
  }
  return total;
}

export type HasilSiapkan = { fitur: FiturBatas[]; masalah: Masalah[] };

/**
 * Fitur WGS84 mentah -> FiturBatas siap simpan, beserta temuan. Sama dengan pemeriksaan skrip laptop: id 16 digit dan unik, cincin tertutup (ditutup otomatis
 * bila selisih sedikit), minimal 4 titik, titik di dalam kotak Kab. Solok, luas sangat kecil. Fitur bergalat TIDAK ikut hasil (GALAT dicatat per id).
 */
export function siapkanFitur(mentah: readonly FiturMentah[], kolom: PilihanKolom): HasilSiapkan {
  const masalah: Masalah[] = [];
  const catat = (id: string, tingkat: TingkatMasalah, pesan: string) => masalah.push({ id, tingkat, pesan });
  const fitur: FiturBatas[] = [];
  const lihat = new Set<string>();
  if (!kolom.id) {
    catat("-", "GALAT", "Kolom kode sub SLS (16 digit) belum dipilih.");
    return { fitur, masalah };
  }
  if (mentah.length > MAKS_FITUR_BATAS) {
    catat("-", "GALAT", `Terlalu banyak fitur (${mentah.length}); batas ${MAKS_FITUR_BATAS}.`);
    return { fitur, masalah };
  }
  mentah.forEach((m, urut) => {
    const idMentah = (m.atribut[kolom.id] ?? "").trim();
    const id = idMentah || `baris ${urut + 1}`;
    if (!adalah16(idMentah)) {
      catat(id, "GALAT", `kode sub SLS "${idMentah || "kosong"}" bukan 16 digit angka${/e\+/i.test(idMentah) ? " (tampaknya terubah menjadi notasi ilmiah)" : ""}`);
      return;
    }
    if (lihat.has(idMentah)) {
      catat(idMentah, "GALAT", "kode sub SLS ganda pada berkas ini");
      return;
    }
    let galat = false;
    let luarKotak = false;
    const bagian: Poligon[] = [];
    for (const p of m.g) {
      const cincinBaru: number[][][] = [];
      p.forEach((c, ci) => {
        const titik: number[][] = [];
        for (const t of c) {
          if (!Array.isArray(t) || !Number.isFinite(t[0]) || !Number.isFinite(t[1])) {
            galat = true;
            continue;
          }
          const q = [bulat(t[0]), bulat(t[1])];
          const akhir = titik[titik.length - 1];
          if (akhir && akhir[0] === q[0] && akhir[1] === q[1]) continue; // titik kembar setelah pembulatan
          titik.push(q);
          if (q[0] < KOTAK_SOLOK.minX || q[0] > KOTAK_SOLOK.maxX || q[1] < KOTAK_SOLOK.minY || q[1] > KOTAK_SOLOK.maxY) luarKotak = true;
        }
        if (titik.length >= 3) {
          const a = titik[0];
          const z = titik[titik.length - 1];
          if (a[0] !== z[0] || a[1] !== z[1]) {
            titik.push([a[0], a[1]]);
            catat(idMentah, "INFO", "cincin tidak tertutup, ditutup otomatis");
          }
        }
        if (titik.length < 4) {
          if (ci === 0) catat(idMentah, "PERINGATAN", "cincin luar kurang dari 4 titik, bagian ini dibuang");
          return;
        }
        cincinBaru.push(titik);
      });
      if (cincinBaru.length > 0) bagian.push(cincinBaru);
    }
    if (galat) catat(idMentah, "GALAT", "ada koordinat yang bukan angka");
    if (bagian.length === 0) {
      catat(idMentah, "GALAT", "tidak ada poligon yang sah");
      return;
    }
    if (luarKotak) {
      catat(idMentah, "GALAT", "ada titik di luar kotak Kab. Solok (periksa sistem koordinat atau bujur-lintang tertukar)");
      return;
    }
    if (galat) return;
    const luas = luasPoligonKm2(bagian);
    if (luas < 0.0005) catat(idMentah, "PERINGATAN", `luas sangat kecil (${(luas * 1e6).toFixed(0)} m2)`);
    const semua = bagian.flat(2);
    const bb: Bb = [
      bulat(Math.min(...semua.map((q) => q[0]))),
      bulat(Math.min(...semua.map((q) => q[1]))),
      bulat(Math.max(...semua.map((q) => q[0]))),
      bulat(Math.max(...semua.map((q) => q[1]))),
    ];
    lihat.add(idMentah);
    fitur.push({ id: idMentah, nm: (kolom.nama ? m.atribut[kolom.nama] : "") ?? "", kd: (kolom.kode ? m.atribut[kolom.kode] : "") ?? "", bb, g: bagian });
  });
  return { fitur, masalah };
}

// ------------------------------------------------------------------ perbandingan dengan versi aktif

export type Perbandingan = {
  baru: string[];
  hilang: string[];
  sama: number;
  berubah: { id: string; luasPersen: number; geserM: number }[];
};

const tengah = (b: Bb): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

/** Beda dengan versi sebelumnya: baru, hilang, dan yang berubah (luas lebih dari 2% atau pusat kotak bergeser lebih dari 5 m). `lama` null = belum ada pembanding. */
export function bandingkan(baru: readonly FiturBatas[], lama: readonly FiturBatas[] | null): Perbandingan {
  if (!lama) return { baru: [], hilang: [], sama: 0, berubah: [] };
  const petaLama = new Map(lama.map((f) => [f.id, f]));
  const petaBaru = new Map(baru.map((f) => [f.id, f]));
  const hasil: Perbandingan = { baru: [], hilang: [], sama: 0, berubah: [] };
  for (const f of baru) {
    const l = petaLama.get(f.id);
    if (!l) {
      hasil.baru.push(f.id);
      continue;
    }
    const la = luasPoligonKm2(l.g);
    const lb = luasPoligonKm2(f.g);
    const luasPersen = la > 0 ? ((lb - la) / la) * 100 : 0;
    const [x1, y1] = tengah(l.bb);
    const [x2, y2] = tengah(f.bb);
    const geserM = Math.hypot((x2 - x1) * 111320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110570);
    if (Math.abs(luasPersen) > 2 || geserM > 5) hasil.berubah.push({ id: f.id, luasPersen: Math.round(luasPersen * 10) / 10, geserM: Math.round(geserM * 10) / 10 });
    else hasil.sama += 1;
  }
  for (const f of lama) if (!petaBaru.has(f.id)) hasil.hilang.push(f.id);
  hasil.baru.sort();
  hasil.hilang.sort();
  return hasil;
}

// ------------------------------------------------------------------ versi (berkas per kecamatan + manifest)

export type PaketVersi = { versi: string; manifest: ManifestBatas & { desimal: number; semua: { n: number } }; berkas: Record<string, string> };

/** Tanda versi dari waktu, mis. 202611081530 (WIB). Hanya huruf/angka supaya aman sebagai nama folder Storage. */
export function tandaVersi(sekarang: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(sekarang);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}${g("month")}${g("day")}${g("hour")}${g("minute")}`;
}

/** Susun isi versi: satu berkas per kecamatan (7 digit pertama id) dan manifest.json, bentuk sama dengan keluaran skrip laptop. */
export function susunVersi(fitur: readonly FiturBatas[], versi: string, sekarang: Date): PaketVersi {
  const perKec = new Map<string, FiturBatas[]>();
  for (const f of fitur) {
    const kec = f.id.slice(0, 7);
    const l = perKec.get(kec);
    if (l) l.push(f);
    else perKec.set(kec, [f]);
  }
  const dibuat = sekarang.toISOString();
  const berkas: Record<string, string> = {};
  const kecamatan: ManifestBatas["kecamatan"] = {};
  for (const kec of [...perKec.keys()].sort()) {
    const list = (perKec.get(kec) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const nama = `batas-${kec}.json`;
    const isi = JSON.stringify({ versi, dibuat, krs: "WGS84", desimal: DESIMAL_BATAS, n: list.length, fitur: list.map(({ id, nm, kd, bb, g }) => ({ id, nm, kd, bb, g })) });
    berkas[nama] = isi;
    const bb: Bb = [Math.min(...list.map((f) => f.bb[0])), Math.min(...list.map((f) => f.bb[1])), Math.max(...list.map((f) => f.bb[2])), Math.max(...list.map((f) => f.bb[3]))];
    kecamatan[kec] = { berkas: nama, ukuran: isi.length, n: list.length, bb };
  }
  const manifest = { versi, dibuat, desimal: DESIMAL_BATAS, semua: { n: fitur.length }, kecamatan };
  berkas["manifest.json"] = JSON.stringify(manifest, null, 1);
  return { versi, manifest, berkas };
}

export const adalahTandaVersi = (v: string) => /^[0-9A-Za-z]{6,20}$/.test(v);
