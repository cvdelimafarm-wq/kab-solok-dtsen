import { describe, expect, it } from "vitest";
import { alasanSah, awalRab, bacaRab, bolehUbah, cocokDenganPok, paguPok, pilihVersi, selisihBaris, ubahBaris, versiBaru, versiDipilih, versiTerakhir } from "../anggaranRabUji";
import { jumlahBaris, pasangkanRevisi, totalRab } from "../anggaranRab";
import type { DetailPok } from "../perencanaanPok";

const pok = (o: Partial<DetailPok> & Pick<DetailPok, "uraian" | "jumlah">): DetailPok => ({
  id: o.uraian,
  roId: "ro1",
  komponen: "051",
  subKomponen: "A",
  akun: "521213",
  volume: null,
  satuan: "",
  harga: null,
  ...o,
});
const POK: DetailPok[] = [
  pok({ uraian: "Honor petugas pencacah", akun: "521213", volume: 100, satuan: "OK", harga: 500_000, jumlah: 50_000_000 }),
  pok({ uraian: "Transport lokal", akun: "524113", jumlah: 10_000_000 }),
];
const T = "2026-10-22T00:00:00.000Z";

describe("awalRab", () => {
  it("v1 = salinan POK, total sama dengan pagu, terkunci", () => {
    const r = awalRab(POK, T);
    expect(r.versi).toHaveLength(1);
    expect(totalRab(versiTerakhir(r).baris)).toBe(paguPok(POK));
    expect(r.terpilih).toBe(1);
    expect(bolehUbah(r, 1)).toBe(false);
    expect(ubahBaris(r, 1, 0, { volume: 1 })).toBe(r);
  });
});

describe("versiBaru", () => {
  it("menolak alasan pendek, menyalin versi terakhir, rentang mengikuti nomor versi", () => {
    const r1 = awalRab(POK, T);
    expect(versiBaru(r1, "pendek", T)).toBeNull();
    expect(alasanSah("sudah cukup panjang")).toBe(true);
    const r2 = versiBaru(r1, "Penugasan petugas sudah final", T)!;
    expect(r2.versi.map((v) => v.no)).toEqual([1, 2]);
    expect(versiTerakhir(r2).rentangPersen).toBe(14);
    expect(r2.terpilih).toBe(2);
    expect(totalRab(versiTerakhir(r2).baris)).toBe(totalRab(r1.versi[0].baris));
    expect(r2.versi[0].baris).not.toBe(r2.versi[1].baris);
  });
  it("versi lama tidak ikut berubah saat versi baru diubah (RAB tidak pernah ditimpa)", () => {
    const r2 = versiBaru(awalRab(POK, T), "Penugasan petugas sudah final", T)!;
    const r2b = ubahBaris(r2, 2, 0, { volume: 80 });
    expect(jumlahBaris(r2b.versi[1].baris[0])).toBe(80 * 500_000);
    expect(jumlahBaris(r2b.versi[0].baris[0])).toBe(50_000_000);
  });
});

describe("ubahBaris", () => {
  const r2 = versiBaru(awalRab(POK, T), "Penugasan petugas sudah final", T)!;
  it("hanya versi terakhir (>1) yang boleh diubah; versi lama terkunci setelah versi baru dibuat", () => {
    const r3 = versiBaru(r2, "Realisasi transport pekan pertama", T)!;
    expect(bolehUbah(r3, 3)).toBe(true);
    expect(bolehUbah(r3, 2)).toBe(false);
    expect(ubahBaris(r3, 2, 0, { volume: 1 })).toBe(r3);
  });
  it("menolak angka negatif/NaN dan indeks di luar jangkauan", () => {
    expect(ubahBaris(r2, 2, 0, { volume: -1 })).toBe(r2);
    expect(ubahBaris(r2, 2, 0, { harga: Number.NaN })).toBe(r2);
    expect(ubahBaris(r2, 2, 9, { volume: 1 })).toBe(r2);
  });
  it("rentang hanya menerima 0-100", () => {
    expect(versiTerakhir(ubahBaris(r2, 2, 0, { rentangPersen: 9 })).rentangPersen).toBe(9);
    expect(versiTerakhir(ubahBaris(r2, 2, 0, { rentangPersen: 150 })).rentangPersen).toBe(14);
  });
});

describe("pilihVersi / versiDipilih", () => {
  it("memilih versi yang ada; nomor tak dikenal diabaikan", () => {
    const r2 = versiBaru(awalRab(POK, T), "Penugasan petugas sudah final", T)!;
    expect(versiDipilih(pilihVersi(r2, 1)).no).toBe(1);
    expect(pilihVersi(r2, 9)).toBe(r2);
  });
});

describe("bacaRab", () => {
  it("bolak-balik JSON, dan data rusak diabaikan per RO", () => {
    const r = versiBaru(awalRab(POK, T), "Penugasan petugas sudah final", T)!;
    const baca = bacaRab(JSON.stringify({ ro1: r, ro2: { versi: [{ no: "x" }] }, ro3: 5 }));
    expect(Object.keys(baca)).toEqual(["ro1"]);
    expect(baca.ro1.versi).toHaveLength(2);
    expect(baca.ro1.terpilih).toBe(2);
  });
  it("kosong / bukan JSON / bukan objek -> {}", () => {
    expect(bacaRab(null)).toEqual({});
    expect(bacaRab("{rusak")).toEqual({});
    expect(bacaRab("[1,2]")).toEqual({});
  });
  it("terpilih yang tidak ada dikembalikan ke versi terakhir", () => {
    const r = awalRab(POK, T);
    expect(bacaRab(JSON.stringify({ ro1: { ...r, terpilih: 7 } })).ro1.terpilih).toBe(1);
  });
});

describe("selisihBaris & pasangan revisi", () => {
  it("v1 -> semua selisih 0; setelah volume dikurangi muncul sisa pada baris itu", () => {
    const r1 = awalRab(POK, T);
    expect(selisihBaris(POK, versiTerakhir(r1).baris, "2907", "2907.BMA.009").every((s) => s.selisih === 0)).toBe(true);
    const r2 = ubahBaris(versiBaru(r1, "Penugasan petugas sudah final", T)!, 2, 0, { volume: 80 });
    const s = selisihBaris(POK, versiTerakhir(r2).baris, "2907", "2907.BMA.009");
    expect(s[0].selisih).toBe(10_000_000);
    expect(s[1].selisih).toBe(0);
  });
  it("sisa di satu RO menutup kekurangan RO lain (antar RO)", () => {
    const a = selisihBaris([pok({ uraian: "A", jumlah: 100 })], [{ kunci: null, akun: "x", uraian: "A", volume: 1, satuan: "P", harga: 60 }], "2907", "2907.BMA.009");
    const b = selisihBaris([pok({ uraian: "B", jumlah: 100 })], [{ kunci: null, akun: "x", uraian: "B", volume: 1, satuan: "P", harga: 130 }], "2907", "2907.QDB.001");
    // baris POK tanpa kunci RAB cocok dianggap RAB 0 -> selisih = pagu; baris luar-POK menambah kebutuhan
    const hasil = pasangkanRevisi([...a, ...b]);
    expect(hasil.totalDigeser).toBeGreaterThan(0);
    expect(hasil.pasangan.every((p) => p.jenis === "antar_ro" || p.jenis === "dalam_ro")).toBe(true);
  });
  it("baris RAB di luar POK dihitung sebagai kekurangan", () => {
    const s = selisihBaris([], [{ kunci: null, akun: "x", uraian: "Tambahan", volume: 2, satuan: "P", harga: 50 }], "2907", "R");
    expect(s).toHaveLength(1);
    expect(s[0].selisih).toBe(-100);
  });
});

describe("cocokDenganPok", () => {
  it("selaras bila POK sama dengan v1", () => {
    const r = awalRab(POK, T);
    expect(cocokDenganPok(r, POK)).toEqual({ sama: true, paguV1: 60_000_000, paguPok: 60_000_000, baru: 0, hilang: 0 });
  });
  it("versi berikutnya yang berbeda tidak membuat RAB dianggap basi", () => {
    const r2 = ubahBaris(versiBaru(awalRab(POK, T), "Penugasan petugas sudah final", T)!, 2, 0, { volume: 10 });
    expect(cocokDenganPok(r2, POK).sama).toBe(true);
  });
  it("basi bila POK direset ke baris lain", () => {
    const r = awalRab(POK, T);
    const lain = [pok({ uraian: "Baris lain", jumlah: 5_000_000 })];
    const c = cocokDenganPok(r, lain);
    expect(c.sama).toBe(false);
    expect(c.baru).toBe(1);
    expect(c.hilang).toBe(2);
  });
  it("basi bila pagu baris berubah walau kunci sama", () => {
    const r = awalRab(POK, T);
    const ubah = POK.map((d, i) => (i === 1 ? { ...d, jumlah: 12_000_000 } : d));
    const c = cocokDenganPok(r, ubah);
    expect(c.sama).toBe(false);
    expect(c.baru + c.hilang).toBe(0);
    expect(c.paguPok).toBe(62_000_000);
  });
});
