import { describe, expect, it } from "vitest";
import { isiRec, mingguKe, modeRec, rapikanRec, recPerk, ringkasRec, ubahRec } from "../waktu";

describe("mingguKe", () => {
  it("minggu ke-2 November 2026 = Senin 9 s.d. Jumat 13", () => {
    expect(mingguKe(2026, 10, 2)).toEqual({ mulai: "2026-11-09", selesai: "2026-11-13" });
  });
  it("minggu ke-1: Senin pertama; bulan dimulai hari Minggu", () => {
    expect(mingguKe(2026, 10, 1)).toEqual({ mulai: "2026-11-02", selesai: "2026-11-06" }); // 1 Nov 2026 = Minggu
    expect(mingguKe(2026, 5, 1)).toEqual({ mulai: "2026-06-01", selesai: "2026-06-05" }); // 1 Jun 2026 = Senin
  });
  it("minggu ke-5 yang tidak ada dijepit ke Senin terakhir; Jumat boleh masuk bulan berikutnya", () => {
    expect(mingguKe(2026, 10, 5)).toEqual({ mulai: "2026-11-30", selesai: "2026-12-04" });
    expect(mingguKe(2026, 1, 5)).toEqual({ mulai: "2026-02-23", selesai: "2026-02-27" }); // Feb 2026 hanya 4 Senin
  });
  it("masukan di luar batas dijepit", () => {
    expect(mingguKe(2026, 99, 0)).toEqual(mingguKe(2026, 11, 1));
  });
});

describe("recPerk", () => {
  it("tanda eksplisit didahulukan", () => {
    expect(recPerk({ mulai: "2026-11-02", selesai: "2026-11-02", perk: true })).toBe(true);
    expect(recPerk({ mulai: "", selesai: "", perk: false })).toBe(false);
  });
  it("tanpa tanda: kosong = Perkiraan, terisi = Fix (data lama)", () => {
    expect(recPerk(undefined)).toBe(true);
    expect(recPerk({ mulai: "", selesai: "" })).toBe(true);
    expect(recPerk({ mulai: "2026-02-23", selesai: "2026-02-25" })).toBe(false);
  });
});

describe("isiRec / ubahRec", () => {
  it("perkiraan: bulan + minggu menjadi tanggal", () => {
    const r = ubahRec(undefined, { bulan: 10, minggu: 2 }, 2026);
    expect(r).toMatchObject({ perk: true, bulan: 10, minggu: 2, mulai: "2026-11-09", selesai: "2026-11-13" });
  });
  it("perkiraan tanpa bulan: tanggal tetap kosong", () => {
    expect(ubahRec(undefined, { minggu: 3 }, 2026)).toMatchObject({ mulai: "", selesai: "" });
  });
  it("Fix satu tanggal: selesai = mulai", () => {
    const r = ubahRec(undefined, { perk: false, mode: "tgl", mulai: "2026-11-12" }, 2026);
    expect(r).toMatchObject({ perk: false, mulai: "2026-11-12", selesai: "2026-11-12" });
  });
  it("Fix rentang: tanggal dibiarkan", () => {
    const r = ubahRec(undefined, { perk: false, mode: "rentang", mulai: "2026-11-10", selesai: "2026-11-14" }, 2026);
    expect(r).toMatchObject({ mulai: "2026-11-10", selesai: "2026-11-14" });
  });
  it("Fix minggu: Senin sampai Jumat dari bulan + minggu", () => {
    const r = ubahRec(undefined, { perk: false, mode: "minggu", bulan: 10, minggu: 3 }, 2026);
    expect(r).toMatchObject({ perk: false, mulai: "2026-11-16", selesai: "2026-11-20" });
  });
  it("beralih dari Perkiraan ke Fix mempertahankan tanggal yang sudah dihitung", () => {
    const p = ubahRec(undefined, { bulan: 10, minggu: 2 }, 2026);
    const f = ubahRec(p, { perk: false, mode: "tgl" }, 2026);
    expect(f.mulai).toBe("2026-11-09");
    expect(f.selesai).toBe("2026-11-09");
  });
});

describe("rapikanRec / ringkasRec", () => {
  it("rekaman lama tetap utuh; nilai ngawur dibersihkan", () => {
    expect(rapikanRec({ mulai: "2026-02-23", selesai: "2026-02-25" })).toEqual({ mulai: "2026-02-23", selesai: "2026-02-25" });
    expect(rapikanRec({ mulai: 5, perk: "ya", mode: "x", bulan: 99, minggu: -3 })).toEqual({ mulai: "", selesai: "", bulan: 11, minggu: 1 });
    expect(rapikanRec(null)).toEqual({ mulai: "", selesai: "" });
  });
  it("ringkasan", () => {
    expect(ringkasRec(ubahRec(undefined, { bulan: 10, minggu: 2 }, 2026))).toBe("minggu ke-2 November (09/11/2026 s.d. 13/11/2026)");
    expect(ringkasRec({ mulai: "2026-11-12", selesai: "2026-11-12", perk: false })).toBe("12/11/2026");
    expect(ringkasRec({ mulai: "2026-11-10", selesai: "2026-11-14", perk: false })).toBe("10/11/2026 s.d. 14/11/2026");
    expect(ringkasRec(undefined)).toBe("");
  });
});

describe("modeRec", () => {
  it("data lama tanpa mode: rentang bila mulai dan selesai berbeda, selain itu satu tanggal", () => {
    expect(modeRec({ mulai: "2026-03-02", selesai: "2026-03-04" })).toBe("rentang");
    expect(modeRec({ mulai: "2026-03-02", selesai: "2026-03-02" })).toBe("tgl");
    expect(modeRec(undefined)).toBe("tgl");
    expect(modeRec({ mulai: "", selesai: "", mode: "minggu" })).toBe("minggu");
  });
  it("menyentuh data lama (Fix, rentang) tidak meratakan selesai", () => {
    expect(isiRec({ mulai: "2026-03-02", selesai: "2026-03-04" }, 2026)).toMatchObject({ perk: false, mode: "rentang", selesai: "2026-03-04" });
  });
});
