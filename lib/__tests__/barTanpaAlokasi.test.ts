// lib/__tests__/barTanpaAlokasi.test.ts
//
// (7 Nov 2026) Bar kegiatan: Kamera dan Translok tetap tampil bila akun belum punya alokasi Transport Lokal, tetapi redup dan memberi alasan saat diketuk.
// Komponen React tidak bisa dirender di lingkungan node, jadi bagian tampilan dijaga lewat pemindaian sumber.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const baca = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");

describe("BarKegiatan: item nonaktif", () => {
  const src = baca("app/sigap/BarKegiatan.tsx");
  it("ketukan pada item nonaktif menampilkan alasan dan tidak berpindah halaman", () => {
    const ketuk = src.slice(src.indexOf("function ketuk("), src.indexOf("return (", src.indexOf("function ketuk(")));
    expect(ketuk.indexOf("it.nonaktif")).toBeGreaterThan(-1);
    expect(ketuk.indexOf("it.nonaktif")).toBeLessThan(ketuk.indexOf("router.push"));
    expect(ketuk.indexOf("it.nonaktif")).toBeLessThan(ketuk.indexOf('it.kunci === "kamera"'));
    expect(src).toMatch(/setPesanBar\(it\.nonaktif\)/);
  });
  it("item nonaktif tampil redup dan ditandai aria-disabled", () => {
    expect(src.match(/aria-disabled=\{it\.nonaktif/g)?.length).toBe(2);
    expect(src.match(/it\.nonaktif \? "opacity-45"/g)?.length).toBe(2);
  });
});

describe("Hari Ini sederhana: pintasan nonaktif", () => {
  const src = baca("app/sigap/kegiatan/[id]/Induk.tsx");
  it("pintasan nonaktif bukan tautan dan menampilkan alasannya; tombol Kamera nonaktif tidak ditampilkan sebagai tautan", () => {
    expect(src).toMatch(/i\.nonaktif \? \(/);
    expect(src).toMatch(/\{i\.nonaktif\}/);
    expect(src).toMatch(/kamera && !kamera\.nonaktif/);
  });
});
