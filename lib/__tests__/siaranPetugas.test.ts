import { describe, expect, it } from "vitest";
import { HARI_MODAL_SIARAN, akhirModalSiaran, kunciBacaSiaran, validasiSiaran } from "@/lib/siaranPetugas";

const dasar = { kirim_push: true, judul: "Info 1: Data FASIH keluarga belum ada", isi: "Tetap siaga ya.", url: "/", modal: { aktif: true, judul: "INFO 1", isi: "**Siaga** dulu", jenis: "info" } };

describe("validasiSiaran (13 Okt 2026)", () => {
  it("push + modal sah", () => {
    const v = validasiSiaran(dasar);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.nilai.push).toEqual({ judul: "Info 1: Data FASIH keluarga belum ada", isi: "Tetap siaga ya.", url: "/" });
      expect(v.nilai.modal).toEqual({ judul: "INFO 1", isi: "**Siaga** dulu", jenis: "info" });
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
