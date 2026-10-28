import { describe, it, expect } from "vitest";
import { pecahSelisih, gabungSelisih, kalimatSelisih, peringatanRentang } from "../relJadwal";

describe("pecahSelisih / gabungSelisih", () => {
  it("memecah angka bertanda", () => {
    expect(pecahSelisih(10)).toEqual({ n: 10, arah: "sesudah" });
    expect(pecahSelisih(-3)).toEqual({ n: 3, arah: "sebelum" });
    expect(pecahSelisih(0)).toEqual({ n: 0, arah: "sesudah" });
    expect(pecahSelisih(NaN)).toEqual({ n: 0, arah: "sesudah" });
  });
  it("menggabungkan kembali", () => {
    expect(gabungSelisih(10, "sesudah")).toBe(10);
    expect(gabungSelisih(3, "sebelum")).toBe(-3);
    expect(gabungSelisih(0, "sebelum")).toBe(0);
    expect(Object.is(gabungSelisih(0, "sebelum"), -0)).toBe(false);
    expect(gabungSelisih(-4, "sesudah")).toBe(4);
  });
  it("bolak-balik sama", () => {
    for (const d of [-60, -1, 0, 1, 14, 365]) { const p = pecahSelisih(d); expect(gabungSelisih(p.n, p.arah)).toBe(d); }
  });
});

describe("kalimatSelisih", () => {
  it("merangkai kalimat", () => {
    expect(kalimatSelisih(10, "selesai", "pendataan")).toBe("10 hari sesudah selesai pendataan");
    expect(kalimatSelisih(-1, "mulai", "pengolahan")).toBe("1 hari sebelum mulai pengolahan");
    expect(kalimatSelisih(0, "mulai", "pendataan")).toBe("tepat pada mulai pendataan");
  });
});

describe("peringatanRentang", () => {
  it("terbalik diperingatkan", () => {
    expect(peringatanRentang("2026-11-10", "2026-11-02")).toContain("lebih awal");
  });
  it("wajar atau kosong = null", () => {
    expect(peringatanRentang("2026-11-02", "2026-11-02")).toBeNull();
    expect(peringatanRentang("2026-11-02", "2026-12-05")).toBeNull();
    expect(peringatanRentang("", "2026-12-05")).toBeNull();
    expect(peringatanRentang(undefined, null)).toBeNull();
  });
});
