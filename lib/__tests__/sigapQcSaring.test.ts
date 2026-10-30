import { describe, expect, it } from "vitest";
import { kartuDariStatus, ketukKartu, lolosKartuHasil, lolosKartuPetugas } from "@/lib/sigapQcSaring";

describe("kartu QC sebagai saringan", () => {
  it("ketuk kartu yang sama melepas saringan; kartu lain menggantikan", () => {
    expect(ketukKartu(null, "belum_mengisi")).toBe("belum_mengisi");
    expect(ketukKartu("belum_mengisi", "belum_mengisi")).toBeNull();
    expect(ketukKartu("belum_mengisi", "belum_lulus")).toBe("belum_lulus");
  });
  it("Pasca Bencana: belum mengisi = tanpa jawaban; belum lulus = ada jawaban dan masih ada salah", () => {
    expect(lolosKartuHasil(null, { terjawab: 0, salah: 0 })).toBe(true);
    expect(lolosKartuHasil("belum_mengisi", { terjawab: 0, salah: 0 })).toBe(true);
    expect(lolosKartuHasil("belum_mengisi", { terjawab: 40, salah: 2 })).toBe(false);
    expect(lolosKartuHasil("belum_lulus", { terjawab: 40, salah: 2 })).toBe(true);
    expect(lolosKartuHasil("belum_lulus", { terjawab: 40, salah: 0 })).toBe(false);
    expect(lolosKartuHasil("belum_lulus", { terjawab: 0, salah: 0 })).toBe(false); // belum mengisi bukan "masih ada salah"
  });
  it("SPDT: belum mengisi = percobaan 0; belum lulus = tidak lulus (termasuk yang belum mengisi)", () => {
    expect(lolosKartuPetugas("belum_mengisi", { percobaan: 0, lulus: false })).toBe(true);
    expect(lolosKartuPetugas("belum_mengisi", { percobaan: 2, lulus: false })).toBe(false);
    expect(lolosKartuPetugas("belum_lulus", { percobaan: 2, lulus: false })).toBe(true);
    expect(lolosKartuPetugas("belum_lulus", { percobaan: 1, lulus: true })).toBe(false);
    expect(lolosKartuPetugas("belum_lulus", { percobaan: 0, lulus: false })).toBe(true);
    expect(lolosKartuPetugas(null, { percobaan: 1, lulus: true })).toBe(true);
  });
  it("status tampilan Petugas <-> kartu", () => {
    expect(kartuDariStatus("belum_mengisi")).toBe("belum_mengisi");
    expect(kartuDariStatus("belum_lulus")).toBe("belum_lulus");
    expect(kartuDariStatus("modal_belum")).toBeNull();
    expect(kartuDariStatus("semua")).toBeNull();
  });
});
