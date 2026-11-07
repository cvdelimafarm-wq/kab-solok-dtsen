// lib/__tests__/batasUnggah.test.ts
// (7 Nov 2026, tahap C2) Pembaca shapefile murni: SHP, DBF, PRJ, proyeksi TM, GeoJSON, pemeriksaan, perbandingan, dan susunan versi.

import { describe, expect, it } from "vitest";
import {
  adalahTandaVersi, bacaDbf, bacaPrj, bacaShp, bandingkan, dariGeoJson, geografisKeTm, kelompokkanCincin, keWgs84, siapkanFitur, susunVersi, tandaVersi, tebakKolom,
  tebakTanpaPrj, tmKeGeografis, type FiturMentah, type Poligon, type SistemKoordinat,
} from "../batasUnggah";
import { bacaBerkasBatas, bacaManifestBatas } from "../batasSubsls";
import { KECIL, bangunDbf, bangunShp, kotak } from "./pembantuShapefile";

// ---------- proyeksi
const UTM47S: Extract<SistemKoordinat, { jenis: "tm" }> = { jenis: "tm", fe: 500000, fn: 10_000_000, kn: 0, k0: 0.9996, lamda0: 99, wgs84: true, catatan: "" };

// rujukan bebas: deret Snyder (Map Projections, 8-9 s.d. 8-15)
function snyderMaju(bujur: number, lintang: number, s: typeof UTM47S): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = (lintang * Math.PI) / 180;
  const A = (((bujur - s.lamda0) * Math.PI) / 180) * Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) - ((35 * e6) / 3072) * Math.sin(6 * phi));
  const x = s.k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y = s.k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [s.fe + x, s.fn + y];
}

describe("proyeksi Transverse Mercator", () => {
  it("titik asal zona: (500000, 10000000) di meridian pusat 99 BT dan lintang 0", () => {
    const [x, y] = tmKeGeografis(500000, 10_000_000, UTM47S);
    expect(x).toBeCloseTo(99, 9);
    expect(y).toBeCloseTo(0, 9);
  });
  it("maju (Krüger) cocok dengan rujukan Snyder hingga di bawah 2 cm di Kab. Solok", () => {
    for (const [lng, lat] of [[100.5, -1.0], [100.85, -1.2], [101.2, -0.6], [100.3, -1.7], [101.5, -0.25]]) {
      const [e1, n1] = geografisKeTm(lng, lat, UTM47S);
      const [e2, n2] = snyderMaju(lng, lat, UTM47S);
      expect(Math.abs(e1 - e2)).toBeLessThan(0.02);
      expect(Math.abs(n1 - n2)).toBeLessThan(0.02);
    }
  });
  it("mundur adalah kebalikan maju (selisih di bawah 1e-9 derajat)", () => {
    for (const [lng, lat] of [[100.5, -1.0], [100.85, -1.2], [101.2, -0.6], [100.3, -1.7]]) {
      const [e, n] = geografisKeTm(lng, lat, UTM47S);
      const [x, y] = tmKeGeografis(e, n, UTM47S);
      expect(Math.abs(x - lng)).toBeLessThan(1e-9);
      expect(Math.abs(y - lat)).toBeLessThan(1e-9);
    }
  });
  it("keWgs84 mengubah poligon UTM dan membiarkan poligon geografis", () => {
    const [e, n] = geografisKeTm(100.85, -1.2, UTM47S);
    const p: Poligon[] = [[[[e, n], [e + 10, n], [e + 10, n + 10], [e, n]]]];
    const w = keWgs84(p, UTM47S);
    expect(w[0][0][0][0]).toBeCloseTo(100.85, 6);
    expect(w[0][0][0][1]).toBeCloseTo(-1.2, 6);
    const g: Poligon[] = [[[[100.8, -1.2], [100.9, -1.2], [100.8, -1.1], [100.8, -1.2]]]];
    expect(keWgs84(g, { jenis: "geografis", wgs84: true, catatan: "" })).toEqual(g);
    expect(() => keWgs84(g, { jenis: "tak_dikenal", catatan: "x" })).toThrow(/tidak didukung/);
  });
});

describe("bacaPrj", () => {
  const PRJ_ESRI = 'PROJCS["WGS_1984_UTM_Zone_47S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",99.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  it("UTM zona 47S gaya Esri", () => {
    const s = bacaPrj(PRJ_ESRI);
    expect(s.jenis).toBe("tm");
    if (s.jenis === "tm") {
      expect(s.lamda0).toBe(99);
      expect(s.fn).toBe(10_000_000);
      expect(s.k0).toBe(0.9996);
    }
  });
  it("UTM gaya EPSG (WGS 84 / UTM zone 47S, kode 32747) dan belahan utara 32647", () => {
    const s = bacaPrj('PROJCS["WGS 84 / UTM zone 47S",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]]],PROJECTION["Transverse_Mercator"],AUTHORITY["EPSG","32747"]]');
    expect(s.jenis === "tm" && s.fn === 10_000_000 && s.lamda0 === 99).toBe(true);
    const u = bacaPrj('PROJCS["WGS 84 / UTM zone 47N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]]],PROJECTION["Transverse_Mercator"]]');
    expect(u.jenis === "tm" && u.fn === 0).toBe(true);
  });
  it("TM-3 Indonesia (parameter dibaca langsung)", () => {
    const s = bacaPrj('PROJCS["DGN95 / Indonesia TM-3 zone 47.2",GEOGCS["DGN95",DATUM["Datum_Geodesi_Nasional_1995",SPHEROID["WGS 84",6378137,298.257223563]]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",100.5],PARAMETER["scale_factor",0.9999],PARAMETER["false_easting",200000],PARAMETER["false_northing",1500000]]');
    expect(s).toMatchObject({ jenis: "tm", fe: 200000, fn: 1500000, k0: 0.9999, lamda0: 100.5 });
  });
  it("geografis, datum asing diberi catatan, proyeksi lain ditolak", () => {
    expect(bacaPrj('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]]')).toMatchObject({ jenis: "geografis", wgs84: true });
    const asing = bacaPrj('GEOGCS["GCS_Bessel_1841",DATUM["D_Bessel_1841",SPHEROID["Bessel_1841",6377397.155,299.1528128]]]');
    expect(asing).toMatchObject({ jenis: "geografis", wgs84: false });
    expect(asing.catatan).toMatch(/datum/);
    expect(bacaPrj('PROJCS["Lambert",PROJECTION["Lambert_Conformal_Conic"]]').jenis).toBe("tak_dikenal");
    expect(bacaPrj("").jenis).toBe("tak_dikenal");
    expect(bacaPrj("bukan wkt").jenis).toBe("tak_dikenal");
  });
  it("tanpa .prj: angka bujur-lintang dianggap geografis, angka besar tidak ditebak", () => {
    expect(tebakTanpaPrj([[[[100.8, -1.2], [100.9, -1.2], [100.8, -1.1], [100.8, -1.2]]]])?.jenis).toBe("geografis");
    expect(tebakTanpaPrj([[[[611000, 9867000], [611100, 9867000], [611000, 9867100], [611000, 9867000]]]])).toBeNull();
  });
});

describe("bacaShp dan kelompokkanCincin", () => {
  it("membaca poligon, rekaman kosong, dan lubang", () => {
    const luar = kotak(100.8, -1.2, 0.01);
    const lubang = KECIL(kotak(100.803, -1.197, 0.002));
    const hasil = bacaShp(bangunShp([[luar, lubang], null, [kotak(100.9, -1.1)]]));
    expect(hasil).toHaveLength(3);
    expect(hasil[0]).toHaveLength(1); // satu poligon
    expect(hasil[0]![0]).toHaveLength(2); // luar + satu lubang
    expect(hasil[1]).toBeNull();
    expect(hasil[2]![0][0][0]).toEqual([100.9, -1.1]);
  });
  it("dua cincin luar terpisah menjadi dua poligon (MultiPolygon)", () => {
    expect(kelompokkanCincin([kotak(100.8, -1.2), kotak(100.9, -1.2)])).toHaveLength(2);
  });
  it("semua cincin berlawanan jarum jam: semuanya dianggap cincin luar", () => {
    expect(kelompokkanCincin([KECIL(kotak(100.8, -1.2)), KECIL(kotak(100.9, -1.2))])).toHaveLength(2);
  });
  it("menolak berkas yang bukan shapefile atau bukan poligon atau terpotong", () => {
    expect(() => bacaShp(new ArrayBuffer(50))).toThrow(/terlalu pendek/);
    expect(() => bacaShp(new ArrayBuffer(120))).toThrow(/9994/);
    const titik = bangunShp([kotak(100.8, -1.2)].map((c) => [c]));
    new DataView(titik).setInt32(32, 1, true); // jenis Point
    expect(() => bacaShp(titik)).toThrow(/bukan poligon/);
    const utuh = bangunShp([[kotak(100.8, -1.2)]]);
    expect(() => bacaShp(utuh.slice(0, utuh.byteLength - 20))).toThrow(/terpotong/);
  });
});

describe("bacaDbf", () => {
  it("membaca kolom dan baris sebagai teks, kode 16 digit tidak rusak, baris terhapus null", () => {
    const dbf = bangunDbf([{ nama: "idsubsls", panjang: 16 }, { nama: "nmsls", panjang: 20 }], [["1303040001000100", "JORONG LUBUK"], "hapus", ["1303040001000201", "JORONG BALANTAI"]]);
    const h = bacaDbf(dbf);
    expect(h.kolom).toEqual(["idsubsls", "nmsls"]);
    expect(h.baris).toHaveLength(3);
    expect(h.baris[0]).toEqual({ idsubsls: "1303040001000100", nmsls: "JORONG LUBUK" });
    expect(h.baris[1]).toBeNull();
    expect(h.baris[2]?.idsubsls).toBe("1303040001000201");
  });
  it("menolak berkas rusak", () => {
    expect(() => bacaDbf(new ArrayBuffer(10))).toThrow(/terlalu pendek/);
    expect(() => bacaDbf(new ArrayBuffer(64))).toThrow(/rusak/);
  });
});

describe("GeoJSON", () => {
  const fc = (id: string | null, tipe = "Polygon") => ({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: id ? { idsubsls: id, nmsls: "X" } : {}, geometry: { type: tipe, coordinates: tipe === "Polygon" ? [kotak(100.8, -1.2)] : [[kotak(100.8, -1.2)]] } }],
  });
  it("Polygon dan MultiPolygon dibaca; atribut menjadi teks", () => {
    expect(dariGeoJson(fc("1303040001000100")).fitur[0].atribut).toEqual({ idsubsls: "1303040001000100", nmsls: "X" });
    expect(dariGeoJson(fc("1303040001000100", "MultiPolygon")).fitur).toHaveLength(1);
  });
  it("nama berkas 16 digit menjadi id cadangan (satu berkas per sub SLS)", () => {
    expect(dariGeoJson(fc(null), "C:\\x\\1303040001000100.geojson").fitur[0].atribut.idsubsls).toBe("1303040001000100");
  });
  it("sistem koordinat bukan WGS84 dan geometri bukan poligon dilaporkan", () => {
    expect(dariGeoJson({ ...fc("1"), crs: { properties: { name: "EPSG:32747" } } }).masalah[0]).toMatch(/bukan WGS84/);
    const titik = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [100, -1] } }] };
    const h = dariGeoJson(titik);
    expect(h.fitur).toHaveLength(0);
    expect(h.masalah.join(" ")).toMatch(/Point dilewati/);
  });
});

describe("tebakKolom", () => {
  it("memilih kolom berisi 16 digit, nama dan kode sub SLS dikenali", () => {
    const baris = [
      { OBJECTID: "1", idsubsls: "1303040001000100", nmsls: "A", kdsubsls: "00" },
      { OBJECTID: "2", idsubsls: "1303040001000201", nmsls: "B", kdsubsls: "01" },
    ];
    expect(tebakKolom(["OBJECTID", "idsubsls", "nmsls", "kdsubsls"], baris)).toEqual({ id: "idsubsls", nama: "nmsls", kode: "kdsubsls" });
  });
  it("tanpa kolom 16 digit: id kosong", () => {
    expect(tebakKolom(["a"], [{ a: "123" }]).id).toBe("");
  });
});

describe("siapkanFitur", () => {
  const f = (id: string, g: Poligon[] = [[kotak(100.85, -1.2)]], extra: Record<string, string> = {}): FiturMentah => ({ atribut: { idsubsls: id, nmsls: "JORONG", kdsubsls: "01", ...extra }, g });
  const kol = { id: "idsubsls", nama: "nmsls", kode: "kdsubsls" };
  it("fitur sah: bb, nama, kode, pembulatan 6 desimal", () => {
    const h = siapkanFitur([f("1303040001000100", [[[[100.8500004, -1.2], [100.8500004, -1.198], [100.852, -1.198], [100.852, -1.2], [100.8500004, -1.2]]]])], kol);
    expect(h.masalah.filter((m) => m.tingkat === "GALAT")).toEqual([]);
    expect(h.fitur[0]).toMatchObject({ id: "1303040001000100", nm: "JORONG", kd: "01", bb: [100.85, -1.2, 100.852, -1.198] });
  });
  it("galat: id bukan 16 digit, notasi ilmiah, ganda, di luar kotak, kolom id belum dipilih", () => {
    const h = siapkanFitur([f("123"), f("1.30304E+15"), f("1303040001000100"), f("1303040001000100"), f("1303040001000200", [[kotak(110, -1.2)]])], kol);
    const pesan = h.masalah.map((m) => `${m.id}|${m.pesan}`).join("\n");
    expect(pesan).toMatch(/123\|kode sub SLS "123" bukan 16 digit/);
    expect(pesan).toMatch(/notasi ilmiah/);
    expect(pesan).toMatch(/1303040001000100\|kode sub SLS ganda/);
    expect(pesan).toMatch(/1303040001000200\|ada titik di luar kotak/);
    expect(h.fitur.map((x) => x.id)).toEqual(["1303040001000100"]);
    expect(siapkanFitur([f("1303040001000100")], { id: "", nama: "", kode: "" }).masalah[0].pesan).toMatch(/belum dipilih/);
  });
  it("cincin tidak tertutup ditutup otomatis (INFO); cincin 3 titik dibuang (PERINGATAN) dan fitur tanpa poligon bergalat", () => {
    const terbuka = [[100.85, -1.2], [100.85, -1.198], [100.852, -1.198], [100.852, -1.2]];
    const h = siapkanFitur([f("1303040001000100", [[terbuka]]), f("1303040001000200", [[[[100.85, -1.2], [100.851, -1.2], [100.85, -1.2]]]])], kol);
    expect(h.fitur).toHaveLength(1);
    expect(h.fitur[0].g[0][0].at(-1)).toEqual(h.fitur[0].g[0][0][0]);
    expect(h.masalah.some((m) => m.tingkat === "INFO" && /ditutup otomatis/.test(m.pesan))).toBe(true);
    expect(h.masalah.some((m) => m.id === "1303040001000200" && m.tingkat === "GALAT")).toBe(true);
  });
  it("luas sangat kecil diberi peringatan, tetap dimuat", () => {
    const h = siapkanFitur([f("1303040001000100", [[kotak(100.85, -1.2, 0.00002)]])], kol);
    expect(h.fitur).toHaveLength(1);
    expect(h.masalah.some((m) => m.tingkat === "PERINGATAN" && /luas sangat kecil/.test(m.pesan))).toBe(true);
  });
  it("koordinat bukan angka bergalat", () => {
    const h = siapkanFitur([f("1303040001000100", [[[[100.85, -1.2], [NaN, 0], [100.852, -1.198], [100.85, -1.2]]]])], kol);
    expect(h.fitur).toHaveLength(0);
    expect(h.masalah.some((m) => /bukan angka/.test(m.pesan))).toBe(true);
  });
});

describe("bandingkan dan versi", () => {
  const kol = { id: "idsubsls", nama: "nmsls", kode: "kdsubsls" };
  const buat = (id: string, x: number, sisi = 0.002) => siapkanFitur([{ atribut: { idsubsls: id, nmsls: "J", kdsubsls: "0" }, g: [[kotak(x, -1.2, sisi)]] }], kol).fitur[0];
  const lama = [buat("1303040001000100", 100.85), buat("1303040001000200", 100.86), buat("1303050001000100", 100.9)];
  it("baru, hilang, berubah (luas), sama", () => {
    const baru = [buat("1303040001000100", 100.85), buat("1303040001000200", 100.86, 0.003), buat("1303050009000100", 100.95)];
    const b = bandingkan(baru, lama);
    expect(b.baru).toEqual(["1303050009000100"]);
    expect(b.hilang).toEqual(["1303050001000100"]);
    expect(b.sama).toBe(1);
    expect(b.berubah).toHaveLength(1);
    expect(b.berubah[0].id).toBe("1303040001000200");
    expect(b.berubah[0].luasPersen).toBeGreaterThan(100);
    expect(bandingkan(baru, null)).toEqual({ baru: [], hilang: [], sama: 0, berubah: [] });
  });
  it("susunVersi: satu berkas per kecamatan + manifest yang terbaca oleh pembaca aplikasi", () => {
    const sekarang = new Date("2026-11-08T08:30:00Z");
    const p = susunVersi(lama, tandaVersi(sekarang), sekarang);
    expect(p.versi).toBe("202611081530");
    expect(Object.keys(p.berkas).sort()).toEqual(["batas-1303040.json", "batas-1303050.json", "manifest.json"]);
    const m = bacaManifestBatas(JSON.parse(p.berkas["manifest.json"]));
    expect(m?.versi).toBe("202611081530");
    expect(Object.keys(m!.kecamatan)).toEqual(["1303040", "1303050"]);
    expect(m!.kecamatan["1303040"].n).toBe(2);
    expect(m!.kecamatan["1303040"].bb).not.toBeNull();
    const b = bacaBerkasBatas(JSON.parse(p.berkas["batas-1303040.json"]));
    expect(b?.fitur.map((x) => x.id)).toEqual(["1303040001000100", "1303040001000200"]);
    expect(b?.fitur[0].g[0][0]).toHaveLength(5);
  });
  it("tanda versi: WIB, hanya huruf/angka", () => {
    expect(tandaVersi(new Date("2026-11-08T17:05:00Z"))).toBe("202611090005");
    expect(adalahTandaVersi("202611081530")).toBe(true);
    expect(adalahTandaVersi("../x")).toBe(false);
    expect(adalahTandaVersi("12")).toBe(false);
  });
});

describe("alur shapefile utuh (SHP + DBF + PRJ UTM)", () => {
  it("poligon UTM 47S + atribut -> fitur WGS84 yang sah", () => {
    const [e, n] = geografisKeTm(100.85, -1.2, UTM47S);
    const utm = (dx: number, dy: number) => [e + dx, n + dy];
    const cincin = [utm(0, 0), utm(0, 200), utm(200, 200), utm(200, 0), utm(0, 0)]; // searah jarum jam
    const shp = bacaShp(bangunShp([[cincin]]));
    const dbf = bacaDbf(bangunDbf([{ nama: "idsubsls", panjang: 16 }, { nama: "nmsls", panjang: 10 }], [["1303040001000100", "JORONG"]]));
    const sk = bacaPrj('PROJCS["WGS_1984_UTM_Zone_47S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",99.0],PARAMETER["Scale_Factor",0.9996]]');
    const mentah: FiturMentah[] = shp.map((g, i) => ({ atribut: dbf.baris[i]!, g: keWgs84(g!, sk) }));
    const h = siapkanFitur(mentah, tebakKolom(dbf.kolom, dbf.baris as Record<string, string>[]));
    expect(h.masalah.filter((m) => m.tingkat === "GALAT")).toEqual([]);
    expect(h.fitur).toHaveLength(1);
    expect(h.fitur[0].bb[0]).toBeCloseTo(100.85, 5);
    expect(h.fitur[0].bb[1]).toBeCloseTo(-1.2, 5);
    expect(h.fitur[0].nm).toBe("JORONG");
  });
});
