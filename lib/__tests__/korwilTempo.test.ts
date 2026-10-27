import { describe, expect, it } from "vitest";
import { geserTanggal, hitungTempo, ringkasTempo, selisihHari } from "../korwilTempo";

const HARI = "2026-10-27";
const SELESAI = "2026-11-10"; // 15 hari termasuk hari ini
const dasar = { hariIni: HARI, selesai: SELESAI, ppl: 5 };
/** kecepatan tetap n per hari selama 7 hari sebelum HARI */
const tetap = (n: number, hari = 7): Record<string, number> => Object.fromEntries(Array.from({ length: hari }, (_, i) => [geserTanggal(HARI, -(i + 1)), n]));

describe("tanggal", () => {
  it("selisih dan geser", () => {
    expect(selisihHari("2026-10-27", "2026-11-10")).toBe(14);
    expect(geserTanggal("2026-10-30", 3)).toBe("2026-11-02");
    expect(geserTanggal("2026-11-01", -1)).toBe("2026-10-31");
  });
});

describe("hitungTempo", () => {
  it("selesai bila sisa 0", () => {
    const t = hitungTempo({ ...dasar, target: 100, realisasi: 100, harian: {} });
    expect(t).toMatchObject({ status: "selesai", sisa: 0, targetHarian: 0, terlambatHari: 0 });
  });
  it("aman: kecepatan >= target harian", () => {
    // sisa 300 / 15 hari = 20 per hari; kecepatan 25
    const t = hitungTempo({ ...dasar, target: 500, realisasi: 200, harian: tetap(25) });
    expect(t).toMatchObject({ status: "aman", sisa: 300, hariSisa: 15, targetHarian: 20, targetPerPpl: 4, kecepatan: 25, hariDinilai: 7 });
    expect(t.perkiraanSelesai).toBe("2026-11-07"); // ceil(300/25)=12 hari -> 27 Okt + 11
    expect(t.terlambatHari).toBe(0);
  });
  it("waspada: 80-99% dari target harian", () => {
    const t = hitungTempo({ ...dasar, target: 500, realisasi: 200, harian: tetap(17) }); // 17 >= 16 (80% dari 20), < 20
    expect(t.status).toBe("waspada");
    expect(t.terlambatHari).toBe(3); // ceil(300/17)=18 hari -> 13 Nov; batas 10 Nov
  });
  it("warning: di bawah 80%", () => {
    const t = hitungTempo({ ...dasar, target: 500, realisasi: 200, harian: tetap(10) });
    expect(t.status).toBe("warning");
    expect(t.perkiraanSelesai).toBe("2026-11-25");
    expect(t.terlambatHari).toBe(15);
  });
  it("warning bila belum ada kecepatan sama sekali", () => {
    const t = hitungTempo({ ...dasar, target: 50, realisasi: 0, harian: {} });
    expect(t).toMatchObject({ status: "warning", kecepatan: 0, perkiraanSelesai: null, terlambatHari: null, targetHarian: 4 });
  });
  it("hari ini tidak ikut dihitung kecepatan", () => {
    const h = { ...tetap(10), [HARI]: 999 };
    expect(hitungTempo({ ...dasar, target: 500, realisasi: 0, harian: h }).kecepatan).toBe(10);
  });
  it("kurang dari 7 hari data: dihitung sejak hari pertama ada catatan", () => {
    const h = { [geserTanggal(HARI, -3)]: 30, [geserTanggal(HARI, -2)]: 30, [geserTanggal(HARI, -1)]: 30 };
    const t = hitungTempo({ ...dasar, target: 300, realisasi: 90, harian: h });
    expect(t).toMatchObject({ hariDinilai: 3, kecepatan: 30 });
  });
  it("hari tanpa catatan di dalam jendela dihitung nol", () => {
    const h = { [geserTanggal(HARI, -7)]: 70 }; // hanya 1 hari ada isi, 6 hari lain nol -> 70/7 = 10
    expect(hitungTempo({ ...dasar, target: 500, realisasi: 0, harian: h }).kecepatan).toBe(10);
  });
  it("batas sudah lewat dan masih ada sisa -> warning", () => {
    const t = hitungTempo({ hariIni: "2026-11-12", selesai: SELESAI, ppl: 3, target: 100, realisasi: 90, harian: {} });
    expect(t).toMatchObject({ status: "warning", hariSisa: 0, targetHarian: 10 });
  });
  it("hari terakhir: seluruh sisa harus selesai hari ini", () => {
    const t = hitungTempo({ hariIni: SELESAI, selesai: SELESAI, ppl: 4, target: 100, realisasi: 60, harian: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [geserTanggal(SELESAI, -(i + 1)), 40])) });
    expect(t).toMatchObject({ hariSisa: 1, targetHarian: 40, targetPerPpl: 10, status: "aman" });
  });
  it("tanpa PPL: target per PPL kosong", () => {
    expect(hitungTempo({ ...dasar, ppl: 0, target: 10, realisasi: 0, harian: tetap(5) }).targetPerPpl).toBeNull();
  });
});

describe("ringkasTempo", () => {
  it("menghitung per status", () => {
    expect(ringkasTempo([{ status: "aman" }, { status: "aman" }, { status: "warning" }, { status: "selesai" }])).toEqual({ selesai: 1, aman: 2, waspada: 0, warning: 1 });
  });
});
