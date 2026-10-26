import { describe, expect, it } from "vitest";
import { gradienLegenda, kontras, warnaBeban } from "@/lib/delego/warna";

describe("warnaBeban", () => {
  it("null untuk tanpa beban atau angka tidak sah", () => {
    expect(warnaBeban(0)).toBeNull();
    expect(warnaBeban(-5)).toBeNull();
    expect(warnaBeban(NaN)).toBeNull();
  });
  it("tiga ruas berbeda warna di tiap batas sasaran", () => {
    const bawah = warnaBeban(79)!.latar;
    const awalSasaran = warnaBeban(80)!.latar;
    const akhirSasaran = warnaBeban(100)!.latar;
    const atas = warnaBeban(101)!.latar;
    expect(new Set([bawah, awalSasaran, akhirSasaran, atas]).size).toBe(4);
  });
  it("makin pekat bila makin jauh dari kosong: bawah sasaran makin biru, atas sasaran makin merah", () => {
    const l = (p: number) => warnaBeban(p)!.latar;
    expect(l(10)).not.toBe(l(70));
    expect(l(105)).not.toBe(l(150));
    // jenuh di puncak
    expect(l(150)).toBe(l(400));
  });
  it("71% (kasus layar uji) berwarna biru, bukan hijau atau merah", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(warnaBeban(71)!.latar.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThanOrEqual(g);
  });
  it("teks terbaca (kontras minimal 4.5) di seluruh rentang 1..300%", () => {
    for (let p = 1; p <= 300; p++) {
      const w = warnaBeban(p)!;
      expect(kontras(w.latar, w.teks), `p=${p} ${w.latar}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("mengikuti batas sasaran yang diberikan", () => {
    expect(warnaBeban(85, 90, 110)!.latar).not.toBe(warnaBeban(95, 90, 110)!.latar);
    expect(warnaBeban(105, 90, 110)!.latar).toBe(warnaBeban(105, 90, 110)!.latar);
  });
});

describe("gradienLegenda", () => {
  it("berisi gradien dengan batas keras di 80/150 dan 100/150", () => {
    const g = gradienLegenda();
    expect(g.startsWith("linear-gradient(to right, ")).toBe(true);
    expect(g).toContain("53.33%");
    expect(g).toContain("66.67%");
    expect(g.trim().endsWith("100%)")).toBe(true);
  });
});
