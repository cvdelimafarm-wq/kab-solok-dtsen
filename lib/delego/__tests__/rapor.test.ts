import { describe, expect, it } from "vitest";
import { capaian, csvRekap, geser, penuhiMinimal, rataHarian, type BahanRapor, type BarisRapor } from "@/lib/delego/rapor";

const b = (x: Partial<BarisRapor>): BarisRapor => ({
  akun: 1, nama: "A", hari_kerja: "10", poin: "650", poin_diakui: "600", poin_menunggu: 0, laporan: 10, hari_60: 8, faktor: "0.9", lewat_tenggat: 0, inisiatif: 1,
  kualitas: null, kepatuhan: null, penilai_360: 2, nilai_360: null, pembinaan: 0, penghargaan: 0, ...x,
});

describe("rapor", () => {
  it("capaian dan rata harian terhadap kapasitas 100", () => {
    expect(capaian(b({}))).toBe(60);
    expect(rataHarian(b({}))).toBe(65);
    expect(penuhiMinimal(b({}))).toBe(true);
    expect(penuhiMinimal(b({ poin: 500 }))).toBe(false);
    expect(capaian(b({ hari_kerja: 0 }))).toBeNull();
  });
  it("geser bulan melewati pergantian tahun", () => {
    expect(geser("2026-12-01", 1)).toBe("2027-01-01");
    expect(geser("2026-01-01", -1)).toBe("2025-12-01");
  });
  it("CSV rekap SKP", () => {
    const d = { bulan: "2026-11-01", sampai: "2026-11-14", semua: true, ringkas: { pegawai: 1, tercatat: 1, min60: 1, bobot_total: 12, bobot_tervalidasi: 0 }, baris: [b({ nama: "Nama; Koma" })] } as BahanRapor;
    const c = csvRekap(d).split("\n");
    expect(c[0].startsWith("Nama;Hari kerja;Poin dilaporkan")).toBe(true);
    expect(c[1]).toBe('"Nama; Koma";10;650;600;60;65;8;0.9;0;1;;;;2;0;0');
  });
});
