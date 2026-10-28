// lib/keu/__tests__/gapRab.test.ts
//
// (28 Okt 2026) Uji sambungan RAB per survei ke Gap.

import { describe, expect, it } from "vitest";
import type { BarisRincian } from "../lanjutan";
import { rincianUntukGap, susunRabSurveiGap, temuanRabSurvei, type RabSurveiGap } from "../gapRab";

const r = (akun: string, jumlah: number, uraian = "u"): BarisRincian => ({ kelompok: "Rapat", uraian, akun, volume: 1, satuan: "x", tarif: jumlah, jumlah, catatan: "", perk: false });
const rincian = [r("521211", 1000000), r("524113", 500000)];
const rab = (status: "draf" | "siap" | null, baris: RabSurveiGap["baris"], berubah = 0): RabSurveiGap => ({ status, baris, berubah });
const bRab = (akun: string, jumlah: number) => ({ akun, ket: "rab", volume: 1, satuan: "x", harga: jumlah, jumlah });

describe("rincianUntukGap", () => {
  it("tanpa RAB, draf, atau kosong: tetap identifikasi", () => {
    for (const x of [null, undefined, rab("draf", [bRab("521211", 1)]), rab("siap", []), rab(null, [bRab("521211", 1)])]) {
      const g = rincianUntukGap(rincian, x);
      expect(g.sumber).toBe("identifikasi");
      expect(g.rincian).toBe(rincian);
    }
  });
  it("siap: baris RAB menggantikan akun yang sama, akun lain tetap dari identifikasi", () => {
    const g = rincianUntukGap(rincian, rab("siap", [bRab("521211123", 1200000), bRab("521211", 300000)]));
    expect(g.sumber).toBe("rab");
    expect(g.dariIdentifikasi).toBe(1);
    expect(g.rincian.map((x) => [x.akun, x.jumlah])).toEqual([["521211", 1200000], ["521211", 300000], ["524113", 500000]]);
  });
});

describe("temuanRabSurvei", () => {
  it("tanpa data RAB tidak ada temuan", () => {
    expect(temuanRabSurvei(null, rincian)).toEqual([]);
  });
  it("belum disalin: info hanya bila identifikasi punya biaya", () => {
    expect(temuanRabSurvei(rab(null, []), rincian).map((x) => x.kunci)).toEqual(["biaya:rab_belum"]);
    expect(temuanRabSurvei(rab(null, []), [])).toEqual([]);
  });
  it("draf: info draf (+ sedang bila ada yang berubah), tidak menghitung selisih", () => {
    const t = temuanRabSurvei(rab("draf", [bRab("521211", 10)], 2), rincian);
    expect(t.map((x) => [x.kunci, x.tingkat])).toEqual([["biaya:rab_berubah", "sedang"], ["biaya:rab_draf", "info"]]);
  });
  it("siap: selisih dan sebagian", () => {
    const t = temuanRabSurvei(rab("siap", [bRab("521211", 1400000)]), rincian);
    expect(t.map((x) => x.kunci)).toEqual(["biaya:rab_selisih", "biaya:rab_sebagian"]);
    expect(t[0].pesan).toContain("lebih");
  });
  it("siap dan sama persis: tidak ada temuan", () => {
    expect(temuanRabSurvei(rab("siap", [bRab("521211", 1000000), bRab("524113", 500000)]), rincian)).toEqual([]);
  });
});

describe("susunRabSurveiGap", () => {
  const b = (item_id: number, jumlah: number, ident_id: number | null, ident_ver: number | null = 1) =>
    ({ item_id, ket: "k", volume: "2", satuan: "x", harga_satuan: String(jumlah / 2), jumlah: String(jumlah), ident_id, ident_ver });
  const akun = [{ id: 1, akun_kode: "521211" }, { id: 2, akun_kode: "524113" }];
  it("null bila RAB tidak ada", () => {
    expect(susunRabSurveiGap(false, [], akun, [], 9, 1)).toBeNull();
  });
  it("hanya baris identifikasi ini; angka diubah ke number; status belum ada = null", () => {
    const g = susunRabSurveiGap(true, [b(1, 100, 9), b(2, 50, 8), b(2, 70, null)], akun, [], 9, 1);
    expect(g).toEqual({ status: null, baris: [{ akun: "521211", ket: "k", volume: 2, satuan: "x", harga: 50, jumlah: 100 }], berubah: 0 });
  });
  it("status dari keu_rab_survei; berubah = salinan dari versi lebih lama", () => {
    const g = susunRabSurveiGap(true, [b(1, 100, 9, 1), b(2, 100, 9, 2), b(2, 10, 9, null)], akun, [{ ident_id: 9, status: "siap" }], 9, 2);
    expect(g?.status).toBe("siap");
    expect(g?.berubah).toBe(1);
  });
  it("baris tanpa akun item dibuang", () => {
    expect(susunRabSurveiGap(true, [b(99, 100, 9)], akun, [], 9, 1)?.baris).toEqual([]);
  });
});
