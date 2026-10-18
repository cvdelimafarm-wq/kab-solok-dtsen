import { describe, expect, it } from "vitest";
import { pilihanNonaktif, type SubTim } from "@/lib/pendataan";

// (18 Okt 2026) Sub SLS non aktif (dibekukan admin) tidak boleh diajukan PML untuk pendataan/FASIH.
const s = (idsubsls: string, nonaktif?: boolean): SubTim => ({ idsubsls, kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "01", nonaktif });

describe("pilihanNonaktif", () => {
  const sub = [s("A", true), s("B"), s("C", false), s("D", true)];
  it("mengembalikan hanya pilihan yang non aktif", () => {
    expect(pilihanNonaktif(sub, ["A", "B", "C", "D"])).toEqual(["A", "D"]);
  });
  it("kosong bila semua pilihan aktif", () => {
    expect(pilihanNonaktif(sub, ["B", "C"])).toEqual([]);
  });
  it("kolom nonaktif belum ada (sebelum migrasi) dianggap aktif", () => {
    expect(pilihanNonaktif([{ idsubsls: "X" }], ["X"])).toEqual([]);
  });
  it("id yang tidak ada di daftar tim tidak dianggap non aktif (dijaga pemeriksaan wilayah tim)", () => {
    expect(pilihanNonaktif(sub, ["Z"])).toEqual([]);
  });
});
