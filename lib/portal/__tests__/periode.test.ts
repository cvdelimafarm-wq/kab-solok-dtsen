// (7 Okt 2026) Uji status periode kegiatan (tgl selesai + masa tenggang) -- portal satu login.
import { describe, expect, it } from "vitest";
import { statusPeriode, tanggalDitutup } from "../periode";

const k = { tanggal_mulai: "2026-10-12", tanggal_selesai: "2026-11-12", hari_tenggang: 7, dibuka_sampai: null };

describe("statusPeriode", () => {
  it("tanggal ditutup = selesai + 7", () => expect(tanggalDitutup(k)).toBe("2026-11-19"));
  it("sebelum mulai = akan_datang", () => expect(statusPeriode(k, "2026-10-06").status).toBe("akan_datang"));
  it("dalam periode = aktif", () => expect(statusPeriode(k, "2026-11-12").status).toBe("aktif"));
  it("masa tenggang", () => {
    const s = statusPeriode(k, "2026-11-13");
    expect(s.status).toBe("tenggang");
    expect(s.sisa_hari).toBe(6);
  });
  it("hari terakhir tenggang masih tenggang", () => expect(statusPeriode(k, "2026-11-19").status).toBe("tenggang"));
  it("lewat tenggang = arsip", () => expect(statusPeriode(k, "2026-11-20").status).toBe("arsip"));
  it("tenggang 0 hari", () => expect(statusPeriode({ ...k, hari_tenggang: 0 }, "2026-11-13").status).toBe("arsip"));
  it("tenggang kosong pakai bawaan 7", () => expect(tanggalDitutup({ ...k, hari_tenggang: null })).toBe("2026-11-19"));
  it("buka ulang mengaktifkan arsip", () => {
    const s = statusPeriode({ ...k, dibuka_sampai: "2026-12-01" }, "2026-11-25");
    expect(s.status).toBe("aktif");
    expect(s.dibuka_ulang).toBe(true);
  });
  it("buka ulang yg sudah lewat tidak berlaku", () => expect(statusPeriode({ ...k, dibuka_sampai: "2026-11-21" }, "2026-11-25").status).toBe("arsip"));
  it("tanpa tanggal selesai = belum_diatur", () => expect(statusPeriode({ tanggal_mulai: null, tanggal_selesai: null }, "2026-10-06").status).toBe("belum_diatur"));
});
