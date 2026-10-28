import { describe, expect, it } from "vitest";
import { bangunLibur, daftarHariKerja, hariKerja, hariKerjaAntara, sisaHariKerja, tambahHariKerja, tenggatBayar, tenggatSpj } from "../hariKerja";

describe("hari kerja", () => {
  it("Senin sampai Jumat; akhir pekan dan libur bukan hari kerja", () => {
    expect(hariKerja("2026-11-02")).toBe(true);   // Senin
    expect(hariKerja("2026-11-07")).toBe(false);  // Sabtu
    expect(hariKerja("2026-11-08")).toBe(false);  // Minggu
    expect(hariKerja("2026-11-04", new Set(["2026-11-04"]))).toBe(false);
    expect(hariKerja("")).toBe(false);
    expect(hariKerja("2026-02-30")).toBe(false);
  });
  it("hanya libur aktif yang dihitung; tanggal tidak sah diabaikan", () => {
    const l = bangunLibur([{ tanggal: "2026-11-04", aktif: true }, { tanggal: "2026-11-05", aktif: false }, { tanggal: "2026-11-06" }, { tanggal: "x" }]);
    expect([...l].sort()).toEqual(["2026-11-04", "2026-11-06"]);
    expect(bangunLibur(null).size).toBe(0);
  });
  it("hari kerja antara: akhir pekan dan libur dikeluarkan", () => {
    expect(hariKerjaAntara("2026-03-01", "2026-03-05")).toBe(4);   // Minggu s.d. Kamis
    expect(hariKerjaAntara("2026-03-02", "2026-03-06")).toBe(5);
    expect(hariKerjaAntara("2026-03-02", "2026-03-06", new Set(["2026-03-04"]))).toBe(4);
    expect(hariKerjaAntara("2026-03-06", "2026-03-02")).toBe(0);
    expect(daftarHariKerja("2026-11-06", "2026-11-10")).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
  });
});

describe("tambahHariKerja dan tenggat", () => {
  it("melompati akhir pekan", () => {
    expect(tambahHariKerja("2026-11-06", 1)).toBe("2026-11-09"); // Jumat + 1 = Senin
    expect(tambahHariKerja("2026-11-06", 0)).toBe("2026-11-06");
    expect(tambahHariKerja("2026-11-02", 5)).toBe("2026-11-09");
  });
  it("melompati libur", () => {
    expect(tambahHariKerja("2026-11-06", 1, new Set(["2026-11-09"]))).toBe("2026-11-10");
  });
  it("tenggat SPJ 5 hari kerja dan pembayaran 10 hari kerja dari hari terakhir kegiatan", () => {
    expect(tenggatSpj("2026-11-05")).toBe("2026-11-12");   // Kamis 5 Nov -> Kamis 12 Nov
    expect(tenggatBayar("2026-11-05")).toBe("2026-11-19"); // 10 hari kerja
    expect(tenggatSpj("2026-11-05", new Set(["2026-11-09"]))).toBe("2026-11-13");
    expect(tenggatSpj("2026-11-05", new Set(), 3)).toBe("2026-11-10");
  });
  it("masukan tidak sah memberi kosong", () => {
    expect(tenggatSpj("")).toBe("");
    expect(tambahHariKerja("2026-11-05", -1)).toBe("");
    expect(tambahHariKerja("2026-11-05", 1.5)).toBe("");
  });
});

describe("sisaHariKerja", () => {
  it("positif sebelum tenggat, nol pada hari tenggat, negatif sesudahnya", () => {
    expect(sisaHariKerja("2026-11-09", "2026-11-12")).toBe(3);
    expect(sisaHariKerja("2026-11-12", "2026-11-12")).toBe(0);
    expect(sisaHariKerja("2026-11-14", "2026-11-12")).toBe(-1); // Sabtu: Jumat 13 terlewat
    expect(sisaHariKerja("2026-11-16", "2026-11-12")).toBe(-2);
    expect(sisaHariKerja("", "2026-11-12")).toBeNull();
  });
});
