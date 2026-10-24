import { describe, expect, it } from "vitest";
import { KEPALA_BUKU, lembarBuku, ringkasBuku, type CatatanKek } from "../bukuselisih";

const c = (id: number, ro: string, kel: string, pri: string, urut: number, jumlah: number, o: Partial<CatatanKek> = {}): CatatanKek => ({
  id, ro_kode: ro, kro_kode: ro.slice(0, 8), akun_kode: "521211", kelompok_kode: kel, uraian: `u${id}`, jumlah, prioritas_kode: pri, prioritas_nama: pri, prioritas_urut: urut, status: "tercatat", terbuka: true, kali_ditunda: 0, ...o,
});
const data = [
  c(1, "2906.BMA.005", "52L", "inti", 1, 1_000_000), c(2, "2906.BMA.005", "524", "tunda", 3, 5_000_000), c(3, "2903.BMA.001", "52L", "penting", 2, 2_000_000),
  c(4, "2903.BMA.001", "51", "inti", 1, 500_000, { status: "ditunda", kali_ditunda: 1 }), c(5, "2903.BMA.002", "53", "inti", 1, 9_000_000, { terbuka: false, status: "dipenuhi" }),
];

describe("ringkasBuku", () => {
  it("hanya menghitung catatan terbuka", () => {
    const r = ringkasBuku(data);
    expect(r.nCatatan).toBe(4); expect(r.total).toBe(8_500_000); expect(r.nRo).toBe(2); expect(r.nDitunda).toBe(1);
  });
  it("menjumlah per kelompok tetap empat baris", () => {
    const r = ringkasBuku(data);
    expect(r.perKelompok.map((k) => [k.kode, k.jumlah, k.n])).toEqual([["51", 500_000, 1], ["524", 5_000_000, 1], ["52L", 3_000_000, 2], ["53", 0, 0]]);
  });
  it("urut prioritas dan urut RO menurut kekurangan Inti", () => {
    const r = ringkasBuku(data);
    expect(r.perPrioritas.map((p) => p.kode)).toEqual(["inti", "penting", "tunda"]);
    expect(r.perRo.map((x) => x.ro)).toEqual(["2906.BMA.005", "2903.BMA.001"]);
    expect(r.perRo[1].baris.map((b) => b.id)).toEqual([4, 3]);
  });
  it("menyaring per kelompok dan prioritas", () => {
    expect(ringkasBuku(data, { kelompok: "52L" }).nCatatan).toBe(2);
    expect(ringkasBuku(data, { prioritas: "inti" }).total).toBe(1_500_000);
    expect(ringkasBuku([]).nRo).toBe(0);
  });
});

describe("lembarBuku", () => {
  it("memuat kepala, satu baris per catatan terbuka, dan total", () => {
    const l = lembarBuku(ringkasBuku(data), "Semua");
    expect(l[3]).toEqual([...KEPALA_BUKU]);
    expect(l.length).toBe(4 + 4 + 1);
    expect(l[l.length - 1]).toEqual(["Total", "", "", "", "", "", 8_500_000]);
    expect(l[4][0]).toBe("2906.BMA.005");
  });
  it("mengikuti penyaring", () => {
    const l = lembarBuku(ringkasBuku(data, { kelompok: "524" }), "Kelompok 524");
    expect(l.length).toBe(4 + 1 + 1);
    expect(l[l.length - 1][6]).toBe(5_000_000);
  });
});
