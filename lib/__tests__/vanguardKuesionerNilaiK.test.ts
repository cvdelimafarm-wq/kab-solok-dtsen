import { describe, expect, it } from "vitest";
import { KASUS_K, cariKasusK, nilaiKasusK, type IsianK } from "../vanguard/kuesioner/nilaiK";
import { hitungIv1, periksaIv1, rekapIv31, rekapIv32 } from "../vanguard/kuesioner/engine";
import { cariRincianIv1 } from "../vanguard/kuesioner/rincian";

const k01 = cariKasusK("K01")!;
const salin = (): IsianK[] => k01.kunci.map((e) => ({ ...e }));
const ubah = (r: number, f: (e: IsianK) => void): IsianK[] => salin().map((e) => { if (e.r === r) f(e); return e; });

describe("kasus K01 dan penilaian per entri (V6c)", () => {
  it("K01: 14 entri kunci, semua rincian ada di daftar IV.1 dan berada pada R.155–R.186", () => {
    expect(KASUS_K).toHaveLength(2);
    expect(k01.kunci).toHaveLength(14);
    for (const e of k01.kunci) { expect(cariRincianIv1(e.r), `R${e.r}`).toBeDefined(); expect(e.r).toBeGreaterThanOrEqual(155); expect(e.r).toBeLessThanOrEqual(186); }
    expect(cariRincianIv1(158)?.nama).toContain("lainnya");
    expect(cariRincianIv1(186)?.nama).toContain("Lainnya");
  });
  it("angka kunci mengikuti contoh Buku 4 (konversi dan pembulatan)", () => {
    const get = (r: number) => k01.kunci.find((e) => e.r === r)!;
    expect(Math.round(4.8 * 3 * 7)).toBe(101);                     // garam 100,8 → 101 gram
    expect(Math.round((2000 / 150) * 101)).toBe(1347);              // Rp13,33 × 101
    expect(get(168)).toMatchObject({ k1: 101, k2: 1347 });
    expect(get(176)).toMatchObject({ k1: 0.68, k2: 3750 });          // 135/100 × 0,5 = 0,675 → 0,68
    expect(get(158)).toMatchObject({ k1: 105, k2: 4500, nama: "SANTAN INSTAN", satuan: "ML" });
    expect(get(160)).toMatchObject({ k1: 10, k2: 14000 });          // 1 kg = 10 ons, harga jual Rp14.000
    expect(get(185)).toMatchObject({ k1: 0.33, k2: 7000 });
    expect(get(186)).toMatchObject({ k1: 750, k2: 12000, nama: "BIHUN", satuan: "GRAM" });
  });
  it("kunci → benar, rekap sesuai; isian kosong → semua belum diisi", () => {
    const b = nilaiKasusK(k01, salin());
    expect(b).toMatchObject({ benar: true, sesuai: 14, total: 14, rekapSesuai: true });
    const k = nilaiKasusK(k01, []);
    expect(k.benar).toBe(false);
    expect(k.kesalahan).toHaveLength(14);
    expect(new Set(k.kesalahan.map((x) => x.jenis))).toEqual(new Set(["belum_diisi"]));
    expect(k.rekapSesuai).toBe(false);
  });
  it("toleransi: nilai ±Rp1 dan banyaknya ±0,01 diterima", () => {
    expect(nilaiKasusK(k01, ubah(168, (e) => { e.k2 = 1346; e.k1 = 101; })).benar).toBe(true);
    expect(nilaiKasusK(k01, ubah(176, (e) => { e.k1 = 0.675; })).benar).toBe(true);
  });
  it("salah letak: santan instan di R166 (nilai sama) → salah_rincian fatal, dan R158 tidak dianggap kosong dua kali", () => {
    const x = salin().filter((e) => e.r !== 158); x.push({ r: 166, k1: 105, k2: 4500, nama: "SANTAN INSTAN", satuan: "ML" });
    const h = nilaiKasusK(k01, x);
    const s = h.kesalahan.find((e) => e.jenis === "salah_rincian")!;
    expect(s.tingkat).toBe("fatal");
    expect(s.pesan).toContain("dicatat pada R166, seharusnya pada R158");
    expect(s.pesan).toContain("Santan instan tidak punya baris sendiri"); // jebakan khas ditempel
    expect(h.kesalahan.filter((e) => e.jenis === "belum_diisi")).toHaveLength(0);
  });
  it("salah sumber (produksi di kolom 7–8 padahal pembelian), harga kulakan, konversi sendok, nama lainnya", () => {
    const sumber = nilaiKasusK(k01, ubah(160, (e) => { e.k3 = e.k1; e.k4 = e.k2; e.k1 = undefined; e.k2 = undefined; }));
    expect(sumber.kesalahan[0]).toMatchObject({ jenis: "salah_sumber", tingkat: "fatal", r: 160 });
    const kulakan = nilaiKasusK(k01, ubah(168, (e) => { e.k2 = 1010; }));
    expect(kulakan.kesalahan[0]).toMatchObject({ jenis: "angka_meleset", tingkat: "berat", r: 168 });
    expect(kulakan.kesalahan[0].pesan).toContain("harga JUAL warung");
    const sendok = nilaiKasusK(k01, ubah(168, (e) => { e.k1 = 21; }));
    expect(sendok.kesalahan[0]).toMatchObject({ jenis: "banyaknya_meleset", tingkat: "berat" });
    expect(sendok.kesalahan[0].pesan).toContain("konversi satuan");
    const kecil = nilaiKasusK(k01, ubah(165, (e) => { e.k2 = 10300; }));
    expect(kecil.kesalahan[0]).toMatchObject({ jenis: "angka_meleset", tingkat: "ringan" }); // 1,9%
    const nama = nilaiKasusK(k01, ubah(186, (e) => { e.nama = ""; }));
    expect(nama.kesalahan[0]).toMatchObject({ jenis: "nama_lainnya", tingkat: "berat" });
    expect(nilaiKasusK(k01, ubah(158, (e) => { e.satuan = "GRAM"; })).kesalahan[0].pesan).toContain("Satuan baris R158 harus ML");
  });
  it("entri berlebih → harus_kosong; rekap dihitung engine dari isian petugas", () => {
    const lebih = [...salin(), { r: 125, k1: 1, k2: 10000 }]; // tahu bukan bagian catatan
    const h = nilaiKasusK(k01, lebih);
    expect(h.kesalahan).toHaveLength(1);
    expect(h.kesalahan[0]).toMatchObject({ jenis: "harus_kosong", tingkat: "fatal", r: 125 });
    expect(h.rekapSesuai).toBe(false);
    const rek = rekapIv32(hitungIv1(k01.kunci));
    expect(rek[8].k3).toBe(25000 + 16000 + 4500); // R9 minyak dan kelapa (R156 + R157 + R158)
    expect(rek[9].k3).toBe(14000 + 300 + 10500);    // R10 bahan minuman (R160 + R161 + R165)
  });
});

describe("kasus K02 (makanan jadi dan rokok per ART)", () => {
  const k02 = cariKasusK("K02")!;
  const salin2 = () => k02.kunci.map((e) => ({ ...e }));
  const ubah2 = (r: number, art: number, f: (e: IsianK) => void) => { const x = salin2(); f(x.find((e) => e.r === r && e.art === art)!); return x; };
  it("kunci sendiri = benar, rekap sesuai; 10 entri, 4 ART", () => {
    const h = nilaiKasusK(k02, salin2());
    expect(h.benar).toBe(true); expect(h.rekapSesuai).toBe(true); expect(h.total).toBe(10);
    expect(new Set(k02.kunci.map((e) => e.art))).toEqual(new Set([1, 2, 3, 4]));
  });
  it("kunci K02 lolos aturan bentuk kuesioner (periksaIv1) dan rekap IV.3.1 per ART benar", () => {
    expect(periksaIv1(k02.kunci)).toEqual([]);
    const r = rekapIv31(hitungIv1(k02.kunci));
    expect(r.baris.find((b) => b.art === 1)).toMatchObject({ k3: 102000 + 0, k4: 0, k5: 17000, k6: 0 });
    expect(r.baris.find((b) => b.art === 2)).toMatchObject({ k3: 0, k4: 24000 });
  });
  it("pemberian dicatat sebagai pembelian = salah_sumber fatal dengan label ART", () => {
    const x = ubah2(200, 2, (e) => { e.k1 = e.k3; e.k2 = e.k4; e.k3 = undefined; e.k4 = undefined; });
    const s = nilaiKasusK(k02, x).kesalahan[0];
    expect(s).toMatchObject({ jenis: "salah_sumber", tingkat: "fatal", r: 200, art: 2 });
    expect(s.pesan.startsWith("ART 2:")).toBe(true);
  });
  it("kode sumber salah = kode_sumber (berat); dicatat pada ART lain = salah_art (berat)", () => {
    const a = nilaiKasusK(k02, ubah2(192, 3, (e) => { e.sumber = 1; })).kesalahan[0];
    expect(a).toMatchObject({ jenis: "kode_sumber", tingkat: "berat", r: 192, art: 3 });
    const x = salin2().filter((e) => !(e.r === 192 && e.art === 3)); x.push({ r: 192, art: 4, k1: 2, k2: 3000, sumber: 2 });
    const b = nilaiKasusK(k02, x).kesalahan.find((e) => e.jenis === "salah_art")!;
    expect(b.tingkat).toBe("berat"); expect(b.pesan).toContain("ART 4"); expect(b.pesan).toContain("ART 3");
  });
  it("isian pada Naldo (ART 5) = harus_kosong fatal; konversi siomai 2 porsi = banyaknya_meleset", () => {
    const x = salin2(); x.push({ r: 204, art: 5, k1: 1, k2: 3000, sumber: 2 });
    expect(nilaiKasusK(k02, x).kesalahan.find((e) => e.art === 5)).toMatchObject({ jenis: "harus_kosong", tingkat: "fatal" });
    expect(nilaiKasusK(k02, ubah2(210, 3, (e) => { e.k1 = 2; })).kesalahan[0]).toMatchObject({ jenis: "banyaknya_meleset", r: 210 });
  });
});
