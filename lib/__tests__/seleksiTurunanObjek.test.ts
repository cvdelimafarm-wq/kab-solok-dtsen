import { describe, expect, it } from "vitest";
import { kodeKelompok, tingkatKelompok, wilayahDariObjek, type NamaWilayahMin } from "../seleksiTurunanObjek";

const SLS_A = "13030100010001"; // 14 digit
const SLS_B = "13030100010002";
const nama = new Map<string, NamaWilayahMin>([
  [SLS_A, { kecamatan: "Lembah Gumanti", nagari: "Alahan Panjang", sls: "Jorong A" }],
  [SLS_B, { kecamatan: "Lembah Gumanti", nagari: "Alahan Panjang", sls: "Jorong B" }],
  ["1303010001", { kecamatan: "Lembah Gumanti", nagari: "Alahan Panjang", sls: "" }],
]);

describe("kodeKelompok", () => {
  it("memotong ke panjang tingkat; sub SLS naik ke SLS", () => {
    expect(kodeKelompok(SLS_A + "01", "sub_sls")).toBe(SLS_A);
    expect(kodeKelompok(SLS_A, "nagari")).toBe("1303010001");
    expect(kodeKelompok(SLS_A, "kecamatan")).toBe("1303010");
  });
  it("kosong, bukan angka, atau terlalu pendek = null", () => {
    expect(kodeKelompok(null, "sls")).toBeNull();
    expect(kodeKelompok("13030100", "nagari")).toBeNull();
    expect(kodeKelompok("abc", "kecamatan")).toBeNull();
  });
  it("tingkatKelompok", () => expect(tingkatKelompok("sub_sls")).toBe("sls"));
});

describe("wilayahDariObjek", () => {
  const baris = [
    { kode_wilayah: SLS_A + "01", jumlah: 1, lat: -1.0, lng: 100.0 },
    { kode_wilayah: SLS_A + "02", jumlah: 4, lat: -1.2, lng: 100.2 },
    { kode_wilayah: SLS_B + "01", jumlah: 2, lat: null, lng: null },
    { kode_wilayah: null, jumlah: 9, lat: null, lng: null },
  ];
  it("mengelompokkan per SLS, menjumlah, merata-ratakan titik, dan menghitung tanpa wilayah", () => {
    const h = wilayahDariObjek(baris, "sub_sls", nama);
    expect(h.jumlah_wilayah).toBe(2);
    expect(h.sampel).toBe(7);
    expect(h.tanpa_wilayah).toBe(1);
    expect(h.tak_dikenal).toBe(0);
    const a = h.wilayah.find((w) => w.kode === SLS_A)!;
    expect(a).toMatchObject({ nama: "Alahan Panjang · Jorong A", kecamatan: "LEMBAH GUMANTI", nagari: "ALAHAN PANJANG", jumlah_sampel: 5, lat: -1.1, lng: 100.1 });
  });
  it("titik SLS dari master dipakai bila objek tanpa titik", () => {
    const h = wilayahDariObjek(baris, "sub_sls", nama, new Map([[SLS_B, { lat: -2, lng: 101 }]]));
    expect(h.wilayah.find((w) => w.kode === SLS_B)).toMatchObject({ lat: -2, lng: 101 });
  });
  it("tingkat nagari: nama = nagari, tanpa titik master", () => {
    const h = wilayahDariObjek(baris, "nagari", nama, new Map([["1303010001", { lat: 9, lng: 9 }]]));
    expect(h.jumlah_wilayah).toBe(1);
    expect(h.wilayah[0]).toMatchObject({ kode: "1303010001", nama: "Alahan Panjang", jumlah_sampel: 7 });
  });
  it("kode tak dikenal diberi nama sementara dan dihitung", () => {
    const h = wilayahDariObjek([{ kode_wilayah: "99999999999999", jumlah: 3, lat: null, lng: null }], "sls", nama);
    expect(h.tak_dikenal).toBe(1);
    expect(h.wilayah[0]).toMatchObject({ nama: "Wilayah 99999999999999", kecamatan: null, jumlah_sampel: 3 });
  });
  it("memotong sesuai batas wilayah", () => {
    const h = wilayahDariObjek(baris, "sub_sls", nama, new Map(), 1);
    expect(h.wilayah).toHaveLength(1);
    expect(h.terpotong).toBe(1);
  });
  it("jumlah tidak sah dihitung 1", () => {
    const h = wilayahDariObjek([{ kode_wilayah: SLS_A, jumlah: 0, lat: null, lng: null }], "sls", nama);
    expect(h.sampel).toBe(1);
  });
});
