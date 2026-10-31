import { describe, expect, it } from "vitest";
import { periksaMenuBuka, teksStatusBuka } from "../sigapMenuBuka";

describe("periksaMenuBuka", () => {
  it("menerima kode dan menu yang sah", () => {
    expect(periksaMenuBuka({ kode: "spdt_ntp", menu: "pengawasan" })).toEqual({ ok: true, kode: "spdt_ntp", menu: "pengawasan" });
  });
  it("menolak kode/menu tak sah", () => {
    expect(periksaMenuBuka({ kode: "SPDT", menu: "pengawasan" }).ok).toBe(false);
    expect(periksaMenuBuka({ kode: "spdt_ntp", menu: "lain" }).ok).toBe(false);
    expect(periksaMenuBuka(null).ok).toBe(false);
  });
});

describe("teksStatusBuka", () => {
  it("belum dibuka", () => expect(teksStatusBuka(null)).toEqual({ sudah: false, teks: "Belum dibuka hari ini" }));
  it("sudah dibuka: jam WIB", () => expect(teksStatusBuka("2026-10-31T00:12:00Z")).toEqual({ sudah: true, teks: "Sudah dibuka hari ini pukul 07.12 WIB" }));
});
