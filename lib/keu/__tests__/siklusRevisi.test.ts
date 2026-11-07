import { describe, expect, it } from "vitest";
import {
  akhirTutupMs, bisaBukaLagi, kabarAksi, keadaanRo, labelTanggal, labelWaktu, perJadwal, periksaWaktuBebas, peringatanDekatTutup, pilihanTersedia, pintasanWaktu, tambahHari,
  tautKertas, teksSisaTunda, tglWib, yangWajib, type TanggapanSaya,
} from "../siklusRevisi";

const SABTU_MALAM = new Date("2026-11-07T22:00:00+07:00"); // Sabtu
const dasar = (o: Partial<TanggapanSaya> = {}): TanggapanSaya => ({
  jadwal_id: 2, judul: "Revisi POK Nov", jenis: "pok", tutup: "2026-11-12", ro_kode: "2906.BMA.006", status: "belum", tunda_kali: 0, sisa_tunda: 2, ingat_at: null,
  jatuh_tempo: false, oleh: null, oleh_nama: null, oleh_saya: null, alasan: null, ada_kurang: false, sudah_usulan: false, masih_buka: true, wajib: true, ...o,
});

describe("tanggal WIB", () => {
  it("tanggal WIB melewati tengah malam UTC", () => {
    expect(tglWib(new Date("2026-11-07T22:00:00+07:00"))).toBe("2026-11-07");
    expect(tglWib(new Date("2026-11-07T17:30:00Z"))).toBe("2026-11-08");
  });
  it("tambahHari lintas bulan dan tahun", () => {
    expect(tambahHari("2026-11-30", 1)).toBe("2026-12-01");
    expect(tambahHari("2026-12-31", 1)).toBe("2027-01-01");
    expect(tambahHari("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("label waktu dan tanggal", () => {
    expect(labelWaktu("2026-11-09T08:00:00+07:00")).toBe("Sen, 9 Nov 08.00 WIB");
    expect(labelTanggal("2026-11-12")).toBe("Kamis, 12 Nov 2026");
  });
  it("batas penutupan = awal hari sesudah tanggal tutup (WIB)", () => {
    expect(akhirTutupMs("2026-11-12")).toBe(new Date("2026-11-13T00:00:00+07:00").getTime());
  });
});

describe("pintasanWaktu", () => {
  it("Sabtu malam, tutup Kamis: besok pagi dan Senin siang; Jumat sudah lewat penutupan", () => {
    const p = pintasanWaktu(SABTU_MALAM, "2026-11-12");
    expect(p.map((x) => x.kunci)).toEqual(["besok", "kerja"]);
    expect(p[0].iso).toBe("2026-11-08T08:00:00+07:00");
    expect(p[1].iso).toBe("2026-11-09T14:00:00+07:00");
  });
  it("tutup jauh: ketiganya, Jumat 13 Nov", () => {
    const p = pintasanWaktu(SABTU_MALAM, "2026-11-20");
    expect(p.map((x) => x.kunci)).toEqual(["besok", "kerja", "jumat"]);
    expect(p[2].iso).toBe("2026-11-13T14:00:00+07:00");
  });
  it("Kamis: hari kerja berikutnya dan Jumat jatuh pada saat sama, dipakai sekali", () => {
    const p = pintasanWaktu(new Date("2026-11-12T10:00:00+07:00"), "2026-11-20");
    expect(p.map((x) => x.kunci)).toEqual(["besok", "kerja"]);
  });
  it("hari terakhir siklus: tidak ada pintasan", () => {
    expect(pintasanWaktu(new Date("2026-11-12T20:00:00+07:00"), "2026-11-12")).toEqual([]);
  });
  it("pagi dini hari: besok pagi masih sah", () => {
    const p = pintasanWaktu(new Date("2026-11-08T07:00:00+07:00"), "2026-11-12");
    expect(p[0].iso).toBe("2026-11-09T08:00:00+07:00");
  });
});

describe("periksaWaktuBebas", () => {
  const tutup = "2026-11-12";
  it("sah dan tanpa peringatan jauh dari penutupan", () => {
    const r = periksaWaktuBebas("2026-11-09", "09:30", SABTU_MALAM, tutup);
    expect(r).toEqual({ ok: true, iso: "2026-11-09T09:30:00+07:00", peringatan: null });
  });
  it("kurang dari 24 jam sebelum penutupan memberi peringatan, tetap sah", () => {
    const r = periksaWaktuBebas("2026-11-12", "10:00", SABTU_MALAM, tutup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peringatan).toMatch(/kurang dari 24 jam/);
  });
  it("menolak waktu lampau, terlalu dekat, setelah tutup, dan isian kosong", () => {
    expect(periksaWaktuBebas("2026-11-07", "09:00", SABTU_MALAM, tutup).ok).toBe(false);
    expect(periksaWaktuBebas("2026-11-07", "22:03", SABTU_MALAM, tutup).ok).toBe(false);
    expect(periksaWaktuBebas("2026-11-07", "22:06", SABTU_MALAM, tutup).ok).toBe(true);
    const lewat = periksaWaktuBebas("2026-11-13", "00:00", SABTU_MALAM, tutup);
    expect(lewat.ok).toBe(false);
    if (!lewat.ok) expect(lewat.pesan).toMatch(/penutupan/);
    expect(periksaWaktuBebas("", "", SABTU_MALAM, tutup).ok).toBe(false);
    expect(periksaWaktuBebas("2026-11-09", "25:00", SABTU_MALAM, tutup).ok).toBe(false);
  });
  it("batas peringatan tepat 24 jam", () => {
    const akhir = akhirTutupMs("2026-11-12");
    expect(peringatanDekatTutup(akhir - 24 * 3_600_000, "2026-11-12")).toBeNull();
    expect(peringatanDekatTutup(akhir - 24 * 3_600_000 + 60_000, "2026-11-12")).not.toBeNull();
  });
});

describe("pilihanTersedia", () => {
  it("belum ditanggapi: ketiganya", () => expect(pilihanTersedia(dasar())).toEqual(["ajukan", "ingat", "tidak"]));
  it("tunda habis: hanya ajukan dan tidak", () => expect(pilihanTersedia(dasar({ status: "ingat", tunda_kali: 2, sisa_tunda: 0, oleh_saya: true }))).toEqual(["ajukan", "tidak"]));
  it("diingatkan satu kali: masih boleh tunda sekali lagi", () => expect(pilihanTersedia(dasar({ status: "ingat", tunda_kali: 1, sisa_tunda: 1, jatuh_tempo: true }))).toEqual(["ajukan", "ingat", "tidak"]));
  it("sudah ditanggapi rekan: tidak ada pilihan", () => {
    expect(pilihanTersedia(dasar({ status: "ajukan", oleh_saya: false, oleh_nama: "Wakil A" }))).toEqual([]);
    expect(pilihanTersedia(dasar({ status: "tidak", oleh_saya: false }))).toEqual([]);
  });
  it("sudah ada usulan atau siklus tertutup: tidak ada pilihan", () => {
    expect(pilihanTersedia(dasar({ sudah_usulan: true }))).toEqual([]);
    expect(pilihanTersedia(dasar({ masih_buka: false }))).toEqual([]);
  });
  it("buka lagi hanya untuk tidak mengusulkan selama siklus buka", () => {
    expect(bisaBukaLagi(dasar({ status: "tidak" }))).toBe(true);
    expect(bisaBukaLagi(dasar({ status: "tidak", masih_buka: false }))).toBe(false);
    expect(bisaBukaLagi(dasar({ status: "ingat" }))).toBe(false);
  });
});

describe("teks dan tautan", () => {
  it("keadaan RO", () => {
    expect(keadaanRo(dasar()).teks).toBe("Belum ditanggapi");
    expect(keadaanRo(dasar({ status: "ingat", jatuh_tempo: true })).warna).toBe("merah");
    expect(keadaanRo(dasar({ status: "ingat", ingat_at: "2026-11-09T08:00:00+07:00", jatuh_tempo: false })).teks).toBe("Diingatkan Sen, 9 Nov 08.00 WIB");
    expect(keadaanRo(dasar({ status: "ajukan", oleh_saya: false, oleh_nama: "Wakil A" })).teks).toBe("Diajukan oleh Wakil A");
    expect(keadaanRo(dasar({ status: "tidak", oleh_saya: true })).teks).toBe("Anda memilih tidak mengusulkan");
    expect(keadaanRo(dasar({ sudah_usulan: true })).warna).toBe("hijau");
  });
  it("tautan kertas kerja memakai KRO; kode tak dikenal ke daftar revisi", () => {
    expect(tautKertas({ jadwal_id: 2, ro_kode: "2906.BMA.006" })).toBe("/sigap/revisi/kertas?jadwal=2&kro=2906.BMA");
    expect(tautKertas({ jadwal_id: 2, ro_kode: "TIM-X" })).toBe("/sigap/revisi");
  });
  it("sisa tunda", () => {
    expect(teksSisaTunda({ sisa_tunda: 1 })).toBe("Dapat ditunda 1 kali lagi.");
    expect(teksSisaTunda({ sisa_tunda: 0 })).toMatch(/habis/);
  });
  it("kabar aksi", () => {
    expect(kabarAksi("tidak", "R", { ada_kurang: true })).toMatch(/belum terdanai/);
    expect(kabarAksi("ingat", "R", { ingat_at: "2026-11-09T08:00:00+07:00", peringatan: "Hati-hati." })).toMatch(/Sen, 9 Nov 08.00 WIB.*Hati-hati/);
    expect(kabarAksi("ajukan", "R", null)).toMatch(/kertas kerja/);
  });
  it("wajib dan pengelompokan", () => {
    const d = [dasar(), dasar({ ro_kode: "2906.BMA.007", wajib: false }), dasar({ jadwal_id: 3, judul: "Des", ro_kode: "2906.BMA.008" })];
    expect(yangWajib(d).map((x) => x.ro_kode)).toEqual(["2906.BMA.006", "2906.BMA.008"]);
    const g = perJadwal(d);
    expect(g.map((x) => [x.jadwal_id, x.baris.length])).toEqual([[2, 2], [3, 1]]);
  });
});
