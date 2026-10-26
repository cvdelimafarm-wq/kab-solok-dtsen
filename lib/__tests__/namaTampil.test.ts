import { describe, expect, it } from "vitest";
import { namaDepanTampil, namaSingkatTampil, namaTampil, namaTanpaGelar } from "../namaTampil";

describe("namaTampil", () => {
  it("huruf kapital di awal tiap kata, berapa pun gaya aslinya", () => {
    expect(namaTampil("MINDA SUSANTI")).toBe("Minda Susanti");
    expect(namaTampil("minda susanti")).toBe("Minda Susanti");
    expect(namaTampil("Minda Susanti")).toBe("Minda Susanti");
    expect(namaTampil("  budi   PERNANDES ")).toBe("Budi Pernandes");
  });
  it("inisial tetap kapital; tanda hubung dan apostrof dijaga", () => {
    expect(namaTampil("m. iqbal hadi")).toBe("M. Iqbal Hadi");
    expect(namaTampil("SITI-AISYAH")).toBe("Siti-Aisyah");
    expect(namaTampil("MA'RUF")).toBe("Ma'ruf");
  });
  it("gelar sesudah koma dibiarkan apa adanya", () => {
    expect(namaTampil("M. IQBAL HADI, SST.")).toBe("M. Iqbal Hadi, SST.");
    expect(namaTampil("BUDI PERNANDES,S.Tr.Stat")).toBe("Budi Pernandes, S.Tr.Stat");
    expect(namaTampil("dewi, S.Si, M.Si")).toBe("Dewi, S.Si, M.Si");
  });
  it("gelar tanpa koma di ujung nama tidak ikut dikapitalkan ulang", () => {
    expect(namaTampil("ANDI WIJAYA S.Si")).toBe("Andi Wijaya, S.Si");
    expect(namaTampil("ANDI WIJAYA SST")).toBe("Andi Wijaya, SST");
  });
  it("kosong / null / undefined -> teks kosong", () => {
    expect(namaTampil("")).toBe("");
    expect(namaTampil(null)).toBe("");
    expect(namaTampil(undefined)).toBe("");
  });
  it("nama satu kata yang kebetulan mirip gelar tetap nama", () => {
    expect(namaTampil("SE")).toBe("Se");
  });
  it("idempoten", () => {
    for (const n of ["MINDA SUSANTI", "m. iqbal hadi, SST.", "Dewi, S.Si, M.Si", "siti-aisyah"]) expect(namaTampil(namaTampil(n))).toBe(namaTampil(n));
  });
});

describe("namaTanpaGelar / namaDepanTampil / namaSingkatTampil", () => {
  it("tanpa gelar", () => {
    expect(namaTanpaGelar("M. IQBAL HADI, SST.")).toBe("M. Iqbal Hadi");
    expect(namaTanpaGelar("ANDI WIJAYA S.Si")).toBe("Andi Wijaya");
  });
  it("nama depan sapaan: lewati inisial, tetap satu gaya", () => {
    expect(namaDepanTampil("MINDA SUSANTI")).toBe("Minda");
    expect(namaDepanTampil("M. Iqbal Hadi, SST.")).toBe("Iqbal");
    expect(namaDepanTampil("M.")).toBe("M.");
    expect(namaDepanTampil("")).toBe("");
  });
  it("nama singkat dua kata", () => {
    expect(namaSingkatTampil("M. HAFIZH DINU AULIA")).toBe("M. Hafizh");
    expect(namaSingkatTampil("MINDA SUSANTI")).toBe("Minda Susanti");
    expect(namaSingkatTampil("Budi")).toBe("Budi");
  });
  it("tiga layar yang tadi berbeda kini seragam", () => {
    const db = "MINDA SUSANTI";
    expect(namaTampil(db)).toBe(namaSingkatTampil(db));
    expect(namaDepanTampil(db)).toBe("Minda");
  });
});
