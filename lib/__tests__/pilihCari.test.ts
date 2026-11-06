// lib/__tests__/pilihCari.test.ts
// (6 Nov 2026) Logika dropdown bisa-dicari (lib/pilihCari.ts).
import { describe, expect, it } from "vitest";
import {
  AMBANG_CARI,
  BATAS_TAMPIL,
  geserAktif,
  indeksAwal,
  indeksPertamaAktif,
  labelPenentuLebar,
  labelTerpanjang,
  labelTerpilih,
  normalisasi,
  perluKotakCari,
  potongTampil,
  saringPilihan,
  type OpsiPilih,
} from "../pilihCari";

const o = (nilai: string, label = nilai, nonaktif = false): OpsiPilih => ({ nilai, label, nonaktif });

describe("normalisasi", () => {
  it("huruf kecil, tanpa aksen, spasi dirapatkan", () => {
    expect(normalisasi("  Jorong   Ö ")).toBe("jorong o");
    expect(normalisasi("")).toBe("");
  });
});

describe("saringPilihan", () => {
  const d = [o("", "Semua kecamatan"), o("1", "Kec. Lembah Gumanti"), o("2", "Kec. Gunung Talang"), o("3", "Kec. X Koto Diatas")];
  it("kueri kosong = semua, urutan asli", () => {
    expect(saringPilihan(d, "").map((x) => x.nilai)).toEqual(["", "1", "2", "3"]);
    expect(saringPilihan(d, "   ").length).toBe(4);
  });
  it("tidak peduli huruf besar/kecil", () => {
    expect(saringPilihan(d, "GUNUNG").map((x) => x.nilai)).toEqual(["2"]);
  });
  it("tiap kata harus cocok, urutan bebas", () => {
    expect(saringPilihan(d, "talang kec").map((x) => x.nilai)).toEqual(["2"]);
    expect(saringPilihan(d, "kec gu").map((x) => x.nilai)).toEqual(["1", "2"]);
    expect(saringPilihan(d, "gunung lembah")).toEqual([]);
  });
  it("potongan kata cocok di mana saja", () => {
    expect(saringPilihan(d, "koto").map((x) => x.nilai)).toEqual(["3"]);
  });
  it("tidak ada yang cocok -> kosong", () => {
    expect(saringPilihan(d, "zzz")).toEqual([]);
  });
  it("tidak mengubah daftar asli", () => {
    const salinan = d.slice();
    saringPilihan(d, "kec");
    expect(d).toEqual(salinan);
  });
});

describe("navigasi papan ketik", () => {
  const d = [o("a"), o("b", "b", true), o("c"), o("d", "d", true)];
  it("melewati pilihan nonaktif", () => {
    expect(geserAktif(d, 0, 1)).toBe(2);
    expect(geserAktif(d, 2, -1)).toBe(0);
  });
  it("berhenti di ujung, tidak berputar", () => {
    expect(geserAktif(d, 2, 1)).toBe(2);
    expect(geserAktif(d, 0, -1)).toBe(0);
  });
  it("belum ada yang disorot: mulai dari ujung sesuai arah", () => {
    expect(geserAktif(d, -1, 1)).toBe(0);
    expect(geserAktif(d, -1, -1)).toBe(2);
  });
  it("daftar kosong / semuanya nonaktif", () => {
    expect(geserAktif([], 0, 1)).toBe(-1);
    expect(indeksPertamaAktif([o("a", "a", true)])).toBe(-1);
  });
  it("indeksAwal: yang terpilih, kalau tidak ada yang pertama aktif", () => {
    expect(indeksAwal(d, "c")).toBe(2);
    expect(indeksAwal(d, "zzz")).toBe(0);
    expect(indeksAwal(d, "b")).toBe(0); // terpilih tapi nonaktif -> tak disorot
  });
});

describe("tampilan", () => {
  it("ambang kotak cari", () => {
    expect(perluKotakCari(AMBANG_CARI - 1)).toBe(false);
    expect(perluKotakCari(AMBANG_CARI)).toBe(true);
  });
  it("label terpanjang", () => {
    expect(labelTerpanjang([o("a", "pendek"), o("b", "yang paling panjang"), o("c", "sedang")])).toBe("yang paling panjang");
    expect(labelTerpanjang([])).toBe("");
  });
  it("label penentu lebar: daftar kecil semuanya, daftar besar n terpanjang tanpa duplikat", () => {
    expect(labelPenentuLebar([o("a", "x"), o("b", "x"), o("c", "yy")])).toEqual(["x", "yy"]);
    const banyak = Array.from({ length: 30 }, (_, i) => o(String(i), "k".repeat(i + 1)));
    const r = labelPenentuLebar(banyak, 3);
    expect(r).toEqual(["k".repeat(30), "k".repeat(29), "k".repeat(28)]);
  });
  it("label terpilih; tak cocok -> pilihan pertama seperti <select>", () => {
    const d = [o("", "Semua"), o("1", "Satu")];
    expect(labelTerpilih(d, "1")).toEqual({ label: "Satu", cocok: true });
    expect(labelTerpilih(d, "9")).toEqual({ label: "Semua", cocok: false });
    expect(labelTerpilih([], "")).toEqual({ label: "", cocok: false });
  });
  it("potongTampil membatasi baris dan melaporkan sisa", () => {
    const banyak = Array.from({ length: BATAS_TAMPIL + 25 }, (_, i) => o(String(i)));
    const r = potongTampil(banyak);
    expect(r.tampil.length).toBe(BATAS_TAMPIL);
    expect(r.sisa).toBe(25);
    expect(potongTampil(banyak.slice(0, 10))).toEqual({ tampil: banyak.slice(0, 10), sisa: 0 });
  });
});
