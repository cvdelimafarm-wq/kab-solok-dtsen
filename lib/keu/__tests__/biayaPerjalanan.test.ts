import { describe, expect, it } from "vitest";
import { biayaPerjalananKelas, hariPerjalanan, normalisasiLanjutan, rincianBiaya } from "../lanjutan";

const isiDengan = (kelas: Record<string, unknown>) => normalisasiLanjutan({
  peran: { ppl: { on: true, nOrg: 0, nMit: 10, translok: false, penginapan: false, fix: true } },
  kelas: [{ id: "k1", nama: "Pelatihan", sesi: "pelatihan", metode: "Luring", tempat: "Hotel luar kota", paket: "fullboard", oh: 3, mulai: "2026-02-02", selesai: "2026-02-04", untuk: ["ppl"], fix: true, ...kelas }],
});
const uraian = (k: Record<string, unknown>) => rincianBiaya(isiDengan(k), null, null).filter((r) => r.kelompok === "Pelatihan").map((r) => r.uraian);
const cari = (k: Record<string, unknown>, teks: string) => rincianBiaya(isiDengan(k), null, null).find((r) => r.uraian.includes(teks));

describe("biayaPerjalananKelas", () => {
  it("fullboard luar kota: uang harian fullboard, tanpa transport lokal", () => {
    expect(biayaPerjalananKelas({ tempat: "Hotel luar kota", paket: "fullboard" })).toEqual({ uhFullboard: true, transportLokal: false, hariPerjalanan: 0 });
  });
  it("fullday luar kota: transport lokal, tanpa uang harian fullboard", () => {
    expect(biayaPerjalananKelas({ tempat: "Hotel luar kota", paket: "fullday" })).toEqual({ uhFullboard: false, transportLokal: true, hariPerjalanan: 0 });
  });
  it("dalam kota (kantor atau hotel): transport lokal; uang harian fullboard hanya bila fullboard", () => {
    expect(biayaPerjalananKelas({ tempat: "Kantor", paket: "" }).transportLokal).toBe(true);
    expect(biayaPerjalananKelas({ tempat: "Hotel dalam kota", paket: "fullday" })).toMatchObject({ uhFullboard: false, transportLokal: true });
    expect(biayaPerjalananKelas({ tempat: "Hotel dalam kota", paket: "fullboard" })).toMatchObject({ uhFullboard: true, transportLokal: true });
  });
  it("tempat belum dipilih: tidak ada transport lokal", () => {
    expect(biayaPerjalananKelas({ tempat: "", paket: "" })).toEqual({ uhFullboard: false, transportLokal: false, hariPerjalanan: 0 });
  });
  it("hari perjalanan: sebelum 1, sesudah 1, keduanya 2", () => {
    expect([undefined, "", "sebelum", "sesudah", "keduanya"].map((p) => hariPerjalanan({ perjalanan: p as never }))).toEqual([0, 0, 1, 1, 2]);
  });
});

describe("rincianBiaya: perjalanan peserta pelatihan", () => {
  it("fullboard luar kota + perjalanan dua hari", () => {
    const u = uraian({ perjalanan: "keduanya" });
    expect(u.some((x) => x.includes("uang harian fullboard"))).toBe(true);
    expect(u.some((x) => x.includes("transport lokal"))).toBe(false);
    const uh = cari({ perjalanan: "keduanya" }, "uang harian perjalanan")!;
    expect(uh.volume).toBe(20); // 10 peserta x 2 hari
    expect(uh.tarif).toBe(380000);
    expect(uh.jumlah).toBe(7600000);
    expect(uh.akun).toBe("524111");
    expect(cari({ perjalanan: "keduanya" }, "uang harian fullboard")!.volume).toBe(30); // 10 x 3 hari
  });
  it("fullday luar kota: transport lokal, tanpa uang harian fullboard dan perjalanan", () => {
    const u = uraian({ paket: "fullday" });
    expect(u.some((x) => x.includes("transport lokal"))).toBe(true);
    expect(u.some((x) => x.includes("uang harian"))).toBe(false);
    expect(cari({ paket: "fullday" }, "transport lokal")!.volume).toBe(30);
  });
  it("pelatihan di kantor: transport lokal saja", () => {
    const u = uraian({ tempat: "Kantor", paket: "" });
    expect(u.some((x) => x.includes("transport lokal"))).toBe(true);
    expect(u.some((x) => x.includes("uang harian"))).toBe(false);
  });
  it("daring: tidak ada biaya perjalanan", () => {
    const u = uraian({ metode: "Daring", perjalanan: "sebelum" });
    expect(u.some((x) => x.includes("transport") || x.includes("uang harian"))).toBe(false);
  });
  it("normalisasi menyimpan pilihan perjalanan dan membuang nilai asing", () => {
    expect(isiDengan({ perjalanan: "sebelum" }).kelas[0].perjalanan).toBe("sebelum");
    expect(isiDengan({ perjalanan: "ngawur" }).kelas[0].perjalanan).toBeUndefined();
    expect(isiDengan({}).kelas[0].perjalanan).toBeUndefined();
  });
});
