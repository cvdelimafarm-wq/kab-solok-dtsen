import { describe, expect, it } from "vitest";
import { batasRevisi, hitungNeracaSatker, jagaRevisi, type BarisJaga } from "../penjagaanRevisi";

let seq = 0;
const b = (o: Partial<BarisJaga> & { ro: string; akunS?: string | null; akunM: string; semula: number; menjadi: number }): BarisJaga => ({
  id: ++seq, jadwal_id: 1, ro_kode: o.ro, kro: o.kro ?? null, detail_id: o.detail_id === undefined ? seq : o.detail_id, pok_kunci: null, komponen_kode: "051",
  akun_semula: o.akunS === undefined ? o.akunM : o.akunS, akun_menjadi: o.akunM, uraian_semula: "u", uraian_menjadi: "u",
  vol_semula: 1, vol_menjadi: 1, sat_semula: "x", sat_menjadi: "x", harga_semula: o.semula, harga_menjadi: o.menjadi, jumlah_semula: o.semula, jumlah_menjadi: o.menjadi,
  selisih: o.menjadi - o.semula, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: seq, pemicu: null,
  booked: o.booked, real: o.real,
});
const A = "2906.BMA.004"; // KRO 2906.BMA
const B = "2906.EBA.994"; // KRO 2906.EBA

describe("hitungNeracaSatker", () => {
  it("selisih per KRO, total, dan 524 per KRO serta per satker", () => {
    const n = hitungNeracaSatker([
      b({ ro: A, akunM: "521211", semula: 1000, menjadi: 700 }),
      b({ ro: A, akunM: "524111", semula: 500, menjadi: 800 }),
      b({ ro: B, akunM: "524111", semula: 400, menjadi: 100 }),
      b({ ro: B, akunM: "521211", semula: 100, menjadi: 400 }),
    ]);
    expect(n.perKro.map((k) => [k.kro, k.selisih, k.selisih524])).toEqual([["2906.BMA", 0, 300], ["2906.EBA", 0, -300]]);
    expect(n.selisih).toBe(0);
    expect(n.selisih524).toBe(0);
  });
  it("akun diganti ke 524 (P-03) dihitung pada akun asal dan akun tujuan", () => {
    const n = hitungNeracaSatker([b({ ro: A, akunS: "521211", akunM: "524111", semula: 100, menjadi: 100 })]);
    expect(n.semula524).toBe(0);
    expect(n.menjadi524).toBe(100);
    expect(n.selisih524).toBe(100);
  });
  it("transfer antar satker dijumlah", () => {
    const n = hitungNeracaSatker([], [{ arah: "masuk", satker: "X", nilai: 500 }, { arah: "keluar", satker: "Y", nilai: 200 }]);
    expect([n.transferMasuk, n.transferKeluar, n.transferBersih]).toEqual([500, 200, 300]);
  });
});

describe("jagaRevisi: Revisi POK", () => {
  it("substitusi silang antar akun di dalam KRO, pagu KRO dan 524 satker tetap: tidak memblokir, 524 per KRO jadi peringatan", () => {
    const h = jagaRevisi("pok", [
      b({ ro: A, akunM: "521211", semula: 1000, menjadi: 700 }), b({ ro: A, akunM: "524111", semula: 500, menjadi: 800 }),
      b({ ro: B, akunM: "524111", semula: 400, menjadi: 100 }), b({ ro: B, akunM: "521211", semula: 100, menjadi: 400 }),
    ]);
    expect(h.memblokir).toBe(false);
    expect(h.temuan.map((t) => t.kode).sort()).toEqual(["J-04", "J-04"]);
    expect(h.temuan[0].pesan).toMatch(/seimbangkan/);
  });
  it("pagu KRO berubah memblokir (J-01), pagu satker berubah memblokir (J-02), 524 satker (J-03)", () => {
    const h = jagaRevisi("pok", [b({ ro: A, akunM: "524111", semula: 500, menjadi: 800 }), b({ ro: B, akunM: "521211", semula: 100, menjadi: 100 })]);
    expect(h.memblokir).toBe(true);
    expect(h.temuan.filter((t) => t.tingkat === "merah").map((t) => t.kode).sort()).toEqual(["J-01", "J-02", "J-03"]);
  });
  it("pergeseran di dalam KRO tanpa menyentuh 524: bersih", () => {
    const h = jagaRevisi("pok", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 600 }), b({ ro: A, akunM: "522151", semula: 0, menjadi: 400, detail_id: null })]);
    expect(h.temuan).toEqual([]);
    expect(h.memblokir).toBe(false);
  });
  it("revisi administrasi dijaga sama seperti POK", () => {
    expect(jagaRevisi("administrasi", [b({ ro: A, akunM: "521211", semula: 100, menjadi: 90 })]).memblokir).toBe(true);
  });
});

describe("jagaRevisi: DJPb dan DJA", () => {
  it("subsidi antar KRO seimbang (satker tetap): tidak memblokir, info per KRO", () => {
    const h = jagaRevisi("dipa_djpb", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 700 }), b({ ro: B, akunM: "521211", semula: 100, menjadi: 400 })]);
    expect(h.memblokir).toBe(false);
    expect(h.temuan.map((t) => t.kode)).toEqual(["J-09", "J-09"]);
  });
  it("tambahan dari satker lain seimbang dengan kenaikan KRO", () => {
    const h = jagaRevisi("dipa_dja", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 1500 })], { transfer: [{ arah: "masuk", satker: "BPS Kota X", nilai: 500 }] });
    expect(h.memblokir).toBe(false);
  });
  it("kenaikan tanpa sumber memblokir (J-06) dan pelepasan tanpa tujuan juga", () => {
    const naik = jagaRevisi("dipa_djpb", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 1500 })]);
    expect(naik.temuan.find((t) => t.kode === "J-06")?.nilai).toBe(500);
    const turun = jagaRevisi("dipa_djpb", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 800 })]);
    expect(turun.temuan.find((t) => t.kode === "J-06")?.pesan).toMatch(/pelepasan/);
  });
  it("total satker dijaga tetap tetapi ada transfer bersih: J-02", () => {
    const h = jagaRevisi("dipa_djpb", [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 1500 })], { transfer: [{ arah: "masuk", satker: "X", nilai: 500 }], jagaTotalTetap: true });
    expect(h.temuan.some((t) => t.kode === "J-02" && t.tingkat === "merah")).toBe(true);
  });
  it("524 satker berubah hanya peringatan (J-07); transfer tanpa nama atau nilai memblokir (J-08)", () => {
    const h = jagaRevisi("dipa_djpb", [b({ ro: A, akunM: "524111", semula: 100, menjadi: 300 })], { transfer: [{ arah: "masuk", satker: " ", nilai: 200 }] });
    expect(h.temuan.some((t) => t.kode === "J-07" && t.tingkat === "kuning")).toBe(true);
    expect(h.temuan.some((t) => t.kode === "J-08")).toBe(true);
  });
});

describe("semua jenis", () => {
  it("pagu baris di bawah Booked + Realisasi memblokir (J-05)", () => {
    for (const j of ["pok", "dipa_djpb"] as const) {
      const h = jagaRevisi(j, [b({ ro: A, akunM: "521211", semula: 1000, menjadi: 1000, booked: 600, real: 500 }), b({ ro: A, akunM: "521211", semula: 0, menjadi: 0, detail_id: null })]);
      expect(h.temuan.some((t) => t.kode === "J-05")).toBe(true);
    }
  });
  it("teks batas per jenis tersedia dan berbeda antara POK dan DJPb", () => {
    expect(batasRevisi("pok")[0]).toMatch(/Pagu tiap KRO tetap/);
    expect(batasRevisi("dipa_djpb")[0]).toMatch(/boleh berubah/);
    expect(batasRevisi("dipa_dja")).toEqual(batasRevisi("dipa_djpb"));
    expect(batasRevisi("administrasi")).toEqual(batasRevisi("pok"));
  });
});
