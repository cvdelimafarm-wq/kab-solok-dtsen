import { describe, expect, it } from "vitest";
import { META_CONTOH, NAMA_PEMICU, pemicuBaris, saranDari, SKENARIO, tabelPemicu, tingkatDari, type BarisContoh } from "../pemicu";

let n = 0;
const r = (akun: string, uraian: string, vol: number, harga: number, p: Partial<BarisContoh> = {}): BarisContoh =>
  ({ id: ++n, ro: "2906.BMA.005", kom: "052", akun, akunM: akun, uraian, uraM: uraian, vol, volM: vol, harga, hargaM: harga, ...p });

describe("pemicu P-01 sampai P-08", () => {
  it("angka saja = P-01; tanpa perubahan = kosong", () => {
    n = 0;
    const a = r("521211", "Konsumsi", 100, 50_000, { volM: 80 }), c = r("521211", "Lain", 1, 1000);
    expect(pemicuBaris([a, c], a)).toBe("P-01");
    expect(pemicuBaris([a, c], c)).toBe("");
  });
  it("redaksi diganti = P-02 pada pasangan; akun pindah = P-03", () => {
    n = 0;
    const lama = r("521211", "Konsumsi", 100, 50_000, { volM: 0, pindahKe: 2 });
    const baru = r("521211", "Konsumsi koordinasi", 0, 50_000, { volM: 100, uraM: "Konsumsi koordinasi", baru: true, pindahDari: 1 });
    expect(pemicuBaris([lama, baru], lama)).toBe("P-02");
    expect(pemicuBaris([lama, baru], baru)).toBe("P-02");
    n = 0;
    const l2 = r("524113", "Transport", 10, 100, { volM: 0, pindahKe: 2 });
    const b2 = r("524113", "Transport", 0, 100, { akunM: "524114", volM: 10, baru: true, pindahDari: 1 });
    expect(pemicuBaris([l2, b2], b2)).toBe("P-03");
  });
  it("item baru: akun baru P-04, akun sudah ada P-06", () => {
    n = 0;
    const ada = r("521211", "A", 1, 100);
    const baru1 = r("521213", "Honor", 0, 1000, { volM: 1, baru: true });
    const baru2 = r("521211", "B", 0, 1000, { volM: 1, baru: true });
    const semua = [ada, baru1, baru2];
    expect(pemicuBaris(semua, baru1)).toBe("P-04");
    expect(pemicuBaris(semua, baru2)).toBe("P-06");
  });
  it("dikosongkan: sisa item lain = P-07, tunggal = P-05", () => {
    n = 0;
    const a = r("521211", "A", 1, 100, { volM: 0 }), b = r("521211", "B", 1, 100), c = r("521811", "ATK", 1, 100, { volM: 0 });
    expect(pemicuBaris([a, b, c], a)).toBe("P-07");
    expect(pemicuBaris([a, b, c], c)).toBe("P-05");
  });
  it("lebih dari satu perubahan pada satu baris = P-08", () => {
    n = 0;
    const a = r("521211", "A", 10, 100, { volM: 8, uraM: "A baru" });
    expect(pemicuBaris([a], a)).toBe("P-08");
  });
  it("tabel pemicu memuat delapan kode berurutan dengan nama", () => {
    const t = tabelPemicu();
    expect(t.map((x) => x.kode)).toEqual(["P-01", "P-02", "P-03", "P-04", "P-05", "P-06", "P-07", "P-08"]);
    for (const x of t) { expect(x.nama).toBe(NAMA_PEMICU[x.kode]); expect(x.kapan.length).toBeGreaterThan(15); }
  });
});

describe("tingkat dan saran jenis pada skenario contoh", () => {
  const hasil = Object.fromEntries(SKENARIO.map((s) => [s.kode, saranDari(s.rows, META_CONTOH)]));
  it("setiap skenario berimbang (pagu Satker tetap) kecuali T06", () => {
    for (const s of SKENARIO) {
      const sel = s.rows.reduce((a, x) => a + (x.volM * x.hargaM - x.vol * x.harga), 0);
      if (s.kode === "T06") expect(sel).toBeGreaterThan(0); else expect(sel, s.kode).toBe(0);
    }
  });
  it("tingkat 1 sampai 5", () => {
    expect(tingkatDari(SKENARIO.find((s) => s.kode === "T00")!.rows, META_CONTOH)).toBe(1);
    expect(hasil.T01.tingkat).toBe(2);
    expect(hasil.T02.tingkat).toBe(3);
    expect(hasil.T03.tingkat).toBe(4);
    expect(hasil.T05b.tingkat).toBe(5);
  });
  it("jenis menurut tingkat dan pemicu lain", () => {
    expect(hasil.T00).toMatchObject({ jenis: "pok", campuran: false });
    expect(hasil.T01).toMatchObject({ jenis: "pok" });
    expect(hasil.T02.jenis).toBe("dipa_djpb");
    expect(hasil.T03).toMatchObject({ jenis: "dipa_djpb", lampiran: ["Surat persetujuan pejabat Eselon I"] });
    expect(hasil.T05b.jenis).toBe("dipa_dja");
    expect(hasil.T04.jenis).toBe("dipa_djpb");
    expect(hasil.T06.jenis).toBe("dipa_dja");
    expect(hasil.T06.alasan[0]).toContain("Pagu Satker berubah");
    expect(hasil.T15.jenis).toBe("pok");
    expect(hasil.T15.alasan[0]).toContain("Hanya redaksi");
  });
  it("campuran: baris jalur POK terpisah dari baris DJPb", () => {
    const h = hasil.T07;
    expect(h.jenis).toBe("dipa_djpb");
    expect(h.campuran).toBe(true);
    expect(h.penaik.length).toBe(2);
    expect(h.pokSaja.length).toBe(2);
  });
  it("tanpa perubahan tidak ada saran", () => {
    n = 0;
    expect(saranDari([r("521211", "A", 1, 100)], META_CONTOH)).toMatchObject({ jenis: null, tingkat: 0, campuran: false });
  });
});
