import { describe, expect, it } from "vitest";
import { alamatLokasi, kebutuhanLokasi, KECAMATAN_SOLOK, periksaSimpanLokasi, tautanPeta, tujuanKembali } from "../lokasiMitra";

const titikSolok = { lat: -0.79, lng: 100.65, akurasi: 25 };
const perluSemua = { titik: true, kecamatan: true };

describe("kebutuhanLokasi", () => {
  it("titik dan kecamatan kosong -> keduanya dibutuhkan", () => {
    expect(kebutuhanLokasi({ lat: null, lng: null, kecamatan: null })).toEqual(perluSemua);
    expect(kebutuhanLokasi({ lat: 0, lng: 0, kecamatan: "  " })).toEqual(perluSemua);
  });
  it("lengkap -> tidak ada yang dibutuhkan", () => {
    expect(kebutuhanLokasi({ lat: -0.79, lng: 100.65, kecamatan: "Kubung" })).toEqual({ titik: false, kecamatan: false });
  });
  it("hanya salah satu", () => {
    expect(kebutuhanLokasi({ lat: -0.79, lng: 100.65, kecamatan: null })).toEqual({ titik: false, kecamatan: true });
    expect(kebutuhanLokasi({ lat: null, lng: null, kecamatan: "KUBUNG" })).toEqual({ titik: true, kecamatan: false });
  });
});

describe("periksaSimpanLokasi", () => {
  it("titik + kecamatan sah -> dibulatkan 6 desimal, kecamatan huruf besar", () => {
    const r = periksaSimpanLokasi({ ...titikSolok, lat: -0.7896123456, kecamatan: "kubung" }, perluSemua, KECAMATAN_SOLOK);
    expect(r).toEqual({ ok: true, nilai: { titik: { lat: -0.789612, lng: 100.65, akurasi_m: 25 }, kecamatan: "KUBUNG" } });
  });
  it("hanya titik dibutuhkan", () => {
    const r = periksaSimpanLokasi(titikSolok, { titik: true, kecamatan: false }, KECAMATAN_SOLOK);
    expect(r.ok && r.nilai.kecamatan).toBeNull();
  });
  it("hanya kecamatan dibutuhkan", () => {
    const r = periksaSimpanLokasi({ kecamatan: "Lembang Jaya" }, { titik: false, kecamatan: true }, KECAMATAN_SOLOK);
    expect(r).toEqual({ ok: true, nilai: { titik: null, kecamatan: "LEMBANG JAYA" } });
  });
  it("titik di luar Kabupaten Solok ditolak", () => {
    const r = periksaSimpanLokasi({ ...titikSolok, lat: -6.2, lng: 106.8 }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK);
    expect(r.ok).toBe(false);
  });
  it("lintang/bujur tertukar atau 0,0 ditolak", () => {
    expect(periksaSimpanLokasi({ ...titikSolok, lat: 100.65, lng: -0.79 }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
    expect(periksaSimpanLokasi({ ...titikSolok, lat: 0, lng: 0 }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
  });
  it("angka berupa teks atau tidak ada ditolak", () => {
    expect(periksaSimpanLokasi({ ...titikSolok, lat: "-0.79" }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
    expect(periksaSimpanLokasi({}, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
  });
  it("akurasi lebih dari 300 m ditolak, tepat 300 m boleh", () => {
    const kasar = periksaSimpanLokasi({ ...titikSolok, akurasi: 300.5 }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK);
    expect(kasar.ok).toBe(false);
    expect(!kasar.ok && kasar.pesan).toContain("301");
    expect(periksaSimpanLokasi({ ...titikSolok, akurasi: 300 }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(true);
    expect(periksaSimpanLokasi({ ...titikSolok, akurasi: undefined }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
  });
  it("kecamatan wajib dan harus dari daftar", () => {
    expect(periksaSimpanLokasi(titikSolok, perluSemua, KECAMATAN_SOLOK).ok).toBe(false);
    expect(periksaSimpanLokasi({ ...titikSolok, kecamatan: "Jakarta" }, perluSemua, KECAMATAN_SOLOK).ok).toBe(false);
  });
  it("titik atau kecamatan yang sudah tercatat tidak boleh ditimpa", () => {
    const t = periksaSimpanLokasi(titikSolok, { titik: false, kecamatan: true }, KECAMATAN_SOLOK);
    expect(!t.ok && t.pesan).toContain("hubungi admin");
    const k = periksaSimpanLokasi({ ...titikSolok, kecamatan: "KUBUNG" }, { titik: true, kecamatan: false }, KECAMATAN_SOLOK);
    expect(!k.ok && k.pesan).toContain("Kecamatan Anda sudah tercatat");
  });
  it("lokasi sudah lengkap -> ditolak", () => {
    expect(periksaSimpanLokasi({ ...titikSolok, kecamatan: "KUBUNG" }, { titik: false, kecamatan: false }, KECAMATAN_SOLOK).ok).toBe(false);
  });
});

describe("tujuanKembali / alamatLokasi", () => {
  it("jalur internal sah", () => {
    expect(tujuanKembali("/sigap/seleksi/12")).toBe("/sigap/seleksi/12");
    expect(tujuanKembali("/")).toBe("/");
  });
  it("tautan luar, skema, dan jalur berbahaya ditolak", () => {
    for (const x of ["https://jahat.example", "//jahat.example", "/\\jahat.example", "javascript:alert(1)", "/sigap/../admin", "/sigap//x", "/lain/x", "", null, 5]) {
      expect(tujuanKembali(x)).toBeNull();
    }
  });
  it("alamatLokasi menyandikan tujuan sah dan membuang yang tidak sah", () => {
    expect(alamatLokasi("/sigap/seleksi/3")).toBe("/sigap/lokasi-saya?kembali=%2Fsigap%2Fseleksi%2F3");
    expect(alamatLokasi("https://jahat.example")).toBe("/sigap/lokasi-saya");
    expect(alamatLokasi()).toBe("/sigap/lokasi-saya");
  });
});

describe("tautanPeta", () => {
  it("memuat koordinat enam desimal", () => {
    expect(tautanPeta(-0.79, 100.65)).toBe("https://www.google.com/maps?q=-0.790000,100.650000");
  });
});
