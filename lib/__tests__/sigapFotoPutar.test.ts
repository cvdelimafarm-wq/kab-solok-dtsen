import { describe, it, expect } from "vitest";
import {
  AMBANG_KOREKSI, BELAJAR_AWAL, arahDariGravitasi, bacaBelajarPeta, catatKoreksi, kuartalAkhir, kuartalDariArah, kunciKondisi, matriksKuartal, matriksPutarBingkai, perbaruiBelajar, petakTitik,
} from "../sigapFotoPutar";

// Bingkai tegak 90 x 160 (lebar x tinggi). Kanvas hasil untuk putar samping: 160 x 90.
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

  it("HP terbalik (2): sisi BAWAH bingkai menjadi ATAS foto, ukuran kanvas tetap 90 x 160", () => {
    const m = matriksPutarBingkai(2, VW, VH);
    const bawah = petakTitik(m, VW / 2, VH);
    expect(bawah.y).toBe(0);
    const atas = petakTitik(m, VW / 2, 0);
    expect(atas.y).toBe(VH);
    const kiriAtas = petakTitik(m, 0, 0);
    expect(kiriAtas).toEqual({ x: VW, y: VH });
  });

  it("semua sudut bingkai jatuh di dalam kanvas hasil (tidak ada yang terpotong)", () => {
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
    const m2 = matriksPutarBingkai(2, VW, VH);
    for (const [x, y] of [[0, 0], [VW, 0], [0, VH], [VW, VH]]) {
      const t = petakTitik(m2, x, y);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(VW);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(VH);
    }
  });
});

describe("matriksKuartal (putar manual pada pratinjau)", () => {
  it("1 = searah jarum jam: sisi kiri menjadi atas; ukuran kanvas bertukar", () => {
    const r = matriksKuartal(1, VW, VH);
    expect([r.lebar, r.tinggi]).toEqual([VH, VW]);
    expect(petakTitik(r.m, 0, VH / 2).y).toBe(0);
  });
  it("3 = berlawanan arah jarum jam: sisi kanan menjadi atas", () => {
    const r = matriksKuartal(3, VW, VH);
    expect([r.lebar, r.tinggi]).toEqual([VH, VW]);
    expect(petakTitik(r.m, VW, VH / 2).y).toBe(0);
  });
  it("2 = 180 derajat; ukuran sama", () => {
    const r = matriksKuartal(2, VW, VH);
    expect([r.lebar, r.tinggi]).toEqual([VW, VH]);
    expect(petakTitik(r.m, VW / 2, VH).y).toBe(0);
  });
  it("kuartalDariArah sesuai matriks arah", () => {
    expect(kuartalDariArah(0)).toBe(0);
    expect(kuartalDariArah(1)).toBe(3);
    expect(kuartalDariArah(-1)).toBe(1);
    expect(kuartalDariArah(2)).toBe(2);
  });
});

describe("arahDariGravitasi", () => {
  it("empat arah dasar (Android)", () => {
    expect(arahDariGravitasi(0, 9.8, 1)).toBe(0); // tegak
    expect(arahDariGravitasi(9.8, 0, 0)).toBe(1); // ke kiri
    expect(arahDariGravitasi(-9.8, 0, 0)).toBe(-1); // ke kanan
    expect(arahDariGravitasi(0, -9.8, 0)).toBe(2); // terbalik
  });
  it("HP rebah di meja atau menghadap ke atas/bawah mempertahankan arah lama", () => {
    expect(arahDariGravitasi(0.3, 0.4, 1)).toBe(1);
    expect(arahDariGravitasi(1, 2, 2)).toBe(2);
  });
  it("histeresis: arah lama bertahan sampai 40 derajat; arah baru baru dipilih dalam 25 derajat dari pusatnya", () => {
    const g = (sudutDeg: number) => [9.8 * Math.sin((sudutDeg * Math.PI) / 180), 9.8 * Math.cos((sudutDeg * Math.PI) / 180)] as const;
    const [x35, y35] = g(35);
    expect(arahDariGravitasi(x35, y35, 0)).toBe(0); // masih tegak
    expect(arahDariGravitasi(x35, y35, 1)).toBe(1); // arah lama kiri (90) berjarak 55 -> di luar 40 -> cek arah baru: 35 dari 0 > 25 -> tetap lama
    const [x20, y20] = g(20);
    expect(arahDariGravitasi(x20, y20, 1)).toBe(0); // 20 derajat dari tegak -> pindah ke tegak
    const [x70, y70] = g(70);
    expect(arahDariGravitasi(x70, y70, 0)).toBe(1); // 20 derajat dari 90 -> kiri
    const [xm100, ym100] = g(-100);
    expect(arahDariGravitasi(xm100, ym100, 0)).toBe(-1);
    const [x170, y170] = g(170);
    expect(arahDariGravitasi(x170, y170, 0)).toBe(2);
    const [xm170, ym170] = g(-170);
    expect(arahDariGravitasi(xm170, ym170, 0)).toBe(2); // sekitar -180 juga terbalik
  });
});

describe("belajar dari koreksi petugas (per kondisi)", () => {
  it("kunci kondisi: sensor atau layar landscape", () => {
    expect(kunciKondisi(false, 0, 1)).toBe("s1");
    expect(kunciKondisi(false, 0, -1)).toBe("s-1");
    expect(kunciKondisi(false, 90, 0)).toBe("s0");
    expect(kunciKondisi(true, 270, 0)).toBe("l270");
    expect(kunciKondisi(true, -90, 0)).toBe("l270");
  });
  it("kuartalAkhir menambah 180 derajat hanya pada kondisi yang sudah dipelajari terbalik", () => {
    const peta = { s1: { balik: true, koreksi: 0, benar: 0 }, l90: { balik: false, koreksi: 1, benar: 0 } };
    expect(kuartalAkhir(3, peta, "s1")).toBe(1); // 3 + 2 = 5 -> 1
    expect(kuartalAkhir(0, peta, "s1")).toBe(2);
    expect(kuartalAkhir(3, peta, "s-1")).toBe(3);
    expect(kuartalAkhir(0, peta, "l90")).toBe(0);
    expect(kuartalAkhir(0, {}, "l270")).toBe(0);
  });
  it("dua koreksi 180 derajat membalik satu kondisi saja; penghitung diulang dari nol", () => {
    let p = catatKoreksi({}, "s1", 2);
    expect(p).toEqual({ s1: { balik: false, koreksi: 1, benar: 0 } });
    p = catatKoreksi(p, "s1", 2);
    expect(AMBANG_KOREKSI).toBe(2);
    expect(p).toEqual({ s1: { balik: true, koreksi: 0, benar: 0 } });
    expect(p["s-1"]).toBeUndefined();
  });
  it("foto yang tidak dikoreksi menambah 'benar' dan menahan pembalikan", () => {
    let b = perbaruiBelajar(BELAJAR_AWAL, 0);
    b = perbaruiBelajar(b, 0);
    b = perbaruiBelajar(b, 2);
    b = perbaruiBelajar(b, 2);
    expect(b).toEqual({ balik: false, koreksi: 2, benar: 2 });
    b = perbaruiBelajar(b, 2);
    b = perbaruiBelajar(b, 2);
    expect(b.balik).toBe(true);
  });
  it("koreksi 90 derajat tidak dihitung; 4 x 90 = tidak dikoreksi; 6 x 90 = 180", () => {
    expect(perbaruiBelajar(BELAJAR_AWAL, 1)).toBe(BELAJAR_AWAL);
    expect(perbaruiBelajar(BELAJAR_AWAL, 3)).toBe(BELAJAR_AWAL);
    expect(perbaruiBelajar(BELAJAR_AWAL, 4)).toEqual({ balik: false, koreksi: 0, benar: 1 });
    expect(perbaruiBelajar(BELAJAR_AWAL, 6)).toEqual({ balik: false, koreksi: 1, benar: 0 });
  });
  it("bacaBelajarPeta menolak bentuk tidak sah", () => {
    expect(bacaBelajarPeta(null)).toEqual({});
    expect(bacaBelajarPeta("{rusak")).toEqual({});
    expect(bacaBelajarPeta(JSON.stringify({ s1: { balik: true, koreksi: 1, benar: 0 }, x: { balik: "ya" }, y: 5 }))).toEqual({ s1: { balik: true, koreksi: 1, benar: 0 } });
  });
});
