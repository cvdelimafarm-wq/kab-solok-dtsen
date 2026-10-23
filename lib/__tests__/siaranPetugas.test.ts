import { describe, expect, it } from "vitest";
import { HARI_MODAL_SIARAN, akhirModalSiaran, hitungKonfirmasiSiaran, kunciBacaSiaran, urlInternalSigap, validasiSiaran } from "@/lib/siaranPetugas";

const dasar = { kirim_push: true, judul: "Info 1: Data FASIH keluarga belum ada", isi: "Tetap siaga ya.", url: "/", modal: { aktif: true, judul: "INFO 1", isi: "**Siaga** dulu", jenis: "info" } };

describe("validasiSiaran (13 Okt 2026)", () => {
  it("push + modal sah", () => {
    const v = validasiSiaran(dasar);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.nilai.push).toEqual({ judul: "Info 1: Data FASIH keluarga belum ada", isi: "Tetap siaga ya.", url: "/" });
      expect(v.nilai.modal).toEqual({ judul: "INFO 1", isi: "**Siaga** dulu", jenis: "info", tombol: null });
    }
  });
  it("hanya modal / hanya push", () => {
    const m = validasiSiaran({ ...dasar, kirim_push: false });
    expect(m.ok && m.nilai.push === null && m.nilai.modal !== null).toBe(true);
    const p = validasiSiaran({ ...dasar, modal: { aktif: false } });
    expect(p.ok && p.nilai.modal === null && p.nilai.push !== null).toBe(true);
  });
  it("menolak bila tak ada pilihan", () => {
    expect(validasiSiaran({ ...dasar, kirim_push: false, modal: { aktif: false } })).toEqual({ ok: false, pesan: "Pilih minimal satu: kirim notifikasi atau tampilkan modal." });
    expect(validasiSiaran(null).ok).toBe(false);
  });
  it("batas panjang dan tautan luar", () => {
    expect(validasiSiaran({ ...dasar, judul: "x".repeat(81) }).ok).toBe(false);
    expect(validasiSiaran({ ...dasar, isi: "x".repeat(241) }).ok).toBe(false);
    expect(validasiSiaran({ ...dasar, url: "https://contoh.com" }).ok).toBe(false);
    expect(validasiSiaran({ ...dasar, modal: { aktif: true, judul: "", isi: "x", jenis: "info" } }).ok).toBe(false);
    expect(validasiSiaran({ ...dasar, modal: { aktif: true, judul: "J", isi: "x".repeat(2001), jenis: "info" } }).ok).toBe(false);
  });
  it("jenis modal tak dikenal -> info; judul push tak wajib bila hanya modal", () => {
    const v = validasiSiaran({ kirim_push: false, modal: { aktif: true, judul: "J", isi: "x", jenis: "aneh" } });
    expect(v.ok && v.nilai.modal?.jenis).toBe("info");
  });
  it("akhir modal = 14 hari; kunci baca memuat versi", () => {
    const dari = new Date("2026-10-13T00:00:00Z");
    expect(akhirModalSiaran(dari)).toBe("2026-10-27T00:00:00.000Z");
    expect(HARI_MODAL_SIARAN).toBe(14);
    expect(kunciBacaSiaran(5, "v1")).not.toBe(kunciBacaSiaran(5, "v2"));
  });
});

describe("tombol navigasi modal (13 Okt 2026)", () => {
  const modal = (extra: Record<string, unknown>) => ({ ...dasar, modal: { aktif: true, judul: "J", isi: "x", jenis: "info", ...extra } });
  it("tombol ke halaman SIGAP atau https diterima", () => {
    const a = validasiSiaran(modal({ tombol_label: "Buka Lembar Pendataan", tombol_url: "/sigap/pendataan" }));
    expect(a.ok && a.nilai.modal?.tombol).toEqual({ label: "Buka Lembar Pendataan", url: "/sigap/pendataan" });
    const b = validasiSiaran(modal({ tombol_label: "Peta", tombol_url: "https://maps.app.goo.gl/abc" }));
    expect(b.ok && b.nilai.modal?.tombol?.url).toBe("https://maps.app.goo.gl/abc");
  });
  it("label dan tujuan harus berpasangan; tujuan berbahaya ditolak", () => {
    expect(validasiSiaran(modal({ tombol_label: "Buka" })).ok).toBe(false);
    expect(validasiSiaran(modal({ tombol_url: "/sigap/pendataan" })).ok).toBe(false);
    expect(validasiSiaran(modal({ tombol_label: "X", tombol_url: "javascript:alert(1)" })).ok).toBe(false);
    expect(validasiSiaran(modal({ tombol_label: "X", tombol_url: "//evil.com" })).ok).toBe(false);
    expect(validasiSiaran(modal({ tombol_label: "X", tombol_url: "/login" })).ok).toBe(false);
    expect(validasiSiaran(modal({ tombol_label: "x".repeat(61), tombol_url: "/sigap/pendataan" })).ok).toBe(false);
  });
  it("urlInternalSigap", () => {
    expect(urlInternalSigap("/sigap/pendataan")).toBe(true);
    expect(urlInternalSigap("/sigap/../admin")).toBe(false);
    expect(urlInternalSigap("/sigap/a b")).toBe(false);
    expect(urlInternalSigap(null)).toBe(false);
  });
});

import { validasiKirimSatu } from "@/lib/siaranPetugas";

describe("validasiKirimSatu (17 Okt 2026)", () => {
  const dasar1 = { akun_id: 266, judul: "Coba menu Kolam wilayah", isi: "Silakan dicoba ya.", url: "/sigap/pendataan" };
  it("sah", () => {
    const v = validasiKirimSatu(dasar1);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.nilai).toEqual({ akun: 266, pesan: { judul: "Coba menu Kolam wilayah", isi: "Silakan dicoba ya.", url: "/sigap/pendataan" } });
  });
  it("tolak penerima kosong/tidak sah", () => {
    expect(validasiKirimSatu({ ...dasar1, akun_id: undefined }).ok).toBe(false);
    expect(validasiKirimSatu({ ...dasar1, akun_id: 0 }).ok).toBe(false);
    expect(validasiKirimSatu({ ...dasar1, akun_id: "abc" }).ok).toBe(false);
    expect(validasiKirimSatu({ ...dasar1, akun_id: 1.5 }).ok).toBe(false);
  });
  it("tolak judul/isi kosong, terlalu panjang, dan tautan luar", () => {
    expect(validasiKirimSatu({ ...dasar1, judul: "  " }).ok).toBe(false);
    expect(validasiKirimSatu({ ...dasar1, isi: "x".repeat(241) }).ok).toBe(false);
    expect(validasiKirimSatu({ ...dasar1, url: "//evil.com" }).ok).toBe(false);
  });
});

describe("hitungKonfirmasiSiaran (audit Tahap 3)", () => {
  it("pembilang tidak pernah melebihi penyebut", () => {
    const r = hitungKonfirmasiSiaran([1, 2, 3, 9, 10], [1, 2, 3, 4]);
    expect(r).toEqual({ sudah: 3, dari: 4 }); // 9 dan 10 bukan penerima sekarang
    expect(r.sudah).toBeLessThanOrEqual(r.dari);
  });
  it("akun kembar dihitung sekali; daftar kosong aman", () => {
    expect(hitungKonfirmasiSiaran([1, 1, 2], [1, 2])).toEqual({ sudah: 2, dari: 2 });
    expect(hitungKonfirmasiSiaran([], [])).toEqual({ sudah: 0, dari: 0 });
  });
});
