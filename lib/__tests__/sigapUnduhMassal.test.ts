import { describe, expect, it } from "vitest";
import { MAKS_PER_ZIP, bagiBatch, namaZip, ringkasanMassal, unikanNama } from "../sigapUnduhMassal";

describe("bagiBatch", () => {
  it("membagi sesuai ukuran; sisa di batch terakhir", () => {
    expect(bagiBatch([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("kosong -> tanpa batch; ukuran tak sah -> minimal 1", () => {
    expect(bagiBatch([])).toEqual([]);
    expect(bagiBatch([1, 2], 0)).toEqual([[1], [2]]);
  });
  it("bawaan = MAKS_PER_ZIP", () => {
    const n = MAKS_PER_ZIP * 2 + 1;
    expect(bagiBatch(Array.from({ length: n }, (_, i) => i)).map((b) => b.length)).toEqual([MAKS_PER_ZIP, MAKS_PER_ZIP, 1]);
  });
});

describe("unikanNama", () => {
  it("nama kembar diberi akhiran sebelum ekstensi; tanpa pembedaan huruf besar/kecil", () => {
    const d = new Set<string>();
    expect(unikanNama("SPJ_A_Budi.pdf", d)).toBe("SPJ_A_Budi.pdf");
    expect(unikanNama("SPJ_A_Budi.pdf", d)).toBe("SPJ_A_Budi_2.pdf");
    expect(unikanNama("spj_a_budi.PDF", d)).toBe("spj_a_budi.PDF".replace(".PDF", "_3.PDF"));
  });
  it("tanpa ekstensi", () => {
    const d = new Set<string>();
    expect(unikanNama("x", d)).toBe("x");
    expect(unikanNama("x", d)).toBe("x_2");
  });
});

describe("namaZip", () => {
  it("satu ZIP tanpa penanda bagian; banyak ZIP memakai bagian-i-dari-n", () => {
    expect(namaZip("2907.BMA", "2026-10-23", 1, 1)).toBe("Paket_SPJ_2907_BMA_2026-10-23.zip");
    expect(namaZip("kegiatan-1", "2026-10-23", 2, 3)).toBe("Paket_SPJ_kegiatan-1_2026-10-23_bagian-2-dari-3.zip");
  });
  it("kode kosong -> SIGAP", () => {
    expect(namaZip("", "2026-10-23", 1, 1)).toBe("Paket_SPJ_SIGAP_2026-10-23.zip");
  });
});

describe("ringkasanMassal", () => {
  it("semua berhasil", () => {
    expect(ringkasanMassal({ berhasil: ["a", "b"], dilewati: [], dibatalkan: false }, 2)).toBe("2 dari 2 paket SPJ masuk ZIP.");
  });
  it("dilewati dan dibatalkan", () => {
    const t = ringkasanMassal({ berhasil: ["a"], dilewati: [{ nama: "Budi", alasan: "belum ada dokumen" }], dibatalkan: true }, 3);
    expect(t).toContain("1 dari 3");
    expect(t).toContain("(dibatalkan)");
    expect(t).toContain("Dilewati 1: Budi (belum ada dokumen)");
  });
  it("daftar dilewati dipotong 5", () => {
    const d = Array.from({ length: 7 }, (_, i) => ({ nama: `P${i}`, alasan: "x" }));
    const t = ringkasanMassal({ berhasil: [], dilewati: d, dibatalkan: false }, 7);
    expect(t).toContain("Dilewati 7");
    expect(t.endsWith("; …")).toBe(true);
    expect(t).not.toContain("P5");
  });
});
