import { describe, expect, it } from "vitest";
import { batasCukup, golongan, kalimatNeraca, kebutuhan, ringkasGapRo, semuaItem } from "../kebutuhan";
import { hitungItem, susunPohon } from "../pokTata";
import type { ItemAnggaran, KomponenAnggaran } from "../ro";

const item = (id: number, pok: number, realisasi: number, rab: number | null, o: Partial<ItemAnggaran> = {}): ItemAnggaran => ({
  detail_id: id, kunci: `K${id}`, komponen: "051", akun: "521213", nomor_item: null, uraian: `butir ${id}`, volume: 1, satuan: "OK", pok, realisasi, rab,
  statusRab: rab === null ? null : "rinci", selesai: false, ...o,
});
const sel = (...x: Parameters<typeof item>) => hitungItem(item(...x));

describe("golongan", () => {
  it("belum ber-RAB = belum dikaji, bukan lebih", () => {
    expect(sel(1, 1_000_000, 0, null).gap).toBeNull();
    expect(golongan(null, 1_000_000)).toBe("belum");
  });
  it("toleransi 1% pagu, minimal Rp 1.000", () => {
    expect(batasCukup(100_000)).toBe(1000);
    expect(batasCukup(10_000_000)).toBe(100_000);
    expect(golongan(99_999, 10_000_000)).toBe("cukup");
    expect(golongan(-100_000, 10_000_000)).toBe("cukup");
    expect(golongan(100_001, 10_000_000)).toBe("lebih");
    expect(golongan(-100_001, 10_000_000)).toBe("kurang");
    expect(golongan(0, 0)).toBe("cukup");
  });
  it("gap butir = pagu - kebutuhan (RAB menutup realisasi, tanpa hitung ganda)", () => {
    // pagu 1.000, realisasi 400, RAB 800 -> kebutuhan 800 (bukan 1.200) -> gap +200
    const i = sel(1, 1000, 400, 800);
    expect(kebutuhan(i.realisasi, i.sisa)).toBe(800);
    expect(i.gap).toBe(200);
  });
  it("realisasi melebihi RAB: kebutuhan = realisasi", () => {
    const i = sel(1, 1000, 900, 500);
    expect(kebutuhan(i.realisasi, i.sisa)).toBe(900);
    expect(i.gap).toBe(100);
  });
  it("butir selesai: kebutuhan = realisasi, sisa pagu menjadi lebih", () => {
    const i = sel(1, 5_000_000, 3_000_000, 4_000_000, { selesai: true });
    expect(kebutuhan(i.realisasi, i.sisa)).toBe(3_000_000);
    expect(golongan(i.gap, i.pok)).toBe("lebih");
  });
  it("kebutuhan kosong bila sisa tidak diketahui", () => {
    expect(kebutuhan(100, null)).toBeNull();
  });
});

describe("ringkasGapRo", () => {
  const daftar = [
    sel(1, 10_000_000, 2_000_000, 6_000_000),      // gap +4.000.000 lebih
    sel(2, 8_000_000, 1_000_000, 11_000_000),      // gap -3.000.000 kurang
    sel(3, 5_000_000, 0, 5_000_000),               // gap 0 cukup
    sel(4, 3_000_000, 500_000, null),              // belum dikaji, sisa pagu 2.500.000
    sel(5, 2_000_000, 0, 2_900_000),               // gap -900.000 kurang
    sel(6, 6_000_000, 6_000_000, 6_000_000),       // gap 0 cukup
  ];
  const r = ringkasGapRo(daftar);
  it("hitung per golongan", () => {
    expect([r.nItem, r.nDikaji, r.nLebih, r.nKurang, r.nCukup, r.nBelum]).toEqual([6, 5, 1, 2, 2, 1]);
    expect(r.lebih).toBe(4_000_000);
    expect(r.kurang).toBe(3_900_000);
  });
  it("belum dikaji tidak dianggap lebih; sisa pagunya dicatat terpisah", () => {
    expect(r.belumSisaPagu).toBe(2_500_000);
    expect(r.bersih).toBe(100_000);
    expect(r.paguDikaji).toBe(31_000_000);
    expect(r.kebutuhanDikaji).toBe(30_900_000);
  });
  it("butir terbesar urut menurut besar selisih", () => {
    expect(r.teratasLebih.map((b) => b.detail_id)).toEqual([1]);
    expect(r.teratasKurang.map((b) => b.detail_id)).toEqual([2, 5]);
  });
  it("tanpa butir dikaji: bersih null", () => {
    const k = ringkasGapRo([sel(1, 100, 0, null)]);
    expect(k.bersih).toBeNull();
    expect(k.nBelum).toBe(1);
    expect(kalimatNeraca(k)).toContain("Belum ada butir yang ber-RAB");
  });
  it("kalimat neraca: lebih menutup, atau kurang dari luar RO", () => {
    expect(kalimatNeraca({ lebih: 5_000_000, kurang: 3_000_000, nDikaji: 3, nBelum: 0 })).toContain("masih tersisa Rp 2.000.000");
    expect(kalimatNeraca({ lebih: 1_000_000, kurang: 3_000_000, nDikaji: 3, nBelum: 1 })).toMatch(/melebihi kelebihan .* sebesar Rp 2\.000\.000.*luar RO.*1 butir belum dikaji/);
    expect(kalimatNeraca({ lebih: 3_000_000, kurang: 3_000_000, nDikaji: 2, nBelum: 0 })).toContain("dan pas");
    expect(kalimatNeraca({ lebih: 0, kurang: 0, nDikaji: 2, nBelum: 0 })).toContain("cukup");
    expect(kalimatNeraca({ lebih: 2_000_000, kurang: 0, nDikaji: 2, nBelum: 0 })).toContain("Tidak ada kekurangan");
  });
});

describe("semuaItem dari pohon", () => {
  it("meratakan komponen > sub > akun > item", () => {
    const ang: KomponenAnggaran[] = [
      { komponen: "051", akun: [{ akun: "521213", item: [item(1, 100, 0, 100), item(2, 200, 0, null)], pok: 300, realisasi: 0, rab: 100 }], pok: 300, realisasi: 0, rab: 100 },
      { komponen: "052", akun: [{ akun: "524119", item: [item(3, 400, 100, 400, { komponen: "052", akun: "524119" })], pok: 400, realisasi: 100, rab: 400 }], pok: 400, realisasi: 100, rab: 400 },
    ];
    const p = susunPohon(ang, null, new Map(), { kode: "X", nama: "RO" });
    expect(semuaItem(p).map((i) => i.detail_id)).toEqual([1, 2, 3]);
    const r = ringkasGapRo(semuaItem(p));
    expect(r.nBelum).toBe(1);
    expect(r.nDikaji).toBe(2);
  });
});
