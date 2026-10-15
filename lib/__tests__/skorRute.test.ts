import { describe, expect, it } from "vitest";
import { FAKTOR_JALAN, jarakPerkiraanKm, kunciRute, pusatTitik, ruteHari, tanggalWibDari, urutanSubPerHari } from "../skorRute";

describe("tanggalWibDari", () => {
  it("menggeser ke WIB (UTC+7)", () => {
    expect(tanggalWibDari("2026-10-15T17:30:00Z")).toBe("2026-10-16");
    expect(tanggalWibDari("2026-10-15T16:59:00Z")).toBe("2026-10-15");
  });
});

describe("urutanSubPerHari", () => {
  it("urut menurut waktu penandaan paling awal, tiap Sub SLS sekali", () => {
    const m = urutanSubPerHari([
      { tanggal: "2026-10-15", idsubsls: "B", waktu: 200 },
      { tanggal: "2026-10-15", idsubsls: "A", waktu: 100 },
      { tanggal: "2026-10-15", idsubsls: "B", waktu: 50 },
      { tanggal: "2026-10-16", idsubsls: "C", waktu: 10 },
    ]);
    expect(m.get("2026-10-15")).toEqual(["B", "A"]);
    expect(m.get("2026-10-16")).toEqual(["C"]);
  });

  it("baris tidak sah dilewati", () => {
    const m = urutanSubPerHari([{ tanggal: "2026-10-15", idsubsls: "", waktu: 1 }, { tanggal: "2026-10-15", idsubsls: "A", waktu: Number.NaN }]);
    expect(m.size).toBe(0);
  });
});

describe("pusatTitik dan ruteHari", () => {
  it("rata-rata koordinat", () => {
    expect(pusatTitik([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 });
    expect(pusatTitik([])).toBeNull();
  });

  it("rute rumah - A - B - rumah; null bila tanpa rumah atau tanpa pusat", () => {
    const rumah = { lat: -0.8, lng: 100.6 };
    const a = { lat: -0.81, lng: 100.61 };
    const b = { lat: -0.82, lng: 100.62 };
    expect(ruteHari(rumah, [a, null, b])).toEqual([rumah, a, b, rumah]);
    expect(ruteHari(null, [a])).toBeNull();
    expect(ruteHari(rumah, [null])).toBeNull();
  });
});

describe("jarakPerkiraanKm", () => {
  it("pergi-pulang ke satu titik = 2 x garis lurus x faktor", () => {
    const rumah = { lat: 0, lng: 0 };
    const a = { lat: 0, lng: 0.1 }; // ±11,12 km
    const km = jarakPerkiraanKm([rumah, a, rumah]);
    expect(km).toBeGreaterThan(28.5);
    expect(km).toBeLessThan(29.5);
    expect(FAKTOR_JALAN).toBe(1.3);
  });

  it("rute kosong = 0", () => {
    expect(jarakPerkiraanKm([])).toBe(0);
  });
});

describe("kunciRute", () => {
  it("koordinat sangat dekat menghasilkan kunci sama", () => {
    expect(kunciRute([{ lat: -0.8000001, lng: 100.6 }])).toBe(kunciRute([{ lat: -0.8, lng: 100.6 }]));
  });
});
