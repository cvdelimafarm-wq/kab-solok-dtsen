import { describe, expect, it } from "vitest";
import { JENIS_PER_HARI, pilihanTanggalUnduh } from "@/lib/sigapUnduh";

const hari = (...a: [string, boolean][]) => a.map(([tanggal, lengkap]) => ({ tanggal, lengkap }));

describe("pilihanTanggalUnduh", () => {
  it("hari ini lengkap -> bawaan hari ini", () => {
    const p = pilihanTanggalUnduh(hari(["2026-10-19", true], ["2026-10-20", true]), "2026-10-20");
    expect(p).toEqual({ hariIni: "2026-10-20", hariIniLengkap: true, terakhirLengkap: "2026-10-20", bawaan: "2026-10-20" });
  });
  it("hari ini belum lengkap -> bawaan hari lengkap terakhir", () => {
    const p = pilihanTanggalUnduh(hari(["2026-10-18", true], ["2026-10-19", true], ["2026-10-20", false]), "2026-10-20");
    expect(p.bawaan).toBe("2026-10-19");
    expect(p.hariIni).toBe("2026-10-20");
    expect(p.hariIniLengkap).toBe(false);
  });
  it("hari lengkap di masa depan tidak dipakai", () => {
    const p = pilihanTanggalUnduh(hari(["2026-10-17", true], ["2026-10-20", false], ["2026-10-25", true]), "2026-10-20");
    expect(p.terakhirLengkap).toBe("2026-10-17");
  });
  it("belum ada hari lengkap tapi hari ini hari kerja -> bawaan hari ini", () => {
    expect(pilihanTanggalUnduh(hari(["2026-10-20", false]), "2026-10-20").bawaan).toBe("2026-10-20");
  });
  it("hari ini bukan hari kerja, ada hari lengkap -> bawaan hari lengkap terakhir; hariIni null", () => {
    const p = pilihanTanggalUnduh(hari(["2026-10-15", true], ["2026-10-16", true]), "2026-10-20");
    expect(p.hariIni).toBeNull();
    expect(p.bawaan).toBe("2026-10-16");
  });
  it("tidak ada hari cocok -> bawaan null", () => {
    expect(pilihanTanggalUnduh(hari(["2026-10-25", false]), "2026-10-20").bawaan).toBeNull();
    expect(pilihanTanggalUnduh([], "2026-10-20").bawaan).toBeNull();
  });
  it("jenis per hari = laporan & dokumentasi", () => expect([...JENIS_PER_HARI]).toEqual(["laporan", "dokumentasi"]));
});
