import { describe, it, expect } from "vitest";
import { matriksPutarBingkai, petakTitik } from "../sigapFotoPutar";

// Bingkai tegak 90 x 160 (lebar x tinggi). Kanvas hasil: 160 x 90.
const VW = 90;
const VH = 160;

describe("matriksPutarBingkai", () => {
  it("HP ke kiri (1): sisi KANAN bingkai menjadi ATAS foto, sisi atas bingkai menjadi KIRI", () => {
    const m = matriksPutarBingkai(1, VW, VH);
    const kanan = petakTitik(m, VW, VH / 2);
    expect(kanan.y).toBe(0); // atas
    const atasBingkai = petakTitik(m, VW / 2, 0);
    expect(atasBingkai.x).toBe(0); // kiri
  });

  it("HP ke kanan (-1): sisi KIRI bingkai menjadi ATAS foto, sisi atas bingkai menjadi KANAN", () => {
    const m = matriksPutarBingkai(-1, VW, VH);
    const kiri = petakTitik(m, 0, VH / 2);
    expect(kiri.y).toBe(0); // atas
    const atasBingkai = petakTitik(m, VW / 2, 0);
    expect(atasBingkai.x).toBe(VH); // kanan
  });

  it("semua sudut bingkai jatuh di dalam kanvas 160 x 90 (tidak ada yang terpotong)", () => {
    for (const p of [1, -1] as const) {
      const m = matriksPutarBingkai(p, VW, VH);
      for (const [x, y] of [[0, 0], [VW, 0], [0, VH], [VW, VH]]) {
        const t = petakTitik(m, x, y);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(VH);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThanOrEqual(VW);
      }
    }
  });
});
