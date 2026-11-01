import { describe, expect, it } from "vitest";
import { RINCIAN_IV2, JUDUL_IV2, anakJudul, hitungIv2, periksaIv2, ringkasIv2 } from "../vanguard/kuesioner/engineIv2";
import { rekapIv33 } from "../vanguard/kuesioner/engine";
import { METADATA_KP } from "../vanguard/pantau/peta";

describe("Blok IV.2 (V6b)", () => {
  it("122 rincian R.226–R.347 tanpa lubang; semua kolomnya ada di Metadata_KP", () => {
    expect(RINCIAN_IV2.map((r) => r.no)).toEqual(Array.from({ length: 122 }, (_, i) => 226 + i));
    const nama = new Set(METADATA_KP.map((f) => f[0]));
    for (const r of RINCIAN_IV2) for (const k of Object.keys(r.kolom)) expect(nama.has(`R${r.no}K${k}`), `R${r.no}K${k}`).toBe(true);
  });
  it("anak judul sama persis dengan aturan jumlah PANTAU (jumlah anak dan contoh)", () => {
    expect(anakJudul(226, 5)).toHaveLength(19);
    expect(anakJudul(226, 5)).toEqual([228, 229, 230, 231, 234, 236, 239, 244, 246, 248, 253, 255, 257, 259, 260, 261, 263, 264, 266]);
    expect(anakJudul(226, 6)).toEqual([232, 241, 242, 250, 251, 262, 265, 267]);
    expect(anakJudul(268, 5)).toEqual([269, 271, 272, 273, 274, 275, 304]);
    expect(anakJudul(268, 6)).toHaveLength(31);
    expect(anakJudul(307, 6)).toEqual([308, 309, 310, 311, 312, 313, 314, 315]);
    expect(anakJudul(316, 6)).toHaveLength(17);
    expect(anakJudul(334, 6)).toEqual([335, 336, 337, 338, 339, 340]);
    expect(anakJudul(341, 6)).toEqual([342, 343, 344, 345, 346, 347]);
    expect(Object.keys(JUDUL_IV2)).toHaveLength(6);
  });
  it("jumlah judul dari anak; isian judul yang diketik diabaikan; ringkasan mengisi rekap IV.3.3", () => {
    const e = [
      { r: 228, k5: 200000 }, { r: 234, k5: 50000 }, { r: 233, k7: 82.6 }, { r: 232, k6: 15000 },
      { r: 269, k5: 30000 }, { r: 270, k6: 250000 }, { r: 226, k5: 1 },
      { r: 309, k6: 200000, k7: 2 }, { r: 310, k6: 10000, k7: 2 },
    ];
    const h = hitungIv2(e);
    expect(h.R226K5).toBe(250000);
    expect(h.R226K6).toBe(15000);
    expect(h.R268K5).toBe(30000);
    expect(h.R268K6).toBe(250000);
    expect(h.R307K6).toBe(210000);
    const r = ringkasIv2(e);
    expect(r).toMatchObject({ r226k5: 250000, r226k6: 15000, r268k5: 30000, r268k6: 250000, r307k6: 210000, r316k6: 0 });
    const k = rekapIv33(r, 1000000);
    expect(k.r7a).toBe(280000);
    expect(k.r7b).toBe(15000 + 250000 + 210000);
    expect(k.r8).toBe(280000 + Math.round((475000) / 12));
    expect(k.r9).toBe(1000000 + k.r8);
  });
  it("pemeriksaan: kolom tidak tersedia, rentang, nilai kecil (peringatan), listrik, sumber perolehan, status → sewa", () => {
    const t = periksaIv2([
      { r: 228, k6: 5000 },                    // R228 hanya punya K5
      { r: 229, k5: 300 },                     // < 500 peringatan
      { r: 233, k7: 82.6 },                    // listrik: kWh terisi, nilai (R234) tidak ada
      { r: 309, k6: 200000 },                  // sumber (K7) kosong
      { r: 310, k7: 1 },                       // sumber ada, nilai kosong
      { r: 279, k6: 100000, k10: 500 },        // OOP < 1000 peringatan
      { r: 400 },                              // tidak dikenal
    ]);
    const p = t.map((x) => x.pesan);
    expect(p).toContain("Isian R228K6 tidak tersedia pada rincian ini");
    expect(p).toContain("R229K5 terisi tetapi terisinya kurang dari 500");
    expect(p).toContain("Isian R233K7 ada isian tetapi isian R234K5 tidak terisi");
    expect(p).toContain("Isian R309K7 tidak ada isian tetapi isian R309K6 ada isiannya");
    expect(p).toContain("Isian R310K7 berkode 0 sampai 3 tetapi R310K6 tidak ada isian");
    expect(p).toContain("R279K10 terisi tetapi terisinya kurang dari 1000");
    expect(p).toContain("Rincian R400 tidak dikenal pada Blok IV.2");
    expect(t.find((x) => x.pesan.includes("kurang dari 500"))?.fatal).toBe(false);
    expect(t.find((x) => x.pesan.includes("tidak tersedia"))?.fatal).toBe(true);
    // status kontrak (2) tanpa nilai kontrak
    expect(periksaIv2([{ r: 227, k7: 2 }, { r: 228, k5: 100000 }]).map((x) => x.pesan)).toContain("Rincian R227K7 terisi 2 tetapi isian R229K5 tidak ada isian");
    expect(periksaIv2([{ r: 227, k7: 1 }, { r: 228, k5: 100000 }])).toEqual([]);
    // rentang
    expect(periksaIv2([{ r: 228, k5: 999999999 }]).map((x) => x.pesan)).toContain("Isian R228K5 berada di luar rentang 0–99999999");
  });
});
