import { describe, expect, it } from "vitest";
import { adaSaring, lolosSaring, nilaiBeda, putarUrut, terapkanTabel, type Saring, type Urut } from "../sigapTabelKolom";

type R = { nama: string; peran: string; hari: number };
type K = "nama" | "peran" | "hari";
const nilai = (r: R, k: K) => r[k];
const data: R[] = [
  { nama: "Budi", peran: "pml", hari: 10 },
  { nama: "andi", peran: "ppl", hari: 9 },
  { nama: "Citra", peran: "ppl", hari: 11 },
  { nama: "Dedi", peran: "korwil", hari: 9 },
];

describe("tabel kolom", () => {
  it("lolosSaring: cari mengandung (tanpa beda huruf) dan filter nilai, digabung (AND)", () => {
    expect(lolosSaring(data[1], { nama: { q: "AN", pilih: [] } }, nilai)).toBe(true);
    expect(lolosSaring(data[0], { nama: { q: "an", pilih: [] } }, nilai)).toBe(false);
    expect(lolosSaring(data[1], { peran: { q: "", pilih: ["ppl", "pml"] } }, nilai)).toBe(true);
    expect(lolosSaring(data[3], { peran: { q: "", pilih: ["ppl", "pml"] } }, nilai)).toBe(false);
    expect(lolosSaring(data[1], { peran: { q: "", pilih: ["ppl"] }, nama: { q: "zz", pilih: [] } }, nilai)).toBe(false);
    expect(lolosSaring(data[0], { hari: { q: "", pilih: ["10"] } }, nilai)).toBe(true);
  });
  it("adaSaring", () => {
    expect(adaSaring<K>({})).toBe(false);
    expect(adaSaring<K>({ nama: { q: " ", pilih: [] } })).toBe(false);
    expect(adaSaring<K>({ nama: { q: "a", pilih: [] } })).toBe(true);
    expect(adaSaring<K>({ peran: { q: "", pilih: ["x"] } })).toBe(true);
  });
  it("nilaiBeda: unik; angka numerik, teks abjad", () => {
    expect(nilaiBeda(data, "hari", nilai, true)).toEqual(["9", "10", "11"]);
    expect(nilaiBeda(data, "nama", nilai, false)).toEqual(["andi", "Budi", "Citra", "Dedi"]);
  });
  it("putarUrut: naik, turun, tanpa; kolom lain mulai naik", () => {
    let u: Urut<K> = null;
    u = putarUrut(u, "nama");
    expect(u).toEqual({ kolom: "nama", arah: "naik" });
    u = putarUrut(u, "nama");
    expect(u).toEqual({ kolom: "nama", arah: "turun" });
    expect(putarUrut(u, "nama")).toBeNull();
    expect(putarUrut(u, "hari")).toEqual({ kolom: "hari", arah: "naik" });
  });
  it("terapkanTabel: saring + urut, stabil, array asal tidak berubah", () => {
    const asal = [...data];
    const s: Saring<K> = { peran: { q: "", pilih: ["ppl", "korwil"] } };
    expect(terapkanTabel(data, s, { kolom: "hari", arah: "naik" }, nilai).map((r) => r.nama)).toEqual(["andi", "Dedi", "Citra"]);
    expect(terapkanTabel(data, s, { kolom: "hari", arah: "turun" }, nilai).map((r) => r.nama)).toEqual(["Citra", "andi", "Dedi"]);
    expect(terapkanTabel(data, {}, { kolom: "nama", arah: "naik" }, nilai).map((r) => r.nama)).toEqual(["andi", "Budi", "Citra", "Dedi"]);
    expect(terapkanTabel(data, {}, null, nilai)).toEqual(asal);
    expect(data).toEqual(asal);
  });
});
