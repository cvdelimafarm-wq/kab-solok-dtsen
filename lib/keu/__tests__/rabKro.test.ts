import { describe, expect, it } from "vitest";
import type { BarisKk } from "../kk";
import { gabungKetersediaan, type BarisMx } from "../matriks";
import { barisBerubah, barisJadwalBeda, bayangBiru, kelompokBulanan, keCsv, ketBulan, rentangBulan, sandingkanRab, susunBulanan, susunPencairan, teksCatatanPencairan, teksTag, USULAN_TAG, type ItemRabKro, type JadwalItem } from "../rabKro";

let seq = 0;
const B = (o: Partial<BarisKk> = {}): BarisMx => {
  const b: BarisKk = {
    id: ++seq, jadwal_id: 1, ro_kode: "2903.BMA.007", kro: "2903.BMA", detail_id: seq, pok_kunci: `K${seq}`, komponen_kode: "051", akun_semula: "521811", akun_menjadi: "521811",
    uraian_semula: `Item ${seq}`, uraian_menjadi: `Item ${seq}`, vol_semula: 1, vol_menjadi: 1, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100, harga_menjadi: 100,
    jumlah_semula: 100, jumlah_menjadi: 100, selisih: 0, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: seq, pemicu: null, ...o,
  };
  return gabungKetersediaan([b], new Map([[b.detail_id ?? -1, { nomor: "000001", booked: 10, real: 20 }]]), new Map())[0];
};
const IT = (o: Partial<ItemRabKro> & { item_id: number }): ItemRabKro => ({ rab_id: 1, pok_kunci: null, status: "sama", jumlah_rab: 100, selesai: false, ...o });

describe("sandingkanRab", () => {
  it("memasangkan lewat rab_item_id atau kunci, menghitung status, selisih, dan dana bebas", () => {
    const a = B({ rab_item_id: 11, jumlah_menjadi: 100 });
    const b = B({ pok_kunci: "KB", jumlah_menjadi: 200 });
    const c = B({ jumlah_menjadi: 300 });
    const d = B({ rab_item_id: 14, jumlah_menjadi: 500 });
    const pg = B({ penggenap: true, detail_id: null, jumlah_menjadi: 50 });
    const r = sandingkanRab([a, b, c, d, pg], [IT({ item_id: 11, jumlah_rab: 120, status: "rinci" }), IT({ item_id: 12, pok_kunci: "KB", jumlah_rab: 200 }), IT({ item_id: 14, selesai: true, jumlah_rab: 400 })]);
    expect(r.baris).toHaveLength(4);
    expect(r.baris.map((x) => x.status)).toEqual(["rinci", "sama", "belum", "selesai"]);
    expect(r.baris[0].selisih).toBe(20); expect(r.baris[2].rab).toBeNull();
    expect(r.ringkas).toMatchObject({ total: 4, sama: 1, rinci: 1, belum: 1, selesai: 1, pokBerRab: 300, rab: 320, selisih: 20, danaBebas: 470 });
  });
});

describe("susunBulanan", () => {
  const J = (o: Partial<JadwalItem>): JadwalItem => ({ rab_id: 1, ro_kode: "2903.BMA.007", item_id: 1, pok_kunci: null, akun_menjadi: "521811", uraian: "Honor", baris_id: 1, ket: "", bulan: 3, minggu: 2, nilai: 100, ...o });
  it("menjumlah per item, per bulan, per minggu, dan memberi tag minggu terbesar", () => {
    const r = susunBulanan([J({}), J({ baris_id: 2, minggu: 4, nilai: 50 }), J({ bulan: 5, minggu: 1, nilai: 70 }), J({ item_id: 2, uraian: "ATK", bulan: 3, nilai: 30 }), J({ nilai: 0, bulan: 7 })]);
    expect(r.item.map((x) => x.uraian)).toEqual(["ATK", "Honor"]);
    const honor = r.item[1];
    expect(honor.nilai[2]).toBe(150); expect(honor.minggu[2]).toBe(2); expect(honor.minggu[4]).toBe(1); expect(honor.total).toBe(220);
    expect(r.perBulan[2]).toBe(180); expect(r.perMinggu[2]).toEqual([0, 130, 0, 50]); expect(r.total).toBe(250);
    expect(r.rincian.get(2)).toHaveLength(3);
  });
  it("rentangBulan", () => { expect(rentangBulan([0, 0, 5, 0, 7, 0, 0, 0, 0, 0, 0, 0])).toBe("Mar-Mei"); expect(rentangBulan(Array(12).fill(0))).toBe(""); expect(rentangBulan([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe("Jan"); });
});

describe("barisBerubah dan keCsv", () => {
  it("hanya baris berubah", () => {
    const a = B({}), b = B({ jumlah_menjadi: 150, selisih: 50, pemicu: "P-01" }), c = B({ baru: true, detail_id: null });
    expect(barisBerubah([a, b, c]).map((x) => x.id)).toEqual([b.id, c.id]);
  });
  it("CSV mengutip sel bertanda kutip atau titik koma", () => {
    expect(keCsv(["a", "b"], [["x;y", 'q"r'], [1, 2]])).toBe('﻿a;b\r\n"x;y";"q""r"\r\n1;2');
  });
});

describe("tampilan RAB bulanan dan perkiraan pencairan", () => {
  const J = (o: Partial<JadwalItem>): JadwalItem => ({ rab_id: 1, ro_kode: "2903.BMA.007", item_id: 1, pok_kunci: "K1", akun_menjadi: "521811", uraian: "Honor", baris_id: 1, ket: "", bulan: 3, minggu: 2, nilai: 100, ...o });
  const data = [J({}), J({ baris_id: 2, minggu: 4, nilai: 50 }), J({ bulan: 5, minggu: 1, nilai: 70 }), J({ ro_kode: "2903.BMA.009", item_id: 2, baris_id: 3, uraian: "ATK", bulan: 3, nilai: 30 })];

  it("tag minggu penuh dan jumlah baris tiap item", () => {
    const honor = susunBulanan(data).item.find((x) => x.itemId === 1)!;
    expect(honor.tag[2]).toEqual([2, 4]); expect(honor.tag[4]).toEqual([1]); expect(honor.tag[0]).toEqual([]);
    expect(honor.nBaris).toBe(2); expect(honor.pokKunci).toBe("K1");
    expect(teksTag(honor.tag[2])).toBe("M2, M4");
  });
  it("kelompokBulanan: per RO dengan subtotal, filter RO, dan nilai terbesar", () => {
    const item = susunBulanan(data).item;
    const semua = kelompokBulanan(item);
    expect(semua.kelompok.map((k) => k.ro)).toEqual(["2903.BMA.007", "2903.BMA.009"]);
    expect(semua.kelompok[0].perBulan[2]).toBe(150); expect(semua.kelompok[0].total).toBe(220);
    expect(semua.perBulan[2]).toBe(180); expect(semua.total).toBe(250); expect(semua.maks).toBe(150);
    const satu = kelompokBulanan(item, "2903.BMA.009");
    expect(satu.kelompok).toHaveLength(1); expect(satu.total).toBe(30);
    expect(kelompokBulanan(item, "2903.BMA.999").kelompok).toEqual([]);
  });
  it("bayangBiru: kosong transparan, makin besar makin pekat, tahan nilai terbesar nol", () => {
    expect(bayangBiru(0, 100)).toBe("transparent");
    expect(bayangBiru(100, 100)).toBe("rgba(29,95,180,0.38)");
    expect(bayangBiru(50, 100)).toBe("rgba(29,95,180,0.23)");
    expect(bayangBiru(5, 0)).toBe("rgba(29,95,180,1.58)".replace("1.58", (0.08 + 0.3 * 5).toFixed(2)));
  });
  it("susunPencairan: per bulan, per minggu, rincian urut minggu, filter RO", () => {
    const p = susunPencairan(data);
    expect(p.total).toBe(250); expect(p.bulan).toHaveLength(12);
    expect(p.bulan[2].total).toBe(180); expect(p.bulan[2].minggu).toEqual([0, 130, 0, 50]);
    expect(p.bulan[2].rincian.map((r) => r.minggu)).toEqual([2, 2, 4]);
    expect(p.maks).toBe(130);
    expect(susunPencairan(data, "2903.BMA.009").total).toBe(30);
  });
  it("ketBulan", () => {
    const p = susunPencairan(data);
    expect(ketBulan(p.bulan[2])).toBe("3 baris rincian · M2, M4");
    expect(ketBulan(p.bulan[0])).toBe("tidak ada pencairan");
  });
  it("barisJadwalBeda: hanya baris yang jumlah jadwalnya tak sama dengan rincian", () => {
    const rincian = new Map([[1, 170], [2, 50], [3, 40], [99, 10]]);
    expect(barisJadwalBeda(data, rincian)).toEqual([3]);
    expect(barisJadwalBeda(data, new Map([[1, 170], [2, 50], [3, 30]]))).toEqual([]);
  });
  it("catatan kaki memuat jumlah POK tanpa RAB; usulan tag lengkap", () => {
    expect(teksCatatanPencairan(1500000, (v) => String(v))).toContain("POK Rp 1500000");
    expect(USULAN_TAG.every((t) => t.tag >= 1 && t.tag <= 4 && /^\d{6}$/.test(t.akun))).toBe(true);
  });
});
