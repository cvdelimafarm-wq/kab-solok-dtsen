import { describe, expect, it } from "vitest";
import { ALAMAT_LEMBAR_QC_KORWIL, tabDariAlamat } from "../sigapKorwilTab";

describe("tabDariAlamat", () => {
  it("tab sah dikenali", () => {
    expect(tabDariAlamat("kuesioner")).toBe("kuesioner");
    expect(tabDariAlamat("lapangan")).toBe("lapangan");
    expect(tabDariAlamat("hasil")).toBe("hasil");
  });
  it("kosong atau di luar daftar -> null (tab awal)", () => {
    expect(tabDariAlamat(null)).toBeNull();
    expect(tabDariAlamat(undefined)).toBeNull();
    expect(tabDariAlamat("")).toBeNull();
    expect(tabDariAlamat("administrasi")).toBeNull();
    expect(tabDariAlamat("KUESIONER")).toBeNull();
    expect(tabDariAlamat("kuesioner&x=1")).toBeNull();
  });
  it("alamat Lembar Quality Check membuka tab kuesioner", () => {
    const tab = new URLSearchParams(ALAMAT_LEMBAR_QC_KORWIL.split("?")[1]).get("tab");
    expect(ALAMAT_LEMBAR_QC_KORWIL.startsWith("/sigap/korwil?")).toBe(true);
    expect(tabDariAlamat(tab)).toBe("kuesioner");
  });
});
