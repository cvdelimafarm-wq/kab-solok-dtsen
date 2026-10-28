// lib/keu/__tests__/rabStatus.test.ts
//
// (28 Okt 2026) Uji status RAB per survei dan pemicu revisi.

import { describe, expect, it } from "vitest";
import type { BarisRabRow, ItemRabRow, PemetaanItem } from "../rab";
import type { ItemAnggaran } from "../ro";
import { adaBarisStatus, analisisRevisi, dataStatusBaru, dataStatusUbah, periksaSiap, ringkasPemicu, statusDari, type ItemRabLengkap } from "../rabStatus";

const pok = (kunci: string, akun: string, uraian: string, nilai: number, komponen = "051"): ItemAnggaran =>
  ({ detail_id: 1, kunci, komponen, akun, nomor_item: null, uraian, volume: 1, satuan: "PAKET", pok: nilai, realisasi: 0, rab: null, statusRab: null, selesai: false });
const peta = (p: ItemAnggaran): PemetaanItem => ({ pok: p, rab: null, baris: [], jumlahRab: 0, selisih: null, status: "belum" });
const itm = (id: number, pk: string | null, akun: string, uraian: string, komponen = "051"): ItemRabLengkap => ({ id, pok_kunci: pk, akun_kode: akun, uraian, satuan: "PAKET", komponen_kode: komponen, selesai: false });
const br = (baris_id: number, item_id: number, jumlah: number, ident_id: number | null): BarisRabRow => ({
  baris_id, item_id, urut: baris_id, ket: "x", volume: 1, satuan: "PAKET", harga_satuan: jumlah, jumlah, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 1, bulan_sampai: 1, minggu: 1, ident_id,
});
void ({} as ItemRabRow);

describe("status survei", () => {
  it("belum ada baris = draf; siap hanya bila tepat 'siap'", () => {
    expect(statusDari(null, 5)).toBe("draf");
    expect(statusDari([], 5)).toBe("draf");
    expect(statusDari([{ ident_id: 5, status: "siap" }], 5)).toBe("siap");
    expect(statusDari([{ ident_id: 6, status: "siap" }], 5)).toBe("draf");
    expect(statusDari([{ ident_id: 5, status: "ngawur" as never }], 5)).toBe("draf");
  });
  it("adaBarisStatus", () => {
    expect(adaBarisStatus([{ ident_id: 5 }], 5)).toBe(true);
    expect(adaBarisStatus(null, 5)).toBe(false);
  });
  it("periksaSiap menolak bila tidak ada rincian", () => {
    expect(periksaSiap(0)).not.toBeNull();
    expect(periksaSiap(1)).toBeNull();
  });
  it("data tulis", () => {
    expect(dataStatusBaru(1, 2, "siap")).toEqual({ rab_id: 1, ident_id: 2, status: "siap", catatan: "" });
    expect(dataStatusBaru(1, 2, "draf", "x".repeat(600)).catatan).toHaveLength(500);
    expect(dataStatusUbah("draf")).toEqual({ status: "draf" });
    expect(dataStatusUbah("siap", "ok")).toEqual({ status: "siap", catatan: "ok" });
  });
});

describe("analisisRevisi", () => {
  const p1 = pok("K1", "521211", "Konsumsi rapat", 1000000);
  const pt = [peta(p1), peta(pok("K2", "524113", "Translok", 500000))];
  it("tanpa baris bertanda identifikasi tidak ada pemicu", () => {
    expect(analisisRevisi(pt, [itm(1, "K1", "521211", "Konsumsi rapat")], [br(1, 1, 2000000, null)], 9)).toEqual([]);
  });
  it("P-01 bila jumlah RAB item (semua survei) melebihi pagu", () => {
    const h = analisisRevisi(pt, [itm(1, "K1", "521211", "Konsumsi rapat")], [br(1, 1, 700000, 9), br(2, 1, 400000, 8)], 9);
    expect(h.map((x) => x.kode)).toEqual(["P-01"]);
    expect(h[0].pesan).toContain("100.000");
  });
  it("tepat sama dengan pagu tidak memicu", () => {
    expect(analisisRevisi(pt, [itm(1, "K1", "521211", "Konsumsi rapat")], [br(1, 1, 1000000, 9)], 9)).toEqual([]);
  });
  it("P-02 bila redaksi berubah (abaikan spasi dan huruf besar)", () => {
    expect(analisisRevisi(pt, [itm(1, "K1", "521211", "  KONSUMSI   rapat ")], [br(1, 1, 10, 9)], 9)).toEqual([]);
    const h = analisisRevisi(pt, [itm(1, "K1", "521211", "Konsumsi rapat evaluasi")], [br(1, 1, 10, 9)], 9);
    expect(h.map((x) => x.kode)).toEqual(["P-02"]);
  });
  it("item baru: P-06 bila akun+komponen sudah ada, selain itu P-04", () => {
    const h = analisisRevisi(pt, [itm(7, null, "521211", "Konsumsi lain"), itm(8, null, "522151", "Honor instruktur")], [br(1, 7, 100, 9), br(2, 8, 200, 9)], 9);
    expect(h.map((x) => [x.kode, x.itemId])).toEqual([["P-06", 7], ["P-04", 8]]);
  });
  it("akun sama tetapi komponen lain = P-04", () => {
    const h = analisisRevisi(pt, [itm(7, null, "521211", "Konsumsi lain", "052")], [br(1, 7, 100, 9)], 9);
    expect(h.map((x) => x.kode)).toEqual(["P-04"]);
  });
  it("kunci POK yang tidak ada lagi dilewati; ringkas menghitung", () => {
    expect(analisisRevisi(pt, [itm(1, "HILANG", "521211", "x")], [br(1, 1, 10, 9)], 9)).toEqual([]);
    const h = analisisRevisi(pt, [itm(1, "K1", "521211", "Beda"), itm(7, null, "521211", "Baru")], [br(1, 1, 2000000, 9), br(2, 7, 5, 9)], 9);
    expect(ringkasPemicu(h)).toEqual({ "P-01": 1, "P-02": 1, "P-04": 0, "P-06": 1, total: 3 });
  });
});
