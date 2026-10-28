import { describe, expect, it } from "vitest";
import { buatCacheTtl } from "../cacheTtl";

function jam(mulai = 1000) {
  let t = mulai;
  return { sekarang: () => t, maju: (ms: number) => { t += ms; } };
}

describe("buatCacheTtl", () => {
  it("memakai simpanan selama masih segar, memuat ulang setelah kedaluwarsa", async () => {
    const j = jam();
    const c = buatCacheTtl<number, string>({ ttlMs: 30_000, sekarang: j.sekarang });
    let n = 0;
    const muat = async () => `v${++n}`;
    expect(await c.ambil(1, muat)).toBe("v1");
    j.maju(29_999);
    expect(await c.ambil(1, muat)).toBe("v1");
    expect(n).toBe(1);
    j.maju(2);
    expect(await c.ambil(1, muat)).toBe("v2");
    expect(n).toBe(2);
  });

  it("tidak menyimpan null (akun nonaktif/tidak ada selalu dicek ulang)", async () => {
    const c = buatCacheTtl<number, string>({ ttlMs: 30_000 });
    let n = 0;
    expect(await c.ambil(1, async () => { n++; return null; })).toBeNull();
    expect(await c.ambil(1, async () => { n++; return "aktif"; })).toBe("aktif");
    expect(n).toBe(2);
    expect(await c.ambil(1, async () => { n++; return "tak dipanggil"; })).toBe("aktif");
    expect(n).toBe(2);
  });

  it("galat tidak disimpan dan dilempar; percobaan berikutnya memuat lagi", async () => {
    const c = buatCacheTtl<number, string>({ ttlMs: 30_000 });
    await expect(c.ambil(1, async () => { throw new Error("db habis waktu"); })).rejects.toThrow("db habis waktu");
    expect(await c.ambil(1, async () => "pulih")).toBe("pulih");
  });

  it("menggabungkan permintaan bersamaan untuk kunci yang sama menjadi satu pembacaan", async () => {
    const c = buatCacheTtl<number, string>({ ttlMs: 30_000 });
    let n = 0;
    let lepas!: (v: string) => void;
    const tahan = () => new Promise<string>((r) => { n++; lepas = r; });
    const a = c.ambil(7, tahan);
    const b = c.ambil(7, tahan);
    const d = c.ambil(7, tahan);
    lepas("x");
    expect(await Promise.all([a, b, d])).toEqual(["x", "x", "x"]);
    expect(n).toBe(1);
  });

  it("kunci berbeda tidak saling menggabung", async () => {
    const c = buatCacheTtl<number, number>({ ttlMs: 30_000 });
    const hasil = await Promise.all([1, 2, 3].map((k) => c.ambil(k, async () => k * 10)));
    expect(hasil).toEqual([10, 20, 30]);
    expect(c.ukuran()).toBe(3);
  });

  it("lupakan dan bersihkan memaksa pembacaan ulang", async () => {
    const c = buatCacheTtl<number, string>({ ttlMs: 30_000 });
    let n = 0;
    const muat = async () => `v${++n}`;
    await c.ambil(1, muat);
    await c.ambil(2, muat);
    c.lupakan(1);
    expect(await c.ambil(1, muat)).toBe("v3");
    expect(await c.ambil(2, muat)).toBe("v2");
    c.bersihkan();
    expect(c.ukuran()).toBe(0);
    expect(await c.ambil(2, muat)).toBe("v4");
  });

  it("membatasi jumlah entri: yang paling lama disingkirkan", async () => {
    const c = buatCacheTtl<number, number>({ ttlMs: 30_000, maks: 3 });
    for (const k of [1, 2, 3, 4, 5]) await c.ambil(k, async () => k);
    expect(c.ukuran()).toBe(3);
    let n = 0;
    expect(await c.ambil(5, async () => { n++; return 99; })).toBe(5); // masih tersimpan
    expect(await c.ambil(1, async () => { n++; return 11; })).toBe(11); // sudah tersingkir
    expect(n).toBe(1);
  });

  it("ttl 0 = tanpa simpanan (setiap kali memuat)", async () => {
    const c = buatCacheTtl<number, string>({ ttlMs: 0 });
    let n = 0;
    await c.ambil(1, async () => `v${++n}`);
    await c.ambil(1, async () => `v${++n}`);
    expect(n).toBe(2);
    expect(c.ukuran()).toBe(0);
  });
});
