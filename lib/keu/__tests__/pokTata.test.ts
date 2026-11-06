import { describe, expect, it } from "vitest";
import { susunAnggaran, type BarisLembar } from "../ro";
import { adaKebutuhan, arahGap, hitungItem, susunPohon, teksVolume, type Struktur } from "../pokTata";

const lembar = (id: number, komp: string, akun: string, uraian: string, volume: number, jumlah: number): BarisLembar => ({
  detail_id: id, ro_kode: "2906.BMA.006", komponen_kode: komp, akun_kode: akun, kunci_stabil: `K${id}`, nomor_item: null, uraian, volume, satuan: "OK", jumlah,
});
const LEMBAR = [lembar(1, "005", "521213", "honor A", 10, 1000), lembar(2, "005", "521213", "honor B", 5, 500), lembar(3, "051", "524119", "pelatihan", 2, 2000)];
const STRUKTUR: Struktur[] = [
  { detail_id: 1, komponen_kode: "005", komponen_nama: "Dukungan", sub_kode: "A", sub_nama: "TANPA SUB KOMPONEN" },
  { detail_id: 2, komponen_kode: "005", komponen_nama: "Dukungan", sub_kode: "B", sub_nama: "Sub kedua" },
  { detail_id: 3, komponen_kode: "051", komponen_nama: "PERSIAPAN", sub_kode: "A", sub_nama: "TANPA SUB KOMPONEN" },
];
const REAL = [{ detail_id: 1, real_sd: 400, pagu: 1000 }, { detail_id: 3, real_sd: 2500, pagu: 2000 }];
const NAMA = new Map([["521213", "Belanja Honor Output Kegiatan"], ["524119", "Belanja Perjalanan Dinas Paket Meeting Luar Kota"]]);
const RO = { kode: "2906.BMA.006", nama: "Survei Sosial Ekonomi Nasional" };
const rabItem = (kunci: string, jumlah: number, status: string, selesai = false) => ({ pok_kunci: kunci, baru: false, status, jumlah_rab: jumlah, selesai });

describe("hitungItem", () => {
  const dasar = { detail_id: 1, kunci: "K", komponen: "005", akun: "521213", nomor_item: null, uraian: "x", volume: 10, satuan: "OK", pok: 1000, realisasi: 400, rab: null, statusRab: null, selesai: false } as const;
  it("tanpa RAB: sisa kebutuhan dan gap kosong, bukan nol", () => {
    const i = hitungItem({ ...dasar });
    expect(i).toMatchObject({ sisaPagu: 600, sisa: null, gap: null, harga: 100 });
    expect(adaKebutuhan({ ...dasar })).toBe(false);
  });
  it("RAB berstatus belum (baris RAB kosong) dianggap belum ber-RAB", () => {
    expect(hitungItem({ ...dasar, rab: 0, statusRab: "belum" })).toMatchObject({ sisa: null, gap: null });
  });
  it("RAB di bawah pagu: sisa = RAB - realisasi, gap positif", () => {
    expect(hitungItem({ ...dasar, rab: 800, statusRab: "sama" })).toMatchObject({ sisa: 400, gap: 200 });
  });
  it("RAB melebihi pagu: gap negatif", () => {
    expect(hitungItem({ ...dasar, rab: 1500, statusRab: "rinci" })).toMatchObject({ sisa: 1100, gap: -500 });
  });
  it("realisasi melebihi RAB: sisa kebutuhan 0, gap = sisa pagu", () => {
    expect(hitungItem({ ...dasar, realisasi: 900, rab: 800, statusRab: "sama" })).toMatchObject({ sisa: 0, gap: 100 });
    expect(hitungItem({ ...dasar, realisasi: 1200, rab: 800, statusRab: "sama" })).toMatchObject({ sisa: 0, gap: -200 });
  });
  it("selesai: sisa kebutuhan 0 walau tanpa RAB; gap = sisa pagu", () => {
    expect(hitungItem({ ...dasar, selesai: true, statusRab: "selesai" })).toMatchObject({ sisa: 0, gap: 600 });
  });
});

describe("susunPohon", () => {
  it("komponen > sub > akun > item, dengan nama dari struktur dan akun", () => {
    const p = susunPohon(susunAnggaran(LEMBAR, REAL, []), STRUKTUR, NAMA, RO);
    expect(p.komponen.map((k) => [k.kode, k.nama])).toEqual([["005", "Dukungan"], ["051", "PERSIAPAN"]]);
    expect(p.komponen[0].sub.map((s) => [s.kode, s.nama])).toEqual([["A", "TANPA SUB KOMPONEN"], ["B", "Sub kedua"]]);
    expect(p.komponen[0].sub[0].akun[0]).toMatchObject({ kode: "521213", nama: "Belanja Honor Output Kegiatan" });
    expect(p.total).toMatchObject({ pok: 3500, realisasi: 2900, sisaPagu: 600, nItem: 3, nBerRab: 0, sisa: null, gap: null });
  });
  it("tanpa struktur: satu sub A per komponen dan nama komponen baku", () => {
    const p = susunPohon(susunAnggaran(LEMBAR, REAL, []), null, NAMA, RO);
    expect(p.komponen[1]).toMatchObject({ kode: "051", nama: "Persiapan" });
    expect(p.komponen[0].sub).toHaveLength(1);
    expect(p.komponen[0].sub[0]).toMatchObject({ kode: "A", nama: "TANPA SUB KOMPONEN" });
    expect(p.komponen[0].total.pok).toBe(1500);
  });
  it("sisa kebutuhan dan gap tingkat atas hanya bila semua item di bawahnya ber-RAB", () => {
    const sebagian = susunPohon(susunAnggaran(LEMBAR, REAL, [rabItem("K1", 800, "sama"), rabItem("K2", 500, "sama")]), STRUKTUR, NAMA, RO);
    expect(sebagian.komponen[0].total).toMatchObject({ nBerRab: 2, rab: 1300, sisa: 400 + 500, gap: (600 - 400) + (500 - 500) });
    expect(sebagian.komponen[1].total).toMatchObject({ nBerRab: 0, sisa: null, gap: null });
    expect(sebagian.total).toMatchObject({ nItem: 3, nBerRab: 2, sisa: null, gap: null });
    const penuh = susunPohon(susunAnggaran(LEMBAR, REAL, [rabItem("K1", 800, "sama"), rabItem("K2", 500, "sama"), rabItem("K3", 2000, "sama")]), STRUKTUR, NAMA, RO);
    expect(penuh.total).toMatchObject({ nBerRab: 3, sisa: 400 + 500 + 0, gap: 200 + 0 + (-500 - 0) });
  });
});

describe("pembantu tampilan", () => {
  it("teksVolume dan arahGap", () => {
    expect(teksVolume(20)).toBe("20"); expect(teksVolume(1.5)).toBe("1,5"); expect(teksVolume(1598)).toBe("1.598");
    expect([arahGap(5), arahGap(-5), arahGap(0), arahGap(null)]).toEqual(["lebih", "kurang", "pas", "belum"]);
  });
});
