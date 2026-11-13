// lib/keu/__tests__/poinBeban.test.ts
// (13 Nov 2026, C) Matriks Poin beban kerja: susunan, format, konversi.
import { describe, expect, it } from "vitest";
import { fmtPoin, perHariDariPoin, persenUbah, poinDariPerHari, susunMatriks, type BarisSelPoin, type JenisPoin, type SurveiPoin } from "../poinBeban";
import { TAMPILAN_BACA } from "../tampilan";
import { FUNGSI_BACA } from "../gerbang";

const j = (id: number, nama: string, urut: number, aktif = true): JenisPoin => ({ id, kode: nama.toLowerCase().replace(/ /g, "_"), nama, satuan: "dokumen", urut, aktif });
const s = (id: number, nama: string, urut: number, aktif = true): SurveiPoin => ({ id, kode: nama.toLowerCase(), nama, pola: "", urut, aktif });
const sel = (jenis_id: number, survei_id: number, poin: number) => ({ id: jenis_id * 10 + survei_id, jenis_id, survei_id, poin_berlaku: poin }) as unknown as BarisSelPoin;

describe("poinBeban", () => {
  it("standar 12 dokumen per hari = 8,33 poin; 18 = 5,56; 8 JP = 12,5", () => {
    expect(poinDariPerHari(12)).toBe(8.33);
    expect(poinDariPerHari(18)).toBe(5.56);
    expect(poinDariPerHari(8)).toBe(12.5);
    expect(perHariDariPoin(8.33)).toBe(12);
    expect(poinDariPerHari(0)).toBeNull();
  });
  it("format dan persen ubah", () => {
    expect(fmtPoin("8.33")).toBe("8,33");
    expect(fmtPoin(null)).toBe("–");
    expect(persenUbah(8.33, 10.43)).toBe(25.2);
    expect(persenUbah(null, 5)).toBeNull();
  });
  it("matriks: jenis aktif × survei aktif, urut, saring", () => {
    const m = susunMatriks([j(2, "Memeriksa peta", 2), j(1, "Memeriksa dokumen", 1), j(3, "Lama", 3, false)], [s(20, "Susenas", 10), s(10, "Umum", 1), s(30, "Mati", 5, false)], [sel(1, 20, 8.33), sel(1, 10, 12)]);
    expect(m.kolom.map((k) => k.nama)).toEqual(["Umum", "Susenas"]);
    expect(m.baris.map((b) => b.jenis.nama)).toEqual(["Memeriksa dokumen", "Memeriksa peta"]);
    expect(m.baris[0].sel.get(20)?.poin_berlaku).toBe(8.33);
    expect(susunMatriks([j(1, "Memeriksa dokumen", 1), j(2, "Memeriksa peta", 2)], [s(10, "Umum", 1)], [], "peta").baris).toHaveLength(1);
    expect(susunMatriks([j(1, "A", 1)], [s(10, "Umum", 1), s(20, "Susenas", 2)], [], "", 20).kolom.map((k) => k.id)).toEqual([20]);
  });
  it("gerbang: view poin boleh dibaca; usul_perlu fungsi baca", () => {
    for (const v of ["keu_v_poin_sel", "keu_v_poin_perubahan", "keu_v_poin_survei", "keu_v_poin_atur", "keu_v_poin_jenis", "keu_v_poin_berlaku"]) expect(TAMPILAN_BACA[v]).toBeDefined();
    expect(FUNGSI_BACA).toContain("keu_poin_usul_perlu");
  });
});
