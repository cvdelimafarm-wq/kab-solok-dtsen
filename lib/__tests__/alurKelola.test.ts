import { describe, expect, it } from "vitest";
import { alurIdentifikasi, alamatIdentifikasi, namaTanpaNomor, nomorDariLabel, posisiAlur, tahapTerakhir, teksPosisi, teksTombol, urutanDariTab } from "../alurKelola";

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
  it("lima tahap berurutan dengan alamat benar", () => {
    const u = alurIdentifikasi(42);
    expect(u.map((t) => t.kode)).toEqual(["awal", "lanjutan", "kebutuhan", "pelaksanaan", "gap"]);
    expect(u[0].href).toBe("/sigap/kelola/perencanaan/identifikasi/42");
    expect(u[1].href).toBe("/sigap/kelola/perencanaan/identifikasi/42/lanjutan");
    expect(u[4].href).toBe("/sigap/kelola/perencanaan/identifikasi/42/gap");
  });
  it("posisi lanjutan: sebelumnya awal, berikutnya kebutuhan", () => {
    const p = posisiAlur(alurIdentifikasi("7"), "lanjutan")!;
    expect(p.no).toBe(2);
    expect(p.total).toBe(5);
    expect(p.sebelumnya?.href).toBe("/sigap/kelola/perencanaan/identifikasi/7");
    expect(p.berikutnya?.href).toBe("/sigap/kelola/perencanaan/identifikasi/7/kebutuhan");
  });
  it("id di-encode agar tidak bisa menyisipkan jalur lain", () => {
    expect(alamatIdentifikasi("1/../x")).toBe("/sigap/kelola/perencanaan/identifikasi/1%2F..%2Fx");
  });
});
