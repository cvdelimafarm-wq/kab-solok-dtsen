// lib/__tests__/sigapMasukan.test.ts
//
// (28 Okt 2026) Tombol masukan melayang: validasi, alamat halaman bersih token, posisi seret, status usulan.

import { describe, expect, it } from "vitest";
import {
  BATAS_ATAS,
  BATAS_BAWAH,
  POSISI_BAWAAN,
  TEPI_TOMBOL,
  UKURAN_TOMBOL,
  adalahSeretan,
  bacaPosisi,
  bersihkanTeks,
  hitungStatus,
  jalurGambar,
  jalurGambarSah,
  jepitAtas,
  letakTombol,
  periksaCatatan,
  periksaMasukan,
  posisiDariTitik,
  rapikanHalaman,
  ringkasPerangkat,
  tombolTersembunyi,
  urutkanMasukan,
} from "@/lib/sigapMasukan";

describe("bersihkanTeks & periksaMasukan", () => {
  it("menyeragamkan baris baru, membuang karakter kendali dan baris kosong berlebih", () => {
    expect(bersihkanTeks("  a\r\nb\u0007\n\n\n\nc  ")).toBe("a\nb\n\nc");
    expect(bersihkanTeks(null)).toBe("");
    expect(bersihkanTeks(5)).toBe("");
  });

  it("menerima masukan sah dan merapikan bidangnya", () => {
    const h = periksaMasukan({ jenis: "galat", isi: "  Foto tidak muncul  ", halaman: "/sigap/foto?x=1", peran: "PPL", versi: "abc123", perangkat: "Android · Chrome" });
    expect(h).toEqual({ ok: true, nilai: { jenis: "galat", isi: "Foto tidak muncul", halaman: "/sigap/foto", peran: "PPL", versi: "abc123", perangkat: "Android · Chrome" } });
  });

  it("menolak jenis tidak dikenal, isi terlalu pendek atau terlalu panjang", () => {
    expect(periksaMasukan({ jenis: "x", isi: "halo dunia" })).toMatchObject({ ok: false });
    expect(periksaMasukan({ jenis: "saran", isi: "  ab  " })).toMatchObject({ ok: false });
    expect(periksaMasukan({ jenis: "saran", isi: "a".repeat(2001) })).toMatchObject({ ok: false });
    expect(periksaMasukan({ jenis: "saran", isi: "a".repeat(2000) })).toMatchObject({ ok: true });
    expect(periksaMasukan({ jenis: "pertanyaan" })).toMatchObject({ ok: false });
  });

  it("bidang tambahan dipotong ke batas dan tidak boleh berbaris baru", () => {
    const h = periksaMasukan({ jenis: "saran", isi: "isi masukan", peran: "x\ny".repeat(100), versi: "v".repeat(100) });
    if (!h.ok) throw new Error("harus sah");
    expect(h.nilai.peran.length).toBeLessThanOrEqual(60);
    expect(h.nilai.peran).not.toContain("\n");
    expect(h.nilai.versi.length).toBe(40);
  });

  it("catatan admin dipotong ke 1000 karakter", () => {
    expect(periksaCatatan("a".repeat(1500)).length).toBe(1000);
    expect(periksaCatatan(undefined)).toBe("");
  });
});

describe("rapikanHalaman", () => {
  it("membuang query/hash dan menutup token", () => {
    expect(rapikanHalaman("/sigap/foto?tab=saya#x")).toBe("/sigap/foto");
    expect(rapikanHalaman("/sigap/translok/a1b2c3d4e5f6g7h8i9j0")).toBe("/sigap/translok/:token");
    expect(rapikanHalaman("/sigap/kegiatan/12/rincian")).toBe("/sigap/kegiatan/12/rincian");
  });
  it("selain jalur berawalan / ditolak; panjang dibatasi", () => {
    expect(rapikanHalaman("https://x.id/sigap")).toBe("");
    expect(rapikanHalaman(undefined)).toBe("");
    expect(rapikanHalaman("/" + "a/".repeat(100)).length).toBeLessThanOrEqual(120);
  });
});

describe("jalur gambar", () => {
  it("membentuk jalur per akun dengan ekstensi sesuai tipe, dan hanya jalur bentukan itu yang sah", () => {
    expect(jalurGambar(7, "Ab12/..Cd34", "image/png")).toBe("masukan/7/Ab12Cd34.png");
    expect(jalurGambar(7, "abcdef12", "image/jpeg")).toBe("masukan/7/abcdef12.jpg");
    expect(jalurGambarSah("masukan/7/abcdef12.jpg")).toBe(true);
    expect(jalurGambarSah("masukan/7/../../x.jpg")).toBe(false);
    expect(jalurGambarSah("foto/7/abcdef12.jpg")).toBe(false);
    expect(jalurGambarSah(null)).toBe(false);
  });
});

describe("posisi tombol", () => {
  it("jepitAtas menjaga tombol di bawah header dan di atas bilah bawah", () => {
    expect(jepitAtas(0, 800)).toBe(BATAS_ATAS);
    expect(jepitAtas(5000, 800)).toBe(800 - BATAS_BAWAH - UKURAN_TOMBOL);
    expect(jepitAtas(300, 800)).toBe(300);
    expect(jepitAtas(Number.NaN, 800)).toBe(BATAS_ATAS);
    expect(jepitAtas(10, 100)).toBe(BATAS_ATAS); // layar sangat pendek: tidak pernah di bawah batas atas
  });

  it("posisiDariTitik menempel ke tepi terdekat", () => {
    expect(posisiDariTitik(30, 300, 400, 800)).toEqual({ sisi: "kiri", atas: 300 - UKURAN_TOMBOL / 2 });
    expect(posisiDariTitik(350, 300, 400, 800).sisi).toBe("kanan");
    expect(posisiDariTitik(200, 300, 400, 800).sisi).toBe("kanan"); // tepat di tengah -> kanan
    expect(posisiDariTitik(350, -50, 400, 800).atas).toBe(BATAS_ATAS);
  });

  it("bacaPosisi menerima hanya bentuk yang sah", () => {
    expect(bacaPosisi(JSON.stringify({ sisi: "kiri", atas: 120 }))).toEqual({ sisi: "kiri", atas: 120 });
    expect(bacaPosisi("rusak{")).toBeNull();
    expect(bacaPosisi(JSON.stringify({ sisi: "atas", atas: 1 }))).toBeNull();
    expect(bacaPosisi(JSON.stringify({ sisi: "kanan", atas: "9" }))).toBeNull();
    expect(bacaPosisi(null)).toBeNull();
    expect(bacaPosisi("")).toBeNull();
  });

  it("letakTombol: sisi kiri/kanan, tinggi dijepit ulang, banner menggeser ke bawah", () => {
    expect(letakTombol(POSISI_BAWAAN, 800)).toEqual({ top: 72, right: TEPI_TOMBOL });
    expect(letakTombol({ sisi: "kiri", atas: 300 }, 800)).toEqual({ top: 300, left: TEPI_TOMBOL });
    expect(letakTombol({ sisi: "kanan", atas: 700 }, 500).top).toBe(500 - BATAS_BAWAH - UKURAN_TOMBOL); // layar diputar jadi pendek
    expect(letakTombol(POSISI_BAWAAN, 800, 28).top).toBe(100); // banner "Lihat sebagai" 28px
  });
});

describe("tombolTersembunyi & adalahSeretan", () => {
  it("tampil di Beranda dan halaman SIGAP, tidak di lembar masukan sendiri maupun halaman lain", () => {
    expect(tombolTersembunyi("/")).toBe(false);
    expect(tombolTersembunyi("/sigap/foto")).toBe(false);
    expect(tombolTersembunyi("/sigap/kelola/masukan")).toBe(false);
    expect(tombolTersembunyi("/sigap/masukan")).toBe(true);
    expect(tombolTersembunyi("/sigap/masukan/")).toBe(true);
    expect(tombolTersembunyi("/verifikasi/abc")).toBe(true);
    expect(tombolTersembunyi("/dashboard")).toBe(true);
    expect(tombolTersembunyi("")).toBe(false); // jalur kosong dianggap "/"
  });

  it("ketukan kecil bukan seretan", () => {
    expect(adalahSeretan(2, 3)).toBe(false);
    expect(adalahSeretan(6, 0)).toBe(false);
    expect(adalahSeretan(5, 5)).toBe(true);
  });
});

describe("daftar usulan", () => {
  it("hitungStatus mengabaikan status tidak dikenal", () => {
    expect(hitungStatus([{ status: "baru" }, { status: "baru" }, { status: "selesai" }, { status: "aneh" }])).toEqual({ baru: 2, dibaca: 0, diproses: 0, selesai: 1, ditolak: 0 });
  });

  it("urutkanMasukan: yang belum selesai di atas, lalu terbaru dulu", () => {
    const d = [
      { id: 1, status: "selesai", dibuat_at: "2026-10-28T09:00:00Z" },
      { id: 2, status: "diproses", dibuat_at: "2026-10-27T09:00:00Z" },
      { id: 3, status: "baru", dibuat_at: "2026-10-26T09:00:00Z" },
      { id: 4, status: "baru", dibuat_at: "2026-10-28T08:00:00Z" },
      { id: 5, status: "ditolak", dibuat_at: "2026-10-28T10:00:00Z" },
    ];
    expect(urutkanMasukan(d).map((x) => x.id)).toEqual([4, 3, 2, 5, 1]);
    expect(d[0].id).toBe(1); // tidak mengubah masukan
  });
});

describe("ringkasPerangkat", () => {
  it("mengenali Android Chrome dan aplikasi terpasang", () => {
    const ua = "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(ringkasPerangkat(ua, true)).toBe("Android · Chrome · aplikasi terpasang");
    expect(ringkasPerangkat(ua, false)).toBe("Android · Chrome");
    expect(ringkasPerangkat("", false)).toBe("? · ?");
  });
});
