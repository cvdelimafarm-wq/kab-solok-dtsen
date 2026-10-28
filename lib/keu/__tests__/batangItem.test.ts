import { describe, expect, it } from "vitest";
import { sumbanganDariBaris, susunBatang } from "../batangItem";

const s = (id: string, nama: string, volume: number, jumlah: number | null = volume * 170000) => ({ id, nama, volume, jumlah });
const KASUS = [s("a", "IMK bulanan", 2), s("b", "IMK tahunan", 100), s("c", "Industri besar", 70)];

describe("susunBatang", () => {
  it("contoh pengguna: 150 OK diisi 2 + 100 + 70 = 172, lebih 22", () => {
    const h = susunBatang({ volume: 150, pagu: 25500000 }, KASUS);
    expect(h).toMatchObject({ total: 172, kapasitas: 150, lebih: 22, sisa: 0, status: "lebih" });
    expect(h.segmen.map((x) => x.nilai)).toEqual([2, 100, 70]);
    expect(h.segmen.map((x) => x.bagian.toFixed(3))).toEqual(["0.012", "0.581", "0.407"]);
    expect(h.segmen[0].lewat).toBe(0);
    expect(h.segmen[1].lewat).toBe(0);
    // segmen ketiga: 102..172, batas 150 -> 22 dari 70 melewati batas
    const k = h.segmen[2];
    expect(k.lewat).toBeGreaterThan(0);
    expect(k.lewat / k.lebar).toBeCloseTo(22 / 70, 2);
  });
  it("posisi segmen berurutan dan tidak melebihi sumbang", () => {
    const h = susunBatang({ volume: 150, pagu: 1 }, KASUS);
    for (let i = 1; i < h.segmen.length; i++) expect(h.segmen[i].kiri).toBeCloseTo(h.segmen[i - 1].kiri + h.segmen[i - 1].lebar, 2);
    const akhir = h.segmen[2].kiri + h.segmen[2].lebar;
    expect(akhir).toBeLessThanOrEqual(100.001);
    expect(h.garis).toBeLessThan(akhir);
  });
  it("kurang: sisa ditampilkan dan garis batas di kanan batang", () => {
    const h = susunBatang({ volume: 150, pagu: 1 }, [s("a", "A", 60), s("b", "B", 40)]);
    expect(h).toMatchObject({ total: 100, sisa: 50, lebih: 0, status: "kurang" });
    expect(h.sisaKiri + h.sisaLebar).toBeCloseTo(h.garis, 1);
    expect(h.segmen.every((x) => x.lewat === 0)).toBe(true);
  });
  it("pas dan kosong", () => {
    expect(susunBatang({ volume: 150, pagu: 1 }, [s("a", "A", 150)]).status).toBe("pas");
    const k = susunBatang({ volume: 150, pagu: 1 }, []);
    expect(k.status).toBe("kosong"); expect(k.segmen).toEqual([]);
  });
  it("dasar rupiah memakai jumlah; null dianggap nol; nilai nol diabaikan", () => {
    const h = susunBatang({ volume: 150, pagu: 25500000 }, [s("a", "A", 100, 17000000), s("b", "B", 50, null), s("c", "C", 0, 0)], "rupiah");
    expect(h.total).toBe(17000000);
    expect(h.segmen).toHaveLength(1);
    expect(h.status).toBe("kurang"); expect(h.sisa).toBe(8500000);
  });
  it("kapasitas nol: semua sumbangan melewati batas", () => {
    const h = susunBatang({ volume: 0, pagu: 0 }, [s("a", "A", 5)]);
    expect(h.status).toBe("lebih"); expect(h.lebih).toBe(5);
  });
});

describe("sumbanganDariBaris", () => {
  it("baris satu survei dijumlahkan; tanpa ident menjadi 'Lainnya'", () => {
    const r = sumbanganDariBaris([
      { ident_id: 6, nama: "IMK", volume: 10, jumlah: 100 }, { ident_id: 6, nama: "IMK", volume: 5, jumlah: 50 },
      { ident_id: null, nama: "x", volume: 3, jumlah: null }, { ident_id: 7, nama: "IBS", volume: 1, jumlah: null },
    ]);
    expect(r).toEqual([
      { id: "s6", nama: "IMK", volume: 15, jumlah: 150 },
      { id: "lain", nama: "Lainnya (di luar identifikasi)", volume: 3, jumlah: null },
      { id: "s7", nama: "IBS", volume: 1, jumlah: null },
    ]);
  });
  it("jumlah menjadi null bila salah satu baris tanpa harga", () => {
    const r = sumbanganDariBaris([{ ident_id: 1, nama: "A", volume: 1, jumlah: 10 }, { ident_id: 1, nama: "A", volume: 1, jumlah: null }]);
    expect(r[0].jumlah).toBeNull();
  });
});
