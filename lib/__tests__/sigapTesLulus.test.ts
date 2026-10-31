import { describe, expect, it } from "vitest";
import { NILAI_LULUS_BAWAAN, PERCOBAAN_WAJIB_LULUS, alasanTakBisaUlang, bisaUlang, nilaiLulus, percobaanMaks, statusLulus, wajibLulus, type TesBaris } from "../sigapTes";

const SEKARANG = new Date("2026-10-08T10:00:00Z");
const tesDasar = { jenis: "posttest" as const, aktif: true, buka_at: "2026-10-08T07:00:00Z", tutup_at: "2026-10-08T15:00:00Z", ulang_maks: 1 };
const selesai = (skor: number, percobaan = 1, skor_terbaik: number | null = null) => ({ selesai_at: "2026-10-08T09:00:00Z", percobaan, skor, skor_terbaik });
const wajib = (j: TesBaris["jenis"], nilai: number | null = 70) => ({ ...tesDasar, jenis: j, wajib_lulus: true, nilai_lulus: nilai });

describe("nilaiLulus / wajibLulus / percobaanMaks", () => {
  it("nilai lulus kosong atau rusak jatuh ke 70", () => {
    expect(nilaiLulus({ nilai_lulus: undefined })).toBe(NILAI_LULUS_BAWAAN);
    expect(nilaiLulus({ nilai_lulus: null })).toBe(70);
    expect(nilaiLulus({ nilai_lulus: 150 })).toBe(70);
    expect(nilaiLulus({ nilai_lulus: -1 })).toBe(70);
    expect(nilaiLulus({ nilai_lulus: 0 })).toBe(0);
    expect(nilaiLulus({ nilai_lulus: 85.5 })).toBe(85.5);
  });
  it("wajib lulus hanya bila true persis (kolom belum ada = tidak wajib)", () => {
    expect(wajibLulus({})).toBe(false);
    expect(wajibLulus({ wajib_lulus: false })).toBe(false);
    expect(wajibLulus({ wajib_lulus: true })).toBe(true);
  });
  it("percobaan maksimal: wajib lulus = 3 untuk pretest dan posttest; tidak wajib mengikuti aturan lama", () => {
    expect(percobaanMaks({ jenis: "pretest", ulang_maks: 1, wajib_lulus: true })).toBe(PERCOBAAN_WAJIB_LULUS);
    expect(percobaanMaks({ jenis: "posttest", ulang_maks: 5, wajib_lulus: true })).toBe(3);
    expect(percobaanMaks({ jenis: "posttest", ulang_maks: 4 })).toBe(4);
    expect(percobaanMaks({ jenis: "posttest", ulang_maks: 9 })).toBe(5);
    expect(percobaanMaks({ jenis: "pretest", ulang_maks: 3 })).toBe(1);
    expect(percobaanMaks({ jenis: "posttest", ulang_maks: 0 })).toBe(1);
  });
});

describe("statusLulus", () => {
  it("tes tidak wajib -> tidak_wajib berapa pun skornya", () => {
    expect(statusLulus({ wajib_lulus: false, nilai_lulus: 70 }, 10)).toBe("tidak_wajib");
    expect(statusLulus({}, 100)).toBe("tidak_wajib");
  });
  it("tanpa skor -> belum_dinilai; batas tepat = lulus", () => {
    expect(statusLulus({ wajib_lulus: true, nilai_lulus: 70 }, null)).toBe("belum_dinilai");
    expect(statusLulus({ wajib_lulus: true, nilai_lulus: 70 }, 69.99)).toBe("belum_lulus");
    expect(statusLulus({ wajib_lulus: true, nilai_lulus: 70 }, 70)).toBe("lulus");
    expect(statusLulus({ wajib_lulus: true, nilai_lulus: null }, 70)).toBe("lulus");
  });
});

describe("bisaUlang", () => {
  it("perilaku lama tetap: posttest ulang_maks 2 boleh ulang sekali, pretest tidak", () => {
    expect(bisaUlang({ ...tesDasar, ulang_maks: 2 }, selesai(90), 10, SEKARANG)).toBe(true);
    expect(bisaUlang({ ...tesDasar, ulang_maks: 2 }, selesai(90, 2), 10, SEKARANG)).toBe(false);
    expect(bisaUlang({ ...tesDasar, jenis: "pretest", ulang_maks: 1 }, selesai(10), 10, SEKARANG)).toBe(false);
    expect(bisaUlang(tesDasar, selesai(10), 10, SEKARANG)).toBe(false);
  });
  it("wajib lulus, belum lulus -> boleh ulang (pretest maupun posttest), maksimal 3 percobaan", () => {
    for (const j of ["pretest", "posttest"] as const) {
      expect(bisaUlang(wajib(j), selesai(50, 1), 10, SEKARANG)).toBe(true);
      expect(bisaUlang(wajib(j), selesai(50, 2), 10, SEKARANG)).toBe(true);
      expect(bisaUlang(wajib(j), selesai(50, 3), 10, SEKARANG)).toBe(false);
    }
  });
  it("wajib lulus, sudah lulus -> tidak ditawarkan; skor tertinggi dari percobaan sebelumnya ikut dihitung", () => {
    expect(bisaUlang(wajib("posttest"), selesai(70), 10, SEKARANG)).toBe(false);
    expect(bisaUlang(wajib("posttest"), selesai(40, 2, 80), 10, SEKARANG)).toBe(false);
    expect(bisaUlang(wajib("posttest"), selesai(40, 2, 60), 10, SEKARANG)).toBe(true);
  });
  it("syarat jadwal dan sesi tetap berlaku", () => {
    expect(bisaUlang(wajib("posttest"), { ...selesai(50), selesai_at: null }, 10, SEKARANG)).toBe(false);
    expect(bisaUlang(wajib("posttest"), null, 10, SEKARANG)).toBe(false);
    expect(bisaUlang({ ...wajib("posttest"), aktif: false }, selesai(50), 10, SEKARANG)).toBe(false);
    expect(bisaUlang(wajib("posttest"), selesai(50), 0, SEKARANG)).toBe(false);
    expect(bisaUlang(wajib("posttest"), selesai(50), 10, new Date("2026-10-08T14:59:30Z"))).toBe(false); // sisa < 60 dtk
    expect(bisaUlang(wajib("posttest"), selesai(50), 10, new Date("2026-10-08T06:00:00Z"))).toBe(false); // belum buka
  });
  it("nilai lulus yang diubah memengaruhi putusan (KKM 40 -> skor 50 sudah lulus)", () => {
    expect(bisaUlang(wajib("posttest", 40), selesai(50), 10, SEKARANG)).toBe(false);
  });
});

describe("alasanTakBisaUlang", () => {
  it("tes biasa tanpa ulangan", () => {
    expect(alasanTakBisaUlang(tesDasar, selesai(10))).toContain("tidak membuka kesempatan");
    expect(alasanTakBisaUlang({ ...tesDasar, jenis: "pretest" }, selesai(10))).toContain("tidak membuka kesempatan");
  });
  it("wajib lulus: sedang berjalan, sudah lulus, kuota habis", () => {
    expect(alasanTakBisaUlang(wajib("posttest"), { ...selesai(50), selesai_at: null })).toContain("Selesaikan percobaan");
    expect(alasanTakBisaUlang(wajib("posttest"), selesai(90))).toContain("sudah mencapai nilai lulus");
    expect(alasanTakBisaUlang(wajib("pretest"), selesai(50, 3))).toContain("maksimal 3");
  });
  it("posttest biasa: kuota habis lalu waktu", () => {
    expect(alasanTakBisaUlang({ ...tesDasar, ulang_maks: 2 }, selesai(50, 2))).toContain("maksimal 2");
    expect(alasanTakBisaUlang({ ...tesDasar, ulang_maks: 2 }, selesai(50, 1))).toContain("Waktu tes");
  });
});
