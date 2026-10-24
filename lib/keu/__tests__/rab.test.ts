import { describe, expect, it } from "vitest";
import {
  aksiTersedia, barisKosong, bacaVolume, bisaDiubah, bolehSusunBaru, dataBaris, dataItemRab, dataSamaDenganItem, itemRabYatim, jumlahBaris, periksaBaris,
  periksaCatatanAksi, petakanRab, type BarisRabRow, type HakRab, type IsianBaris,
} from "../rab";
import type { ItemAnggaran } from "../ro";

const semua: HakRab = { rab: true, draf: true, setuju_ketua: true, sahkan: true };
const tak: HakRab = { rab: false, draf: false, setuju_ketua: false, sahkan: false };
const item = (o: Partial<ItemAnggaran> & { kunci: string }): ItemAnggaran => ({ detail_id: 1, komponen: "055", akun: "521211", nomor_item: null, uraian: "Konsumsi rapat", volume: 20, satuan: "OK", pok: 1000000, realisasi: 0, rab: null, statusRab: null, selesai: false, ...o });

describe("status dan aksi", () => {
  it("hanya draf dan dikembalikan yang dapat diubah", () => {
    expect(bisaDiubah("draf")).toBe(true);
    expect(bisaDiubah("dikembalikan")).toBe(true);
    for (const s of ["menunggu_ketua", "menunggu_ppk", "disetujui", "digantikan", "dibatalkan", "", null, undefined]) expect(bisaDiubah(s as string)).toBe(false);
  });
  it("aksi menurut status dan hak", () => {
    expect(aksiTersedia("draf", semua)).toEqual(["ajukan", "batalkan"]);
    expect(aksiTersedia("dikembalikan", { ...tak, draf: true })).toEqual(["ajukan", "batalkan"]);
    expect(aksiTersedia("draf", tak)).toEqual([]);
    expect(aksiTersedia("menunggu_ketua", semua)).toEqual(["setuju_ketua", "kembalikan"]);
    expect(aksiTersedia("menunggu_ketua", { ...tak, sahkan: true })).toEqual([]);
    expect(aksiTersedia("menunggu_ppk", semua)).toEqual(["sahkan", "kembalikan"]);
    expect(aksiTersedia("menunggu_ppk", { ...tak, rab: true })).toEqual([]);
    expect(aksiTersedia("disetujui", semua)).toEqual([]);
  });
  it("susun baru hanya bila tidak ada RAB aktif dan berwenang", () => {
    expect(bolehSusunBaru(null, semua)).toBe(true);
    expect(bolehSusunBaru("disetujui", { ...tak, draf: true })).toBe(true);
    expect(bolehSusunBaru("draf", semua)).toBe(false);
    expect(bolehSusunBaru("menunggu_ppk", semua)).toBe(false);
    expect(bolehSusunBaru(null, tak)).toBe(false);
  });
  it("kembalikan wajib alasan", () => {
    expect(periksaCatatanAksi("kembalikan", "ya")).not.toBeNull();
    expect(periksaCatatanAksi("kembalikan", "perbaiki volume")).toBeNull();
    expect(periksaCatatanAksi("ajukan", "")).toBeNull();
  });
});

describe("rincian", () => {
  const sah: IsianBaris = { ket: "PML", volume: "2,5", satuan: "OK", harga: "170.000", periode: "bulanan", bulan_mulai: 3, bulan_sampai: 5, minggu: 2 };
  it("bacaVolume", () => {
    expect(bacaVolume("2")).toBe(2);
    expect(bacaVolume("2,5")).toBe(2.5);
    expect(bacaVolume("0.25")).toBe(0.25);
    for (const t of ["0", "-1", "1,234", "abc", "", "1.000.000"]) expect(bacaVolume(t)).toBeNull();
  });
  it("periksaBaris", () => {
    expect(periksaBaris(sah)).toEqual([]);
    expect(periksaBaris({ ...sah, volume: "", harga: "0", satuan: " " }).length).toBe(3);
    expect(periksaBaris({ ...sah, bulan_sampai: 2 })).toHaveLength(1);
    expect(periksaBaris({ ...sah, periode: "sekali", bulan_sampai: 1 })).toEqual([]);
    expect(periksaBaris({ ...sah, minggu: 5 })).toHaveLength(1);
    expect(periksaBaris({ ...sah, ket: "x".repeat(201) })).toHaveLength(1);
  });
  it("jumlahBaris dibulatkan seperti basis data", () => {
    expect(jumlahBaris(sah)).toBe(425000);
    expect(jumlahBaris({ ...sah, volume: "" })).toBeNull();
    expect(jumlahBaris({ ...sah, volume: "0,33", harga: "100" })).toBe(33);
  });
  it("dataBaris: periode sekali memaksa bulan sampai = bulan mulai", () => {
    const d = dataBaris({ ...sah, periode: "sekali", bulan_mulai: 7, bulan_sampai: 9 });
    expect(d).toMatchObject({ volume: 2.5, harga_satuan: 170000, bulan_mulai: 7, bulan_sampai: 7, periode: "sekali" });
    expect(dataBaris(sah)).toMatchObject({ bulan_sampai: 5 });
  });
  it("dataSamaDenganItem mengunci jumlah ke pagu POK", () => {
    const d = dataSamaDenganItem(9, item({ kunci: "k", volume: 3, pok: 1000000 }), 6, 2);
    expect(d).toMatchObject({ item_id: 9, jumlah_tetap: 1000000, sama_dengan_item: true, volume: 3, bulan_mulai: 6, bulan_sampai: 6, minggu: 2 });
    expect(d.harga_satuan).toBeCloseTo(333333.33, 2);
    expect(dataSamaDenganItem(9, item({ kunci: "k", volume: 0, pok: 500 }), 1, 1)).toMatchObject({ volume: 1, harga_satuan: 500 });
  });
  it("dataItemRab memakai kunci stabil POK dan membatasi satuan", () => {
    expect(dataItemRab(4, item({ kunci: "ro/055/521211/x#1", satuan: "" }), "inti")).toEqual({ rab_id: 4, pok_kunci: "ro/055/521211/x#1", komponen_kode: "055", akun_kode: "521211", uraian: "Konsumsi rapat", satuan: "PAKET", prioritas_kode: "inti" });
    expect(dataItemRab(4, item({ kunci: "k" }), "")).toMatchObject({ prioritas_kode: null });
  });
  it("barisKosong", () => expect(barisKosong("OK", 8)).toMatchObject({ satuan: "OK", bulan_mulai: 8, bulan_sampai: 8, periode: "sekali" }));
});

describe("petakanRab", () => {
  const b = (o: Partial<BarisRabRow> & { baris_id: number; item_id: number }): BarisRabRow => ({ urut: 1, ket: "", volume: 1, satuan: "OK", harga_satuan: 1, jumlah: 100, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 1, bulan_sampai: 1, minggu: 3, ...o });
  const items = [item({ kunci: "a", pok: 300 }), item({ kunci: "b", pok: 200 }), item({ kunci: "c", pok: 50 }), item({ kunci: "d", pok: 80 })];
  const rab = [
    { id: 1, pok_kunci: "a", selesai: false, prioritas_kode: "inti" },
    { id: 2, pok_kunci: "b", selesai: false, prioritas_kode: null },
    { id: 3, pok_kunci: "d", selesai: true, prioritas_kode: null },
    { id: 4, pok_kunci: "hilang", selesai: false, prioritas_kode: null },
    { id: 5, pok_kunci: null, selesai: false, prioritas_kode: null },
  ];
  const baris = [b({ baris_id: 12, item_id: 1, urut: 2, jumlah: 100 }), b({ baris_id: 11, item_id: 1, urut: 1, jumlah: 200 }), b({ baris_id: 20, item_id: 2, jumlah: 250, sama_dengan_item: true })];
  const h = petakanRab(items, rab, baris);
  it("status, jumlah, dan selisih", () => {
    expect(h.map((x) => x.status)).toEqual(["rinci", "sama", "belum", "selesai"]);
    expect(h[0].jumlahRab).toBe(300);
    expect(h[0].selisih).toBe(0);
    expect(h[0].baris.map((x) => x.baris_id)).toEqual([11, 12]);
    expect(h[1].selisih).toBe(50);
    expect(h[2].rab).toBeNull();
    expect(h[2].selisih).toBeNull();
    expect(h[3].selisih).toBeNull();
  });
  it("item RAB yatim (kunci tak ada di POK) terpisah; item baru (tanpa kunci) bukan yatim", () => {
    expect(itemRabYatim(items, rab).map((x) => x.id)).toEqual([4]);
  });
});
