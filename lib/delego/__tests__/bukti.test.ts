import { describe, expect, it } from "vitest";
import { bacaButir, ditemukanDiLaporan, bacaDaftar, daftarPath, delegasiDariPath, jenisGambar, lokasiBukti, MAKS_BUTIR, muatDiBatas, periksaUkuran, tipeDariPath, ukuranKecil, untukSimpan } from "@/lib/delego/bukti";

const HASH = "a".repeat(64);

describe("jenisGambar", () => {
  it("mengenali jpeg, png, dan webp dari byte awal", () => {
    expect(jenisGambar(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("jpeg");
    expect(jenisGambar(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(jenisGambar(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("menolak yang bukan gambar yang diizinkan (pdf, html, svg, kosong)", () => {
    expect(jenisGambar(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
    expect(jenisGambar(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(jenisGambar(new Uint8Array([]))).toBeNull();
    expect(jenisGambar(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF WAVE
  });
});

describe("periksaUkuran", () => {
  it("menolak kosong dan terlalu besar", () => {
    expect(periksaUkuran(0)).toMatch(/kosong/i);
    expect(periksaUkuran(7 * 1024 * 1024)).toMatch(/terlalu besar/i);
    expect(periksaUkuran(500_000)).toBeNull();
    expect(periksaUkuran(NaN)).not.toBeNull();
  });
});

describe("lokasiBukti dan delegasiDariPath", () => {
  it("membentuk path yang terbaca kembali", () => {
    const p = lokasiBukti(12, HASH, "jpeg");
    expect(p).toBe(`delego/12/${"a".repeat(32)}.jpg`);
    expect(delegasiDariPath(p)).toBe(12);
    expect(tipeDariPath(p)).toBe("image/jpeg");
    expect(tipeDariPath(lokasiBukti(3, HASH, "png"))).toBe("image/png");
    expect(tipeDariPath(lokasiBukti(3, HASH, "webp"))).toBe("image/webp");
  });
  it("menolak masukan tidak sah dan path berbahaya", () => {
    expect(() => lokasiBukti(0, HASH, "jpeg")).toThrow();
    expect(() => lokasiBukti(1, "../x", "jpeg")).toThrow();
    expect(delegasiDariPath("delego/12/../../keu-adm/x.jpg")).toBeNull();
    expect(delegasiDariPath("keu-adm/12/aaaaaaaaaaaaaaaa.jpg")).toBeNull();
    expect(delegasiDariPath("delego/12/aaaaaaaaaaaaaaaa.pdf")).toBeNull();
    expect(delegasiDariPath(42)).toBeNull();
  });
});

describe("bacaButir dan bacaDaftar", () => {
  it("membaca teks lama, objek lama { ket }, dan objek baru { ket, path }", () => {
    expect(bacaButir("  foto-1.jpg ")).toEqual({ ket: "foto-1.jpg", path: null, teks: "foto-1.jpg" });
    expect(bacaButir({ ket: "dokumen" })).toEqual({ ket: "dokumen", path: null, teks: "dokumen" });
    const p = lokasiBukti(5, HASH, "jpeg");
    expect(bacaButir({ ket: "", path: p })).toEqual({ ket: "", path: p, teks: "Foto" });
    expect(bacaButir({ ket: "rumah", path: p })?.path).toBe(p);
  });
  it("membuang butir kosong dan path tidak sah", () => {
    expect(bacaButir("   ")).toBeNull();
    expect(bacaButir(null)).toBeNull();
    expect(bacaButir(7)).toBeNull();
    expect(bacaButir({ path: "../../rahasia" })).toBeNull();
    expect(bacaButir({ ket: "ok", path: "../../rahasia" })).toEqual({ ket: "ok", path: null, teks: "ok" });
    expect(bacaDaftar(["a", "", { x: 1 }, null])).toHaveLength(1);
    expect(bacaDaftar(undefined)).toEqual([]);
  });
  it("daftarPath hanya mengambil path foto", () => {
    const p = lokasiBukti(5, HASH, "png");
    expect(daftarPath(["teks", { ket: "x", path: p }])).toEqual([p]);
  });
});

describe("untukSimpan", () => {
  it("foto menjadi objek, teks tetap teks, kosong dibuang, maksimal 5", () => {
    const p = lokasiBukti(5, HASH, "jpeg");
    expect(untukSimpan([{ ket: " rumah ", path: p }, { ket: "tautan", path: null }, { ket: "", path: null }])).toEqual([{ ket: "rumah", path: p }, "tautan"]);
    const banyak = Array.from({ length: 9 }, (_, i) => ({ ket: `k${i}`, path: null }));
    expect(untukSimpan(banyak)).toHaveLength(MAKS_BUTIR);
  });
  it("memotong keterangan 120 huruf dan mengabaikan path tidak sah", () => {
    const h = untukSimpan([{ ket: "x".repeat(300), path: "../salah" }]);
    expect(h).toEqual(["x".repeat(120)]);
  });
  it("lima foto berketerangan penuh masih muat di 3000 karakter", () => {
    const p = lokasiBukti(99999, HASH, "webp");
    const h = untukSimpan(Array.from({ length: 5 }, () => ({ ket: "k".repeat(120), path: p })));
    expect(muatDiBatas(h)).toBe(true);
    expect(muatDiBatas(["x".repeat(3001)])).toBe(false);
  });
});

describe("ukuranKecil", () => {
  it("mengecilkan sisi terpanjang ke 1600 dengan rasio tetap dan tidak memperbesar", () => {
    expect(ukuranKecil(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(ukuranKecil(3000, 4000)).toEqual({ w: 1200, h: 1600 });
    expect(ukuranKecil(800, 600)).toEqual({ w: 800, h: 600 });
    expect(ukuranKecil(1600, 1600)).toEqual({ w: 1600, h: 1600 });
  });
});

describe("ditemukanDiLaporan", () => {
  it("hanya benar bila path tercatat pada laporan yang boleh dilihat", () => {
    const p = lokasiBukti(5, HASH, "jpeg");
    const q = lokasiBukti(6, HASH, "jpeg");
    const lap = [{ bukti: ["x", { ket: "", path: p }] }, { bukti: [] }];
    expect(ditemukanDiLaporan(p, lap)).toBe(true);
    expect(ditemukanDiLaporan(q, lap)).toBe(false);
    expect(ditemukanDiLaporan(p, null)).toBe(false);
    expect(ditemukanDiLaporan(p, [{ bukti: null }])).toBe(false);
  });
});
