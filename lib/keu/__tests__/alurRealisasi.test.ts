import { describe, it, expect } from "vitest";
import { langkahBerjalan, langkahRealisasi, type KeadaanRealisasi } from "../alurRealisasi";

const dasar: KeadaanRealisasi = {
  boleh: true, adaBerkas: false, membaca: false, galatBaca: null, berkasLolos: null, tanggalSah: false, sudahAdaTanggal: false, cek: "belum", mengirim: false, diterima: false,
};
const st = (k: Partial<KeadaanRealisasi>) => langkahRealisasi({ ...dasar, ...k }).map((x) => x.status);

describe("langkahRealisasi", () => {
  it("awal: langkah 1 berjalan, sisanya menunggu", () => {
    expect(st({})).toEqual(["sekarang", "menunggu", "menunggu", "menunggu", "menunggu"]);
    expect(langkahBerjalan(langkahRealisasi(dasar))).toBe(1);
  });
  it("membaca berkas", () => {
    expect(st({ membaca: true })).toEqual(["selesai", "sekarang", "menunggu", "menunggu", "menunggu"]);
  });
  it("galat baca menandai langkah 1", () => {
    expect(st({ galatBaca: "Berkas kosong." })).toEqual(["perhatian", "menunggu", "menunggu", "menunggu", "menunggu"]);
  });
  it("berkas tidak lolos atau tanggal belum sah: langkah 2 perlu perhatian", () => {
    expect(st({ adaBerkas: true, berkasLolos: false, tanggalSah: true })[1]).toBe("perhatian");
    expect(st({ adaBerkas: true, berkasLolos: true, tanggalSah: false })[1]).toBe("perhatian");
    expect(st({ adaBerkas: true, berkasLolos: false })).toEqual(["selesai", "perhatian", "menunggu", "menunggu", "menunggu"]);
  });
  it("berkas lolos, pagu sedang dibandingkan: kirim menunggu", () => {
    expect(st({ adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "memuat" })).toEqual(["selesai", "selesai", "sekarang", "menunggu", "menunggu"]);
  });
  it("pagu sama: siap kirim", () => {
    expect(st({ adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "sama" })).toEqual(["selesai", "selesai", "selesai", "sekarang", "menunggu"]);
  });
  it("pagu beda hanya peringatan, tidak menghalangi kirim", () => {
    const l = langkahRealisasi({ ...dasar, adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "beda" });
    expect(l.map((x) => x.status)).toEqual(["selesai", "selesai", "perhatian", "sekarang", "menunggu"]);
    expect(l[2].ket).toMatch(/Peringatan saja/);
    expect(langkahBerjalan(l)).toBe(3);
  });
  it("tanpa pembanding POK: tetap boleh lanjut", () => {
    expect(st({ adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "tak_ada" })).toEqual(["selesai", "selesai", "selesai", "sekarang", "menunggu"]);
  });
  it("tanggal sudah ada: langkah 4 perlu perhatian", () => {
    const l = langkahRealisasi({ ...dasar, adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "sama", sudahAdaTanggal: true });
    expect(l[3].status).toBe("perhatian");
    expect(l[3].ket).toMatch(/Batalkan/);
  });
  it("bukan bendahara: langkah 4 perlu perhatian", () => {
    expect(st({ boleh: false, adaBerkas: true, berkasLolos: true, tanggalSah: true, cek: "sama" })[3]).toBe("perhatian");
  });
  it("setelah diterima: langkah 4 selesai, langkah 5 berjalan", () => {
    const l = langkahRealisasi({ ...dasar, diterima: true });
    expect(l.map((x) => x.status)).toEqual(["sekarang", "menunggu", "menunggu", "selesai", "sekarang"]);
    expect(l[4].ket).toMatch(/terbaru/);
  });
  it("lima langkah bernomor 1..5", () => {
    expect(langkahRealisasi(dasar).map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
  });
});
