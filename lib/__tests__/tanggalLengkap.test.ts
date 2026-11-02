import { describe, expect, it } from "vitest";
import { polaDariTanggal, tanggalLengkap } from "@/lib/keu/waktu";

describe("tanggalLengkap (ketikan tahun sebagian tidak dinilai)", () => {
  it("menolak tahun yang belum lengkap diketik", () => {
    for (const d of ["0002-11-10", "0020-11-10", "0202-11-10", "", "2026-11", "2026-13-01"]) expect(tanggalLengkap(d)).toBe(false);
  });
  it("menerima tanggal lengkap", () => {
    expect(tanggalLengkap("2026-11-10")).toBe(true);
    expect(tanggalLengkap("2026-11-30")).toBe(true);
  });
  it("10 dan 30 Nov 2026 sah untuk Triwulan IV 2026", () => {
    expect(polaDariTanggal("2026-11-10", 9, 2026)).toEqual({ bulanKe: 1, hari: 10 });
    expect(polaDariTanggal("2026-11-30", 9, 2026)).toEqual({ bulanKe: 1, hari: 30 });
  });
});
