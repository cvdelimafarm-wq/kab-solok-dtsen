// lib/__tests__/sigapVerifikasi.test.ts
//
// (27 Okt 2026) Aturan tampil foto di halaman publik /verifikasi: foto hanya bila berkas belum dihapus dan belum disetujui untuk dihapus;
// selain itu halaman menampilkan verifikasi kode saja. Plus simpanan kecil di memori server (batas jumlah dan umur).

import { describe, expect, it } from "vitest";
import {
  LEBAR_FOTO_KECIL,
  SimpananKecil,
  fotoBolehTampil,
  statusTampilFoto,
  teksTanpaFoto,
  ukuranDariParam,
  urlGambarVerifikasi,
} from "@/lib/sigapVerifikasi";

const SAAT = "2026-10-27T10:00:00Z";

describe("statusTampilFoto", () => {
  it("berkas ada, tidak ada persetujuan hapus -> tampil", () => {
    expect(statusTampilFoto({ file_path: "2026/a.jpg", file_dihapus_at: null, hapus_disetujui_at: null })).toBe("tampil");
    expect(fotoBolehTampil({ file_path: "2026/a.jpg" })).toBe(true);
  });

  it("penghapusan sudah disetujui tetapi berkas fisik belum dihapus -> dinonaktifkan (tidak tampil)", () => {
    expect(statusTampilFoto({ file_path: "2026/a.jpg", file_dihapus_at: null, hapus_disetujui_at: SAAT })).toBe("dinonaktifkan");
    expect(fotoBolehTampil({ file_path: "2026/a.jpg", hapus_disetujui_at: SAAT })).toBe(false);
  });

  it("berkas fisik sudah dihapus -> dihapus, walau persetujuan juga ada", () => {
    expect(statusTampilFoto({ file_path: "2026/a.jpg", file_dihapus_at: SAAT, hapus_disetujui_at: SAAT })).toBe("dihapus");
    expect(statusTampilFoto({ file_path: "2026/a.jpg", file_dihapus_at: SAAT })).toBe("dihapus");
  });

  it("tanpa jalur berkas -> dihapus (tidak ada yang bisa diambil)", () => {
    expect(statusTampilFoto({ file_path: null })).toBe("dihapus");
    expect(statusTampilFoto({ file_path: "" })).toBe("dihapus");
    expect(statusTampilFoto({})).toBe("dihapus");
  });

  it("usul hapus (belum disetujui) tidak mematikan tautan: hanya persetujuan yang menonaktifkan", () => {
    // usul_hapus_at bukan bagian dari aturan; kolom ekstra diabaikan
    const f = { file_path: "x.jpg", usul_hapus_at: SAAT } as unknown as Parameters<typeof statusTampilFoto>[0];
    expect(statusTampilFoto(f)).toBe("tampil");
  });
});

describe("teksTanpaFoto", () => {
  it("null saat foto tampil; teks berbeda untuk dinonaktifkan dan dihapus, keduanya menyebut kode", () => {
    expect(teksTanpaFoto("tampil")).toBeNull();
    const a = teksTanpaFoto("dinonaktifkan");
    const b = teksTanpaFoto("dihapus");
    expect(a).toMatch(/dinonaktifkan/);
    expect(b).toMatch(/dihapus/);
    expect(a).not.toBe(b);
    expect(a).toMatch(/kode/);
    expect(b).toMatch(/kode/);
  });
});

describe("ukuranDariParam & urlGambarVerifikasi", () => {
  it("hanya 'penuh' yang meminta ukuran penuh; selainnya kecil", () => {
    expect(ukuranDariParam("penuh")).toBe("penuh");
    expect(ukuranDariParam("kecil")).toBe("kecil");
    expect(ukuranDariParam(null)).toBe("kecil");
    expect(ukuranDariParam(undefined)).toBe("kecil");
    expect(ukuranDariParam("PENUH")).toBe("kecil");
    expect(ukuranDariParam("asli")).toBe("kecil");
  });

  it("alamat gambar memuat kode dan ukuran, kode di-encode", () => {
    expect(urlGambarVerifikasi("SGP-AAAA-BBBB-CCCC", "kecil")).toBe("/api/verifikasi-foto/gambar?k=SGP-AAAA-BBBB-CCCC&u=kecil");
    expect(urlGambarVerifikasi("SGP-AAAA-BBBB-CCCC", "penuh")).toContain("u=penuh");
    expect(urlGambarVerifikasi("a&b", "kecil")).toContain("k=a%26b");
  });

  it("lebar foto kecil tetap 800 px", () => {
    expect(LEBAR_FOTO_KECIL).toBe(800);
  });
});

describe("SimpananKecil", () => {
  it("menyimpan dan mengambil; kunci tak dikenal -> undefined", () => {
    const s = new SimpananKecil<string>(3, 1000);
    s.simpan("a", "A", 0);
    expect(s.ambil("a", 10)).toBe("A");
    expect(s.ambil("b", 10)).toBeUndefined();
  });

  it("kedaluwarsa setelah umur habis dan entri dibuang", () => {
    const s = new SimpananKecil<string>(3, 1000);
    s.simpan("a", "A", 0);
    expect(s.ambil("a", 999)).toBe("A");
    expect(s.ambil("a", 1000)).toBeUndefined();
    expect(s.ukuran).toBe(0);
  });

  it("melebihi batas jumlah: yang paling lama tidak dipakai dibuang", () => {
    const s = new SimpananKecil<number>(2, 10_000);
    s.simpan("a", 1, 0);
    s.simpan("b", 2, 1);
    s.ambil("a", 2); // a jadi yang terbaru dipakai
    s.simpan("c", 3, 3); // b terlama -> dibuang
    expect(s.ukuran).toBe(2);
    expect(s.ambil("a", 4)).toBe(1);
    expect(s.ambil("b", 4)).toBeUndefined();
    expect(s.ambil("c", 4)).toBe(3);
  });

  it("menyimpan ulang kunci yang sama menimpa nilai dan memperpanjang umur", () => {
    const s = new SimpananKecil<string>(2, 1000);
    s.simpan("a", "lama", 0);
    s.simpan("a", "baru", 900);
    expect(s.ukuran).toBe(1);
    expect(s.ambil("a", 1500)).toBe("baru");
  });

  it("buang() menghapus satu entri", () => {
    const s = new SimpananKecil<string>(2, 1000);
    s.simpan("a", "A", 0);
    s.buang("a");
    expect(s.ambil("a", 1)).toBeUndefined();
  });

  it("tidak pernah melebihi batas walau banyak simpan", () => {
    const s = new SimpananKecil<number>(5, 1000);
    for (let i = 0; i < 100; i++) s.simpan(`k${i}`, i, i);
    expect(s.ukuran).toBeLessThanOrEqual(5);
  });
});
