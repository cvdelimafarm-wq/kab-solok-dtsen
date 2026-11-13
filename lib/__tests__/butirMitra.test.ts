import { describe, expect, it } from "vitest";
import { susunButirMitra } from "../butirMitra";

const dasar = { satuan: "dokumen", mulai: "2026-11-10", selesai: "2026-11-30", hariIni: "2026-11-13" };
describe("butir kerja mitra (Fase 2c)", () => {
  it("PPL: target dari alokasi, sisa per hari, status laju", () => {
    const b = susunButirMitra({ ...dasar, peran: "ppl", alokasi: [{ target_sampel: 5, idsubsls: "a" }, { target_sampel: 5, idsubsls: "b" }], realisasi: 4 })!;
    expect(b).toMatchObject({ judul: "Mendata sampel", target: 10, realisasi: 4, sisa: 6, persen: 40, wilayah: 2, sisaHari: 18, perHari: 1, status: "sesuai" });
    expect(susunButirMitra({ ...dasar, peran: "ppl", alokasi: [{ target_sampel: 10 }], realisasi: 0 })!.status).toBe("tertinggal");
    expect(susunButirMitra({ ...dasar, peran: "ppl", alokasi: [{ target_sampel: 10 }], realisasi: 12 })!).toMatchObject({ status: "selesai", persen: 100, sisa: 0 });
  });
  it("PML: memeriksa dokumen; peran lain tidak punya butir; tanpa alokasi", () => {
    expect(susunButirMitra({ ...dasar, peran: "pml", alokasi: [{ target_sampel: 20 }], realisasi: 0 })!.judul).toBe("Memeriksa dokumen");
    expect(susunButirMitra({ ...dasar, peran: "entri", alokasi: [], realisasi: 0 })).toBeNull();
    expect(susunButirMitra({ ...dasar, peran: "ppl", alokasi: [], realisasi: 0 })!.status).toBe("tanpa_target");
    expect(susunButirMitra({ ...dasar, hariIni: "2026-11-01", peran: "ppl", alokasi: [{ target_sampel: 10 }], realisasi: 0 })!.status).toBe("belum_mulai");
  });
});
