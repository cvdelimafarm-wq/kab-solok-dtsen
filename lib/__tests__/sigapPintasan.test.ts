import { describe, expect, it } from "vitest";
import { MAKS_PINTASAN, PINTASAN_BAWAAN, bacaPintasan, geserPintasan, kodeTampil, susunPintasan, ubahPintasan } from "../sigapPintasan";

const K = (n: number) => Array.from({ length: n }, (_, i) => ({ kode: `m${i + 1}` }));

describe("susunPintasan", () => {
  it("belum memilih: beberapa menu pertama", () => {
    expect(susunPintasan(K(12), null).map((x) => x.kode)).toEqual(K(PINTASAN_BAWAAN).map((x) => x.kode));
    expect(susunPintasan(K(3), null)).toHaveLength(3);
  });
  it("mengikuti urutan pilihan petugas; kode yang tak lagi boleh diakses dibuang", () => {
    expect(susunPintasan(K(5), ["m4", "x9", "m1"]).map((x) => x.kode)).toEqual(["m4", "m1"]);
  });
  it("pilihan kosong = petugas sengaja mengosongkan (tidak kembali ke bawaan)", () => {
    expect(susunPintasan(K(5), [])).toEqual([]);
    expect(kodeTampil(K(5), null)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  });
});

describe("bacaPintasan", () => {
  it("membaca daftar kode, membuang yang bukan teks dan ganda", () => {
    expect(bacaPintasan('["a","b","a",3,""]')).toEqual(["a", "b"]);
    expect(bacaPintasan("[]")).toEqual([]);
  });
  it("rusak / kosong / bukan daftar -> null", () => {
    expect(bacaPintasan(null)).toBeNull();
    expect(bacaPintasan("{")).toBeNull();
    expect(bacaPintasan('{"a":1}')).toBeNull();
  });
  it("dibatasi MAKS_PINTASAN", () => {
    expect(bacaPintasan(JSON.stringify(K(30).map((x) => x.kode)))).toHaveLength(MAKS_PINTASAN);
  });
});

describe("ubahPintasan & geserPintasan", () => {
  it("menambah di akhir, tidak ganda, menolak di atas batas, mematikan", () => {
    expect(ubahPintasan(["a"], "b", true)).toEqual(["a", "b"]);
    expect(ubahPintasan(["a"], "a", true)).toEqual(["a"]);
    expect(ubahPintasan(K(MAKS_PINTASAN).map((x) => x.kode), "baru", true)).toBeNull();
    expect(ubahPintasan(["a", "b"], "a", false)).toEqual(["b"]);
  });
  it("menggeser; di tepi tidak berubah", () => {
    expect(geserPintasan(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(geserPintasan(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(geserPintasan(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(geserPintasan(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});
