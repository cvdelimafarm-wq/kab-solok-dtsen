import { describe, expect, it } from "vitest";
import { dariAman, denganDari, indukDari, labelTujuan, tujuanKembali } from "../sigapNavigasi";

describe("dariAman (?dari=) -- hanya jalur internal", () => {
  it("menerima path internal, dengan query", () => {
    expect(dariAman("/")).toBe("/");
    expect(dariAman("/sigap/kelola/pendataan")).toBe("/sigap/kelola/pendataan");
    expect(dariAman("/sigap/kelola/pendataan?tab=pemeriksaan")).toBe("/sigap/kelola/pendataan?tab=pemeriksaan");
  });
  it("menolak kosong, bukan string, dan terlalu panjang", () => {
    expect(dariAman(null)).toBeNull();
    expect(dariAman(undefined)).toBeNull();
    expect(dariAman("")).toBeNull();
    expect(dariAman("   ")).toBeNull();
    expect(dariAman("/" + "a".repeat(300))).toBeNull();
  });
  it("menolak pengalihan ke luar (open redirect)", () => {
    expect(dariAman("//evil.com")).toBeNull();
    expect(dariAman("https://evil.com")).toBeNull();
    expect(dariAman("javascript:alert(1)")).toBeNull();
    expect(dariAman("/\\evil.com")).toBeNull();
    expect(dariAman("evil.com/sigap")).toBeNull();
    expect(dariAman("/sigap/\nevil")).toBeNull();
    expect(dariAman("/sigap/../../x")).toBeNull();
  });
});

describe("indukDari -- Kelola Pendataan", () => {
  it("halaman penuh lama foto/identifikasi/lapangan naik ke Kelola Pendataan", () => {
    expect(indukDari("/sigap/kelola/foto")).toBe("/sigap/kelola/pendataan");
    expect(indukDari("/sigap/kelola/identifikasi")).toBe("/sigap/kelola/pendataan");
    expect(indukDari("/sigap/kelola/lapangan")).toBe("/sigap/kelola/pendataan");
    // (23 Okt 2026, Dokumen Induk v2) alamat baru Monitoring mengikuti perilaku yang sama
    expect(indukDari("/sigap/kelola/monitoring")).toBe("/sigap/kelola/pendataan");
  });
  it("Administrasi & SPJ (alamat baru dan lama) naik ke Beranda", () => {
    expect(indukDari("/sigap/kelola/spj")).toBe("/");
    expect(indukDari("/sigap/kelola/translok")).toBe("/");
  });
  it("modul kelola lain tetap ke Beranda", () => {
    expect(indukDari("/sigap/kelola/pendataan")).toBe("/");
    expect(indukDari("/sigap/kelola/perencanaan")).toBe("/");
    expect(indukDari("/sigap/kelola/pengadaan")).toBe("/");
  });
});

describe("tujuanKembali", () => {
  it("memakai ?dari= yang aman", () => {
    expect(tujuanKembali("/sigap/kelola/pendataan?tab=tim", "/sigap/kelola/perencanaan")).toEqual({ href: "/sigap/kelola/pendataan?tab=tim", label: "Kelola Pendataan" });
  });
  it("tanpa ?dari= atau dari tidak aman -> induk logis -> Beranda", () => {
    expect(tujuanKembali(null, "/sigap/kelola/foto")).toEqual({ href: "/sigap/kelola/pendataan", label: "Kelola Pendataan" });
    expect(tujuanKembali("//evil.com", "/sigap/kelola/foto").href).toBe("/sigap/kelola/pendataan");
    expect(tujuanKembali(null, "/bencana")).toEqual({ href: "/", label: "Beranda" });
  });
  it("?dari= yang menunjuk halaman itu sendiri diabaikan (tak berputar)", () => {
    expect(tujuanKembali("/sigap/korwil", "/sigap/korwil").href).toBe("/sigap/kegiatan/pascabencana");
  });
});

describe("labelTujuan", () => {
  it("nama tujuan yang dikenal", () => {
    expect(labelTujuan("/")).toBe("Beranda");
    expect(labelTujuan("/sigap/kelola/pendataan?tab=siaran")).toBe("Kelola Pendataan");
    expect(labelTujuan("/sigap/kelola/translok")).toBe("Administrasi & SPJ");
    expect(labelTujuan("/sigap/kelola/spj")).toBe("Administrasi & SPJ");
    expect(labelTujuan("/sigap/kelola/monitoring")).toBe("Monitoring Lapangan");
    expect(labelTujuan("/sigap/kegiatan/pascabencana")).toBe("Tahapan");
    expect(labelTujuan("/sigap/kegiatan/pascabencana/pendataan")).toBe("Tahap kegiatan");
    expect(labelTujuan("/sigap/kegiatan/translok-12")).toBe("Kegiatan");
  });
  it("alamat tak dikenal -> label netral", () => {
    expect(labelTujuan("/entah/apa")).toBe("Halaman sebelumnya");
  });
});

describe("denganDari", () => {
  it("menambah ?dari= atau &dari= dan meng-encode", () => {
    expect(denganDari("/bencana", "/sigap/kelola/pendataan?tab=tim")).toBe("/bencana?dari=%2Fsigap%2Fkelola%2Fpendataan%3Ftab%3Dtim");
    expect(denganDari("/x?a=1", "/")).toBe("/x?a=1&dari=%2F");
  });
  it("asal tidak aman -> alamat apa adanya", () => {
    expect(denganDari("/bencana", "//evil.com")).toBe("/bencana");
  });
});
