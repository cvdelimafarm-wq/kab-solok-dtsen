import { describe, expect, it } from "vitest";
import { normalisasiRadius, perluPerbarui } from "../radarKk";

describe("radarKk: aturan per kegiatan", () => {
  it("normalisasiRadius memakai batas yang diberikan", () => {
    expect(normalisasiRadius("1500", 100, 10, 2000)).toBe(1500);
    expect(normalisasiRadius("1500", 100)).toBe(1000);
    expect(normalisasiRadius(5, 100, 20, 300)).toBe(20);
    expect(normalisasiRadius("abc", 77, 20, 300)).toBe(77);
  });
  it("perluPerbarui memakai ambang gerak dan jeda kustom", () => {
    const a = { posisi: { lat: -0.8, lng: 100.6 }, waktu: 0 };
    const dekat = { posisi: { lat: -0.8 + 0.00004, lng: 100.6 }, waktu: 4000 }; // ~4,4 m, 4 dtk
    expect(perluPerbarui(a, dekat)).toBe(false);
    expect(perluPerbarui(a, dekat, { gerak_m: 3, jeda_detik: 60 })).toBe(true);
    expect(perluPerbarui(a, dekat, { gerak_m: 50, jeda_detik: 3 })).toBe(true);
    expect(perluPerbarui(null, dekat, { gerak_m: 50, jeda_detik: 60 })).toBe(true);
  });
});
