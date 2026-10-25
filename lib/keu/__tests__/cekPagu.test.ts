import { describe, it, expect } from "vitest";
import {
  bandingPaguAkun, barisBermasalah, jumlahkanPaguAkun, paguDariGlp, paguDariKertasKerja, paguDariPdf, paguDariPok, ringkasCek, tautanKertasKerja,
} from "../cekPagu";

const P = (ro: string, akun: string, jumlah: number) => ({ ro, akun, jumlah });

describe("jumlahkanPaguAkun", () => {
  it("menjumlahkan per RO+akun, melewati kosong, mengurutkan", () => {
    const h = jumlahkanPaguAkun(
      [{ r: "B.2", a: "521211", j: 100 }, { r: "A.1", a: "521211", j: "50" }, { r: "A.1", a: "521211", j: 25.4 }, { r: "", a: "1", j: 9 }, { r: "A.1", a: "", j: 9 }, { r: "A.1", a: "522151", j: "x" }],
      (b) => ({ ro: b.r, akun: b.a, jumlah: b.j }),
    );
    expect(h).toEqual([P("A.1", "521211", 75), P("A.1", "522151", 0), P("B.2", "521211", 100)]);
  });
  it("pembungkus tiap sumber", () => {
    expect(paguDariGlp([{ ro_kode: "2906.BMA.005", akun_kode: "521211", pagu: 10 }, { ro_kode: "2906.BMA.005", akun_kode: "521211", pagu: "5" }])).toEqual([P("2906.BMA.005", "521211", 15)]);
    expect(paguDariPok([{ ro_kode: "R", akun_kode: "A", jumlah: "7" }])).toEqual([P("R", "A", 7)]);
    expect(paguDariKertasKerja([{ ro_kode: "R", akun_menjadi: "A", jumlah_menjadi: null }, { ro_kode: "R", akun_menjadi: "A", jumlah_menjadi: 4 }])).toEqual([P("R", "A", 4)]);
    expect(paguDariPdf([{ keg_kode: "2906", kro_kode: "BMA", ro_sub: "005", akun_kode: "521211", jumlah: 3 }])).toEqual([P("2906.BMA.005", "521211", 3)]);
  });
});

describe("bandingPaguAkun", () => {
  const resmi = [P("R1", "521211", 1000), P("R1", "522151", 500), P("R2", "521211", 200)];
  it("sama bila semua akun sama", () => {
    const h = bandingPaguAkun(resmi, [...resmi].reverse());
    expect(h.sama).toBe(true);
    expect(h.nSama).toBe(3);
    expect(h.roBermasalah).toEqual([]);
    expect(h.selisihTotal).toBe(0);
  });
  it("beda jumlah, hanya di resmi, hanya di sistem", () => {
    const sistem = [P("R1", "521211", 900), P("R1", "524111", 40), P("R2", "521211", 200)];
    const h = bandingPaguAkun(resmi, sistem);
    expect(h.sama).toBe(false);
    expect(h.baris.find((b) => b.akun === "521211" && b.ro === "R1")).toMatchObject({ status: "beda", selisih: 100 });
    expect(h.baris.find((b) => b.akun === "522151")).toMatchObject({ status: "hanya_resmi", sistem: 0, selisih: 500 });
    expect(h.baris.find((b) => b.akun === "524111")).toMatchObject({ status: "hanya_sistem", resmi: 0, selisih: -40 });
    expect([h.nSama, h.nBeda, h.nHanyaResmi, h.nHanyaSistem]).toEqual([1, 1, 1, 1]);
    expect(h.roBermasalah).toEqual(["R1"]);
    expect(h.totalResmi).toBe(1700);
    expect(h.totalSistem).toBe(1140);
    expect(h.selisihTotal).toBe(560);
    expect(barisBermasalah(h, "R1").map((b) => b.akun)).toEqual(["521211", "522151", "524111"]);
    expect(barisBermasalah(h, "R2")).toEqual([]);
  });
  it("lingkup ro_resmi mengabaikan RO sistem yang tidak ada pada berkas", () => {
    const sistem = [...resmi, P("R9", "521211", 777)];
    const h = bandingPaguAkun(resmi, sistem);
    expect(h.sama).toBe(true);
    expect(h.roTakDibandingkan).toEqual(["R9"]);
    const semua = bandingPaguAkun(resmi, sistem, { lingkup: "semua" });
    expect(semua.sama).toBe(false);
    expect(semua.roBermasalah).toEqual(["R9"]);
    expect(semua.roTakDibandingkan).toEqual([]);
  });
  it("lingkup irisan hanya membandingkan RO yang ada di kedua sisi", () => {
    const sis = [P("R1", "521211", 1000), P("R1", "522151", 400), P("R7", "521211", 5)];
    const h = bandingPaguAkun(resmi, sis, { lingkup: "irisan" });
    expect(h.baris.map((b) => b.ro)).toEqual(["R1", "R1"]);
    expect(h.roTakDibandingkan).toEqual(["R2", "R7"]);
    expect(h.nSama).toBe(1);
    expect(h.nBeda).toBe(1);
    expect(h.roBermasalah).toEqual(["R1"]);
  });
  it("toleransi dan akun bernilai 0 di kedua sisi", () => {
    const h = bandingPaguAkun([P("R", "A", 1000), P("R", "B", 0)], [P("R", "A", 1001), P("R", "B", 0)], { toleransi: 1 });
    expect(h.sama).toBe(true);
    expect(h.baris).toHaveLength(1);
    expect(bandingPaguAkun([P("R", "A", 1000)], [P("R", "A", 1001)]).sama).toBe(false);
  });
  it("kosong", () => {
    const h = bandingPaguAkun([], []);
    expect(h.baris).toEqual([]);
    expect(h.sama).toBe(true);
    expect(ringkasCek(h, "laporan", "POK")).toMatch(/Tidak ada akun/);
  });
  it("ringkasan kalimat", () => {
    expect(ringkasCek(bandingPaguAkun(resmi, resmi), "laporan realisasi", "POK berlaku")).toBe("Pagu 3 akun sama antara laporan realisasi dan POK berlaku.");
    expect(ringkasCek(bandingPaguAkun(resmi, [P("R1", "521211", 1)]), "laporan", "POK")).toBe("3 dari 3 akun berbeda antara laporan dan POK (2 RO).");
  });
});

describe("tautanKertasKerja", () => {
  it("memuat ro dan jadwal bila ada", () => {
    expect(tautanKertasKerja("2906.BMA.005")).toBe("/sigap/revisi/kertas?ro=2906.BMA.005");
    expect(tautanKertasKerja("2906.BMA.005", 7)).toBe("/sigap/revisi/kertas?jadwal=7&ro=2906.BMA.005");
  });
});
