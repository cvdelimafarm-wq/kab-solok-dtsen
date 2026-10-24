import { describe, it, expect } from "vitest";
import { uraiGlp039, tanggalDariJudul } from "../glp039";

// baris: teks di kolom 0..., angka mulai kolom 16
const K = (...t: string[]) => t;
function baris(teks: string[], angka?: number[]): unknown[] {
  const r: unknown[] = new Array(16 + (angka?.length ?? 0)).fill(null);
  teks.forEach((t, i) => { r[i] = t; });
  (angka ?? []).forEach((a, i) => { r[16 + i] = a; });
  return r;
}
const judul = [
  baris(["LAPORAN KETERSEDIAAN DANA DETAIL"]),
  baris(["Per Tanggal 26 Juli 2026"]),
  [], [], [], [], [], [],
];
// item: pagu, lock, lalu, ini, sd, persen, sisa
const A1 = [1000, 0, 200, 300, 500, 50, 500];
const A2 = [2000, 100, 0, 0, 0, 0, 1900];
const jumlah = A1.map((x, i) => x + A2[i]);

function fixture(): unknown[][] {
  return [
    ...judul,
    baris(["GG"], jumlah),
    baris(["GG.2906", "Statistik"], jumlah),
    baris(["BMA", "Data"], jumlah),
    baris(["BMA.005", "Survei"], jumlah),
    baris(["051", "Persiapan"], jumlah),
    baris(["051.AB", "Sub"], jumlah),
    baris(["521211", "Belanja Bahan"], jumlah),
    baris(["000252. ATK dan bahan"], A1),
    baris(["000253. Konsumsi rapat"], A2),
    baris(["*Lock Pagu adalah blokir"]),
    baris(["Hal 1 dari 1"]),
    baris(["JUMLAH SELURUHNYA"], jumlah),
  ];
}

describe("uraiGlp039", () => {
  it("membaca hierarki dan item", () => {
    const h = uraiGlp039(fixture());
    expect(h.galat).toEqual([]);
    expect(h.ok).toBe(true);
    expect(h.item).toHaveLength(2);
    expect(h.item[0]).toMatchObject({ nomor_item: "000252", ro_kode: "2906.BMA.005", komponen_kode: "051", akun_kode: "521211", uraian: "ATK dan bahan", pagu: 1000, real_sd: 500, sisa: 500 });
    expect(h.ringkas).toMatchObject({ nItem: 2, nRo: 1, pagu: 3000, lock: 100, realisasi: 500, sisa: 2400 });
    expect(h.sampaiTanggal).toBe("2026-07-26");
    expect(h.peringatan).toEqual([]);
  });
  it("menggabungkan baris sambungan uraian", () => {
    const f = fixture();
    f.splice(8 + 7 + 1, 0, baris(["lanjutan uraian panjang"], A1)); // setelah item pertama
    const h = uraiGlp039(f);
    expect(h.item[0].uraian).toBe("ATK dan bahan lanjutan uraian panjang");
    expect(h.item).toHaveLength(2);
    expect(h.ok).toBe(true);
  });
  it("menolak identitas s.d. salah", () => {
    const f = fixture();
    f[8 + 7] = baris(["000252. ATK dan bahan"], [1000, 0, 200, 300, 400, 40, 600]);
    const h = uraiGlp039(f);
    expect(h.ok).toBe(false);
    expect(h.galat.join(" ")).toMatch(/s\.d\./);
  });
  it("menolak sisa salah", () => {
    const f = fixture();
    f[8 + 7] = baris(["000252. ATK dan bahan"], [1000, 0, 200, 300, 500, 50, 400]);
    expect(uraiGlp039(f).galat.join(" ")).toMatch(/sisa/);
  });
  it("menolak nomor item ganda", () => {
    const f = fixture();
    f[8 + 8] = baris(["000252. ATK lagi"], A2);
    expect(uraiGlp039(f).galat.join(" ")).toMatch(/lebih dari sekali/);
  });
  it("menolak bila jumlah item tidak sama dengan total laporan", () => {
    const f = fixture();
    f[f.length - 1] = baris(["JUMLAH SELURUHNYA"], jumlah.map((x) => x + 5000));
    const h = uraiGlp039(f);
    expect(h.ok).toBe(false);
    expect(h.galat.join(" ")).toMatch(/JUMLAH SELURUHNYA/);
  });
  it("memberi peringatan bila total tidak ada", () => {
    const f = fixture();
    f.pop();
    const h = uraiGlp039(f);
    expect(h.ok).toBe(true);
    expect(h.peringatan.join(" ")).toMatch(/JUMLAH SELURUHNYA/);
  });
  it("galat bila item tanpa tujuh angka", () => {
    const f = fixture();
    f[8 + 7] = baris(["000252. ATK dan bahan"], [1, 2, 3]);
    expect(uraiGlp039(f).ok).toBe(false);
  });
  it("galat bila tidak ada item (berkas salah)", () => {
    const h = uraiGlp039([baris(["bukan laporan"]), baris(["a", "b"])]);
    expect(h.ok).toBe(false);
    expect(h.item).toEqual([]);
  });
  it("RO lebih dari satu dan kegiatan berbeda", () => {
    const f = fixture();
    const sisip = [
      baris(["BMA.006", "RO lain"], A1),
      baris(["051", "x"], A1),
      baris(["521213", "y"], A1),
      baris(["000300. item lain"], A1),
    ];
    f.splice(f.length - 1, 0, ...sisip);
    f[f.length - 1] = baris(["JUMLAH SELURUHNYA"], jumlah.map((x, i) => x + A1[i]));
    const h = uraiGlp039(f);
    expect(h.galat).toEqual([]);
    expect(h.ringkas.nRo).toBe(2);
    expect(h.item[2]).toMatchObject({ ro_kode: "2906.BMA.006", akun_kode: "521213" });
  });
  it("memberi peringatan bila jumlah akun berbeda", () => {
    const f = fixture();
    f[8 + 6] = baris(["521211", "Belanja Bahan"], jumlah.map((x) => x + 100));
    const h = uraiGlp039(f);
    expect(h.peringatan.join(" ")).toMatch(/akun/);
  });
});

describe("tanggalDariJudul", () => {
  it("beberapa format", () => {
    expect(tanggalDariJudul(["Per 26 Juli 2026"])).toBe("2026-07-26");
    expect(tanggalDariJudul(["Per 26/07/2026"])).toBe("2026-07-26");
    expect(tanggalDariJudul(["2026-07-26"])).toBe("2026-07-26");
    expect(tanggalDariJudul(["tanpa tanggal"])).toBeNull();
    expect(tanggalDariJudul(["31/02/2026"])).toBeNull();
  });
});

import { akhirPeriodeDariJudul } from "../glp039";
describe("akhirPeriodeDariJudul", () => {
  it("hari terakhir bulan", () => {
    expect(akhirPeriodeDariJudul(["Periode September 2026"])).toBe("2026-09-30");
    expect(akhirPeriodeDariJudul(["Periode Februari 2028"])).toBe("2028-02-29");
    expect(akhirPeriodeDariJudul(["x"])).toBeNull();
  });
});
