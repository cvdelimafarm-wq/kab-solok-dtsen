import { describe, expect, it } from "vitest";
import { DRAF_KOSONG, bersihkanUbah, drafKosong, idBarisRincian, isiDrafKirim, normalisasiDraf, pangkasDraf, sidikDraf } from "../rabPerSurvei";

describe("draf RAB per survei (7 Nov 2026)", () => {
  it("normalisasi: bidang tak sah dibuang, hari tak sah tidak ikut", () => {
    const d = normalisasiDraf({
      hari: { a: "3", b: "x", c: "400", d: " 5 " }, mode: { Honor: "gabung", Rapat: "ngawur" }, tidak: ["k1", 5, "k1", "k2"],
      ubah: { k1: { volume: "12,5", harga: "56000", bulan_mulai: 13, minggu: 2, dobel: "pakai", pakaiId: 7, sampah: 1 }, k2: { volume: 9 }, k3: "x" },
    });
    expect(d.hari).toEqual({ a: "3", d: "5" });
    expect(d.mode.Honor).toBe("gabung");
    expect(d.mode.Rapat).toBe("periode");
    expect(d.tidak).toEqual(["k1", "k2"]);
    expect(d.ubah).toEqual({ k1: { volume: "12,5", harga: "56000", minggu: 2, dobel: "pakai", pakaiId: 7 } });
  });
  it("normalisasi: bukan objek -> draf kosong", () => {
    for (const x of [null, undefined, 5, "a", []]) expect(drafKosong(normalisasiDraf(x))).toBe(true);
    expect(drafKosong(DRAF_KOSONG)).toBe(true);
  });
  it("bersihkanUbah: nilai undefined dan tipe salah hilang; boolean dan enum dipertahankan", () => {
    expect(bersihkanUbah({ volume: undefined, tujuan: "pok:12", ubahNama: true, dobel: "baru", minggu: 0 })).toEqual({ tujuan: "pok:12", ubahNama: true, dobel: "baru" });
  });
  it("pangkas: rincian yang hilang atau sudah masuk RAB dibuang", () => {
    const d = normalisasiDraf({ tidak: ["a", "b", "c"], ubah: { a: { volume: "1" }, b: { volume: "2" }, c: { volume: "3" } } });
    const p = pangkasDraf(d, new Set(["a", "b"]), new Set(["b"]));
    expect(p.tidak).toEqual(["a"]);
    expect(Object.keys(p.ubah)).toEqual(["a"]);
  });
  it("sidik: tidak peka urutan kunci, peka isi; kirim = JSON polos", () => {
    const a = normalisasiDraf({ hari: { x: "1", y: "2" }, tidak: ["b", "a"] });
    const b = normalisasiDraf({ hari: { y: "2", x: "1" }, tidak: ["a", "b"] });
    expect(sidikDraf(a)).toBe(sidikDraf(b));
    expect(sidikDraf(a)).not.toBe(sidikDraf(normalisasiDraf({ hari: { x: "1", y: "3" }, tidak: ["a", "b"] })));
    expect(isiDrafKirim(a)).toMatchObject({ v: 1, hari: { x: "1", y: "2" } });
    expect(drafKosong(a)).toBe(false);
  });
  it("id baris rincian aman untuk atribut id", () => {
    expect(idBarisRincian("Honor|PML (mitra)|x")).toBe("rps-Honor_PML__mitra__x-baris");
    expect(idBarisRincian("k", "n")).toBe("rps-k-n");
  });
});
