import { describe, expect, it } from "vitest";
import { hurufCadangan, nomorPemotret, susunHari, type FotoHari } from "../sigapSusunHari";

const foto = (id: number, jam: string, slot: number | null, status = "diterima", ekstra: FotoHari["tag"] = []): FotoHari => ({
  id,
  diambil_at: `2026-10-27T${jam}:00.000Z`,
  tag: [{ peran_tag: "pemotret", status, slot }, ...ekstra],
});

describe("nomorPemotret", () => {
  it("diterima dan ditahan bernomor; lainnya tidak", () => {
    expect(nomorPemotret(foto(1, "01:00", 3))).toEqual({ slot: 3, ditahan: false });
    expect(nomorPemotret(foto(1, "01:00", 3, "ditahan"))).toEqual({ slot: 3, ditahan: true });
    expect(nomorPemotret(foto(1, "01:00", 3, "dilepas"))).toBeNull();
    expect(nomorPemotret(foto(1, "01:00", 3, "diajukan"))).toBeNull();
    expect(nomorPemotret(foto(1, "01:00", null))).toBeNull();
  });
  it("tag rekan tidak dihitung dan foto tanpa tag pemotret tidak bernomor", () => {
    expect(nomorPemotret({ id: 1, diambil_at: "x", tag: [{ peran_tag: "rekan", status: "diterima", slot: 2 }] })).toBeNull();
    expect(nomorPemotret({ id: 1, diambil_at: "x", tag: [] })).toBeNull();
  });
});

describe("susunHari", () => {
  it("nomor urut naik walau jam pengambilan acak; cadangan dipisah", () => {
    const s = susunHari([foto(5, "08:05", 5), foto(1, "00:45", 1), foto(9, "05:30", null, "dilepas"), foto(3, "04:19", 3), foto(2, "04:00", 2), foto(8, "03:00", null, "diajukan")]);
    expect(s.nomor.map((n) => [n.slot, n.foto.id])).toEqual([[1, 1], [2, 2], [3, 3], [5, 5]]);
    expect(s.cadangan.map((f) => f.id)).toEqual([8, 9]); // urut jam
  });
  it("dua foto di nomor yang sama: yang terakhir diambil menang, yang awal ke cadangan", () => {
    const s = susunHari([foto(1, "01:00", 2), foto(2, "02:00", 2)]);
    expect(s.nomor.map((n) => n.foto.id)).toEqual([2]);
    expect(s.cadangan.map((f) => f.id)).toEqual([1]);
  });
  it("foto ditahan tetap di nomornya dan diberi tanda", () => {
    const s = susunHari([foto(1, "01:00", 1, "ditahan")]);
    expect(s.nomor[0]).toMatchObject({ slot: 1, ditahan: true });
  });
  it("kosong aman dan masukan tidak diubah", () => {
    expect(susunHari([])).toEqual({ nomor: [], cadangan: [] });
    const m = [foto(2, "02:00", 2), foto(1, "01:00", 1)];
    susunHari(m);
    expect(m.map((f) => f.id)).toEqual([2, 1]);
  });
});

describe("hurufCadangan", () => {
  it("A, B, C ...", () => {
    expect([0, 1, 2].map(hurufCadangan)).toEqual(["A", "B", "C"]);
  });
});
