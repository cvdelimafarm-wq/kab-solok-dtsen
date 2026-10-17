import { describe, expect, it } from "vitest";
import { K_MAKS, jagaBatas, ketukDua, kodePeta, zoomDi } from "../petaTampil";

describe("kodePeta", () => {
  it("peta SLS memakai idsubsls utuh, peta WA memakai 10 digit pertama (kode nagari)", () => {
    expect(kodePeta("sls", "1303080001000501")).toBe("1303080001000501");
    expect(kodePeta("wa", "1303080001000501")).toBe("1303080001");
  });
});

describe("jagaBatas", () => {
  it("skala 1 tidak boleh bergeser", () => {
    expect(jagaBatas({ x: 40, y: -30, k: 1 }, 300, 400)).toEqual({ x: 0, y: 0, k: 1 });
  });
  it("skala dijepit 1..maks dan geseran tidak melewati tepi", () => {
    expect(jagaBatas({ x: 10, y: 10, k: 20 }, 300, 400)).toEqual({ k: K_MAKS, x: 0, y: 0 });
    expect(jagaBatas({ x: -9999, y: -9999, k: 2 }, 300, 400)).toEqual({ k: 2, x: -300, y: -400 });
  });
});

describe("zoomDi", () => {
  it("titik di bawah jari tetap di tempatnya", () => {
    const t = zoomDi({ x: 0, y: 0, k: 1 }, 2, 150, 200, 300, 400);
    // titik gambar yang tadinya di (150,200) kini masih di (150,200): x = 150 - 150*2 = -150 (masih dalam batas -300..0)
    expect(t).toEqual({ k: 2, x: -150, y: -200 });
  });
  it("zoom di pojok kiri-atas tidak menggeser gambar keluar batas", () => {
    expect(zoomDi({ x: 0, y: 0, k: 1 }, 3, 0, 0, 300, 400)).toEqual({ k: 3, x: 0, y: 0 });
  });
  it("tidak melewati skala maksimum", () => {
    expect(zoomDi({ x: 0, y: 0, k: 4 }, 100, 150, 200, 300, 400).k).toBe(K_MAKS);
  });
});

describe("ketukDua", () => {
  it("memperbesar 2,5x lalu kembali ke 1x", () => {
    const a = ketukDua({ x: 0, y: 0, k: 1 }, 150, 200, 300, 400);
    expect(a.k).toBe(2.5);
    expect(ketukDua(a, 150, 200, 300, 400)).toEqual({ x: 0, y: 0, k: 1 });
  });
});
