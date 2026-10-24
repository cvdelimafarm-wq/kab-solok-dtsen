import { describe, expect, it } from "vitest";
import type { BarisRabRow } from "../rab";
import { barisKosong } from "../rab";
import { calonSamaDenganItem, drafBaru, drafDariRows, isianDariRow, jumlahDraft, kelompokkanRab, rencanaSimpan } from "../rabInline";
import type { BarisRabKro } from "../rabKro";

const row = (o: Partial<BarisRabRow> & { baris_id: number }): BarisRabRow => ({
  item_id: 1, urut: 1, ket: "PML", volume: 2, satuan: "OH", harga_satuan: 170000, jumlah: 340000, jumlah_dikunci: false, sama_dengan_item: false,
  periode: "sekali", bulan_mulai: 3, bulan_sampai: 3, minggu: 2, ...o,
});

describe("rencanaSimpan", () => {
  const asli = [row({ baris_id: 10 }), row({ baris_id: 11, urut: 2, ket: "PPL", volume: 10 })];
  it("tanpa perubahan: tidak ada yang dikirim", () => {
    const r = rencanaSimpan(asli, drafDariRows(asli));
    expect(r.adaUbah).toBe(false);
    expect(r.galat).toEqual([]);
  });
  it("ubah volume satu baris menjadi pembaruan rincian biasa", () => {
    const d = drafDariRows(asli); d[0].f.volume = "3";
    const r = rencanaSimpan(asli, d);
    expect(r.ubah).toHaveLength(1);
    expect(r.ubah[0].id).toBe(10);
    expect(r.ubah[0].data).toMatchObject({ volume: 3, sama_dengan_item: false, jumlah_tetap: null });
  });
  it("baris hilang dihapus, baris baru ditambah dengan urut berikutnya", () => {
    const d = drafDariRows(asli).filter((x) => x.id !== 11);
    const b = drafBaru("n1", "OH", 4); b.f.volume = "1"; b.f.harga = "100000"; b.f.satuan = "OH"; d.push(b);
    const r = rencanaSimpan(asli, d);
    expect(r.hapus).toEqual([11]);
    expect(r.baru).toHaveLength(1);
    expect(r.baru[0].data).toMatchObject({ urut: 3, volume: 1, harga_satuan: 100000 });
  });
  it("isian tidak sah ditolak dengan nomor rincian", () => {
    const d = [drafBaru("n1", "OH", 1)];
    const r = rencanaSimpan([], d);
    expect(r.galat.length).toBeGreaterThan(0);
    expect(r.galat[0]).toMatch(/^Rincian 1:/);
  });
  it("jumlahDraft menjumlah volume x harga", () => {
    expect(jumlahDraft(drafDariRows(asli))).toBe(340000 + 1700000);
    expect(jumlahDraft([drafBaru("n", "OH", 1)])).toBe(0);
  });
  it("isianDariRow memakai koma desimal dan harga bulat", () => {
    expect(isianDariRow(row({ baris_id: 1, volume: "2.50", harga_satuan: "1000.00" }))).toMatchObject({ volume: "2,5", harga: "1000" });
    expect(barisKosong("OH", 5).bulan_mulai).toBe(5);
  });
});

const kro = (o: Partial<BarisRabKro> & { id: number }): BarisRabKro => ({
  ro: "2906.BMA.005", kode: "", uraian: "u", akun: "521213", komponen: "051", pok: 1000, rab: null, selisih: null, booked: 0, real: 0, sisa: 1000, status: "belum", itemId: null, prioritas: null,
  kunci: "k", satuan: "OH", volume: 1, ...o,
});
describe("kelompokkanRab dan calon", () => {
  const b = [kro({ id: 1 }), kro({ id: 2, status: "sama", rab: 1000, pok: 1000 }), kro({ id: 3, akun: "524111", pok: 500, status: "selesai", rab: 400 }), kro({ id: 4, ro: "2906.BMA.006", komponen: "052" })];
  it("hierarki dan jumlah (item selesai tidak masuk RAB)", () => {
    const h = kelompokkanRab(b);
    expect(h.map((x) => x.ro)).toEqual(["2906.BMA.005", "2906.BMA.006"]);
    expect(h[0].komponen[0].akun.map((a) => a.akun)).toEqual(["521213", "524111"]);
    expect(h[0].pok).toBe(2500);
    expect(h[0].rab).toBe(1000);
  });
  it("calon RAB = Item hanya pada RO yang boleh dan berkunci", () => {
    expect(calonSamaDenganItem(b, (ro) => ro.endsWith("005")).map((x) => x.id)).toEqual([1]);
    expect(calonSamaDenganItem([kro({ id: 9, kunci: null })], () => true)).toEqual([]);
  });
});
