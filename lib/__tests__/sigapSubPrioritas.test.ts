// lib/__tests__/sigapSubPrioritas.test.ts
import { describe, expect, it } from "vitest";
import { alamatLembarUtama, pilihSubPrioritas } from "@/lib/sigapSubPrioritas";

const per = { a: { belum: 0, total: 10 }, b: { belum: 3, total: 10 }, c: { belum: 7, total: 9 }, d: { belum: 7, total: 20 } };

describe("pilihSubPrioritas", () => {
  it("memilih yang sisanya paling banyak; seri mengikuti urutan data", () => {
    expect(pilihSubPrioritas(["a", "b", "c", "d"], per, null)).toBe("c");
    expect(pilihSubPrioritas(["d", "c"], per, null)).toBe("d");
  });
  it("melanjutkan Sub SLS terakhir bila masih ada sisa; bila sudah selesai pindah ke prioritas", () => {
    expect(pilihSubPrioritas(["a", "b", "c"], per, "b")).toBe("b");
    expect(pilihSubPrioritas(["a", "b", "c"], per, "a")).toBe("c");
  });
  it("Sub SLS tanpa data/bukan milik tim diabaikan; tak ada sisa = null", () => {
    expect(pilihSubPrioritas(["x", "y"], per, "c")).toBeNull();
    expect(pilihSubPrioritas(["a"], per, null)).toBeNull();
    expect(pilihSubPrioritas([], per, null)).toBeNull();
  });
  it("alamat lembar", () => {
    expect(alamatLembarUtama("/sigap/pendataan")).toBe("/sigap/pendataan?utama=1");
  });
});
