import { describe, expect, it } from "vitest";
import { susunLinimasa } from "../linimasaJadwal";
import { hariKe, tambahHari, tanggalPendek } from "../jadwalPendataanTampil";

const PEND = [{ periode: "Triwulan IV", mulai: "2026-11-10", selesai: "2026-11-30", perkiraan: false }];
const dasar = { pelatihan: { mulai: "2026-11-09", selesai: null }, pendataan: PEND, peran: "ppl" as string | null };

describe("pembantu tanggal", () => {
  it("tambahHari, tanggalPendek, hariKe", () => {
    expect(tambahHari("2026-11-30", 1)).toBe("2026-12-01");
    expect(tambahHari("2026-03-01", -1)).toBe("2026-02-28");
    expect(tanggalPendek("2026-11-09")).toBe("9 Nov");
    expect(hariKe("2026-11-09")).toBe(1); // Senin
    expect(hariKe("xx")).toBe(-1);
  });
});

describe("susunLinimasa", () => {
  it("3 Nov: pelatihan 6 hari lagi, pendataan menyusul; jendela memuat hari ini sampai 1 Des", () => {
    const l = susunLinimasa({ hariIni: "2026-11-03", ...dasar })!;
    expect(l.berikutnya).toMatchObject({ jenis: "belum", angka: "6", satuan: "hari lagi" });
    expect(l.hari[0].tgl).toBe("2026-11-02"); // awal = min(hari ini, mulai paling awal) - 1
    expect(l.hari[l.indeksHariIni].tgl).toBe("2026-11-03");
    expect(l.hari[l.hari.length - 1].tgl).toBe("2026-12-01");
    expect(l.lajur.map((x) => [x.jenis, x.mulai, x.selesai, x.hari])).toEqual([["pelatihan", "2026-11-09", "2026-11-09", 1], ["pendataan", "2026-11-10", "2026-11-30", 21]]);
    expect(l.fase.map((f) => f.status)).toEqual(["belum", "belum", "belum"]);
    expect(l.bulan.map((b) => b.nama)).toEqual(["November 2026", "Desember 2026"]);
    expect(l.fokus).toMatch(/Siapkan diri/);
  });
  it("posisi batang mengikuti kolom", () => {
    const l = susunLinimasa({ hariIni: "2026-11-03", ...dasar })!;
    const pel = l.lajur[0], pend = l.lajur[1];
    expect(l.hari[pel.mulaiIdx].tgl).toBe("2026-11-09");
    expect(l.hari[pend.mulaiIdx].tgl).toBe("2026-11-10");
    expect(pend.panjang).toBe(21);
    expect(l.hari[pend.mulaiIdx + pend.panjang - 1].tgl).toBe("2026-11-30");
  });
  it("akhir pekan ditandai dan nama hari tiga huruf", () => {
    const l = susunLinimasa({ hariIni: "2026-11-03", ...dasar })!;
    expect(l.hari.find((h) => h.tgl === "2026-11-07")!.akhirPekan).toBe(true); // Sabtu
    expect(l.hari.find((h) => h.tgl === "2026-11-08")!.akhirPekan).toBe(true); // Minggu
    expect(l.hari.find((h) => h.tgl === "2026-11-09")!.akhirPekan).toBe(false);
    expect(l.hari.find((h) => h.tgl === "2026-11-09")!.huruf).toBe("Sen");
    expect(l.hari.find((h) => h.tgl === "2026-11-07")!.huruf).toBe("Sab");
  });
  it("pelatihan berjalan (dua hari) -> berjalan, fokus pelatihan", () => {
    const l = susunLinimasa({ hariIni: "2026-11-20", pelatihan: { mulai: "2026-11-20", selesai: "2026-11-21" }, pendataan: [], peran: "ppl" })!;
    expect(l.berikutnya).toMatchObject({ jenis: "berjalan", angka: "1/2" });
    expect(l.fase.map((f) => f.status)).toEqual(["berjalan", "belum"]);
    expect(l.fokus).toMatch(/presensi/);
  });
  it("pendataan berjalan: fokus PPL vs PML berbeda", () => {
    const ppl = susunLinimasa({ hariIni: "2026-11-12", ...dasar })!;
    const pml = susunLinimasa({ hariIni: "2026-11-12", ...dasar, peran: "pml" })!;
    expect(ppl.berikutnya).toMatchObject({ jenis: "berjalan", angka: "3/21" });
    expect(ppl.fokus).toMatch(/hari ke-3 dari 21/);
    expect(ppl.fokus).toMatch(/Kamera SIGAP/);
    expect(pml.fokus).toMatch(/pantau kemajuan PPL/);
    expect(ppl.fase.map((f) => f.status)).toEqual(["selesai", "berjalan", "belum"]);
    expect(ppl.peranTeks).toMatch(/^PPL/);
    expect(pml.peranTeks).toMatch(/^PML/);
  });
  it("jeda antara pelatihan dan pendataan", () => {
    const l = susunLinimasa({ hariIni: "2026-11-09", pelatihan: { mulai: "2026-11-05", selesai: "2026-11-05" }, pendataan: PEND, peran: null })!;
    expect(l.berikutnya).toMatchObject({ jenis: "belum", angka: "Besok" });
    expect(l.fokus).toMatch(/Pelatihan selesai/);
    expect(l.peranTeks).toBeNull();
  });
  it("semua selesai", () => {
    const l = susunLinimasa({ hariIni: "2026-12-20", ...dasar })!;
    expect(l.berikutnya.jenis).toBe("selesai");
    expect(l.fase.every((f) => f.status === "selesai")).toBe(true);
    expect(l.fokus).toMatch(/Terima kasih/);
  });
  it("hanya pelatihan (tanpa pendataan) dan hanya pendataan", () => {
    expect(susunLinimasa({ hariIni: "2026-11-03", pelatihan: { mulai: "2026-11-20", selesai: "2026-11-21" }, pendataan: [], peran: "ppl" })!.fase.map((f) => f.kunci)).toEqual(["pelatihan", "selesai"]);
    expect(susunLinimasa({ hariIni: "2026-11-03", pelatihan: null, pendataan: PEND, peran: "ppl" })!.fase.map((f) => f.kunci)).toEqual(["pendataan", "selesai"]);
  });
  it("jendela dipangkas maksimal 60 kolom dan tetap memuat hari ini", () => {
    const l = susunLinimasa({ hariIni: "2026-11-03", pelatihan: null, pendataan: [{ periode: "A", mulai: "2026-11-10", selesai: "2027-03-10", perkiraan: true }], peran: "ppl" })!;
    expect(l.hari.length).toBeLessThanOrEqual(60);
    expect(l.indeksHariIni).toBeGreaterThanOrEqual(0);
    expect(l.lajur[0].perkiraan).toBe(true);
  });
  it("tanpa data / tanggal rusak -> null", () => {
    expect(susunLinimasa({ hariIni: "2026-11-03", pelatihan: null, pendataan: [], peran: null })).toBeNull();
    expect(susunLinimasa({ hariIni: "bukan", ...dasar })).toBeNull();
    expect(susunLinimasa({ hariIni: "2026-11-03", pelatihan: { mulai: "x" }, pendataan: [{ periode: "A", mulai: "2026-11-10", selesai: "2026-11-01", perkiraan: false }], peran: null })).toBeNull();
  });
  it("beberapa periode pendataan diberi label periode", () => {
    const l = susunLinimasa({ hariIni: "2026-11-03", pelatihan: null, pendataan: [{ periode: "TW IV", mulai: "2026-11-10", selesai: "2026-11-20", perkiraan: false }, { periode: "TW I", mulai: "2026-12-01", selesai: "2026-12-10", perkiraan: true }], peran: null })!;
    expect(l.lajur.map((x) => x.label)).toEqual(["Pendataan TW IV", "Pendataan TW I"]);
  });
});
