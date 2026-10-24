import { describe, expect, it } from "vitest";
import type { BarisMx } from "../matriks";
import type { BarisRabKro } from "../rabKro";
import type { BarisRabRow } from "../rab";
import { OPSI_GESERAN_AWAL, periksaRencana, rencanakanGeseran, rencanakanRabPenuh } from "../geseranMinimal";

let seq = 1;
const mx = (o: Partial<BarisMx>): BarisMx => {
  const vol = Number(o.vol_menjadi ?? 1), harga = Number(o.harga_menjadi ?? 100000);
  return {
    id: seq++, jadwal_id: 1, ro_kode: "2906.BMA.005", kro: "2906.BMA", detail_id: 1, pok_kunci: "k", komponen_kode: "051", akun_semula: "521213", akun_menjadi: "521213",
    uraian_semula: "u", uraian_menjadi: "u", vol_semula: vol, vol_menjadi: vol, sat_semula: "OH", sat_menjadi: "OH", harga_semula: harga, harga_menjadi: harga,
    jumlah_semula: vol * harga, jumlah_menjadi: vol * harga, selisih: 0, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null,
    rab_item_id: null, catatan: "", urut: 1, pemicu: null, nomor: null, booked: 0, real: 0, kurang: 0, ...o,
  } as BarisMx;
};
const rb = (b: BarisMx, rab: number | null, status: BarisRabKro["status"], prio: string | null = null): BarisRabKro => ({
  id: b.id, ro: b.ro_kode, kode: "", uraian: b.uraian_menjadi ?? "", akun: b.akun_menjadi, komponen: b.komponen_kode, pok: Number(b.jumlah_menjadi), semula: Number(b.jumlah_semula), rab, selisih: rab === null ? null : rab - Number(b.jumlah_menjadi),
  booked: b.booked, real: b.real, sisa: 0, status, itemId: rab === null ? null : b.id, prioritas: prio, kunci: "k", satuan: "OH", volume: Number(b.vol_menjadi),
});
const urut = new Map([["inti", 1], ["penting", 2], ["tunda", 3]]);
const jumlahAkhir = (b: BarisMx, r: ReturnType<typeof rencanakanGeseran>) => { const p = r.perubahan.find((x) => x.id === b.id); return p ? p.jumlahKe : Number(b.jumlah_menjadi); };

describe("rencanakanGeseran", () => {
  it("memindahkan kelebihan di atas RAB ke item yang kurang, seimbang per RO dan kelompok", () => {
    const pen = mx({ uraian_menjadi: "kurang", vol_menjadi: 4, harga_menjadi: 100000 });       // POK 400.000, RAB 700.000
    const don = mx({ uraian_menjadi: "lebih", vol_menjadi: 10, harga_menjadi: 100000 });       // POK 1.000.000, RAB 500.000
    const r = rencanakanGeseran([pen, don], [rb(pen, 700000, "sama", "inti"), rb(don, 500000, "sama", "penting")], urut);
    expect(r.dilewati).toEqual([]);
    expect(jumlahAkhir(pen, r)).toBe(700000);
    expect(jumlahAkhir(don, r)).toBe(700000);
    expect(periksaRencana(r)).toEqual([]);
    expect(r.kekuranganSesudah).toBe(0);
    expect(r.aliran).toEqual([expect.objectContaining({ donorId: don.id, penerimaId: pen.id, jumlah: 300000 })]);
  });
  it("tidak melewati Booked + Realisasi dan RAB pada sumber", () => {
    const pen = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const don = mx({ vol_menjadi: 10, harga_menjadi: 100000, booked: 600000, real: 100000 });
    const r = rencanakanGeseran([pen, don], [rb(pen, 500000, "sama", "inti"), rb(don, 200000, "sama")], urut);
    expect(jumlahAkhir(don, r)).toBe(700000);
    expect(jumlahAkhir(pen, r)).toBe(400000);
    expect(r.kekuranganSesudah).toBe(100000);
    expect(periksaRencana(r)).toEqual([]);
  });
  it("pembulatan satuan penuh ditampung di Dana penggenap baru (akun 52)", () => {
    const pen = mx({ vol_menjadi: 1, harga_menjadi: 130000 });  // butuh 70.000 lagi -> 1 unit = 130.000
    const don = mx({ vol_menjadi: 2, harga_menjadi: 100000 });  // lebih 200.000 (rab 0?) -> ambil 1 unit 100.000..
    const r = rencanakanGeseran([pen, don], [rb(pen, 200000, "sama", "inti"), rb(don, 50000, "sama")], urut, { ...OPSI_GESERAN_AWAL });
    expect(periksaRencana(r)).toEqual([]);
    expect(r.dilewati).toEqual([]);
  });
  it("kelompok 51 yang tak pas dilewati dengan alasan", () => {
    const pen = mx({ akun_menjadi: "511111", akun_semula: "511111", vol_menjadi: 1, harga_menjadi: 130000 });
    const don = mx({ akun_menjadi: "511111", akun_semula: "511111", vol_menjadi: 2, harga_menjadi: 100000 });
    const r = rencanakanGeseran([pen, don], [rb(pen, 200000, "sama", "inti"), rb(don, 50000, "sama")], urut);
    expect(periksaRencana(r)).toEqual([]);
    if (r.dilewati.length) expect(r.dilewati[0].alasan).toMatch(/Sisa Rp/);
  });
  it("item tanpa RAB hanya jadi sumber bila dicentang; kategori ditunda hanya bila dicentang", () => {
    const pen = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const tanpa = mx({ vol_menjadi: 5, harga_menjadi: 100000 });
    const tunda = mx({ vol_menjadi: 5, harga_menjadi: 100000 });
    const rab = [rb(pen, 300000, "sama", "inti"), rb(tanpa, null, "belum"), rb(tunda, 500000, "sama", "tunda")];
    const a = rencanakanGeseran([pen, tanpa, tunda], rab, urut);
    expect(a.perubahan).toEqual([]);
    expect(a.dilewati).toHaveLength(1);
    const b = rencanakanGeseran([pen, tanpa, tunda], rab, urut, { ...OPSI_GESERAN_AWAL, tanpaRab: true });
    expect(jumlahAkhir(pen, b)).toBe(300000);
    expect(jumlahAkhir(tanpa, b)).toBe(300000);
    const c = rencanakanGeseran([pen, tunda], [rab[0], rab[2]], urut, { ...OPSI_GESERAN_AWAL, turunkanTunda: true });
    expect(jumlahAkhir(pen, c)).toBe(300000);
    expect(jumlahAkhir(tunda, c)).toBe(300000);
    expect(periksaRencana(c)).toEqual([]);
  });
  it("Dana penggenap jadi sumber pertama, tepat rupiah", () => {
    const pen = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const pg = mx({ detail_id: null, penggenap: true, vol_menjadi: 1, harga_menjadi: 80000, vol_semula: 0, harga_semula: 0, jumlah_semula: 0, akun_semula: null, uraian_menjadi: "Dana penggenap" });
    const r = rencanakanGeseran([pen, pg], [rb(pen, 150000, "sama", "inti")], urut);
    expect(jumlahAkhir(pen, r)).toBe(150000);
    expect(jumlahAkhir(pg, r)).toBe(30000);
    expect(periksaRencana(r)).toEqual([]);
  });
  it("tidak lintas RO atau kelompok", () => {
    const pen = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const donRoLain = mx({ ro_kode: "2906.BMA.006", vol_menjadi: 10, harga_menjadi: 100000 });
    const r = rencanakanGeseran([pen, donRoLain], [rb(pen, 300000, "sama", "inti"), rb(donRoLain, 100000, "sama")], urut);
    expect(r.perubahan).toEqual([]);
  });
});

describe("rencanakanRabPenuh", () => {
  const rinci = (o: Partial<BarisRabRow>): BarisRabRow => ({ baris_id: 1, item_id: 1, urut: 1, ket: "", volume: 2, satuan: "OH", harga_satuan: 170000, jumlah: 340000, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 1, bulan_sampai: 1, minggu: 1, ...o });
  it("satu rincian disalin ke volume dan harga", () => {
    const b = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const r = rb(b, 340000, "rinci");
    const p = rencanakanRabPenuh([b], [r], new Map([[r.itemId!, [rinci({})]]]));
    expect(p.dilewati).toEqual([]);
    expect(p.ubah[0]).toMatchObject({ volKe: 2, hargaKe: 170000, jumlahKe: 340000 });
    expect(p.selisihTotal).toBe(240000);
  });
  it("beberapa rincian: harga = RAB / volume bila tepat, selain itu dilewati", () => {
    const b = mx({ vol_menjadi: 4, harga_menjadi: 100000 });
    const ok = rencanakanRabPenuh([b], [rb(b, 600000, "rinci")], new Map([[b.id, [rinci({ baris_id: 1 }), rinci({ baris_id: 2 })]]]));
    expect(ok.ubah[0]).toMatchObject({ volKe: 4, hargaKe: 150000 });
    const b2 = mx({ vol_menjadi: 1000, harga_menjadi: 1000 });
    const salah = rencanakanRabPenuh([b2], [rb(b2, 1234567, "rinci")], new Map([[b2.id, [rinci({ baris_id: 1 }), rinci({ baris_id: 2 })]]]));
    expect(salah.ubah).toEqual([]);
    expect(salah.dilewati).toHaveLength(1);
  });
  it("satuan berbeda dilewati; sama dengan pok atau selesai diabaikan", () => {
    const b = mx({ vol_menjadi: 1, harga_menjadi: 100000 });
    const p = rencanakanRabPenuh([b], [rb(b, 340000, "rinci")], new Map([[b.id, [rinci({ satuan: "PAKET" })]]]));
    expect(p.dilewati[0].alasan).toMatch(/Satuan/);
    expect(rencanakanRabPenuh([b], [rb(b, 100000, "sama")], new Map()).ubah).toEqual([]);
    expect(rencanakanRabPenuh([b], [rb(b, 300000, "selesai")], new Map()).ubah).toEqual([]);
  });
});

describe("sifat rencana (acak, tetap)", () => {
  it("selalu seimbang per RO dan kelompok, tidak menembus lantai, tidak membuat volume/harga negatif", () => {
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const pilih = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    for (let iter = 0; iter < 300; iter++) {
      const baris: BarisMx[] = [], rab: BarisRabKro[] = [];
      const n = 3 + Math.floor(rnd() * 8);
      for (let i = 0; i < n; i++) {
        const akun = pilih(["521213", "521211", "524111", "511111", "531111"]);
        const harga = pilih([1000, 7500, 12345, 50000, 130000, 170000]);
        const vol = 1 + Math.floor(rnd() * 20);
        const b = mx({ akun_menjadi: akun, akun_semula: akun, vol_menjadi: vol, harga_menjadi: harga, booked: Math.floor(rnd() * vol * harga * 0.5), real: 0, ro_kode: pilih(["2906.BMA.005", "2906.BMA.006"]) });
        baris.push(b);
        const adaRab = rnd() < 0.8;
        rab.push(rb(b, adaRab ? Math.floor(rnd() * vol * harga * 2) : null, adaRab ? pilih(["sama", "rinci", "selesai"] as const) : "belum", pilih(["inti", "penting", "tunda"])));
      }
      const r = rencanakanGeseran(baris, rab, urut, { tanpaRab: rnd() < 0.5, turunkanTunda: rnd() < 0.5, tampungPenggenap: rnd() < 0.8 });
      expect(periksaRencana(r)).toEqual([]);
      for (const p of r.perubahan) {
        const b = baris.find((x) => x.id === p.id)!;
        expect(p.volKe).toBeGreaterThanOrEqual(0);
        expect(p.hargaKe).toBeGreaterThanOrEqual(0);
        if (p.peran === "donor") expect(p.jumlahKe).toBeGreaterThanOrEqual(b.booked + b.real);
      }
    }
  });
});
