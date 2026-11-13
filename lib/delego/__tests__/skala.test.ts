import { describe, expect, it } from "vitest";
import { bebanDelegasiHari, bebanDelegasiMinggu, kapasitasMinggu, kategoriBeban, SASARAN_BEBAN } from "../hitung";
import { faktorSkala, labelSumberPoin, MULAI_SKALA_100, ppsEfektif, skalaPada } from "../skala";
import { menitDariPoin } from "../teknis";
import { poinDariMenit } from "../skor";
import type { Delegasi } from "../tipe";

const dg = (o: Partial<Delegasi>): Delegasi =>
  ({ id: 1, status: "berjalan", mulai: "2026-11-10", tenggat: "2026-11-20", hari_kerja: [1, 2, 3, 4, 5], target_harian: 75, ...o }) as unknown as Delegasi;

describe("fase D: skala 100 mulai 16 Nov 2026", () => {
  it("tanggal dan skala", () => {
    expect(MULAI_SKALA_100).toBe("2026-11-16");
    expect(skalaPada("2026-11-15")).toBe(75);
    expect(skalaPada("2026-11-16")).toBe(100);
    expect(faktorSkala("2026-11-10", "2026-11-13")).toBe(1);
    expect(faktorSkala("2026-11-10", "2026-11-17")).toBeCloseTo(100 / 75);
    expect(faktorSkala("2026-11-16", "2026-11-17")).toBe(1);
    expect(faktorSkala(null, "2026-11-17")).toBe(1);
  });
  it("delegasi skala 75 yang berjalan melewati 16 Nov dibaca setara skala 100", () => {
    const d = dg({});
    expect(bebanDelegasiHari(d, "2026-11-13")).toBe(75); // Jumat, skala 75: penuh
    expect(bebanDelegasiHari(d, "2026-11-17")).toBeCloseTo(100); // Selasa, skala 100: tetap penuh
    expect(bebanDelegasiMinggu(d, "2026-11-18")).toBeCloseTo(500);
    expect(kapasitasMinggu("2026-11-18")).toBe(500);
  });
  it("sasaran minimal 60", () => {
    expect(SASARAN_BEBAN.min).toBe(60);
    expect(kategoriBeban(59)).toBe("ringan");
    expect(kategoriBeban(60)).toBe("sasaran");
    expect(kategoriBeban(101)).toBe("berlebih");
  });
  it("poin per satuan efektif: katalog sebelum 16 Nov, Master sesudahnya, cadangan katalog x 100/75", () => {
    const j = { id: 3, poin_per_satuan: 9 };
    const daftar = [{ jenis_id: 3, poin_katalog: 9, poin: 5.56, sumber: "matriks:seruti_tw4:awal", survei_kode: "seruti_tw4" }];
    expect(ppsEfektif(j, daftar, "2026-11-13")).toMatchObject({ pps: 9, kapasitas: 75 });
    expect(ppsEfektif(j, daftar, "2026-11-16")).toMatchObject({ pps: 5.56, kapasitas: 100 });
    expect(ppsEfektif(j, [], "2026-11-16")).toMatchObject({ pps: 12, kapasitas: 100 });
    expect(ppsEfektif(null, daftar, "2026-11-16").pps).toBe(0);
  });
  it("label asal poin", () => {
    expect(labelSumberPoin("matriks:umum:manual")).toBe("Master · Umum · input manual");
    expect(labelSumberPoin("katalog×100/75")).toBe("katalog lama × 100/75");
    expect(labelSumberPoin("diisi")).toBe("diisi pemberi");
    expect(labelSumberPoin("katalog skala 75")).toBe("katalog lama (skala 75)");
    expect(labelSumberPoin("")).toBe("");
  });
  it("katalog lama tetap skala 75 (1 poin = 6 menit); skala 100: 1 poin = 4,5 menit", () => {
    expect(menitDariPoin(75)).toBe(450);
    expect(poinDariMenit(450)).toBe(75);
    expect(menitDariPoin(100, 100)).toBe(450);
    expect(menitDariPoin(10, 100)).toBe(45);
  });
});
