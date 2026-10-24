import { describe, expect, it } from "vitest";
import { barisSkor, nilaiSkor, persenBobot, rincianBulanan, WARNA_KATEGORI } from "../skor";

const b = { penarikan: 40, volume: 30, cakupan: 20, disiplin: 10 };
const a = { baik: 80, cukup: 60 };

describe("skor RO", () => {
  it("baris urut kode, nama dari master, label menurut ambang", () => {
    const r = barisSkor(
      [{ ro_kode: "2906.BMA.005", n_penarikan: 90, n_volume: 80, n_cakupan: 100, n_disiplin: 100 }, { ro_kode: "2902.FAN.001", n_penarikan: 10, n_volume: null, n_cakupan: 0, n_disiplin: 100 }],
      [{ kode: "2906.BMA.005", nama: "Pendataan" }], b, a);
    expect(r.map((x) => x.ro_kode)).toEqual(["2902.FAN.001", "2906.BMA.005"]);
    expect(r[1]).toMatchObject({ nama: "Pendataan", skor: 90, label: "Baik" });
    expect(r[0].nama).toBe("2902.FAN.001");
    expect(r[0].label).toBe("Perlu pembinaan");
  });
  it("bobot dalam persen dinormalkan", () => {
    expect(persenBobot({ penarikan: 2, volume: 1, cakupan: 1, disiplin: 0 })).toEqual({ penarikan: 50, volume: 25, cakupan: 25, disiplin: 0 });
    expect(persenBobot({ penarikan: 0, volume: 0, cakupan: 0, disiplin: 0 })).toEqual({ penarikan: 0, volume: 0, cakupan: 0, disiplin: 0 });
    expect(persenBobot(b)).toEqual(b);
  });
  it("rincian bulanan sampai bulan data terakhir", () => {
    const r = rincianBulanan(
      [{ bulan: 1, nilai: 100 }, { bulan: "1", nilai: "50" }, { bulan: 3, nilai: 70 }],
      [{ bulan: 1, realisasi_bulan: 120 }, { bulan: 2, realisasi_bulan: 10 }, { bulan: 9, realisasi_bulan: 5 }], 3);
    expect(r.map((x) => x.nama)).toEqual(["Jan", "Feb", "Mar"]);
    expect(r[0]).toMatchObject({ rencana: 150, real: 120, selisih: -30 });
    expect(r[1]).toMatchObject({ rencana: 0, real: 10, selisih: 10 });
    expect(r[2]).toMatchObject({ rencana: 70, real: 0, selisih: -70 });
    expect(rincianBulanan([], [], 0)).toEqual([]);
    expect(rincianBulanan([], [], 20)).toHaveLength(12);
  });
  it("format nilai dan warna kategori", () => {
    expect(nilaiSkor(null)).toBe("-");
    expect(nilaiSkor(87.5)).toBe("87,5");
    expect(WARNA_KATEGORI["Perlu pembinaan"]).toBe("merah");
  });
});
