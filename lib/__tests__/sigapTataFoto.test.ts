import { describe, it, expect } from "vitest";
import { tataFotoDokumentasi, barisUntuk, type Penempatan } from "../sigapTataFoto";

const L = 16 / 9, P = 9 / 16;
const OPSI = { lebar: 538.6, tinggi: 580, gap: 3, cap: 16 };
const foto = (a: number[]) => a.map((aspek, i) => ({ slot: i + 1, aspek }));
const ambil = (p: Penempatan[], s: number) => p.find((x) => x.slot === s)!;
const luas = (p: Penempatan) => Math.sqrt(p.w * p.h);

describe("barisUntuk", () => {
  it("2-1-2 untuk lima slot; baris kosong dibuang", () => {
    expect(barisUntuk([1, 2, 3, 4, 5])).toEqual([[1, 2], [3], [4, 5]]);
    expect(barisUntuk([3, 5])).toEqual([[3], [5]]);
    expect(barisUntuk([1, 2])).toEqual([[1, 2]]);
    expect(barisUntuk([9])).toEqual([]);
  });
});

describe("tataFotoDokumentasi", () => {
  it("26 Okt (foto 1 tegak): foto 3 terbesar, foto 2 dan 4 >= ambang", () => {
    const { penempatan: p, ambang } = tataFotoDokumentasi(foto([P, L, L, L, L]), OPSI);
    expect(ambang).toBe(140);
    expect(p).toHaveLength(5);
    const u3 = luas(ambil(p, 3));
    for (const s of [1, 2, 4, 5]) expect(u3).toBeGreaterThan(luas(ambil(p, s)));
    expect(luas(ambil(p, 2))).toBeGreaterThanOrEqual(139.9);
    expect(luas(ambil(p, 4))).toBeGreaterThanOrEqual(139.9);
    expect(ambil(p, 3).w).toBeGreaterThan(500);
  });
  it("27 Okt (foto 2 tegak): tegak tetap >= ambang, foto 3 tetap terbesar", () => {
    const { penempatan: p } = tataFotoDokumentasi(foto([L, P, L, L, L]), OPSI);
    expect(luas(ambil(p, 2))).toBeGreaterThanOrEqual(140 * 0.85 - 0.1);
    for (const s of [1, 2, 4, 5]) expect(luas(ambil(p, 3))).toBeGreaterThan(luas(ambil(p, s)));
  });
  it("tanpa tumpang tindih, di dalam area, rasio asli terjaga, margin kartu rapat", () => {
    for (const a of [[L, L, L, L, L], [P, L, L, L, L], [L, P, L, P, L], [P, P, P, P, P]]) {
      const { penempatan: p } = tataFotoDokumentasi(foto(a), OPSI);
      expect(p).toHaveLength(5);
      for (const q of p) {
        expect(q.x).toBeGreaterThanOrEqual(-0.01);
        expect(q.x + q.w).toBeLessThanOrEqual(OPSI.lebar + 0.01);
        expect(q.yKet).toBeGreaterThanOrEqual(-0.01);
        expect(q.y + q.h).toBeLessThanOrEqual(OPSI.tinggi + 0.01);
        expect(q.yKet + q.tinggiKartu).toBeLessThanOrEqual(OPSI.tinggi + 0.01);
        expect(q.w / q.h).toBeCloseTo(a[q.slot - 1], 3);
      }
      for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
        const A = p[i], B = p[j];
        const kena = A.x < B.x + B.w && B.x < A.x + A.w && A.yKet < B.yKet + B.tinggiKartu && B.yKet < A.yKet + A.tinggiKartu;
        expect(kena).toBe(false);
      }
    }
  });
  it("slot hilang: baris dibuang dan foto memakai ruang lebih besar", () => {
    const lima = tataFotoDokumentasi(foto([L, L, L, L, L]), OPSI).penempatan;
    const tiga = tataFotoDokumentasi([{ slot: 2, aspek: L }, { slot: 3, aspek: L }, { slot: 4, aspek: L }], OPSI).penempatan;
    expect(tiga.map((x) => x.slot)).toEqual([2, 3, 4]);
    expect(luas(ambil(tiga, 3))).toBeGreaterThanOrEqual(luas(ambil(lima, 3)) - 0.01);
    expect(tataFotoDokumentasi([], OPSI).penempatan).toEqual([]);
    const satu = tataFotoDokumentasi([{ slot: 1, aspek: L }], OPSI).penempatan;
    expect(satu).toHaveLength(1);
    expect(satu[0].w).toBeCloseTo(OPSI.lebar, 1);
  });
  it("area sempit: ambang diturunkan bertahap tetapi tetap menghasilkan susunan", () => {
    const r = tataFotoDokumentasi(foto([L, P, L, P, L]), { lebar: 300, tinggi: 300, gap: 3, cap: 16 });
    expect(r.penempatan).toHaveLength(5);
    expect(r.ambang).toBeLessThan(140);
  });
  it("ruang bawah dan jarak tegak terpisah dihitung; foto di tengah tinggi baris", () => {
    const o = { lebar: 538.6, tinggi: 580, gap: 3, gapV: 3, cap: 24, capBawah: 6 };
    const { penempatan: p } = tataFotoDokumentasi(foto([L, P, L, L, L]), o);
    for (const q of p) {
      expect(q.yKet + q.tinggiKartu).toBeLessThanOrEqual(o.tinggi + 0.01);
      expect(q.y).toBeCloseTo(q.yKet + 24 + (q.hBaris - q.h) / 2, 6);
      expect(q.tinggiKartu).toBeCloseTo(24 + q.hBaris + 6, 6);
    }
    expect(ambil(p, 1).yKet).toBeCloseTo(ambil(p, 2).yKet, 6);
  });
  it("lebar minimum per slot dihormati; bila mustahil, dilepas", () => {
    const { penempatan: p } = tataFotoDokumentasi(foto([P, L, L, L, L]), { ...OPSI, lebarMin: { 1: 95, 5: 95 } });
    expect(ambil(p, 1).w).toBeGreaterThanOrEqual(94.99);
    expect(ambil(p, 5).w).toBeGreaterThanOrEqual(94.99);
    const mustahil = tataFotoDokumentasi(foto([L, L, L, L, L]), { ...OPSI, lebarMin: { 1: 5000 } });
    expect(mustahil.penempatan).toHaveLength(5);
  });
  it("aspek tak sah diganti 16:9", () => {
    const { penempatan: p } = tataFotoDokumentasi([{ slot: 3, aspek: NaN }], OPSI);
    expect(p[0].w / p[0].h).toBeCloseTo(16 / 9, 3);
  });
});
