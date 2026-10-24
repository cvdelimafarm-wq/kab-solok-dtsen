import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { BarisKk } from "../kk";
import { gabungKetersediaan, type BarisMx } from "../matriks";
import { bungkus, buatPdfLembar } from "../lembarPdf";
import { lembarExcel, penetapJenis, susunIsiLembar } from "../lembarPerubahan";

let seq = 0;
const B = (o: Partial<BarisKk> = {}): BarisMx => {
  const b: BarisKk = {
    id: ++seq, jadwal_id: 1, ro_kode: "2903.BMA.007", kro: "2903.BMA", detail_id: seq, pok_kunci: `K${seq}`, komponen_kode: "051", akun_semula: "521811", akun_menjadi: "521811",
    uraian_semula: `Item ${seq}`, uraian_menjadi: `Item ${seq}`, vol_semula: 1, vol_menjadi: 1, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100, harga_menjadi: 100,
    jumlah_semula: 100, jumlah_menjadi: 100, selisih: 0, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: seq, pemicu: null, ...o,
  };
  return gabungKetersediaan([b], new Map(), new Map())[0];
};

describe("susunIsiLembar", () => {
  it("hanya baris berubah, total, dan blok tanda tangan", () => {
    const a = B({}), b = B({ jumlah_menjadi: 150, harga_menjadi: 150, selisih: 50, pemicu: "P-01" }), c = B({ jumlah_menjadi: 50, selisih: -50, uraian_menjadi: "Uraian \"khusus\"; satu" });
    const l = susunIsiLembar([a, b, c], "2903.BMA", "pok", "Revisi POK (wewenang KPA)");
    expect(l.jumlahBaris).toBe(2); expect(l.semula).toBe(200); expect(l.menjadi).toBe(200);
    expect(l.baris[0]).toHaveLength(15); expect(l.total[11]).toBe(0);
    expect(l.penetap).toContain("PPK");
    const x = lembarExcel(l);
    expect(x[0][0]).toBe("Matriks perubahan POK, semula menjadi");
    expect(x[x.length - 2]).toEqual([l.jenis, "Operator anggaran", l.penetap]);
  });
  it("penetap menurut jenis", () => { expect(penetapJenis("dipa_djpb")).toContain("DJPb"); expect(penetapJenis("dipa_dja")).toContain("DJA"); expect(penetapJenis("administrasi")).toContain("KPA"); });
});

describe("PDF lembar", () => {
  it("bungkus memecah teks panjang dan kata tanpa spasi", () => {
    const f = { widthOfTextAtSize: (s: string) => s.length * 4 };
    expect(bungkus("aa bb cc dd ee", f, 8, 20)).toEqual(["aa bb", "cc dd", "ee"]);
    expect(bungkus("abcdefghijkl", f, 8, 20).join("")).toBe("abcdefghijkl");
    expect(bungkus("", f, 8, 20)).toEqual([""]);
  });
  it("menghasilkan PDF sah, berpindah halaman bila baris banyak", async () => {
    const baris = Array.from({ length: 120 }, (_, i) => B({ jumlah_menjadi: 100 + i + 1, harga_menjadi: 100 + i + 1, selisih: i + 1, uraian_menjadi: "Uraian panjang ".repeat(8) + "é ★" }));
    const bytes = await buatPdfLembar(susunIsiLembar(baris, "2903.BMA", "dipa_djpb", "Revisi DIPA jalur DJPb (Kanwil)"));
    const d = await PDFDocument.load(bytes);
    expect(d.getPageCount()).toBeGreaterThan(2);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const kosong = await PDFDocument.load(await buatPdfLembar(susunIsiLembar([], "2903.BMA", "pok", "Belum ada perubahan")));
    expect(kosong.getPageCount()).toBe(1);
  });
});
