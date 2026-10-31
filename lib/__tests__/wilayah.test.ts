import { describe, expect, it } from "vitest";
import { cariSls, judulWilayah, namaWilayah, peringatanWilayah, periksaKodeWilayah, ringkasMaster, semuaSls } from "../wilayah/wilayah";
import { MASTER_SOLOK } from "../wilayah/masterSolok";

describe("master wilayah Kabupaten Solok tertanam", () => {
  it("jumlahnya terkunci", () => {
    expect(ringkasMaster()).toEqual({ kecamatan: 14, nagari: 74, sls: 418, sub_sls: 1084 });
  });
  it("semua idsls unik, 14 digit, berawalan 1303", () => {
    const s = semuaSls();
    expect(new Set(s.map((x) => x.idsls)).size).toBe(418);
    expect(s.every((x) => /^1303\d{10}$/.test(x.idsls))).toBe(true);
    expect(s.every((x) => x.sub.length > 0 && x.sub.every((u) => /^\d{2}$/.test(u)))).toBe(true);
  });
  it("tiap baris master berformat benar", () => {
    for (const b of MASTER_SOLOK.trim().split("\n")) expect(b).toMatch(/^1303\d{6}\|[A-Z .\-]+\|[A-Z .\-]+\|(\d{4}:[^:;|]+:\d{2}(,\d{2})*;?)+$/);
  });
});

describe("cariSls / namaWilayah", () => {
  it("kode 14 dan 16 digit sama-sama ketemu", () => {
    expect(cariSls("13030400010002")?.sls).toBe("Jorong Jalan Balantai");
    expect(cariSls("1303040001000201")?.nagari).toBe("Surian");
    expect(namaWilayah("1303040001000201")).toBe("Pantai Cermin › Surian › Jorong Jalan Balantai");
  });
  it("kode tak dikenal -> null", () => {
    expect(cariSls("13030400019999")).toBeNull();
    expect(cariSls("1303")).toBeNull();
    expect(namaWilayah("abc")).toBeNull();
  });
  it("judulWilayah merapikan huruf dan spasi ganda", () => {
    expect(judulWilayah("JORONG SAPAN  MUNGGU 3")).toBe("Jorong Sapan Munggu 3");
    expect(judulWilayah("X KOTO DIATAS")).toBe("X Koto Diatas");
    expect(judulWilayah("IX KOTO SUNGAI LASI")).toBe("IX Koto Sungai Lasi");
    expect(judulWilayah("JORONG III LUBUAK TAREH")).toBe("Jorong III Lubuak Tareh");
  });
});

describe("periksaKodeWilayah", () => {
  it("kode benar -> ok", () => {
    expect(periksaKodeWilayah("1303040001000201").ok).toBe(true);
    expect(periksaKodeWilayah("13030400010002").ok).toBe(true);
    expect(periksaKodeWilayah("1303050002000401").ok).toBe(true);
  });
  it("kode SLS perairan 6001 dikenal", () => {
    expect(periksaKodeWilayah("1303130003600100").ok).toBe(true);
  });
  it("kurang dari 14 digit", () => {
    const h = periksaKodeWilayah("1303040001");
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.alasan).toBe("terlalu_pendek");
  });
  it("kabupaten lain", () => {
    const h = periksaKodeWilayah("1371010001000101");
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.alasan).toBe("kabupaten_lain");
  });
  it("nagari tidak ada", () => {
    const h = periksaKodeWilayah("1303049999000101");
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.alasan).toBe("nagari_tidak_ada");
  });
  it("SLS tidak ada pada nagari yang ada", () => {
    const h = periksaKodeWilayah("1303040001099901");
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.alasan).toBe("sls_tidak_ada");
  });
  it("sub SLS tidak ada", () => {
    const h = periksaKodeWilayah("1303040001000299");
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.alasan).toBe("sub_tidak_ada");
      expect(h.pesan).toContain("01, 02, 03");
    }
  });
});

describe("peringatanWilayah", () => {
  it("hanya baris bermasalah, dengan nomor baris Excel", () => {
    const r = peringatanWilayah(["1303040001000201", "1303040001099901", "1371010001000101"], [2, 3, 5]);
    expect(r.map((x) => x.baris)).toEqual([3, 5]);
  });
});
