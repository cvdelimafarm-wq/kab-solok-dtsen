import { describe, expect, it } from "vitest";
import { irisanMs, pilihSesiRapat, terlambatPresensi, type SesiJadwal } from "../sigapRapatSesi";

const sesi = (no: number, buka: string, tutup: string, tanggal = "2026-11-02"): SesiJadwal => ({
  kunci: `${tanggal}#${no}`, tanggal, no, nama: `Sesi ${no}`, buka_at: new Date(`${tanggal}T${buka}:00+07:00`).toISOString(), tutup_at: new Date(`${tanggal}T${tutup}:00+07:00`).toISOString(),
});
const wib = (jam: string, tanggal = "2026-11-02") => new Date(`${tanggal}T${jam}:00+07:00`).toISOString();

describe("irisanMs", () => {
  it("irisan, tanpa irisan, dan nilai tak sah", () => {
    expect(irisanMs({ mulai: 0, selesai: 10 }, { mulai: 5, selesai: 20 })).toBe(5);
    expect(irisanMs({ mulai: 0, selesai: 10 }, { mulai: 10, selesai: 20 })).toBe(0);
    expect(irisanMs({ mulai: Number.NaN, selesai: 10 }, { mulai: 5, selesai: 20 })).toBe(0);
  });
});

describe("pilihSesiRapat", () => {
  const jadwal = [sesi(1, "08:00", "12:00"), sesi(2, "13:00", "17:00")];
  it("memilih sesi yang jendelanya beririsan", () => {
    expect(pilihSesiRapat(jadwal, wib("09:00"), wib("10:30"))?.no).toBe(1);
    expect(pilihSesiRapat(jadwal, wib("13:30"), wib("15:00"))?.no).toBe(2);
  });
  it("irisan terpanjang menang bila rapat menyentuh dua sesi", () => {
    expect(pilihSesiRapat(jadwal, wib("11:30"), wib("16:00"))?.no).toBe(2); // 30 mnt vs 3 jam
    expect(pilihSesiRapat(jadwal, wib("07:00"), wib("09:00"))?.no).toBe(1);
  });
  it("seri -> sesi yang lebih awal", () => {
    expect(pilihSesiRapat([sesi(2, "10:00", "11:00"), sesi(1, "08:00", "09:00")], wib("08:30"), wib("10:30"))?.no).toBe(1);
  });
  it("tanpa irisan atau tanggal lain -> null", () => {
    expect(pilihSesiRapat(jadwal, wib("18:00"), wib("19:00"))).toBeNull();
    expect(pilihSesiRapat(jadwal, wib("09:00", "2026-11-03"), wib("10:00", "2026-11-03"))).toBeNull();
    expect(pilihSesiRapat([], wib("09:00"), wib("10:00"))).toBeNull();
  });
  it("sesi yang sudah tercatat dilewati", () => {
    expect(pilihSesiRapat(jadwal, wib("11:30"), wib("16:00"), new Set(["2026-11-02#2"]))?.no).toBe(1);
    expect(pilihSesiRapat(jadwal, wib("09:00"), wib("10:00"), new Set(["2026-11-02#1"]))).toBeNull();
  });
  it("hari kedua dipetakan ke sesi hari kedua", () => {
    const dua = [...jadwal, sesi(1, "08:00", "12:00", "2026-11-03")];
    expect(pilihSesiRapat(dua, wib("09:00", "2026-11-03"), wib("10:00", "2026-11-03"))?.kunci).toBe("2026-11-03#1");
  });
});

describe("terlambatPresensi", () => {
  it("terlambat bila sesudah tutup", () => {
    const s = sesi(1, "08:00", "12:00");
    expect(terlambatPresensi(Date.parse(wib("11:59")), s)).toBe(false);
    expect(terlambatPresensi(Date.parse(wib("12:01")), s)).toBe(true);
  });
});
