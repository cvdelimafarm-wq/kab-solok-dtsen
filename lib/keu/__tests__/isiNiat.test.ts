import { describe, expect, it } from "vitest";
import { alasanTidakBisa, isiDariNiat, isiTulisLangkah, kalimatIsi, langkahDariNiat } from "../isiNiat";
import type { BarisKk } from "../kk";
import type { BarisRencana } from "../niat";

const baris = (o: Partial<BarisKk> & { id: number; pok_kunci: string }): BarisKk => ({
  jadwal_id: 1, ro_kode: "2906.BMA.006", kro: null, detail_id: o.id, komponen_kode: "052", akun_semula: "524113", akun_menjadi: "524113", uraian_semula: "u", uraian_menjadi: "u",
  vol_semula: 10, vol_menjadi: 10, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100000, harga_menjadi: 100000, jumlah_semula: 1000000, jumlah_menjadi: 1000000, selisih: 0,
  pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: 1, pemicu: null, ...o,
});
const rencana = (o: Partial<BarisRencana> & { kunci: string }): BarisRencana => ({
  detail_id: 1, akun: "524113", uraian: "Butir", golongan: "lebih", besar: 0, niat: "lepas", jumlah: 0, bawaan: false, disesuaikan: false, catatan: null, ...o,
});

describe("isiDariNiat", () => {
  it("Lepas: volume turun sehingga dana dilepas tidak melebihi rencana", () => {
    const h = isiDariNiat([rencana({ kunci: "a", niat: "lepas", jumlah: 350000 })], [baris({ id: 1, pok_kunci: "a" })]);
    expect(h.langkah).toHaveLength(1);
    expect(h.langkah[0].volBaru).toBe(7); // sisa 650.000 -> 6,5 -> 7 satuan
    expect(h.langkah[0].perubahan).toBe(-300000);
    expect(h.langkah[0].sisaPembulatan).toBe(50000);
    expect(h.dilepas).toBe(300000);
  });
  it("Lepas seluruhnya mengosongkan volume", () => {
    const h = isiDariNiat([rencana({ kunci: "a", niat: "lepas", jumlah: 1000000 })], [baris({ id: 1, pok_kunci: "a" })]);
    expect(h.langkah[0].volBaru).toBe(0);
    expect(h.langkah[0].perubahan).toBe(-1000000);
  });
  it("Tambal: volume naik sebanyak satuan utuh yang dananya tidak melebihi rencana", () => {
    const h = isiDariNiat([rencana({ kunci: "b", golongan: "kurang", niat: "tambal", jumlah: 250000 })], [baris({ id: 2, pok_kunci: "b" })]);
    expect(h.langkah[0].volBaru).toBe(12);
    expect(h.langkah[0].perubahan).toBe(200000);
    expect(h.langkah[0].sisaPembulatan).toBe(-50000);
    expect(h.ditambah).toBe(200000);
  });
  it("Tambahan diperlakukan seperti Tambal", () => {
    const h = isiDariNiat([rencana({ kunci: "b", golongan: "kurang", niat: "tambahan", jumlah: 100000 })], [baris({ id: 2, pok_kunci: "b" })]);
    expect(h.langkah[0].volBaru).toBe(11);
  });
  it("Biarkan dan Tunda tidak menjadi langkah maupun dilewati", () => {
    const h = isiDariNiat([rencana({ kunci: "a", niat: "biarkan" }), rencana({ kunci: "b", golongan: "kurang", niat: "tunda" })], [baris({ id: 1, pok_kunci: "a" }), baris({ id: 2, pok_kunci: "b" })]);
    expect(h.langkah).toHaveLength(0);
    expect(h.dilewati).toHaveLength(0);
    expect(kalimatIsi(h)).toMatch(/Tidak ada rencana/);
  });
  it("baris yang sudah diubah, dipasangkan, atau tidak ada dilewati dengan alasan", () => {
    const r = [
      rencana({ kunci: "a", niat: "lepas", jumlah: 100000 }), rencana({ kunci: "b", niat: "lepas", jumlah: 100000 }), rencana({ kunci: "c", niat: "lepas", jumlah: 100000 }),
      rencana({ kunci: "d", niat: "lepas", jumlah: 100000 }),
    ];
    const h = isiDariNiat(r, [
      baris({ id: 1, pok_kunci: "a", vol_menjadi: 9, jumlah_menjadi: 900000 }),
      baris({ id: 2, pok_kunci: "b", pindah_ke: 77 }),
      baris({ id: 3, pok_kunci: "c", harga_semula: 0, harga_menjadi: 0 }),
    ]);
    expect(h.langkah).toHaveLength(0);
    expect(h.dilewati.map((x) => x.kunci)).toEqual(["a", "b", "c", "d"]);
    expect(h.dilewati[0].alasan).toMatch(/Sudah diubah/);
    expect(h.dilewati[1].alasan).toMatch(/dipasangkan/);
    expect(h.dilewati[3].alasan).toMatch(/belum ada/);
  });
  it("menjalankan ulang setelah terisi tidak menggandakan (baris sudah berbeda dari Semula)", () => {
    const sesudah = baris({ id: 1, pok_kunci: "a", vol_menjadi: 7, jumlah_menjadi: 700000 });
    const h = isiDariNiat([rencana({ kunci: "a", niat: "lepas", jumlah: 350000 })], [sesudah]);
    expect(h.langkah).toHaveLength(0);
    expect(h.dilewati[0].alasan).toMatch(/Sudah diubah/);
  });
  it("jumlah kurang dari satu satuan dilewati", () => {
    expect(typeof langkahDariNiat(rencana({ kunci: "b", golongan: "kurang", niat: "tambal", jumlah: 50000 }), baris({ id: 2, pok_kunci: "b" }))).toBe("string");
  });
  it("baris penggenap dan item baru tidak dicocokkan", () => {
    const h = isiDariNiat([rencana({ kunci: "a", niat: "lepas", jumlah: 100000 })], [baris({ id: 1, pok_kunci: "a", detail_id: null, penggenap: true })]);
    expect(h.langkah).toHaveLength(0);
  });
  it("selisih keseimbangan dan kalimat", () => {
    const h = isiDariNiat(
      [rencana({ kunci: "a", niat: "lepas", jumlah: 300000 }), rencana({ kunci: "b", golongan: "kurang", niat: "tambal", jumlah: 300000 })],
      [baris({ id: 1, pok_kunci: "a" }), baris({ id: 2, pok_kunci: "b" })],
    );
    expect(h.selisihKeseimbangan).toBe(0);
    expect(kalimatIsi(h)).toMatch(/Seimbang/);
    const h2 = isiDariNiat([rencana({ kunci: "b", golongan: "kurang", niat: "tambal", jumlah: 300000 })], [baris({ id: 2, pok_kunci: "b" })]);
    expect(kalimatIsi(h2)).toMatch(/lebih besar/);
  });
  it("isiTulisLangkah hanya mengisi catatan yang kosong", () => {
    const h = isiDariNiat([rencana({ kunci: "a", niat: "lepas", jumlah: 300000 })], [baris({ id: 1, pok_kunci: "a" })]);
    expect(isiTulisLangkah(h.langkah[0], "")).toMatchObject({ vol_menjadi: 7, catatan: expect.stringContaining("Lepas") });
    expect(isiTulisLangkah(h.langkah[0], "catatan saya")).toEqual({ vol_menjadi: 7 });
  });
  it("alasanTidakBisa", () => {
    expect(alasanTidakBisa(undefined)).toMatch(/belum ada/);
    expect(alasanTidakBisa(baris({ id: 1, pok_kunci: "a" }))).toBeNull();
  });
});
