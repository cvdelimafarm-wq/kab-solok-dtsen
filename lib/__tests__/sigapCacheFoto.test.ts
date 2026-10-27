import { describe, expect, it } from "vitest";
import { SimpananBerat, jalurBerkasFoto, kunciFoto, pilihPrefetch, tetanggaFoto, ukuranBerkasDariParam } from "../sigapCacheFoto";

describe("ukuranBerkasDariParam dan jalur", () => {
  it("mini/kecil dikenali; selain itu penuh (aman untuk klien lama)", () => {
    expect(ukuranBerkasDariParam("mini")).toBe("mini");
    expect(ukuranBerkasDariParam("kecil")).toBe("kecil");
    expect(ukuranBerkasDariParam("penuh")).toBe("penuh");
    expect(ukuranBerkasDariParam(null)).toBe("penuh");
    expect(ukuranBerkasDariParam("../x")).toBe("penuh");
  });
  it("jalur: penuh tanpa ?u agar sama dengan alamat lama", () => {
    expect(jalurBerkasFoto(7, "penuh")).toBe("/api/sigap/foto/berkas?id=7");
    expect(jalurBerkasFoto(7, "mini")).toBe("/api/sigap/foto/berkas?id=7&u=mini");
    expect(kunciFoto(7, "kecil")).toBe("7|kecil");
  });
});

describe("SimpananBerat", () => {
  it("melepas yang paling lama tidak dipakai saat melebihi batas berat", () => {
    const s = new SimpananBerat<string>(100);
    s.simpan("a", "A", 40);
    s.simpan("b", "B", 40);
    s.ambil("a"); // a dipakai lagi -> b menjadi yang paling lama
    s.simpan("c", "C", 40);
    expect(s.ada("b")).toBe(false);
    expect(s.ada("a")).toBe(true);
    expect(s.ada("c")).toBe(true);
    expect(s.berat).toBe(80);
  });
  it("entri lebih besar dari batas ditolak tanpa mengusir yang lain", () => {
    const s = new SimpananBerat<string>(50);
    s.simpan("a", "A", 30);
    expect(s.simpan("besar", "X", 51)).toBe(false);
    expect(s.ada("a")).toBe(true);
    expect(s.berat).toBe(30);
  });
  it("menimpa kunci sama tidak menggandakan berat; buang mengurangi berat", () => {
    const s = new SimpananBerat<string>(100);
    s.simpan("a", "A", 30);
    s.simpan("a", "A2", 50);
    expect(s.berat).toBe(50);
    expect(s.ambil("a")).toBe("A2");
    s.buang("a");
    expect(s.berat).toBe(0);
    expect(s.jumlah).toBe(0);
  });
});

describe("SimpananBerat.kosongkan", () => {
  it("mengosongkan semua entri dan berat", () => {
    const s = new SimpananBerat<string>(100);
    s.simpan("a", "A", 30);
    s.simpan("b", "B", 30);
    s.kosongkan();
    expect(s.jumlah).toBe(0);
    expect(s.berat).toBe(0);
    expect(s.ada("a")).toBe(false);
  });
});

describe("pilihPrefetch", () => {
  it("lewati yang sudah ada, duplikat, dan id tidak sah; patuhi batas", () => {
    const ada = new Set([2]);
    expect(pilihPrefetch([1, 2, 3, 3, 0, -4, 1.5, 4, 5], (i) => ada.has(i), 3)).toEqual([1, 3, 4]);
    expect(pilihPrefetch([], () => false, 5)).toEqual([]);
  });
});

describe("tetanggaFoto", () => {
  it("sebelum dan sesudah; ujung tidak melewati batas", () => {
    expect(tetanggaFoto([1, 2, 3], 1)).toEqual([1, 3]);
    expect(tetanggaFoto([1, 2, 3], 0)).toEqual([2]);
    expect(tetanggaFoto([1, 2, 3], 2)).toEqual([2]);
    expect(tetanggaFoto([1], 0)).toEqual([]);
    expect(tetanggaFoto([], 0)).toEqual([]);
  });
});
