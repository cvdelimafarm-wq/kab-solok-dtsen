import { describe, expect, it } from "vitest";
import { hurufCadangan, nomorPemotret, rekanKeHari, susunHari, type FotoHari } from "../sigapSusunHari";

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

describe("rekanKeHari (foto dari rekan ikut kisi nomor)", () => {
  const rf = (id: number, pemotret: string | null = "Dina Marizka") => ({ id, kegiatan_id: 1, tanggal: "2026-10-27", diambil_at: `2026-10-27T0${id % 9}:19:00.000Z`, pemotret });
  const tg = (id: number, status: string, slot: number | null, peran_tag = "tim") => ({ peran_tag, status, slot, foto: rf(id) });

  it("tag tim/luar_tim diterima atau ditahan bernomor; dilepas ke cadangan; diajukan/ditolak/pemotret tidak ikut", () => {
    const r = rekanKeHari([tg(1, "diterima", 3), tg(2, "ditahan", 4, "luar_tim"), tg(3, "dilepas", null), tg(4, "diajukan", null), tg(5, "ditolak", null), tg(6, "diterima", 2, "pemotret")]);
    expect(r.map((x) => x.id)).toEqual([1, 2, 3]);
    const s = susunHari(r);
    expect(s.nomor.map((n) => [n.slot, n.foto.id, n.ditahan])).toEqual([[3, 1, false], [4, 2, true]]);
    expect(s.cadangan.map((f) => f.id)).toEqual([3]);
  });

  it("label dari: nama pemotret; kosong atau '-' menjadi 'rekan'", () => {
    expect(rekanKeHari([tg(1, "diterima", 3)])[0].dari).toBe("Dina Marizka");
    expect(rekanKeHari([{ peran_tag: "tim", status: "diterima", slot: 1, foto: rf(1, null) }])[0].dari).toBe("rekan");
    expect(rekanKeHari([{ peran_tag: "tim", status: "diterima", slot: 1, foto: rf(1, "-") }])[0].dari).toBe("rekan");
  });

  it("tanpa foto diabaikan; foto yang sama tidak ganda; digabung dengan foto sendiri mengisi nomor 3", () => {
    expect(rekanKeHari([{ peran_tag: "tim", status: "diterima", slot: 1, foto: null }])).toEqual([]);
    expect(rekanKeHari([tg(1, "diterima", 3), tg(1, "diterima", 3)])).toHaveLength(1);
    const s = susunHari([foto(10, "00:45", 1), foto(11, "05:26", 2), foto(12, "04:39", 4), ...rekanKeHari([tg(1, "diterima", 3)])]);
    expect(s.nomor.map((n) => n.slot)).toEqual([1, 2, 3, 4]);
    expect(s.nomor.find((n) => n.slot === 3)?.foto).toMatchObject({ id: 1, dari: "Dina Marizka" });
  });
});

describe("hurufCadangan", () => {
  it("A, B, C ...", () => {
    expect([0, 1, 2].map(hurufCadangan)).toEqual(["A", "B", "C"]);
  });
});
