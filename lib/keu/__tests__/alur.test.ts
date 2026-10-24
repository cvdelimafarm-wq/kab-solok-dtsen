import { describe, expect, it } from "vitest";
import { CABANG_DIPA, CABANG_POK, KURANG_AWAL, SAAT, SEBELUM, semuaLangkah, SESUDAH, TAUTAN_LANGKAH } from "../alur";

describe("alur revisi", () => {
  it("nomor langkah lengkap dan berurutan", () => {
    expect(SEBELUM.map((l) => l.no)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(KURANG_AWAL.map((l) => l.no)).toEqual(["K1", "K2"]);
    expect(CABANG_POK.langkah.map((l) => l.no)).toEqual(["K3", "K4", "K5"]);
    expect(CABANG_DIPA.langkah.map((l) => l.no)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(SAAT.map((l) => l.no)).toEqual(["B1", "B2", "B3", "B4"]);
    expect(SESUDAH.map((l) => l.no)).toEqual(["C1", "C2", "C3", "C4"]);
  });
  it("nomor unik, isi terisi, tautan mengarah ke halaman SIGAP dan ke langkah yang ada", () => {
    const l = semuaLangkah();
    expect(new Set(l.map((x) => x.no)).size).toBe(l.length);
    for (const x of l) { expect(x.judul.length).toBeGreaterThan(3); expect(x.isi.length).toBeGreaterThan(20); }
    for (const [no, t] of Object.entries(TAUTAN_LANGKAH)) { expect(l.some((x) => x.no === no)).toBe(true); expect(t.href.startsWith("/sigap/revisi/")).toBe(true); }
  });
  it("ketentuan kantor: PPK menyatakan sah dan KPA menerima laporan", () => {
    expect(SAAT[1].isi).toContain("KPA menerima laporan");
    expect(CABANG_POK.judul).toContain("KPA menerima laporan");
  });
});
