import { describe, expect, it } from "vitest";
import {
  AMBANG_MIRIP_BIT, MASA_SIMPAN_TAHUN, jarakHamming, kecepatanKmJam, kedaluwarsaTanpaTag, kodeDariByte, modeEfektif,
  nilaiKepercayaan, normalisasiKode, posisiMasukanValid, simpanSampai, teksWaktuWib, urlVerifikasi, waktuResmi,
  type MasukanKepercayaan,
} from "@/lib/sigapFoto";

const T = Date.UTC(2026, 9, 19, 7, 32, 7); // 14.32.07 WIB
const waktuBaik = () => waktuResmi({ tokenT: T - 20_000, elapsedMonoMs: 20_000, elapsedWallMs: 20_100, waktuHpMs: T + 500, terimaMs: T + 3000 });
const dasar = (o: Partial<MasukanKepercayaan> = {}): MasukanKepercayaan => ({
  akurasiM: 8, waktu: waktuBaik(), umurPosisiMs: 1000, jarakWilayahM: 300, kecepatanKmJam: 20, koordinatIdentik: false, hammingTerdekat: 30, ...o,
});

describe("modeEfektif", () => {
  it("bawaan unggah, ikuti bawaan", () => {
    expect(modeEfektif("unggah", "ikuti")).toBe("unggah");
    expect(modeEfektif(null, undefined)).toBe("unggah");
    expect(modeEfektif("kamera", "ikuti")).toBe("kamera");
  });
  it("kegiatan menimpa bawaan", () => {
    expect(modeEfektif("kamera", "unggah")).toBe("unggah");
    expect(modeEfektif("unggah", "kamera")).toBe("kamera");
  });
});

describe("kode verifikasi", () => {
  it("bentuk baku", () => {
    expect(kodeDariByte(Uint8Array.from([0x4a, 0x7f, 0x02, 0xc9, 0x11, 0xe3]))).toBe("SGP-4A7F-02C9-11E3");
  });
  it("normalisasi ketikan", () => {
    expect(normalisasiKode("sgp-4a7f-02c9-11e3")).toBe("SGP-4A7F-02C9-11E3");
    expect(normalisasiKode(" 4A7F 02C9 11E3 ")).toBe("SGP-4A7F-02C9-11E3");
    expect(normalisasiKode("SGP-4A7F-O2C9-11E3")).toBe("SGP-4A7F-02C9-11E3");
    expect(normalisasiKode("SGP-4A7F-02C9")).toBeNull();
    expect(normalisasiKode("SGP-ZZZZ-02C9-11E3")).toBeNull();
    expect(normalisasiKode(123)).toBeNull();
  });
  it("url QR", () => {
    expect(urlVerifikasi("SGP-4A7F-02C9-11E3", "https://bps-solokkab.up.railway.app/")).toBe("https://bps-solokkab.up.railway.app/verifikasi?k=SGP-4A7F-02C9-11E3");
  });
});

describe("waktuResmi", () => {
  it("memakai server + jam monotonik, bukan jam HP", () => {
    const w = waktuResmi({ tokenT: T - 60_000, elapsedMonoMs: 60_000, elapsedWallMs: 60_000, waktuHpMs: T + 7 * 3_600_000, terimaMs: T + 2000 });
    expect(w.terverifikasi).toBe(true);
    expect(w.diambilMs).toBe(T);
    expect(w.selisihHpDetik).toBe(7 * 3600);
  });
  it("tanpa token -> waktu terima, belum terverifikasi", () => {
    const w = waktuResmi({ tokenT: null, elapsedMonoMs: null, elapsedWallMs: null, waktuHpMs: T, terimaMs: T + 9000 });
    expect(w.terverifikasi).toBe(false);
    expect(w.diambilMs).toBe(T + 9000);
    expect(w.bendera).toContain("waktu_belum_terverifikasi");
  });
  it("token kedaluwarsa (potret >30 menit sesudah token) diperlakukan tanpa token", () => {
    const w = waktuResmi({ tokenT: T - 40 * 60_000, elapsedMonoMs: 40 * 60_000, elapsedWallMs: 40 * 60_000, waktuHpMs: T, terimaMs: T });
    expect(w.terverifikasi).toBe(false);
  });
  it("waktu dari token di masa depan -> tidak wajar", () => {
    const w = waktuResmi({ tokenT: T + 600_000, elapsedMonoMs: 1000, elapsedWallMs: 1000, waktuHpMs: T, terimaMs: T });
    expect(w.terverifikasi).toBe(false);
    expect(w.bendera).toContain("waktu_tidak_wajar");
  });
  it("jam dinding melompat dibanding monotonik -> bendera", () => {
    const w = waktuResmi({ tokenT: T - 10_000, elapsedMonoMs: 10_000, elapsedWallMs: 400_000, waktuHpMs: T, terimaMs: T });
    expect(w.bendera).toContain("jam_hp_berubah_atau_tidur");
  });
});

describe("nilaiKepercayaan", () => {
  it("semua wajar = hijau", () => expect(nilaiKepercayaan(dasar())).toEqual({ tingkat: "hijau", alasan: [] }));
  it("akurasi 50 m = kuning", () => expect(nilaiKepercayaan(dasar({ akurasiM: 50 })).tingkat).toBe("kuning"));
  it("jam HP beda 10 menit = kuning; beda 3 jam = merah", () => {
    const k = (detik: number) => nilaiKepercayaan(dasar({ waktu: { ...waktuBaik(), selisihHpDetik: detik } }));
    expect(k(600).tingkat).toBe("kuning");
    expect(k(3 * 3600).tingkat).toBe("merah");
    expect(k(-3 * 3600).alasan).toContain("jam_hp_beda_besar");
  });
  it("jauh dari wilayah 12 km = merah; 5 km = kuning", () => {
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 12_000 })).tingkat).toBe("merah");
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 5000 })).tingkat).toBe("kuning");
  });
  it("kecepatan 300 km/jam = merah", () => expect(nilaiKepercayaan(dasar({ kecepatanKmJam: 300 })).alasan).toContain("kecepatan_tak_wajar"));
  it("koordinat identik & mirip = kuning", () => {
    expect(nilaiKepercayaan(dasar({ koordinatIdentik: true })).tingkat).toBe("kuning");
    expect(nilaiKepercayaan(dasar({ hammingTerdekat: AMBANG_MIRIP_BIT })).alasan).toContain("mirip_foto_lain");
    expect(nilaiKepercayaan(dasar({ hammingTerdekat: AMBANG_MIRIP_BIT + 1 })).tingkat).toBe("hijau");
  });
  it("merah menang atas kuning, alasan merah lebih dulu", () => {
    const h = nilaiKepercayaan(dasar({ akurasiM: 60, jarakWilayahM: 20_000 }));
    expect(h.tingkat).toBe("merah");
    expect(h.alasan[0]).toBe("jauh_dari_wilayah");
  });
});

describe("hamming & kecepatan", () => {
  it("hamming", () => {
    expect(jarakHamming("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
    expect(jarakHamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(jarakHamming("0000000000000001", "0000000000000003")).toBe(1);
    expect(jarakHamming("abc", "abcd")).toBeNull();
    expect(jarakHamming(null, "ab")).toBeNull();
  });
  it("kecepatan", () => {
    // ~1,1 km dalam 60 detik = ~66 km/jam
    const v = kecepatanKmJam({ lat: -0.79, lng: 100.65, ms: 0 }, { lat: -0.80, lng: 100.65, ms: 60_000 });
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(60);
    expect(v!).toBeLessThan(72);
    expect(kecepatanKmJam({ lat: 0, lng: 100, ms: 0 }, { lat: 1, lng: 100, ms: 500 })).toBeNull();
  });
});

describe("masa simpan", () => {
  it("3 tahun", () => expect(MASA_SIMPAN_TAHUN).toBe(3));
  it("dari tanggal selesai kegiatan bila lebih akhir", () => {
    expect(simpanSampai("2026-12-20", "2026-10-19")).toBe("2029-12-20");
    expect(simpanSampai(null, "2026-10-19")).toBe("2029-10-19");
    expect(simpanSampai("2026-10-01", "2026-10-19")).toBe("2029-10-19");
  });
  it("29 Februari", () => expect(simpanSampai(null, "2028-02-29")).toBe("2031-02-28"));
  it("kedaluwarsa tanpa tag 90 hari", () => expect(kedaluwarsaTanpaTag("2026-10-19")).toBe("2027-01-17"));
});

describe("cap & validasi", () => {
  it("teks waktu WIB", () => expect(teksWaktuWib(T)).toBe("Senin, 19 Okt 2026 · 14.32.07 WIB"));
  it("posisi", () => {
    expect(posisiMasukanValid({ lat: -0.79, lng: 100.65, akurasi: 10 })).toBe(true);
    expect(posisiMasukanValid({ lat: 0, lng: 0, akurasi: 10 })).toBe(false);
    expect(posisiMasukanValid({ lat: "a", lng: 100, akurasi: 1 })).toBe(false);
    expect(posisiMasukanValid(null)).toBe(false);
  });
});
