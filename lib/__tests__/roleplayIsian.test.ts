import { describe, expect, it } from "vitest";
import { bentrokCakupan, bersihkanIsian, gabungIsianTerkunci, periksaCakupan, satuanTerkunci } from "@/lib/vanguard/roleplay/isian";
import { kunciIv1, kunciSel } from "@/lib/vanguard/roleplay/penilaian";

// (8 Nov 2026) roleplay: pembersihan isian klien, penguncian sesudah PERIKSA, cakupan langkah.
describe("bersihkanIsian", () => {
  it("membuang rincian/kotak tak dikenal, angka negatif/bukan angka, dan entri tanpa angka", () => {
    const h = bersihkanIsian({
      iv1: [{ r: 2, k1: 2, k2: 30000.4 }, { r: 1, k1: 5 }, { r: 9999, k1: 1 }, { r: 3 }, { r: 4, k1: -1, k2: "x" }, null, "x"],
      nilai: { a1_uang: 1500000.6, ngawur: 5, a2_uang: -3, b1_produksi: "9" },
    });
    expect(h.iv1).toEqual([{ r: 2, k1: 2, k2: 30000 }]);
    expect(h.nilai).toEqual({ a1_uang: 1500001 });
  });
  it("rincian per ART: ART 1-15 dan sumber 0-3; bawaan ART 1", () => {
    const h = bersihkanIsian({ iv1: [{ r: 190, art: 99, sumber: 7, k1: 1, k2: 1000 }, { r: 191, art: 3, sumber: 2, k1: 1, k2: 2000 }] });
    expect(h.iv1[0]).toMatchObject({ r: 190, art: 1 });
    expect(h.iv1[0].sumber).toBeUndefined();
    expect(h.iv1[1]).toMatchObject({ r: 191, art: 3, sumber: 2 });
  });
  it("bentuk tak sah -> isian kosong", () => {
    expect(bersihkanIsian(null)).toEqual({ iv1: [], nilai: {} });
    expect(bersihkanIsian("x")).toEqual({ iv1: [], nilai: {} });
  });
  it("satu entri per (rincian, ART): yang terakhir menang", () => {
    expect(bersihkanIsian({ iv1: [{ r: 2, k2: 1000 }, { r: 2, k2: 2000 }] }).iv1).toEqual([{ r: 2, k2: 2000 }]);
  });
});

describe("gabungIsianTerkunci", () => {
  const lama = { iv1: [{ r: 2, k1: 2, k2: 30000 }, { r: 3, k1: 1, k2: 500 }], nilai: { a1_uang: 100 } };
  it("satuan terkunci kembali ke isian tersimpan; yang lain mengikuti isian baru", () => {
    const baru = { iv1: [{ r: 2, k1: 9, k2: 99999 }, { r: 3, k1: 1, k2: 700 }], nilai: { a1_uang: 999, a2_uang: 50 } };
    const { isian, ditolak } = gabungIsianTerkunci(baru, lama, new Set([kunciIv1(2), kunciSel("a1_uang")]));
    expect(isian.iv1).toEqual([{ r: 2, k1: 2, k2: 30000 }, { r: 3, k1: 1, k2: 700 }]);
    expect(isian.nilai).toEqual({ a1_uang: 100, a2_uang: 50 });
    expect(ditolak).toEqual([kunciIv1(2), kunciSel("a1_uang")].sort());
  });
  it("menghapus satuan terkunci tidak berhasil (tetap ada)", () => {
    const { isian, ditolak } = gabungIsianTerkunci({ iv1: [], nilai: {} }, lama, new Set([kunciIv1(2), kunciSel("a1_uang")]));
    expect(isian.iv1).toEqual([{ r: 2, k1: 2, k2: 30000 }]);
    expect(isian.nilai).toEqual({ a1_uang: 100 });
    expect(ditolak.length).toBe(2);
  });
  it("tanpa yang terkunci: isian baru apa adanya, tidak ada yang ditolak", () => {
    const baru = { iv1: [{ r: 4, k1: 1 }], nilai: {} };
    expect(gabungIsianTerkunci(baru, lama, new Set())).toEqual({ isian: { iv1: [{ r: 4, k1: 1 }], nilai: {} }, ditolak: [] });
  });
  it("mengirim ulang isi terkunci yang sama tidak dianggap ditolak", () => {
    expect(gabungIsianTerkunci({ iv1: [{ r: 2, k1: 2, k2: 30000 }], nilai: { a1_uang: 100 } }, lama, new Set([kunciIv1(2), kunciSel("a1_uang")])).ditolak).toEqual([]);
  });
});

describe("cakupan langkah", () => {
  it("terkunci = semua satuan langkah yang sudah diperiksa/selesai, bukan yang berjalan", () => {
    const s = satuanTerkunci([{ bagian: "iv1", dari: 2, sampai: 3, status: "selesai" }, { bagian: "iv1", dari: 4, sampai: 5, status: "berjalan" }, { bagian: "VI", status: "diperiksa" }]);
    expect(s.has("r2") && s.has("r3") && s.has("s:vi_g1")).toBe(true);
    expect(s.has("r4")).toBe(false);
  });
  it("periksaCakupan: bagian dikenal, rentang IV.1 sah, blok V-VII tanpa rentang", () => {
    expect(periksaCakupan({ bagian: "iv1", dari: 2, sampai: 7 })).toEqual({ ok: true, cakupan: { bagian: "iv1", dari: 2, sampai: 7 } });
    expect(periksaCakupan({ bagian: "iv1", dari: 5 })).toEqual({ ok: true, cakupan: { bagian: "iv1", dari: 5, sampai: 5 } });
    expect(periksaCakupan({ bagian: "iv1", dari: 9, sampai: 3 }).ok).toBe(false);
    expect(periksaCakupan({ bagian: "iv1" }).ok).toBe(false);
    expect(periksaCakupan({ bagian: "Z" }).ok).toBe(false);
    expect(periksaCakupan({ bagian: "VII", dari: 3 })).toEqual({ ok: true, cakupan: { bagian: "VII" } });
    expect(periksaCakupan({ bagian: "iv1", dari: 1, sampai: 1 }).ok).toBe(false); // R1 = judul kelompok, bukan rincian
  });
  it("bentrokCakupan menemukan satuan yang sudah dipakai langkah lain", () => {
    expect(bentrokCakupan({ bagian: "iv1", dari: 5, sampai: 9 }, [{ bagian: "iv1", dari: 2, sampai: 6 }])).toEqual(["r5", "r6"]);
    expect(bentrokCakupan({ bagian: "A" }, [{ bagian: "B" }])).toEqual([]);
  });
});
