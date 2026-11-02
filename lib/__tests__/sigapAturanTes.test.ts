import { describe, expect, it } from "vitest";
import { NILAI_PENUH, bisaUlang, alasanTakBisaUlang, percobaanMaks, sudahPenuh, tesTuntas, wajib100, type TesBaris } from "../sigapTes";
import { hitungKelulusan, lulusMenurut, nilaiPertama, nilaiResmiTes, nilaiTertinggi, periksaAturan, rapikanAturan, statusKelulusan, versiBawaan, KODE_PSP } from "../sigapAturanTes";

const SEKARANG = new Date("2026-11-09T03:00:00Z");
const tes = (o: Partial<TesBaris> = {}): TesBaris => ({
  id: 1, kegiatan_id: 7, jenis: "posttest", judul: "Posttest", buka_at: "2026-11-09T01:00:00Z", durasi_menit: 30, tutup_at: "2026-11-09T09:00:00Z", aktif: true, ulang_maks: 1, nilai_lulus: 70, wajib_lulus: false, wajib_100: false, ...o,
});
const sesi = (o: Record<string, unknown> = {}) => ({ selesai_at: "2026-11-09T02:00:00Z", percobaan: 1, skor: 60, skor_terbaik: null as number | null, ...o });

describe("aturan versi bawaan", () => {
  it("PSP = versi 1, kegiatan lain = versi 2, baris tersimpan menang", () => {
    expect(versiBawaan(KODE_PSP)).toBe(1);
    expect(versiBawaan("pelatihan_seruti_tw4_2026")).toBe(2);
    expect(versiBawaan(null)).toBe(2);
    expect(rapikanAturan(null, KODE_PSP)).toEqual({ versi: 1, blokir_tahap: false, izin_ajukan: false, eksplisit: false });
    expect(rapikanAturan({ aturan_versi: 2, blokir_tahap: true, izin_ajukan: true }, KODE_PSP)).toEqual({ versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true });
    expect(rapikanAturan({ aturan_versi: 9 }, "x").versi).toBe(2);
  });
  it("periksaAturan menolak masukan tak sah", () => {
    expect(periksaAturan({ versi: 2, blokir_tahap: false, izin_ajukan: true }).ok).toBe(true);
    expect(periksaAturan({ versi: 3, blokir_tahap: false, izin_ajukan: true }).ok).toBe(false);
    expect(periksaAturan({ versi: 1, blokir_tahap: "ya", izin_ajukan: true }).ok).toBe(false);
    expect(periksaAturan(null).ok).toBe(false);
  });
});

describe("nilai pertama vs tertinggi", () => {
  it("percobaan pertama: sama", () => {
    expect(nilaiPertama(sesi())).toBe(60);
    expect(nilaiTertinggi(sesi())).toBe(60);
  });
  it("sesudah mengulang: v2 memakai skor_awal, v1 memakai yang tertinggi", () => {
    const s = sesi({ percobaan: 2, skor: 90, skor_terbaik: 60, skor_awal: 60 });
    expect(nilaiResmiTes(1, s)).toBe(90);
    expect(nilaiResmiTes(2, s)).toBe(60);
  });
  it("percobaan ke-2 tanpa skor_awal memakai arsip bila ada, selain itu null", () => {
    const s = sesi({ percobaan: 2, skor: 90, skor_terbaik: 60 });
    expect(nilaiResmiTes(2, s)).toBeNull();
    expect(nilaiResmiTes(2, s, 55)).toBe(55);
  });
  it("percobaan berjalan (belum selesai) tidak mengubah nilai pertama", () => {
    const s = sesi({ percobaan: 2, selesai_at: null, skor: null, skor_terbaik: 60, skor_awal: 60 });
    expect(nilaiResmiTes(2, s)).toBe(60);
    expect(nilaiResmiTes(1, s)).toBe(60);
  });
  it("sesi belum selesai pada percobaan pertama = belum ada nilai", () => {
    expect(nilaiPertama(sesi({ selesai_at: null, skor: null }))).toBeNull();
    expect(nilaiResmiTes(2, null)).toBeNull();
  });
  it("skor berupa teks dari PostgREST dibaca sebagai angka", () => {
    expect(nilaiPertama(sesi({ skor: "72.50" }))).toBe(72.5);
  });
});

describe("lulus lebih dari ambang (versi 2)", () => {
  it("tepat 70 = tidak lulus pada versi 2, lulus pada versi 1", () => {
    expect(lulusMenurut(2, 70, 70)).toBe(false);
    expect(lulusMenurut(2, 70.01, 70)).toBe(true);
    expect(lulusMenurut(1, 70, 70)).toBe(true);
  });
  it("statusKelulusan", () => {
    expect(statusKelulusan(2, { akhir: null, lengkap: false })).toBe("belum_dinilai");
    expect(statusKelulusan(2, { akhir: 80, lengkap: false })).toBe("belum_lengkap");
    expect(statusKelulusan(2, { akhir: 70, lengkap: true })).toBe("tidak_lulus");
    expect(statusKelulusan(2, { akhir: 70.5, lengkap: true })).toBe("lulus");
    expect(statusKelulusan(1, { akhir: 70, lengkap: true })).toBe("lulus");
    expect(statusKelulusan(2, { akhir: 80, lengkap: true }, 85)).toBe("tidak_lulus");
  });
  it("hitungKelulusan", () => {
    expect(hitungKelulusan(["lulus", "lulus", "tidak_lulus", "belum_lengkap"])).toEqual({ lulus: 2, tidak_lulus: 1, belum_lengkap: 1, belum_dinilai: 0 });
  });
});

describe("wajib 100", () => {
  it("percobaan tanpa batas dan mengulang untuk pretest maupun posttest", () => {
    expect(percobaanMaks(tes({ wajib_100: true }))).toBe(999);
    const pre = tes({ jenis: "pretest", wajib_100: true });
    expect(bisaUlang(pre, sesi({ percobaan: 8 }), 20, SEKARANG)).toBe(true);
  });
  it("berhenti begitu mencapai 100 (di percobaan berjalan atau sebelumnya)", () => {
    const t = tes({ wajib_100: true });
    expect(bisaUlang(t, sesi({ skor: 100 }), 20, SEKARANG)).toBe(false);
    expect(bisaUlang(t, sesi({ percobaan: 3, skor: 80, skor_terbaik: 100 }), 20, SEKARANG)).toBe(false);
    expect(alasanTakBisaUlang(t, sesi({ skor: 100 }))).toContain("100");
  });
  it("skor 99,5 belum penuh", () => {
    expect(sudahPenuh(sesi({ skor: 99.5 }))).toBe(false);
    expect(NILAI_PENUH).toBe(100);
  });
  it("wajib 100 mengalahkan wajib lulus (lulus 70 tidak menghentikan pengulangan)", () => {
    const t = tes({ wajib_100: true, wajib_lulus: true });
    expect(bisaUlang(t, sesi({ skor: 85 }), 20, SEKARANG)).toBe(true);
  });
  it("tidak mengulang setelah tes ditutup atau hampir ditutup", () => {
    const t = tes({ wajib_100: true, tutup_at: "2026-11-09T03:00:30Z" });
    expect(bisaUlang(t, sesi(), 20, SEKARANG)).toBe(false);
    expect(bisaUlang(tes({ wajib_100: true }), sesi(), 20, new Date("2026-11-09T09:30:00Z"))).toBe(false);
  });
  it("tidak ada kesempatan bila sesi belum selesai", () => {
    expect(bisaUlang(tes({ wajib_100: true }), sesi({ selesai_at: null }), 20, SEKARANG)).toBe(false);
  });
  it("tesTuntas: wajib 100 hanya bila 100; selain itu cukup selesai", () => {
    expect(tesTuntas(tes({ wajib_100: true }), sesi({ skor: 90 }))).toBe(false);
    expect(tesTuntas(tes({ wajib_100: true }), sesi({ skor: 90, percobaan: 2, skor_terbaik: 100 }))).toBe(true);
    expect(tesTuntas(tes(), sesi({ skor: 10 }))).toBe(true);
    expect(tesTuntas(tes(), null)).toBe(false);
    expect(tesTuntas(tes(), sesi({ selesai_at: null, skor: null }))).toBe(false);
    expect(wajib100({ wajib_100: undefined })).toBe(false);
  });
  it("perilaku lama tanpa wajib 100 tidak berubah", () => {
    const pre = tes({ jenis: "pretest" });
    expect(bisaUlang(pre, sesi(), 20, SEKARANG)).toBe(false);
    expect(bisaUlang(tes({ ulang_maks: 2 }), sesi(), 20, SEKARANG)).toBe(true);
    expect(percobaanMaks(tes({ wajib_lulus: true }))).toBe(3);
  });
});
