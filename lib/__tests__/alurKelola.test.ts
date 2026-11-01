import { describe, expect, it } from "vitest";
import { alurIdentifikasi, alamatIdentifikasi, namaTanpaNomor, nomorDariLabel, posisiAlur, tahapTerakhir, teksPosisi, teksTombol, urutanDariTab, urutanSubAlur } from "../alurKelola";

const TAB = [
  { kode: "ringkasan", label: "Ringkasan" },
  { kode: "persiapan", label: "1 · Persiapan" },
  { kode: "tim", label: "2 · Tim & Surat Tugas" },
  { kode: "siaran", label: "3 · Siaran & Notifikasi" },
  { kode: "qc", label: "4 · QC" },
  { kode: "monitoring", label: "5 · Monitoring" },
  { kode: "pemeriksaan", label: "6 · Pemeriksaan" },
  { kode: "administrasi", label: "7 · Administrasi & SPJ" },
  { kode: "laporan", label: "8 · Laporan" },
];

describe("nomor dan nama dari label", () => {
  it("membaca awalan nomor", () => {
    expect(nomorDariLabel("3 · Siaran & Notifikasi")).toBe(3);
    expect(nomorDariLabel("12 · Sesuatu")).toBe(12);
    expect(nomorDariLabel("Ringkasan")).toBeNull();
    expect(nomorDariLabel("Identifikasi 2026")).toBeNull();
  });
  it("membuang awalan nomor saja", () => {
    expect(namaTanpaNomor("3 · Siaran & Notifikasi")).toBe("Siaran & Notifikasi");
    expect(namaTanpaNomor("Ringkasan")).toBe("Ringkasan");
  });
});

describe("posisiAlur (alur bertab)", () => {
  const urutan = urutanDariTab(TAB);
  it("tahap tengah: nomor mengikuti label, ada sebelumnya dan berikutnya", () => {
    const p = posisiAlur(urutan, "siaran")!;
    expect(p.no).toBe(3);
    expect(p.total).toBe(8);
    expect(p.sebelumnya?.kode).toBe("tim");
    expect(p.berikutnya?.kode).toBe("qc");
    expect(teksPosisi(p)).toBe("Tahap 3 dari 8 · Siaran & Notifikasi");
    expect(teksTombol(p, "berikutnya")).toBe("Berikutnya: 4 · QC");
    expect(teksTombol(p, "sebelumnya")).toBe("Sebelumnya: 2 · Tim & Surat Tugas");
  });
  it("Ringkasan = pembuka tak bernomor tanpa Sebelumnya", () => {
    const p = posisiAlur(urutan, "ringkasan")!;
    expect(p.no).toBeNull();
    expect(p.sebelumnya).toBeNull();
    expect(p.berikutnya?.kode).toBe("persiapan");
    expect(teksPosisi(p)).toBe("Awal alur · Ringkasan");
    expect(teksTombol(p, "sebelumnya")).toBeNull();
  });
  it("tahap terakhir tanpa Berikutnya", () => {
    const p = posisiAlur(urutan, "laporan")!;
    expect(p.no).toBe(8);
    expect(p.berikutnya).toBeNull();
    expect(tahapTerakhir(p)).toBe(true);
    expect(teksTombol(p, "berikutnya")).toBeNull();
  });
  it("tab yang dimatikan dilewati, nomor tetap sama dengan label tab", () => {
    const tanpaQc = urutanDariTab(TAB.filter((t) => t.kode !== "qc"));
    const p = posisiAlur(tanpaQc, "siaran")!;
    expect(p.berikutnya?.kode).toBe("monitoring");
    const m = posisiAlur(tanpaQc, "monitoring")!;
    expect(m.no).toBe(5);
    expect(m.sebelumnya?.kode).toBe("siaran");
    expect(m.total).toBe(8);
  });
  it("kode tak dikenal atau urutan kosong -> null", () => {
    expect(posisiAlur(urutan, "tidak-ada")).toBeNull();
    expect(posisiAlur([], "ringkasan")).toBeNull();
  });
  it("label tanpa nomor sama sekali: nomor = urutan", () => {
    const u = [{ kode: "a", label: "Satu" }, { kode: "b", label: "Dua" }, { kode: "c", label: "Tiga" }];
    const p = posisiAlur(u, "b")!;
    expect(p.no).toBe(2);
    expect(p.total).toBe(3);
    expect(teksPosisi(p)).toBe("Tahap 2 dari 3 · Dua");
  });
  it("satu tahap saja: tanpa Sebelumnya maupun Berikutnya", () => {
    const p = posisiAlur([{ kode: "x", label: "Tunggal" }], "x")!;
    expect(p.sebelumnya).toBeNull();
    expect(p.berikutnya).toBeNull();
  });
});

describe("alur Identifikasi survei (berhalaman)", () => {
  it("enam tahap berurutan dengan alamat benar", () => {
    const u = alurIdentifikasi(42);
    expect(u.map((t) => t.kode)).toEqual(["awal", "lanjutan", "kebutuhan", "pelatihan", "pendataan", "gap"]);
    expect(u.map((t) => nomorDariLabel(t.label))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(u[0].href).toBe("/sigap/kelola/perencanaan/identifikasi/42");
    expect(u[3].href).toBe("/sigap/kelola/perencanaan/identifikasi/42/pelatihan");
    expect(u[4].href).toBe("/sigap/kelola/perencanaan/identifikasi/42/pendataan");
    expect(u[5].href).toBe("/sigap/kelola/perencanaan/identifikasi/42/gap");
  });
  it("tahap 4 dan 5 disebut sebagai persiapan yang rinciannya di menu masing-masing", () => {
    const u = alurIdentifikasi(1);
    expect(u[3].label).toBe("4 · Persiapan pelatihan");
    expect(u[3].ket).toContain("menu Pelatihan");
    expect(u[4].label).toBe("5 · Persiapan pendataan");
    expect(u[4].ket).toContain("menu Pendataan");
  });
  it("posisi persiapan pelatihan: sebelumnya rekrutmen, berikutnya persiapan pendataan", () => {
    const p = posisiAlur(alurIdentifikasi("7"), "pelatihan")!;
    expect(p.no).toBe(4);
    expect(p.total).toBe(6);
    expect(p.sebelumnya?.href).toBe("/sigap/kelola/perencanaan/identifikasi/7/kebutuhan");
    expect(p.berikutnya?.href).toBe("/sigap/kelola/perencanaan/identifikasi/7/pendataan");
  });
  it("gap adalah tahap terakhir dan sebelumnya persiapan pendataan", () => {
    const p = posisiAlur(alurIdentifikasi(3), "gap")!;
    expect(p.no).toBe(6);
    expect(tahapTerakhir(p)).toBe(true);
    expect(p.sebelumnya?.kode).toBe("pendataan");
  });
  it("id di-encode agar tidak bisa menyisipkan jalur lain", () => {
    expect(alamatIdentifikasi("1/../x")).toBe("/sigap/kelola/perencanaan/identifikasi/1%2F..%2Fx");
  });
});

describe("urutanSubAlur", () => {
  const daftar = [
    { kode: "monitoring", label: "Kelengkapan SPJ", ket: "k1" },
    { kode: "verifikasi", label: "Verifikasi & Kunci" },
    { kode: "unduh", label: "Unduh SPJ" },
    { kode: "tarif", label: "Kegiatan & Tarif" },
  ];
  it("hanya sub di kodeUrut, berurutan menurut kodeUrut, label bernomor 1..n, ikon dibawa", () => {
    const u = urutanSubAlur(daftar, ["monitoring", "verifikasi", "unduh"], { monitoring: "daftar" });
    expect(u.map((t) => t.label)).toEqual(["1 · Kelengkapan SPJ", "2 · Verifikasi & Kunci", "3 · Unduh SPJ"]);
    expect(u[0].ikon).toBe("daftar");
    expect(u[1].ikon).toBeUndefined();
    expect(u.some((t) => t.kode === "tarif")).toBe(false);
  });
  it("sub yang tidak tampil dilewati dan nomor dirapatkan", () => {
    const u = urutanSubAlur(daftar.filter((d) => d.kode !== "verifikasi"), ["monitoring", "verifikasi", "unduh"]);
    expect(u.map((t) => t.label)).toEqual(["1 · Kelengkapan SPJ", "2 · Unduh SPJ"]);
    const p = posisiAlur(u, "unduh");
    expect(p?.no).toBe(2);
    expect(p?.total).toBe(2);
    expect(p?.sebelumnya?.kode).toBe("monitoring");
    expect(p?.berikutnya).toBeNull();
  });
  it("tidak ada yang cocok -> daftar kosong -> posisi null", () => {
    expect(urutanSubAlur(daftar, ["x"])).toEqual([]);
    expect(posisiAlur(urutanSubAlur(daftar, ["x"]), "monitoring")).toBeNull();
  });
});
