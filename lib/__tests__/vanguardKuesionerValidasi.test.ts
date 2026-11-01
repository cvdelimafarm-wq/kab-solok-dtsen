import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bersihkanIsian, MAKS_ENTRI } from "../vanguard/kuesioner/validasi";
import { TEMPLAT_K, cariKasusK } from "../vanguard/kuesioner/nilaiK";
import { KASUS_K_PUBLIK, cariKasusKPublik } from "../vanguard/kuesioner/publik";

const AKAR = path.resolve(__dirname, "..", "..");

describe("bersihkanIsian (V6d)", () => {
  it("menerima isian wajar dan menyisakan satu entri per (rincian, ART)", () => {
    const { isian, galat } = bersihkanIsian([{ r: 156, k1: 2, k2: 25000 }, { r: 156, k1: 3, k2: 1 }, { r: 158, k1: 105, k2: 4500, nama: "  santan   instan ", satuan: "ML" }]);
    expect(galat).toBeNull();
    expect(isian).toHaveLength(2);
    expect(isian.find((e) => e.r === 156)?.k1).toBe(3);
    expect(isian.find((e) => e.r === 158)?.nama).toBe("santan instan");
  });
  it("menolak rincian tak dikenal, angka negatif/tak hingga/teks, bukan daftar, dan terlalu banyak", () => {
    expect(bersihkanIsian([{ r: 999, k1: 1 }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 156, k2: -1 }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 156, k2: Infinity }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 156, k2: "5" }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 156.5 }]).galat).not.toBeNull();
    expect(bersihkanIsian("x").galat).not.toBeNull();
    expect(bersihkanIsian([null]).galat).not.toBeNull();
    expect(bersihkanIsian(Array.from({ length: MAKS_ENTRI + 1 }, () => ({ r: 156 }))).galat).not.toBeNull();
  });
  it("ART dan kode sumber hanya berlaku pada rincian per ART (R187–R225)", () => {
    const a = bersihkanIsian([{ r: 190, art: 2, k1: 1, k2: 1000, sumber: 1 }, { r: 190, art: 3, k1: 1, k2: 2000, sumber: 1 }]);
    expect(a.isian).toHaveLength(2);
    expect(bersihkanIsian([{ r: 190, art: 99 }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 190, art: 1, sumber: 5 }]).galat).not.toBeNull();
    expect(bersihkanIsian([{ r: 156, art: 7, k1: 1, k2: 1 }]).isian[0].art).toBeUndefined();
  });
  it("memangkas teks panjang", () => {
    const { isian } = bersihkanIsian([{ r: 158, k1: 1, k2: 1, nama: "A".repeat(200) }]);
    expect(isian[0].nama).toHaveLength(60);
  });
});

describe("daftar publik kasus K (V6d/V7a)", () => {
  it("kasus-k-publik.json mengikuti templat-k.json (jalankan node scripts/vanguard-bangun-publik.mjs bila gagal) dan hanya memuat kode, level, judul", () => {
    expect(KASUS_K_PUBLIK).toEqual(TEMPLAT_K.map((t) => ({ kode: t.kode, level: t.level, judul: t.judul })));
    expect(cariKasusKPublik("K01")?.judul).toBe(cariKasusK("K01")?.judul);
    for (const k of KASUS_K_PUBLIK) expect(Object.keys(k).sort()).toEqual(["judul", "kode", "level"]);
  });
  it("tidak memuat cerita, angka, kunci, jebakan, petunjuk, pembahasan", () => {
    const mentah = fs.readFileSync(path.join(AKAR, "lib/vanguard/kuesioner/kasus-k-publik.json"), "utf8");
    for (const f of ['"kunci"', '"jebakan"', '"petunjuk"', '"pembahasan"', '"rujukan"', '"cerita"', '"catatan"', '"parameter"']) expect(mentah).not.toContain(f);
  });
});
