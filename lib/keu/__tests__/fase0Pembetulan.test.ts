// lib/keu/__tests__/fase0Pembetulan.test.ts
// (13 Nov 2026) Uji Fase 0: realisasi belum terpetakan, uraian biaya Gap, sisa hari tutup revisi, jumlah petugas dari lanjutan Final.
import { describe, expect, it } from "vitest";
import { realisasiLepas } from "../ro";
import { kalimatUraiGap, uraiGapRab, type RabSurveiGap } from "../gapRab";
import { lewatTutup, sisaHariTutup, statusTenggat } from "../revisi";
import { peranDariLanjutan, type RingkasPeran } from "../persiapanHilir";
import type { BarisRincian } from "../lanjutan";

describe("realisasiLepas (butir 1)", () => {
  it("menjumlah realisasi tanpa detail atau di luar lembar", () => {
    const r = realisasiLepas([{ detail_id: 1 }], [
      { detail_id: 1, real_sd: 100, pagu: 100 },
      { detail_id: null, real_sd: 25_800_000, pagu: 25_800_000, nomor_item: "000260", uraian: "a", akun_kode: "521213", komponen_kode: "005" },
      { detail_id: 9, real_sd: 5, pagu: 5 },
      { detail_id: null, real_sd: 0, pagu: 7 },
    ]);
    expect(r.n).toBe(2);
    expect(r.jumlah).toBe(25_800_005);
  });
});

const rinci = (akun: string, jumlah: number, uraian = "x"): BarisRincian => ({ kelompok: "Lain-lain", uraian, akun, volume: 1, satuan: "", tarif: jumlah, jumlah, catatan: "", perk: false });
const rab = (status: "siap" | "draf"): RabSurveiGap => ({
  status, berubah: 0,
  baris: [
    { akun: "521213", ket: "", volume: 1, satuan: "", harga: 20_370_000, jumlah: 20_370_000 },
    { akun: "524113", ket: "", volume: 1, satuan: "", harga: 16_320_000, jumlah: 16_320_000 },
    { akun: "524114", ket: "", volume: 1, satuan: "", harga: 8_625_000, jumlah: 8_625_000 },
  ],
});

describe("uraiGapRab (butir 2)", () => {
  it("Seruti TW IV: RAB 45.315.000 + honor instruktur 888.000 = 46.203.000", () => {
    const u = uraiGapRab([rinci("521213", 1), rinci("524113", 1), rinci("524114", 1), rinci("522151", 888_000, "honor instruktur"), { ...rinci("521211", 0), jumlah: null }], rab("siap"));
    expect(u.sumber).toBe("rab");
    expect(u.rab).toBe(45_315_000);
    expect(u.tambahan).toBe(888_000);
    expect(u.total).toBe(46_203_000);
    expect(u.akunTambahan.map((a) => a.akun)).toEqual(["522151"]);
    expect(kalimatUraiGap(u)).toContain("akun 522151");
  });
  it("RAB masih Draf: seluruhnya dari identifikasi", () => {
    const u = uraiGapRab([rinci("521213", 10), rinci("522151", 5)], rab("draf"));
    expect(u).toMatchObject({ sumber: "identifikasi", rab: 0, total: 15 });
  });
});

describe("sisaHariTutup (butir 4)", () => {
  it("sehari sesudah tutup = lewat 1 hari, bukan hari ini", () => {
    expect(sisaHariTutup("2026-11-12", "2026-11-13")).toBe(-1);
    expect(statusTenggat(sisaHariTutup("2026-11-12", "2026-11-13")).teks).toBe("lewat 1 hari");
    expect(statusTenggat(sisaHariTutup("2026-11-12", "2026-11-12")).teks).toBe("hari ini");
    expect(lewatTutup("dibuka", "2026-11-12", "2026-11-13")).toBe(true);
    expect(lewatTutup("dibuka", "2026-11-12", "2026-11-12")).toBe(false);
    expect(lewatTutup("terkumpul", "2026-11-12", "2026-11-13")).toBe(false);
  });
});

describe("peranDariLanjutan (butir 3)", () => {
  it("PML dari lanjutan Final (7+1), bukan awal (6+2); honor tetap dari awal", () => {
    const awal: RingkasPeran[] = [{ id: "pml", nama: "PML", jumlah: 8, organik: 6, mitra: 2, status: "Organik dan mitra", translok: true, honor: true }];
    const off = { on: false, nOrg: 0, nMit: 0, translok: false, penginapan: false, fix: false };
    const hasil = peranDariLanjutan(awal, { peran: { supervisor: off, kortim: off, ppl: off, entri: off, pml: { on: true, nOrg: 7, nMit: 1, translok: true, penginapan: false, fix: true } } });
    expect(hasil).toEqual([{ id: "pml", nama: "PML", jumlah: 8, organik: 7, mitra: 1, status: "Organik dan mitra", translok: true, honor: true }]);
  });
});
