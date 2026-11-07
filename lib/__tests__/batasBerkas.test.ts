// lib/__tests__/batasBerkas.test.ts
// (7 Nov 2026, tahap C2) Pembaca berkas unggahan: zip shapefile, berkas terpisah, GeoJSON, zip banyak GeoJSON, dan penolakan yang jelas.

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { bacaBerkasUnggahan, bukaZip } from "../batasBerkas";
import { geografisKeTm, siapkanFitur, tebakKolom } from "../batasUnggah";
import { bangunDbf, bangunShp, kotak } from "./pembantuShapefile";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const PRJ_WGS = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const PRJ_UTM = 'PROJCS["WGS_1984_UTM_Zone_47S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",99.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0]]';
const KOL = [{ nama: "idsubsls", panjang: 16 }, { nama: "nmsls", panjang: 12 }];
const dua = [kotak(100.85, -1.2), kotak(100.9, -1.1)];

async function zipSatu(isi: Record<string, ArrayBuffer | string>): Promise<ArrayBuffer> {
  const z = new JSZip();
  for (const [n, d] of Object.entries(isi)) z.file(n, d);
  return z.generateAsync({ type: "arraybuffer" });
}

describe("bacaBerkasUnggahan", () => {
  it("zip shapefile WGS84 (folder bersarang, .shx dan sampah macOS diabaikan)", async () => {
    const z = await zipSatu({
      "batas/solok.shp": bangunShp(dua.map((c) => [c])),
      "batas/solok.dbf": bangunDbf(KOL, [["1303040001000100", "A"], ["1303050001000100", "B"]]),
      "batas/solok.prj": PRJ_WGS,
      "batas/solok.shx": new ArrayBuffer(100),
      "__MACOSX/batas/._solok.shp": new ArrayBuffer(10),
    });
    const h = await bacaBerkasUnggahan([{ nama: "solok.zip", data: z }]);
    expect(h.galat).toEqual([]);
    expect(h.jenis).toBe("shapefile");
    expect(h.kolom).toEqual(["idsubsls", "nmsls"]);
    expect(h.fitur).toHaveLength(2);
    expect(h.fitur[1].atribut.nmsls).toBe("B");
    const k = tebakKolom(h.kolom, h.fitur.map((f) => f.atribut));
    expect(k.id).toBe("idsubsls");
    expect(siapkanFitur(h.fitur, k).fitur).toHaveLength(2);
  });

  it("berkas .shp/.dbf/.prj dipilih terpisah dengan proyeksi UTM", async () => {
    const [e, n] = geografisKeTm(100.85, -1.2, { jenis: "tm", fe: 500000, fn: 10_000_000, kn: 0, k0: 0.9996, lamda0: 99, wgs84: true, catatan: "" });
    const c = [[e, n], [e, n + 300], [e + 300, n + 300], [e + 300, n], [e, n]];
    const h = await bacaBerkasUnggahan([
      { nama: "x.SHP", data: bangunShp([[c]]) },
      { nama: "x.DBF", data: bangunDbf(KOL, [["1303040001000100", "A"]]) },
      { nama: "x.PRJ", data: enc(PRJ_UTM) },
    ]);
    expect(h.galat).toEqual([]);
    expect(h.sistem).toMatch(/UTM zona 47S/);
    expect(h.fitur[0].g[0][0][0][0]).toBeCloseTo(100.85, 5);
  });

  it("tanpa .prj: bujur-lintang dianggap WGS84 dengan catatan; angka UTM tanpa .prj ditolak", async () => {
    const ok = await bacaBerkasUnggahan([{ nama: "a.shp", data: bangunShp([[dua[0]]]) }, { nama: "a.dbf", data: bangunDbf(KOL, [["1303040001000100", "A"]]) }]);
    expect(ok.galat).toEqual([]);
    expect(ok.catatan.join(" ")).toMatch(/dianggap bujur-lintang/);
    const utm = await bacaBerkasUnggahan([{ nama: "a.shp", data: bangunShp([[[[611000, 9867000], [611000, 9867100], [611100, 9867100], [611000, 9867000]]]]) }, { nama: "a.dbf", data: bangunDbf(KOL, [["1303040001000100", "A"]]) }]);
    expect(utm.galat[0]).toMatch(/\.prj tidak ada/);
  });

  it("penolakan yang jelas: .dbf hilang, jumlah baris beda, proyeksi tak didukung, bukan shapefile", async () => {
    const shp = { nama: "a.shp", data: bangunShp(dua.map((c) => [c])) };
    expect((await bacaBerkasUnggahan([shp])).galat[0]).toMatch(/\.dbf untuk a tidak ada/);
    expect((await bacaBerkasUnggahan([shp, { nama: "a.dbf", data: bangunDbf(KOL, [["1303040001000100", "A"]]) }])).galat[0]).toMatch(/tidak sama dengan jumlah baris/);
    const lambert = await bacaBerkasUnggahan([shp, { nama: "a.dbf", data: bangunDbf(KOL, [["1", "A"], ["2", "B"]]) }, { nama: "a.prj", data: enc('PROJCS["L",PROJECTION["Lambert_Conformal_Conic"]]') }]);
    expect(lambert.galat[0]).toMatch(/tidak didukung/);
    expect((await bacaBerkasUnggahan([{ nama: "catatan.txt", data: enc("hai") }])).galat[0]).toMatch(/Tidak ada berkas \.shp/);
    expect((await bacaBerkasUnggahan([{ nama: "rusak.zip", data: enc("bukan zip") }])).galat.length).toBeGreaterThan(0);
  });

  it("GeoJSON tunggal dan zip berisi banyak GeoJSON satu per sub SLS (id dari nama berkas)", async () => {
    const fc = (props: Record<string, string>, c: number[][]) => JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [c] } }] });
    const satu = await bacaBerkasUnggahan([{ nama: "batas.geojson", data: enc(fc({ idsubsls: "1303040001000100", nmsls: "A" }, dua[0])) }]);
    expect(satu.galat).toEqual([]);
    expect(satu.jenis).toBe("geojson");
    const z = await zipSatu({ "1303040001000100.geojson": fc({ nmsls: "A" }, dua[0]), "1303050001000100.geojson": fc({ nmsls: "B" }, dua[1]), "baca-saya.txt": "x" });
    const banyak = await bacaBerkasUnggahan([{ nama: "per-subsls.zip", data: z }]);
    expect(banyak.galat).toEqual([]);
    expect(banyak.fitur).toHaveLength(2);
    expect(tebakKolom(banyak.kolom, banyak.fitur.map((f) => f.atribut)).id).toBe("idsubsls");
    const buruk = await bacaBerkasUnggahan([{ nama: "x.geojson", data: enc("{bukan json") }]);
    expect(buruk.galat.join(" ")).toMatch(/bukan JSON/);
  });

  it("bukaZip hanya mengambil berkas yang dipakai", async () => {
    const z = await zipSatu({ "a.shp": new ArrayBuffer(100), "a.shx": new ArrayBuffer(10), "a.cpg": "UTF-8", "a.dbf": new ArrayBuffer(40) });
    expect((await bukaZip(z)).map((b) => b.nama).sort()).toEqual(["a.dbf", "a.shp"]);
  });
});
