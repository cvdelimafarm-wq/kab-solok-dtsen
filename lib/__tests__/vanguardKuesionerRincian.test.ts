import { describe, expect, it } from "vitest";
import { KELOMPOK_IV1, RINCIAN_IV1, cariRincianIv1, rincianKelompok, rincianLainnya } from "../vanguard/kuesioner/rincian";

describe("daftar rincian Blok IV.1 (V6-0)", () => {
  it("R.1 s.d. R.225: tiap nomor tepat satu kali, sebagai judul kelompok atau rincian isian", () => {
    const judul = new Set(KELOMPOK_IV1.map((k) => k.no));
    const isian = RINCIAN_IV1.map((r) => r.no);
    expect(new Set(isian).size).toBe(isian.length);
    for (const n of isian) expect(judul.has(n), `R.${n}`).toBe(false);
    for (let n = 1; n <= 225; n++) expect(judul.has(n) !== isian.includes(n), `R.${n}`).toBe(true);
    expect(KELOMPOK_IV1).toHaveLength(14);
    expect(RINCIAN_IV1).toHaveLength(211);
  });
  it("kelompok berurutan, tidak tumpang tindih, dan rincian jatuh di kelompoknya", () => {
    let akhir = 0;
    for (const k of KELOMPOK_IV1) {
      expect(k.no).toBe(akhir + 1);
      expect(k.sampai).toBeGreaterThanOrEqual(k.no);
      akhir = k.sampai;
      for (const r of rincianKelompok(k.kel)) { expect(r.no).toBeGreaterThan(k.no); expect(r.no).toBeLessThanOrEqual(k.sampai); }
    }
    expect(akhir).toBe(225);
  });
  it("nomor kelompok sama dengan acuan rekap IV.3.2 (R.1, 8, 16, 61, 74, 85, 121, 129, 154, 159, 167, 182)", () => {
    expect(KELOMPOK_IV1.slice(0, 12).map((k) => k.no)).toEqual([1, 8, 16, 61, 74, 85, 121, 129, 154, 159, 167, 182]);
  });
  it("kode COICOP berbentuk 5 digit (boleh beberapa dipisah /) atau kosong; nama terisi; satuan kosong hanya pada rincian 'sebutkan'", () => {
    for (const r of RINCIAN_IV1) {
      if (r.kode !== null) expect(r.kode, `R.${r.no}`).toMatch(/^\d{5}(\/\d{2,5})*$/);
      expect(r.nama.length, `R.${r.no}`).toBeGreaterThan(2);
      if (r.satuan === null) expect(rincianLainnya(r) || /sebutkan/i.test(r.nama), `R.${r.no} ${r.nama}`).toBe(true);
    }
  });
  it("contoh rujukan: R.2 Beras Kg, R.160 Gula pasir Ons, R.156 minyak goreng Liter, R.98 Tauge, R.217 Es krim, R.224 Tembakau, R.153 buah lainnya", () => {
    expect(cariRincianIv1(2)).toMatchObject({ kode: "01111", nama: expect.stringContaining("Beras"), satuan: "Kg" });
    expect(cariRincianIv1(160)).toMatchObject({ nama: "Gula pasir", satuan: "Ons" });
    expect(cariRincianIv1(156)?.satuan).toBe("Liter");
    expect(cariRincianIv1(98)?.nama).toBe("Tauge");
    expect(cariRincianIv1(217)).toMatchObject({ nama: "Es krim", satuan: "Mangkok kecil" });
    expect(cariRincianIv1(224)).toMatchObject({ nama: "Tembakau", satuan: "Ons" });
    expect(rincianLainnya(cariRincianIv1(153)!)).toBe(true);
  });
});
