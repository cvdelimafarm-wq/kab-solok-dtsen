import { describe, expect, it } from "vitest";
import type { BarisRabKro } from "../rabKro";
import { bukuDariSandingan, dasarKebutuhan, hitungKecukupan, statusKecukupan, teksCakupan, teksFaktor } from "../kecukupan";

let id = 0;
const B = (o: Partial<BarisRabKro>): BarisRabKro => ({
  id: ++id, ro: "2903.BMA.007", kode: "", uraian: "x", akun: "521211", komponen: "051", pok: 1000, semula: 1000, rab: 900, selisih: -100, booked: 0, real: 0, sisa: 1000,
  status: "rinci", itemId: id, prioritas: null, kunci: null, satuan: "OK", volume: 1, ...o,
});

describe("statusKecukupan", () => {
  it("batas-batas sama dengan view basis data", () => {
    expect(statusKecukupan(800, 900, 1000, 0.05)).toBe("kurang");
    expect(statusKecukupan(900, 900, 1000, 0.05)).toBe("tipis");
    expect(statusKecukupan(999, 900, 1000, 0.05)).toBe("tipis");
    expect(statusKecukupan(1000, 900, 1000, 0.05)).toBe("cukup");
    expect(statusKecukupan(1050, 900, 1000, 0.05)).toBe("cukup");
    expect(statusKecukupan(1051, 900, 1000, 0.05)).toBe("lebih");
    expect(statusKecukupan(5, 0, 0, 0.05)).toBe("kosong");
  });
});

describe("hitungKecukupan", () => {
  it("per KRO dan kelompok: kebutuhan = RAB / faktor, RAB selesai apa adanya, item tanpa RAB tidak dibandingkan", () => {
    const baris = [
      B({ akun: "521211", rab: 900, pok: 1000, semula: 800 }),
      B({ akun: "521213", rab: 450, pok: 400, semula: 400 }),
      B({ akun: "524113", rab: 100, pok: 100, semula: 100, status: "selesai" }),
      B({ akun: "524113", rab: null, pok: 5000, semula: 5000, status: "belum", itemId: null }),
      B({ akun: "511111", rab: null, pok: 70, semula: 70, status: "belum", itemId: null }),
    ];
    const h = hitungKecukupan(baris, 0.9, 0.05);
    expect(h.map((x) => x.kode)).toEqual(["kro", "51", "524", "52L"]);
    const kro = h[0], k52 = h[3], k524 = h[2], k51 = h[1];
    expect(kro).toMatchObject({ nItem: 5, nAda: 3, r: 1450, p1: 1500, p0: 1300, k: 1600 });
    expect(k52).toMatchObject({ nAda: 2, r: 1350, p1: 1400, p0: 1200, k: 1500, st0: "kurang", st1: "tipis" });
    expect(k524).toMatchObject({ nItem: 2, nAda: 1, k: 100, st1: "cukup" });
    expect(k51).toMatchObject({ nAda: 0, st1: "kosong" });
    expect(kro.st1).toBe("tipis");
    expect(k52.ket).toContain("naik");
    expect(k52.ket).toContain("kurang Rp 100");
  });
  it("faktor di luar 0,5-1 memakai bawaan", () => {
    const baris = [B({ rab: 900, pok: 1000 })];
    expect(hitungKecukupan(baris, 2, 0.05)[0].k).toBe(1000);
    expect(hitungKecukupan(baris, 1, 0.05)[0].k).toBe(900);
  });
  it("teks pendukung", () => {
    const h = hitungKecukupan([B({ rab: 900, pok: 800 }), B({ rab: null, pok: 300, status: "belum", itemId: null })], 0.9, 0.05);
    expect(teksCakupan(h[0], 300)).toContain("1 dari 2 item");
    expect(teksFaktor(0.9)).toContain("Rp 1.000.000");
    const d = dasarKebutuhan("2903.BMA", h, 0.9, 0.05);
    expect(d).toContain("KRO 2903.BMA");
    expect(d).toContain("belum terdanai terhadap RAB Rp 100");
    expect(dasarKebutuhan("2903.BMA", hitungKecukupan([], 0.9, 0.05), 0.9, 0.05)).toContain("belum ada RAB");
  });
});

describe("bukuDariSandingan", () => {
  it("hanya item ber-RAB yang RAB-nya melebihi POK; urut prioritas lalu kekurangan", () => {
    const baris = [
      B({ uraian: "a", rab: 900, pok: 800, prioritas: "penting" }),
      B({ uraian: "b", rab: 900, pok: 500, prioritas: "inti" }),
      B({ uraian: "c", rab: 900, pok: 100, prioritas: null }),
      B({ uraian: "d", rab: 900, pok: 900 }),
      B({ uraian: "e", rab: null, pok: 10, status: "belum", itemId: null }),
    ];
    const bk = bukuDariSandingan(baris, [{ kode: "inti", nama: "Inti", urut: 1 }, { kode: "penting", nama: "Penting", urut: 2 }]);
    expect(bk.map((x) => x.uraian)).toEqual(["b", "a", "c"]);
    expect(bk[0]).toMatchObject({ kurang: 400, prioritasNama: "Inti", kelompok: "52L" });
  });
});
