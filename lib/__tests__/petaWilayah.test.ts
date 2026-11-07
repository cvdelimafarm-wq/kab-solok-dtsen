import { describe, expect, it } from "vitest";
import { batangSkala, berkasUntukSub, siapkanPetaSub, titikBatas } from "../petaWilayah";
import type { FiturBatas } from "../batasSubsls";

const ID = "1303040001000100";
const fitur: FiturBatas = {
  id: ID, nm: "RT 01", kd: "x", bb: [100.60, -0.80, 100.61, -0.79],
  g: [[[[100.60, -0.80], [100.61, -0.80], [100.61, -0.79], [100.60, -0.79], [100.60, -0.80]]]],
};
const kk = [
  { id: 1, nama_kk: "A", lat: -0.795, lng: 100.605 },
  { id: 2, nama_kk: "B", lat: -0.796, lng: 100.606 },
  { id: 3, nama_kk: "C", lat: null, lng: null },
  { id: 4, nama_kk: "D", lat: 999, lng: 100.6 },
];

describe("petaWilayah", () => {
  it("titikBatas meratakan semua sudut poligon dan aman untuk null", () => {
    expect(titikBatas(fitur)).toHaveLength(5);
    expect(titikBatas(null)).toEqual([]);
  });

  it("menggambar batas + KK ber-koordinat sah; KK tanpa/di luar koordinat dihitung terpisah", () => {
    const g = siapkanPetaSub(fitur, kk, new Map([[1, "utama" as const], [2, "cadangan" as const]]));
    expect(g).not.toBeNull();
    expect(g!.adaBatas).toBe(true);
    expect(g!.jalur.startsWith("M")).toBe(true);
    expect(g!.titik.map((t) => t.id).sort()).toEqual([1, 2]);
    expect(g!.tanpaKoordinat).toBe(2);
  });

  it("peran dipetakan dan yang bertanda digambar terakhir (di atas)", () => {
    const g = siapkanPetaSub(null, [{ id: 1, nama_kk: "A", lat: -0.79, lng: 100.6 }, { id: 2, nama_kk: "B", lat: -0.7901, lng: 100.6001 }, { id: 3, nama_kk: "C", lat: -0.7902, lng: 100.6002 }], new Map([[2, "utama" as const], [3, "cadangan" as const]]))!;
    expect(g.titik.map((t) => t.peran)).toEqual(["lain", "cadangan", "utama"]);
    expect(g.adaBatas).toBe(false);
  });

  it("tanpa batas dan tanpa koordinat: null (tidak ada yang digambar)", () => {
    expect(siapkanPetaSub(null, [{ id: 3, nama_kk: "C", lat: null, lng: null }], new Map())).toBeNull();
    expect(siapkanPetaSub(null, [], new Map())).toBeNull();
  });

  it("hanya batas (KK belum bertitik) tetap tergambar", () => {
    const g = siapkanPetaSub(fitur, [{ id: 3, nama_kk: "C", lat: null, lng: null }], new Map())!;
    expect(g.adaBatas).toBe(true);
    expect(g.titik).toHaveLength(0);
    expect(g.tanpaKoordinat).toBe(1);
  });

  it("titik tetap di dalam kanvas", () => {
    const g = siapkanPetaSub(fitur, kk, new Map())!;
    for (const t of g.titik) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(g.lebar);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(g.tinggi);
    }
  });

  it("batangSkala memilih panjang bulat yang muat; aman untuk skala tak sah", () => {
    const s = batangSkala(2);
    expect(s.meter).toBeGreaterThan(0);
    expect(s.lebar).toBeLessThanOrEqual(90);
    expect(batangSkala(0)).toEqual({ meter: 0, lebar: 0 });
    expect(batangSkala(NaN)).toEqual({ meter: 0, lebar: 0 });
  });

  it("berkasUntukSub memakai 7 digit kecamatan dan menolak id tak sah", () => {
    const m = { kecamatan: { "1303040": { berkas: "batas-1303040.json" } } };
    expect(berkasUntukSub(m, ID)).toBe("batas-1303040.json");
    expect(berkasUntukSub(m, "1303050001000100")).toBeNull();
    expect(berkasUntukSub(m, "123")).toBeNull();
    expect(berkasUntukSub(null, ID)).toBeNull();
  });
});
