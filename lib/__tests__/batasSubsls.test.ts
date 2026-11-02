import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buatProyeksi } from "@/lib/pendataan";
import {
  bacaBerkasBatas,
  bacaManifestBatas,
  gabungFitur,
  idKecamatan,
  jalurBatas,
  jalurCacheBatas,
  kecamatanUntukKotak,
  kotakKk,
  kunciKotak,
  pandangUntukBb,
  siapkanGambarBatas,
  tetanggaDekat,
  tampakDiKanvas,
  type FiturBatas,
} from "@/lib/batasSubsls";

const PUBLIK = join(__dirname, "..", "..", "public", "peta", "batas");
const bacaJson = (nama: string) => JSON.parse(readFileSync(join(PUBLIK, nama), "utf8"));

const kotakKecil = (id: string, x0: number, y0: number, x1: number, y1: number): FiturBatas => ({
  id,
  nm: "JORONG UJI",
  kd: "01",
  bb: [x0, y0, x1, y1],
  g: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]],
});

describe("bacaManifestBatas", () => {
  it("membaca manifest sungguhan: 14 kecamatan, 1084 Sub SLS, semua punya kotak", () => {
    const m = bacaManifestBatas(bacaJson("manifest.json"))!;
    expect(m).not.toBeNull();
    expect(Object.keys(m.kecamatan)).toHaveLength(14);
    expect(Object.values(m.kecamatan).reduce((s, k) => s + k.n, 0)).toBe(1084);
    expect(Object.values(m.kecamatan).every((k) => k.bb !== null)).toBe(true);
  });
  it("bentuk tak dikenal tidak melempar dan menghasilkan null / entri dibuang", () => {
    expect(bacaManifestBatas(null)).toBeNull();
    expect(bacaManifestBatas("x")).toBeNull();
    expect(bacaManifestBatas({ versi: "", kecamatan: {} })).toBeNull();
    expect(bacaManifestBatas({ versi: "1" })).toBeNull();
    const m = bacaManifestBatas({
      versi: "1",
      kecamatan: {
        "1303060": { berkas: "batas-1303060.json", ukuran: 10, n: 2, bb: [1, 2, 3, 4] },
        abc: { berkas: "batas-1303061.json" },
        "1303070": { berkas: "../rahasia.json" },
        "1303080": { berkas: "batas-1303080.json", bb: [5, 2, 3, 4] },
      },
    })!;
    expect(Object.keys(m.kecamatan).sort()).toEqual(["1303060", "1303080"]);
    expect(m.kecamatan["1303080"].bb).toBeNull(); // kotak terbalik ditolak, kecamatan tetap ada
  });
});

describe("bacaBerkasBatas", () => {
  it("semua 14 berkas sungguhan terbaca penuh tanpa satu fitur pun dibuang", () => {
    const m = bacaJson("manifest.json");
    let total = 0;
    for (const [kode, v] of Object.entries<{ berkas: string; n: number }>(m.kecamatan)) {
      const b = bacaBerkasBatas(bacaJson(v.berkas))!;
      expect(b.fitur).toHaveLength(v.n);
      expect(b.fitur.every((f) => idKecamatan(f.id) === kode)).toBe(true);
      total += b.fitur.length;
    }
    expect(total).toBe(1084);
  });
  it("membuang fitur rusak satu per satu", () => {
    const baik = kotakKecil("1303060001000101", 100.7, -0.95, 100.8, -0.9);
    const b = bacaBerkasBatas({
      versi: "9",
      fitur: [baik, { ...baik, id: "123" }, { ...baik, id: "1303060001000102", g: [] }, { ...baik, id: "1303060001000103", g: [[[[1, 2], [3, 4]]]] }, { ...baik, id: "1303060001000104", bb: [9, 9, 1, 1] }, null, "x"],
    })!;
    expect(b.versi).toBe("9");
    expect(b.fitur.map((f) => f.id)).toEqual(["1303060001000101"]);
  });
  it("null bila tidak ada daftar fitur", () => {
    expect(bacaBerkasBatas(null)).toBeNull();
    expect(bacaBerkasBatas({ versi: "1" })).toBeNull();
  });
});

describe("kotakKk dan pemilihan kecamatan", () => {
  it("kotak melebar 20% dan minimal 0,002 derajat; titik tunggal tidak menjadi kotak nol", () => {
    const k = kotakKk([{ lat: -1, lng: 100 }, { lat: -0.9, lng: 100.1 }])!;
    expect(k.minLng).toBeCloseTo(99.98, 6);
    expect(k.maxLat).toBeCloseTo(-0.88, 6);
    const t = kotakKk([{ lat: -1, lng: 100 }])!;
    expect(t.maxLng - t.minLng).toBeCloseTo(0.004, 6);
    expect(kotakKk([])).toBeNull();
    expect(kotakKk([{ lat: NaN, lng: 1 }])).toBeNull();
  });
  it("titik Kubang Nan Duo masuk kecamatan 1303060, dan hanya kecamatan yang beririsan", () => {
    const m = bacaManifestBatas(bacaJson("manifest.json"))!;
    const f = bacaBerkasBatas(bacaJson("batas-1303060.json"))!.fitur.find((x) => x.kd === "01" && x.id.startsWith("1303060001"))!;
    const titik = { lat: (f.bb[1] + f.bb[3]) / 2, lng: (f.bb[0] + f.bb[2]) / 2 };
    const kode = kecamatanUntukKotak(m, kotakKk([titik])!);
    expect(kode).toContain("1303060");
    expect(kode.length).toBeLessThan(14);
  });
  it("kotak di luar semua kecamatan -> kosong; kecamatan tanpa kotak selalu ikut", () => {
    const m = bacaManifestBatas(bacaJson("manifest.json"))!;
    expect(kecamatanUntukKotak(m, { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 })).toEqual([]);
    const tanpaKotak = bacaManifestBatas({ versi: "1", kecamatan: { "1303060": { berkas: "batas-1303060.json" } } })!;
    expect(kecamatanUntukKotak(tanpaKotak, { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 })).toEqual(["1303060"]);
  });
  it("kunciKotak stabil terhadap selisih kecil (<0,0005 derajat)", () => {
    const a = { minLng: 100.12301, minLat: -0.5, maxLng: 100.2, maxLat: -0.4 };
    const b = { ...a, minLng: 100.12304 };
    expect(kunciKotak(a)).toBe(kunciKotak(b));
    expect(kunciKotak(null)).toBe("");
  });
});

describe("jalur dan gambar", () => {
  const proj = buatProyeksi([{ lat: -1, lng: 100 }, { lat: -0.9, lng: 100.1 }], 360, 440, 28)!;
  it("jalurBatas: satu cincin tertutup, y membalik (lintang besar = atas), 2 desimal", () => {
    const f = kotakKecil("1303060001000101", 100.02, -0.98, 100.05, -0.95);
    const d = jalurBatas(f, proj);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(4);
    expect(d).toMatch(/^M-?\d+(\.\d{1,2})? -?\d+(\.\d{1,2})?/);
    const y1 = proj.y(-0.95);
    const y2 = proj.y(-0.98);
    expect(y1).toBeLessThan(y2);
  });
  it("lubang (cincin dalam) ikut sebagai bagian jalur; cincin < 3 titik dibuang", () => {
    const luar = [[100.02, -0.98], [100.05, -0.98], [100.05, -0.95], [100.02, -0.95], [100.02, -0.98]];
    const dalam = [[100.03, -0.97], [100.04, -0.97], [100.04, -0.96], [100.03, -0.96], [100.03, -0.97]];
    const f: FiturBatas = { id: "1303060001000101", nm: "", kd: "", bb: [100.02, -0.98, 100.05, -0.95], g: [[luar, dalam, [[1, 1], [2, 2]]]] };
    expect((jalurBatas(f, proj).match(/Z/g) ?? []).length).toBe(2);
  });
  it("tampakDiKanvas: yang jauh di luar kanvas tidak digambar", () => {
    const dalam = kotakKecil("1303060001000101", 100.02, -0.98, 100.05, -0.95);
    const jauh = kotakKecil("1303060001000102", 101.5, -0.2, 101.6, -0.1);
    expect(tampakDiKanvas(dalam, proj)).toBe(true);
    expect(tampakDiKanvas(jauh, proj, 40)).toBe(false);
  });
  it("siapkanGambarBatas: hanya yang tampak, Sub SLS aktif di urutan terakhir; tanpa proyeksi kosong", () => {
    const a = kotakKecil("1303060001000101", 100.02, -0.98, 100.05, -0.95);
    const b = kotakKecil("1303060001000102", 100.05, -0.98, 100.08, -0.95);
    const jauh = kotakKecil("1303060001000103", 101.5, -0.2, 101.6, -0.1);
    const g = siapkanGambarBatas([a, b, jauh], proj, "1303060001000101");
    expect(g.map((x) => x.id)).toEqual(["1303060001000102", "1303060001000101"]);
    expect(siapkanGambarBatas([a], null, null)).toEqual([]);
  });
  it("data sungguhan: setiap Sub SLS menghasilkan jalur tidak kosong pada proyeksi lokal", () => {
    const b = bacaBerkasBatas(bacaJson("batas-1303060.json"))!;
    const f = b.fitur[0];
    const pr = buatProyeksi([{ lat: f.bb[1], lng: f.bb[0] }, { lat: f.bb[3], lng: f.bb[2] }], 360, 440, 28)!;
    const g = siapkanGambarBatas(b.fitur, pr, f.id);
    expect(g.length).toBeGreaterThanOrEqual(1);
    expect(g[g.length - 1].id).toBe(f.id);
    expect(g.every((x) => x.d.length > 20)).toBe(true);
  });
});

describe("gabungFitur dan jalur cache", () => {
  it("tidak menggandakan id yang sama", () => {
    const a = kotakKecil("1303060001000101", 1, 1, 2, 2);
    const b = kotakKecil("1303060001000102", 2, 2, 3, 3);
    expect(gabungFitur([[a, b], [a]]).map((f) => f.id)).toEqual([a.id, b.id]);
  });
  it("kunci cache memakai awalan /peta-cache/batas/", () => {
    expect(jalurCacheBatas("batas-1303060.json")).toBe("/peta-cache/batas/batas-1303060.json");
  });
});

describe("tetanggaDekat", () => {
  const a = kotakKecil("1303060001000101", 100.02, -0.98, 100.05, -0.95);
  const b = kotakKecil("1303060001000102", 100.05, -0.98, 100.08, -0.95); // bersinggungan dengan a
  const c = kotakKecil("1303060001000103", 100.5, -0.5, 100.6, -0.4); // jauh
  it("Sub SLS aktif + tetangga yang bersinggungan; yang jauh tidak ikut", () => {
    expect(tetanggaDekat([a, b, c], a.id).map((f) => f.id)).toEqual([a.id, b.id]);
  });
  it("tanpa aktif, atau id aktif tidak ada di daftar: semuanya", () => {
    expect(tetanggaDekat([a, b, c], null)).toHaveLength(3);
    expect(tetanggaDekat([a, b, c], "1303060001000999")).toHaveLength(3);
  });
  it("data sungguhan: Sub SLS di kecamatan 1303080 hanya punya segelintir tetangga, bukan ratusan", () => {
    const f = bacaBerkasBatas(bacaJson("batas-1303080.json"))!.fitur;
    const dekat = tetanggaDekat(f, "1303080004000703");
    expect(dekat.length).toBeGreaterThan(1);
    expect(dekat.length).toBeLessThan(20);
    expect(dekat[0].id === "1303080004000703" || dekat.some((x) => x.id === "1303080004000703")).toBe(true);
  });
});

describe("pandangUntukBb", () => {
  const proj = buatProyeksi([{ lat: -1, lng: 100 }, { lat: -0.5, lng: 100.5 }], 360, 440, 28)!;
  it("kotak kecil di tengah: zoom naik (dibatasi zMaks) dan pusat tepat di kotak", () => {
    const bb: [number, number, number, number] = [100.24, -0.76, 100.26, -0.74];
    const p = pandangUntukBb(bb, proj, 0.25, 8);
    expect(p.z).toBe(8);
    expect(p.cx).toBeCloseTo((proj.x(bb[0]) + proj.x(bb[2])) / 2, 6);
    expect(p.cy).toBeCloseTo((proj.y(bb[1]) + proj.y(bb[3])) / 2, 6);
  });
  it("kotak sebesar seluruh kanvas: zoom 1 dan pusat di tengah", () => {
    const p = pandangUntukBb([100, -1, 100.5, -0.5], proj, 0.25, 8);
    expect(p.z).toBe(1);
    expect(p.cx).toBeCloseTo(180, 6);
    expect(p.cy).toBeCloseTo(220, 6);
  });
  it("kotak di pojok: pusat dijaga di dalam kanvas (pandangan tidak keluar)", () => {
    const p = pandangUntukBb([100.0, -1, 100.01, -0.99], proj, 0.25, 8);
    expect(p.cx - 360 / 2 / p.z).toBeGreaterThanOrEqual(-1e-9);
    expect(p.cy + 440 / 2 / p.z).toBeLessThanOrEqual(440 + 1e-9);
  });
  it("hasil dapat dipakai langsung: seluruh kotak masuk pandangan (zoom tidak terbatas zMaks)", () => {
    const bb: [number, number, number, number] = [100.2, -0.8, 100.3, -0.7];
    const p = pandangUntukBb(bb, proj, 0.25, 8);
    const hw = 360 / 2 / p.z;
    expect(proj.x(bb[0])).toBeGreaterThanOrEqual(p.cx - hw - 1e-6);
    expect(proj.x(bb[2])).toBeLessThanOrEqual(p.cx + hw + 1e-6);
  });
});
