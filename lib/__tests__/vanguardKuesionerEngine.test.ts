import { describe, expect, it } from "vitest";
import { bulatkan, hitungBaris, hitungIv1, konsumsiSetahun, periksaIv1, rekapIv31, rekapIv32, rekapIv33, type EntriIv1 } from "../vanguard/kuesioner/engine";

describe("engine Blok IV.1 dan rekap IV.3 (V6a)", () => {
  it("K5 = K1 + K3 dan K6 = K2 + K4", () => {
    expect(hitungBaris({ r: 96, k3: 0.2, k4: 3000 })).toMatchObject({ k1: 0, k2: 0, k3: 0.2, k4: 3000, k5: 0.2, k6: 3000 });
    expect(hitungBaris({ r: 2, k1: 5.6, k2: 140000, k3: 1.15, k4: 1000 })).toMatchObject({ k5: 6.75, k6: 141000 });
  });
  it("judul kelompok = jumlah anak (K2, K4, K6): contoh sayur dengan sebagian dari produksi sendiri", () => {
    const h = hitungIv1([{ r: 93, k1: 0.25, k2: 3000 }, { r: 96, k3: 0.2, k4: 3000 }, { r: 98, k1: 0.2, k2: 5000 }, { r: 105, k3: 0.2, k4: 5000 }, { r: 108, k1: 0.5, k2: 20000 }]);
    expect(h.subtotal.find((s) => s.kel === "F")).toMatchObject({ r: 85, k2: 28000, k4: 8000, k6: 36000 });
    expect(h.komoditasRt).toBe(5);
  });
  it("rincian tak dikenal (judul kelompok, R.1, R.8) diabaikan", () => {
    expect(hitungIv1([{ r: 1, k1: 1, k2: 100 }, { r: 8, k1: 1, k2: 100 }, { r: 400, k1: 1, k2: 5 }]).baris).toHaveLength(0);
  });
  it("IV.3.1 per ART dari R187 dan R220 (judul per ART), dan jumlah JK3..JK6", () => {
    const e: EntriIv1[] = [
      { r: 191, art: 1, k1: 5, k2: 5000, sumber: 2 }, { r: 192, art: 1, k1: 5, k2: 5000, sumber: 2 },
      { r: 191, art: 2, k1: 2, k2: 2000, sumber: 2 }, { r: 199, art: 2, k3: 1, k4: 5000, sumber: 0 },
      { r: 221, art: 1, k1: 12, k2: 30000, sumber: 1 }, { r: 222, art: 2, k3: 3, k4: 9000, sumber: 0 },
    ];
    const h = hitungIv1(e);
    const r = rekapIv31(h);
    expect(r.baris).toEqual([{ art: 1, k3: 10000, k4: 0, k5: 30000, k6: 0 }, { art: 2, k3: 2000, k4: 5000, k5: 0, k6: 9000 }]);
    expect(r.jumlah).toEqual({ k3: 12000, k4: 5000, k5: 30000, k6: 9000 });
    expect(h.komoditasPerArt).toEqual({ 1: 3, 2: 3 });
  });
  it("IV.3.2: R1–R12 dari judul kelompok, R13/R14 dari IV.3.1, R15 jumlah, R16 = ROUNDINT(R15 × 30/7)", () => {
    const e: EntriIv1[] = [
      { r: 2, k1: 5.6, k2: 140000 }, { r: 9, k1: 1, k2: 12000 }, { r: 75, k1: 10, k2: 18000 },
      { r: 93, k1: 0.25, k2: 3000 }, { r: 96, k3: 0.2, k4: 3000 }, { r: 198, art: 1, k1: 1, k2: 5000, sumber: 2 },
    ];
    const rows = rekapIv32(hitungIv1(e));
    expect(rows).toHaveLength(16);
    expect(rows[0]).toMatchObject({ r: 1, k3: 140000, k4: 0, k5: 140000 });
    expect(rows[1]).toMatchObject({ r: 2, k3: 12000, k5: 12000 });
    expect(rows[4]).toMatchObject({ r: 5, k3: 18000, k5: 18000 });
    expect(rows[5]).toMatchObject({ r: 6, k3: 3000, k4: 3000, k5: 6000 });
    expect(rows[12]).toMatchObject({ r: 13, k3: 5000, k4: 0, k5: 5000 });
    expect(rows[14]).toMatchObject({ r: 15, k3: 178000, k4: 3000, k5: 181000 });
    expect(rows[15].k5).toBe(bulatkan((181000 * 30) / 7)); // 775.714,29 → 775.714
    expect(rows[15].k5).toBe(775714);
  });
  it("angka acuan agregat: R15K5 = 357.000 → R16K5 = 1.530.000", () => {
    expect(bulatkan((357000 * 30) / 7)).toBe(1530000);
  });
  it("IV.3.3: R7A = R1A + R2A; R7B = jumlah R1B..R6; R8 = R7A + ROUNDINT(R7B/12); R9 = R16K5 + R8; Blok VI R1 K4 = R9 × 12", () => {
    const r = rekapIv33({ r226k5: 316000, r226k6: 50000, r268k5: 75000, r268k6: 63000, r307k6: 350000, r316k6: 90000, r334k6: 10000, r341k6: 567000 }, 1530000);
    expect(r).toMatchObject({ r7a: 391000, r7b: 1130000, r8: 485167, r9: 2015167 });
    expect(konsumsiSetahun(r.r9)).toBe(24182004);
  });
  it("pemeriksaan: kolom bergantung dan kode sumber (nama variabel R{no}K{n})", () => {
    const t = periksaIv1([
      { r: 17, k1: 0, k2: 5000 },                 // K1 = 0 tetapi K2 terisi
      { r: 18, k1: 1 },                           // K1 > 0 tetapi K2 kosong
      { r: 19, k3: 2 },                           // K3 > 0 tetapi K4 kosong
      { r: 20, k2: 3000 },                        // K1 kosong tetapi K2 terisi
      { r: 199, art: 2, k1: 1, k2: 5000, sumber: 0 }, // K7 = 0 tetapi pembelian terisi
      { r: 200, art: 1, k1: 1, k2: 7000 },        // K7 kosong tetapi pembelian terisi
      { r: 201, art: 1, k1: 1, k2: 7000, sumber: 5 }, // kode sumber di luar 0–3
      { r: 2, k1: 5.6, k2: 140000 },              // benar
    ]);
    expect(t.map((x) => x.pesan)).toEqual([
      "Rincian R17K1 terisi 0 tetapi isian R17K2 ada isiannya",
      "Rincian R18K1 terisi lebih dari 0 tetapi isian R18K2 tidak ada isian",
      "Rincian R19K3 terisi lebih dari 0 tetapi isian R19K4 tidak ada isian",
      "Rincian R20K1 tidak ada isian tetapi isian R20K2 ada isiannya",
      "Isian R199K7 berkode 0 tetapi isian R199K2 ada isiannya",
      "Isian R200K7 tidak ada isian tetapi R200K2 ada isiannya",
      "Isian R201K7 harus 0, 1, 2, atau 3",
    ]);
    expect(t.every((x) => x.fatal)).toBe(true);
  });
});
