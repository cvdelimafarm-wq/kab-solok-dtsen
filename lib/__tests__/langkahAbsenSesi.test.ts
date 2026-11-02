import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/sigap/admin/api", () => ({ fetchJson: vi.fn(), urlPelatihan: (u: string) => u }));
vi.mock("../../app/sigap/admin/api", () => ({ fetchJson: vi.fn(), urlPelatihan: (u: string) => u }));

import { bacaLangkahDariAlamat, hitungLangkahPelatihan, type MasukanLangkah } from "../alurPelatihan";
import { ringkasAbsenSaya, type DataAbsenSaya } from "../../app/sigap/pelatihan/absenSaya";

const dasar = (absenSesi?: MasukanLangkah["absenSesi"]): MasukanLangkah => ({
  langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 0, slot: [] },
  tes: [],
  presensi: null,
  kuis: null,
  absenSesi,
  fotoTranslok: false,
  mulaiMs: Date.parse("2026-11-09T01:00:00Z"),
  now: Date.parse("2026-11-09T04:00:00Z"),
});
const sesi = (m: MasukanLangkah) => hitungLangkahPelatihan(m).find((l) => l.kode === "sesi");

describe("langkah 'Absen sesi' (tampilan lima tab)", () => {
  it("tanpa data absen sesi (null / tidak diisi): langkah tidak ada", () => {
    expect(sesi(dasar())).toBeUndefined();
    expect(sesi(dasar(null))).toBeUndefined();
  });
  it("belum ada sesi dibuka: langkah ada, belum selesai dan belum 'bisa sekarang'", () => {
    const l = sesi(dasar({ total: 0, hadir: 0, terbukaBelum: 0 }))!;
    expect(l.selesai).toBe(false);
    expect(l.bisaSekarang).toBe(false);
    expect(l.tambahan).toBe(true);
    expect(l.href).toBe("/sigap/pelatihan/hari-ini?langkah=sesi");
  });
  it("sesi sedang dibuka dan belum diisi: bisa sekarang", () => {
    const l = sesi(dasar({ total: 2, hadir: 1, terbukaBelum: 1 }))!;
    expect(l.bisaSekarang).toBe(true);
    expect(l.selesai).toBe(false);
  });
  it("semua sesi hari ini sudah hadir dan tidak ada yang terbuka: selesai", () => {
    const l = sesi(dasar({ total: 2, hadir: 2, terbukaBelum: 0 }))!;
    expect(l.selesai).toBe(true);
  });
  it("kode 'sesi' dikenali penunjuk alamat", () => {
    expect(bacaLangkahDariAlamat("sesi")).toBe("sesi");
    expect(bacaLangkahDariAlamat("tidak-ada")).toBeNull();
  });
});

const data = (p: Partial<DataAbsenSaya>): DataAbsenSaya => ({
  kedatangan: { berlaku: true, sudah: true, at: null, manual: false, terlambat: false },
  sesi_terbuka: [],
  sekarang: 0,
  ...p,
});
const now = Date.parse("2026-11-09T04:00:00Z");
const menit = (n: number) => new Date(now + n * 60_000).toISOString();

describe("ringkasAbsenSaya", () => {
  it("tanpa data: null", () => {
    expect(ringkasAbsenSaya(null, now)).toBeNull();
  });
  it("memakai sesi_hari: total semua sesi, hadir, dan sesi terbuka yang belum diisi", () => {
    const d = data({
      sesi_hari: [
        { id: 1, no: 1, label: "Sesi 1", jam: null, keadaan: "habis", tutup_at: menit(-60), sudah_hadir: true },
        { id: 2, no: 2, label: "Sesi 2", jam: null, keadaan: "dibuka", tutup_at: menit(10), sudah_hadir: false },
        { id: 3, no: 3, label: "Sesi 3", jam: null, keadaan: "ditutup", tutup_at: menit(-5), sudah_hadir: false },
      ],
    });
    expect(ringkasAbsenSaya(d, now)).toEqual({ total: 3, hadir: 1, terbukaBelum: 1 });
  });
  it("sesi yang waktunya sudah lewat tidak dihitung terbuka walau server belum menandainya", () => {
    const d = data({ sesi_hari: [{ id: 2, no: 2, label: "Sesi 2", jam: null, keadaan: "dibuka", tutup_at: menit(-1), sudah_hadir: false }] });
    expect(ringkasAbsenSaya(d, now)).toEqual({ total: 1, hadir: 0, terbukaBelum: 0 });
  });
  it("server lama tanpa sesi_hari: memakai sesi_terbuka", () => {
    const d = data({
      sesi_terbuka: [{ id: 9, no: 1, label: "S1", metode: [], tutup_at: menit(5), sisa_detik: 300, radius_m: 0, sudah_hadir: false, di_luar_radar: false }],
    });
    expect(ringkasAbsenSaya(d, now)).toEqual({ total: 1, hadir: 0, terbukaBelum: 1 });
  });
});
