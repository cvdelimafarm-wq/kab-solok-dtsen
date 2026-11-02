import { describe, expect, it } from "vitest";
import { buatKode, hariPertama, kedatanganBerlaku, keadaanSesi, kodeCocok, menitDariJam, menitWib, nilaiRadar, periksaMetode, rapikanSesi, rentangHari, ringkasRadar, sarankanSesi, sisaDetik, SESI_BAWAAN, tabPerPeran, teksSisa, tungguKode, tutupAtDari } from "@/lib/sigapAbsen";

describe("jam dan sesi disarankan", () => {
  it("menitDariJam", () => {
    expect(menitDariJam("08:00")).toBe(480);
    expect(menitDariJam("8:05")).toBe(485);
    expect(menitDariJam("24:00")).toBeNull();
    expect(menitDariJam("x")).toBeNull();
  });
  it("menitWib memakai zona WIB", () => {
    expect(menitWib(Date.parse("2026-11-09T03:00:00Z"))).toBe(600); // 10:00 WIB
  });
  it("menyarankan jam rencana terdekat; seri -> nomor kecil", () => {
    expect(sarankanSesi(SESI_BAWAAN, 9 * 60 + 40)).toBe(2); // 10:00 paling dekat
    expect(sarankanSesi(SESI_BAWAAN, 12 * 60)).toBe(3);
    expect(sarankanSesi(SESI_BAWAAN, 9 * 60)).toBe(1); // 08:00 (60) vs 10:00 (60) -> 1
    expect(sarankanSesi(SESI_BAWAAN, 23 * 60)).toBe(4);
  });
  it("mendahulukan sesi yang belum dimulai; bila semua sudah, terdekat dari seluruhnya", () => {
    expect(sarankanSesi(SESI_BAWAAN, 10 * 60, new Set([2]))).toBe(1); // 08:00 (120) vs 13:30 (210) -> 1
    expect(sarankanSesi(SESI_BAWAAN, 10 * 60, new Set([1, 2, 3, 4]))).toBe(2);
  });
  it("tanpa jam sah -> null", () => {
    expect(sarankanSesi([{ no: 1, label: "A", jam: "" }], 600)).toBeNull();
  });
});

describe("jendela 30 menit", () => {
  const buka = Date.parse("2026-11-09T01:00:00Z");
  it("dibuka sampai tutup_at, lalu habis sendiri", () => {
    const tutup = tutupAtDari(buka, 30);
    expect(tutup - buka).toBe(30 * 60_000);
    const s = { status: "dibuka", tutup_at: new Date(tutup).toISOString() };
    expect(keadaanSesi(s, buka + 29 * 60_000)).toBe("dibuka");
    expect(keadaanSesi(s, buka + 30 * 60_000)).toBe("habis");
  });
  it("ditutup pengelola lebih awal", () => {
    expect(keadaanSesi({ status: "ditutup", tutup_at: buka + 99999999 }, buka)).toBe("ditutup");
  });
  it("hitung mundur", () => {
    const tutup = tutupAtDari(buka, 30);
    expect(sisaDetik(tutup, buka + 29 * 60_000 + 30_000)).toBe(30);
    expect(sisaDetik(tutup, tutup + 5000)).toBe(0);
    expect(teksSisa(90)).toBe("01:30");
    expect(teksSisa(5)).toBe("00:05");
  });
});

describe("hari pertama", () => {
  it("kedatangan hanya hari pertama", () => {
    const hari = ["2026-11-10", "2026-11-09", "2026-11-11"];
    expect(hariPertama(hari)).toBe("2026-11-09");
    expect(kedatanganBerlaku(hari, "2026-11-09")).toBe(true);
    expect(kedatanganBerlaku(hari, "2026-11-10")).toBe(false);
    expect(hariPertama([])).toBeNull();
  });
  it("rentangHari", () => {
    expect(rentangHari("2026-11-09", "2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(rentangHari("2026-11-09", null)).toEqual(["2026-11-09"]);
    expect(rentangHari("2026-11-09", "2026-11-01")).toEqual(["2026-11-09"]);
    expect(rentangHari(null, null)).toEqual([]);
  });
});

describe("pengaturan, metode, kode", () => {
  it("rapikanSesi memulihkan data kotor dan jatuh ke bawaan bila kosong", () => {
    expect(rapikanSesi(null)).toHaveLength(4);
    expect(rapikanSesi([])).toHaveLength(4);
    expect(rapikanSesi([{ no: 2, label: " Pagi ", jam: "9:30" }, { no: 2, label: "dup" }, { no: 99 }, { no: 1 }])).toEqual([{ no: 1, label: "Sesi 1", jam: "" }, { no: 2, label: "Pagi", jam: "09:30" }]);
  });
  it("periksaMetode", () => {
    expect(periksaMetode(["kode", "radar", "kode"])).toEqual({ ok: true, metode: ["kode", "radar"] });
    expect(periksaMetode([]).ok).toBe(false);
    expect(periksaMetode(["x"]).ok).toBe(false);
    expect(periksaMetode("kode").ok).toBe(false);
  });
  it("buatKode 6 digit; kodeCocok mengabaikan spasi", () => {
    let i = 0;
    const urut = [0.0, 0.1, 0.25, 0.5, 0.99, 0.999];
    expect(buatKode(() => urut[i++])).toBe("012599");
    expect(kodeCocok("012 599", "012599")).toBe(true);
    expect(kodeCocok("012598", "012599")).toBe(false);
    expect(kodeCocok("1", null)).toBe(false);
    expect(kodeCocok(123, "123")).toBe(false);
  });
  it("tungguKode: 5 salah lalu tunggu 1 menit", () => {
    const t = 1_000_000;
    expect(tungguKode(4, t, t + 1)).toBe(0);
    expect(tungguKode(5, t, t + 10_000)).toBe(50);
    expect(tungguKode(7, t, t + 60_000)).toBe(0);
    expect(tungguKode(5, null, t)).toBe(0);
  });
});

describe("radar", () => {
  const now = 2_000_000;
  const pusat = { lat: -0.7893, lng: 100.65, akurasi: 5, at: now - 5000 };
  const dekat = { lat: -0.7893 + 0.0001, lng: 100.65, akurasi: 10 }; // ~11 m
  const jauh = { lat: -0.7893 + 0.001, lng: 100.65, akurasi: 10 }; // ~111 m
  it("masuk / luar menurut radius", () => {
    expect(nilaiRadar(pusat, dekat, 25, now).kode).toBe("masuk");
    const l = nilaiRadar(pusat, jauh, 25, now);
    expect(l.kode).toBe("luar");
    expect(l.jarak_m).toBeGreaterThan(100);
    expect(nilaiRadar(pusat, jauh, 150, now).kode).toBe("masuk");
  });
  it("akurasi lemah, posisi pengelola basi atau tidak ada, posisi tak sah", () => {
    expect(nilaiRadar(pusat, { ...dekat, akurasi: 80 }, 25, now).kode).toBe("akurasi");
    expect(nilaiRadar({ ...pusat, at: now - 60_000 }, dekat, 25, now).kode).toBe("basi");
    expect(nilaiRadar(null, dekat, 25, now).kode).toBe("tanpa_pusat");
    expect(nilaiRadar(pusat, { lat: "x" }, 25, now).kode).toBe("akurasi");
  });
  it("ringkasRadar: hanya yang di luar radar tampil dengan nama, terdekat dulu", () => {
    const r = ringkasRadar([
      { akun_id: 1, nama: "A", status: "hadir", jarak_m: 5 },
      { akun_id: 2, nama: "B", status: "luar", jarak_m: 80 },
      { akun_id: 3, nama: "C", status: "luar", jarak_m: 40 },
      { akun_id: 4, nama: "D", status: "belum", jarak_m: null },
    ]);
    expect(r.masuk).toBe(1);
    expect(r.belum).toBe(1);
    expect(r.luar.map((x) => x.nama)).toEqual(["C", "B"]);
  });
});

describe("tab per peran", () => {
  it("pengelola: Absen peserta menggantikan Pelatihan; ganda -> keduanya", () => {
    expect(tabPerPeran("peserta", true)).toEqual({ pelatihan: true, absen: false });
    expect(tabPerPeran("panitia", false)).toEqual({ pelatihan: false, absen: true });
    expect(tabPerPeran("instruktur", true)).toEqual({ pelatihan: true, absen: true });
  });
});
