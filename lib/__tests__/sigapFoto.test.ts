import { describe, expect, it } from "vitest";
import {
  jarakEfektifM, teksLokasiWilayah, lokasiDuaBaris,
  AMBANG_MIRIP_BIT, MASA_SIMPAN_TAHUN, jarakHamming, kecepatanKmJam, kedaluwarsaTanpaTag, kodeDariByte, modeEfektif,
  SLOT_FOTO_LAPORAN, bolehFotoLaporan,
  TOLERANSI_KIRIM_HARI, UMUR_PAKET_MS, dalamToleransiKirim, BATAS_HARI_BAGI, jendelaBagiFoto, LABEL_ALASAN, labelFotoTanpaSinyal,
  nilaiKepercayaan, normalisasiKode, posisiMasukanValid, simpanSampai, statusPemeriksaan, teksWaktuWib, urlVerifikasi, waktuResmi,
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

// (23 Okt 2026) Foto tanpa sinyal: token PAKET, waktu dari jam dinding HP sejak paket diterima, hasil selalu kuning.
describe("waktuResmi: token paket (tanpa sinyal)", () => {
  const paket = (o: Partial<Parameters<typeof waktuResmi>[0]> = {}) =>
    waktuResmi({ tokenT: T - 5 * 3_600_000, elapsedMonoMs: null, elapsedWallMs: 5 * 3_600_000, waktuHpMs: T, terimaMs: T + 2 * 3_600_000, paket: true, ...o });
  it("waktu foto = waktu paket + selang jam dinding HP (bukan waktu terima), bertanda waktu_offline, tidak terverifikasi", () => {
    const w = paket();
    expect(w.diambilMs).toBe(T);
    expect(w.offline).toBe(true);
    expect(w.terverifikasi).toBe(false);
    expect(w.bendera).toEqual(["waktu_offline"]);
    expect(w.selisihHpDetik).toBe(0);
  });
  it("hasil penilaian selalu kuning (tidak pernah hijau) walau semua kriteria lain baik", () => {
    const h = nilaiKepercayaan({ akurasiM: 8, waktu: paket(), umurPosisiMs: 1000, jarakWilayahM: 300, kecepatanKmJam: 20, koordinatIdentik: false, hammingTerdekat: 30 });
    expect(h.tingkat).toBe("kuning");
    expect(h.alasan).toEqual(["waktu_offline"]);
    expect(LABEL_ALASAN.waktu_offline).toMatch(/tanpa sinyal/i);
  });
  it("selang diukur dengan jam dinding walau jam monotonik ada; beda besar keduanya diberi bendera", () => {
    const w = paket({ elapsedMonoMs: 60_000, elapsedWallMs: 5 * 3_600_000 });
    expect(w.diambilMs).toBe(T);
    expect(w.bendera).toContain("jam_hp_berubah_atau_tidur");
    expect(w.bendera).toContain("waktu_offline");
  });
  it("paket berlaku 48 jam: 47 jam dipakai, lebih dari 48 jam diperlakukan tanpa token", () => {
    const ok = paket({ tokenT: T - 47 * 3_600_000, elapsedWallMs: 47 * 3_600_000 });
    expect(ok.offline).toBe(true);
    const lewat = paket({ tokenT: T - 49 * 3_600_000, elapsedWallMs: 49 * 3_600_000, terimaMs: T });
    expect(lewat.offline).toBe(false);
    expect(lewat.diambilMs).toBe(T);
    expect(lewat.bendera).toEqual(["waktu_belum_terverifikasi"]);
    expect(UMUR_PAKET_MS).toBe(48 * 3_600_000);
  });
  it("token biasa (bukan paket) tetap berumur 30 menit dan memakai jam monotonik", () => {
    const w = waktuResmi({ tokenT: T - 5 * 3_600_000, elapsedMonoMs: 5 * 3_600_000, elapsedWallMs: 5 * 3_600_000, waktuHpMs: T, terimaMs: T });
    expect(w.offline).toBeFalsy();
    expect(w.terverifikasi).toBe(false);
  });
  it("jam HP dimajukan melewati waktu terima -> tidak wajar (merah), bukan dipercaya", () => {
    const w = paket({ elapsedWallMs: 9 * 3_600_000 }); // t = T + 4 jam, padahal diterima T + 2 jam
    expect(w.offline).toBe(false);
    expect(w.bendera).toContain("waktu_tidak_wajar");
  });
  it("jam HP dimundurkan (selang negatif) -> tanpa token (waktu terima)", () => {
    const w = paket({ elapsedWallMs: -1000, elapsedMonoMs: null });
    expect(w.offline).toBe(false);
    expect(w.diambilMs).toBe(T + 2 * 3_600_000);
  });
  it("jam HP berbeda > 2 menit dari waktu hitung -> kuning tambahan; > 1 jam -> merah", () => {
    expect(nilaiKepercayaan({ akurasiM: 8, waktu: paket({ waktuHpMs: T + 10 * 60_000 }), umurPosisiMs: 1000, jarakWilayahM: 300, kecepatanKmJam: 20, koordinatIdentik: false, hammingTerdekat: 30 }).alasan).toEqual(["waktu_offline", "jam_hp_beda_kecil"]);
    expect(nilaiKepercayaan({ akurasiM: 8, waktu: paket({ waktuHpMs: T + 2 * 3_600_000 }), umurPosisiMs: 1000, jarakWilayahM: 300, kecepatanKmJam: 20, koordinatIdentik: false, hammingTerdekat: 30 }).tingkat).toBe("merah");
  });
});

describe("labelFotoTanpaSinyal", () => {
  const diambil = "2026-10-23T06:20:00.000Z"; // 13.20 WIB
  it("foto tanpa sinyal: dipotret dan terkirim pada hari yang sama", () => {
    expect(labelFotoTanpaSinyal(["waktu_offline"], diambil, "2026-10-23T10:05:00.000Z")).toBe("Dipotret 13.20 tanpa sinyal, terkirim 17.05 WIB");
  });
  it("terkirim hari berikutnya -> tanggal kirim ikut disebut (WIB, termasuk lewat tengah malam)", () => {
    expect(labelFotoTanpaSinyal(["waktu_offline", "jauh_dari_wilayah"], diambil, "2026-10-24T01:10:00.000Z")).toBe("Dipotret 13.20 tanpa sinyal, terkirim 24 Okt 08.10 WIB");
    expect(labelFotoTanpaSinyal(["waktu_offline"], "2026-10-23T16:50:00.000Z", "2026-10-23T17:10:00.000Z")).toBe("Dipotret 23.50 tanpa sinyal, terkirim 24 Okt 00.10 WIB");
  });
  it("tanpa waktu kirim -> hanya dipotret; bukan foto tanpa sinyal atau data rusak -> null", () => {
    expect(labelFotoTanpaSinyal(["waktu_offline"], diambil, null)).toBe("Dipotret 13.20 tanpa sinyal");
    expect(labelFotoTanpaSinyal(["jauh_dari_wilayah"], diambil, diambil)).toBeNull();
    expect(labelFotoTanpaSinyal([], diambil, diambil)).toBeNull();
    expect(labelFotoTanpaSinyal(undefined, diambil, diambil)).toBeNull();
    expect(labelFotoTanpaSinyal(["waktu_offline"], "bukan-tanggal", diambil)).toBeNull();
  });
});

describe("jendelaBagiFoto (berbagi foto sampai H+1)", () => {
  it("batas 1 hari: H dan H+1 boleh, H+2 tidak", () => {
    expect(BATAS_HARI_BAGI).toBe(1);
    expect(jendelaBagiFoto("2026-10-23", "2026-10-23")).toBe(true);
    expect(jendelaBagiFoto("2026-10-23", "2026-10-24")).toBe(true);
    expect(jendelaBagiFoto("2026-10-23", "2026-10-25")).toBe(false);
  });
  it("lintas bulan dan tanggal tidak wajar", () => {
    expect(jendelaBagiFoto("2026-09-30", "2026-10-01")).toBe(true);
    expect(jendelaBagiFoto("2026-09-29", "2026-10-01")).toBe(false);
    expect(jendelaBagiFoto("2026-10-24", "2026-10-23")).toBe(false);
    expect(jendelaBagiFoto("bukan-tanggal", "2026-10-23")).toBe(false);
  });
});

describe("dalamToleransiKirim", () => {
  it("batas bawaan 2 hari", () => {
    expect(TOLERANSI_KIRIM_HARI).toBe(2);
    expect(dalamToleransiKirim("2026-10-23", "2026-10-23")).toBe(true);
    expect(dalamToleransiKirim("2026-10-22", "2026-10-23")).toBe(true);
    expect(dalamToleransiKirim("2026-10-21", "2026-10-23")).toBe(true);
    expect(dalamToleransiKirim("2026-10-20", "2026-10-23")).toBe(false);
  });
  it("tanggal masa depan atau tidak valid ditolak; lintas bulan benar", () => {
    expect(dalamToleransiKirim("2026-10-24", "2026-10-23")).toBe(false);
    expect(dalamToleransiKirim("bukan-tanggal", "2026-10-23")).toBe(false);
    expect(dalamToleransiKirim("2026-09-30", "2026-10-01")).toBe(true);
    expect(dalamToleransiKirim("2026-09-29", "2026-10-01")).toBe(true);
    expect(dalamToleransiKirim("2026-09-28", "2026-10-01")).toBe(false);
  });
  it("hari = 0 berarti hanya hari yang sama", () => {
    expect(dalamToleransiKirim("2026-10-22", "2026-10-23", 0)).toBe(false);
    expect(dalamToleransiKirim("2026-10-23", "2026-10-23", 0)).toBe(true);
  });
});

describe("nilaiKepercayaan", () => {
  it("semua wajar = hijau", () => expect(nilaiKepercayaan(dasar())).toEqual({ tingkat: "hijau", alasan: [] }));
  it("akurasi 50 m dan 300 m = hijau (tanpa penanda akurasi)", () => {
    for (const a of [50, 100, 300]) {
      const h = nilaiKepercayaan(dasar({ akurasiM: a }));
      expect(h.tingkat).toBe("hijau");
      expect(h.alasan).toEqual([]);
    }
  });
  it("akurasi 301 m = kuning akurasi_kasar", () => {
    const h = nilaiKepercayaan(dasar({ akurasiM: 301 }));
    expect(h.tingkat).toBe("kuning");
    expect(h.alasan).toEqual(["akurasi_kasar"]);
  });
  // (21 Okt 2026) dispensasi akurasi: > 300 m diterima tetapi ditandai kuning "akurasi_kasar" (diperiksa PML/admin), bukan merah/ditolak
  it("akurasi 1745 m = kuning dengan alasan akurasi_kasar", () => {
    const h = nilaiKepercayaan(dasar({ akurasiM: 1745 }));
    expect(h.tingkat).toBe("kuning");
    expect(h.alasan).toContain("akurasi_kasar");
    expect(h.alasan).not.toContain("akurasi_sedang");
  });
  it("jam HP beda 10 menit = kuning; beda 3 jam = merah", () => {
    const k = (detik: number) => nilaiKepercayaan(dasar({ waktu: { ...waktuBaik(), selisihHpDetik: detik } }));
    expect(k(600).tingkat).toBe("kuning");
    expect(k(3 * 3600).tingkat).toBe("merah");
    expect(k(-3 * 3600).alasan).toContain("jam_hp_beda_besar");
  });
  it("jauh dari wilayah 12 km = kuning (bukan merah sejak 23 Okt); 6 km = kuning; 3,3 km = hijau (batas kuning 5 km sejak 20 Okt)", () => {
    const jauh = nilaiKepercayaan(dasar({ jarakWilayahM: 12_000 }));
    expect(jauh.tingkat).toBe("kuning");
    expect(jauh.alasan).toEqual(["jauh_dari_wilayah"]);
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 99_999 })).tingkat).toBe("kuning");
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 6000 })).alasan).toEqual(["luar_wilayah_dekat"]);
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 6000 })).tingkat).toBe("kuning");
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: 3300 })).tingkat).toBe("hijau");
  });
  it("kecepatan 300 km/jam = merah", () => expect(nilaiKepercayaan(dasar({ kecepatanKmJam: 300 })).alasan).toContain("kecepatan_tak_wajar"));
  it("koordinat identik & mirip = kuning", () => {
    expect(nilaiKepercayaan(dasar({ koordinatIdentik: true })).tingkat).toBe("kuning");
    expect(nilaiKepercayaan(dasar({ hammingTerdekat: AMBANG_MIRIP_BIT })).alasan).toContain("mirip_foto_lain");
    expect(nilaiKepercayaan(dasar({ hammingTerdekat: AMBANG_MIRIP_BIT + 1 })).tingkat).toBe("hijau");
  });
  it("merah menang atas kuning, alasan merah lebih dulu", () => {
    const h = nilaiKepercayaan(dasar({ akurasiM: 60, kecepatanKmJam: 300, jarakWilayahM: 20_000 }));
    expect(h.tingkat).toBe("merah");
    expect(h.alasan[0]).toBe("kecepatan_tak_wajar");
    expect(h.alasan).toContain("jauh_dari_wilayah");
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

describe("jarakEfektifM (titik terdekat dari KK atau rumah petugas)", () => {
  it("memakai yang terdekat dari KK dan rumah", () => {
    expect(jarakEfektifM(3300, 500)).toBe(500);
    expect(jarakEfektifM(800, 6400)).toBe(800);
  });
  it("wilayah tidak dikenal = tidak dinilai; rumah tidak diketahui = hanya KK", () => {
    expect(jarakEfektifM(null, 100)).toBeNull();
    expect(jarakEfektifM(3300, null)).toBe(3300);
  });
  it("tidak ada KK dalam 11 km (99999) tetapi di dekat rumah = wajar", () => {
    expect(jarakEfektifM(99999, 900)).toBe(900);
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: jarakEfektifM(99999, 900) })).tingkat).toBe("hijau");
  });
  it("jauh dari KK dan dari rumah tetap ditandai", () => {
    expect(nilaiKepercayaan(dasar({ jarakWilayahM: jarakEfektifM(7000, 8000) })).alasan).toContain("luar_wilayah_dekat");
    // (23 Okt 2026) > 10 km kini kuning (bukan merah) -- selaras dengan tes jarak wilayah di atas
    const jauh = nilaiKepercayaan(dasar({ jarakWilayahM: jarakEfektifM(12_000, 15_000) }));
    expect(jauh.tingkat).toBe("kuning");
    expect(jauh.alasan).toContain("jauh_dari_wilayah");
  });
});

describe("status pemeriksaan yang dilihat petugas", () => {
  it("foto merah yang sudah diperiksa = Sudah diperiksa, tidak lagi menunggu", () => {
    const t = statusPemeriksaan("merah", "diperiksa");
    expect(t.label).toBe("Sudah diperiksa");
    expect(t.perhatian).toBe(false);
  });
  it("foto kuning yang sudah diperiksa juga Sudah diperiksa", () => expect(statusPemeriksaan("kuning", "diperiksa").nada).toBe("biru"));
  it("belum diperiksa: merah ditahan, kuning menunggu, hijau wajar", () => {
    expect(statusPemeriksaan("merah", "belum")).toMatchObject({ label: "Ditahan, menunggu diperiksa", perhatian: true });
    expect(statusPemeriksaan("kuning", "belum")).toMatchObject({ label: "Menunggu diperiksa", perhatian: true });
    expect(statusPemeriksaan("hijau", "belum")).toMatchObject({ label: "Wajar", perhatian: false });
  });
  it("dipertanyakan tetap perlu perhatian; nilai asing/kosong dianggap belum", () => {
    expect(statusPemeriksaan("merah", "dipertanyakan").perhatian).toBe(true);
    expect(statusPemeriksaan("merah", null).label).toBe("Ditahan, menunggu diperiksa");
    expect(statusPemeriksaan("hijau", undefined).label).toBe("Wajar");
  });
});

describe("teks lokasi cap (SLS, Nagari, Kecamatan)", () => {
  it("menyusun SLS + Sub, Nagari, Kec. dengan huruf rapi", () => {
    expect(teksLokasiWilayah({ sls: "JORONG SAWAH TALUAK", sub_sls: "01", nagari: "KOTO BARU", kecamatan: "X KOTO DIATAS" })).toBe(
      "SLS Jorong Sawah Taluak Sub 01, Nagari Koto Baru, Kec. X Koto Diatas",
    );
  });
  it("melewati bagian yang kosong; semua kosong = null", () => {
    expect(teksLokasiWilayah({ sls: "RT 02", sub_sls: "", nagari: "Koto Baru", kecamatan: null })).toBe("SLS Rt 02, Nagari Koto Baru");
    expect(teksLokasiWilayah({ sls: null, sub_sls: "01", nagari: "Koto Baru", kecamatan: "Lembang" })).toBe("Nagari Koto Baru, Kec. Lembang");
    expect(teksLokasiWilayah({ sls: " ", nagari: "", kecamatan: undefined })).toBeNull();
  });
  it("dua baris di cap: SLS di atas, Nagari dan kecamatan di bawah", () => {
    expect(lokasiDuaBaris("SLS Rt 02 Sub 01, Nagari Koto Baru, Kec. Lembang")).toBe("SLS Rt 02 Sub 01\nNagari Koto Baru, Kec. Lembang");
  });
  it("tanpa SLS atau tanpa Nagari tidak dipecah", () => {
    expect(lokasiDuaBaris("Nagari Koto Baru, Kec. Lembang")).toBe("Nagari Koto Baru, Kec. Lembang");
    expect(lokasiDuaBaris("SLS Rt 02")).toBe("SLS Rt 02");
  });
});

describe("foto laporan di luar hari kerja (menempati nomor 3)", () => {
  it("selalu nomor 3 (Saat mendata)", () => {
    expect(SLOT_FOTO_LAPORAN).toBe(3);
  });
  it("hanya kegiatan dengan minimal 3 foto per hari yang menerima foto laporan", () => {
    expect(bolehFotoLaporan(5)).toBe(true);
    expect(bolehFotoLaporan(3)).toBe(true);
    expect(bolehFotoLaporan(2)).toBe(false);
    expect(bolehFotoLaporan(0)).toBe(false);
    expect(bolehFotoLaporan(Number.NaN)).toBe(false);
  });
});
