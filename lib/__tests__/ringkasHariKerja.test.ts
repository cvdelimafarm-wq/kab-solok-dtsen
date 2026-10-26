import { describe, expect, it } from "vitest";
import { kalimatHariKerja, ringkasDariSel, ringkasHariKerja } from "../ringkasHariKerja";

const hari = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `2026-10-${String(a + i).padStart(2, "0")}`);

describe("ringkasHariKerja", () => {
  it("kasus Minda: rencana 11 Okt - 10 Nov (31 hari), hari ini 26 Okt, 14 lengkap sampai 25 Okt", () => {
    const rencana = [...hari(11, 31), ...Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`)];
    expect(rencana).toHaveLength(31);
    const r = ringkasHariKerja(rencana, hari(11, 24), "2026-10-26");
    expect(r).toEqual({ direncanakan: 31, sudahLewat: 15, lengkap: 14, terlewat: 1, akanDatang: 15, hariIni: "berjalan" });
    expect(r.lengkap + r.terlewat).toBe(r.sudahLewat);
  });
  it("hari ini lengkap tidak ikut dihitung sebagai lengkap-lewat, tetapi ditandai", () => {
    const r = ringkasHariKerja(hari(11, 30), [...hari(11, 25), "2026-10-26"], "2026-10-26");
    expect(r.lengkap).toBe(15);
    expect(r.hariIni).toBe("lengkap");
    expect(r.akanDatang).toBe(4);
  });
  it("hari ini bukan hari kerja", () => {
    expect(ringkasHariKerja(["2026-10-20", "2026-10-28"], ["2026-10-20"], "2026-10-26")).toEqual({ direncanakan: 2, sudahLewat: 1, lengkap: 1, terlewat: 0, akanDatang: 1, hariIni: "bukan" });
  });
  it("tanggal ganda diabaikan; lengkap di luar rencana tidak dihitung", () => {
    const r = ringkasHariKerja(["2026-10-20", "2026-10-20", "2026-10-21"], ["2026-10-19", "2026-10-20"], "2026-10-26");
    expect(r.direncanakan).toBe(2);
    expect(r.lengkap).toBe(1);
    expect(r.terlewat).toBe(1);
  });
  it("tanpa rencana", () => {
    expect(ringkasHariKerja([], [], "2026-10-26")).toEqual({ direncanakan: 0, sudahLewat: 0, lengkap: 0, terlewat: 0, akanDatang: 0, hariIni: "bukan" });
    expect(kalimatHariKerja(ringkasHariKerja([], [], "2026-10-26"))).toBe("Belum ada hari kerja yang direncanakan.");
  });
});

describe("ringkasDariSel (papan Korwil) sama dengan Transport Lokal", () => {
  it("angka sama untuk tanggal & status yang sama", () => {
    const tgl = hari(11, 26);
    const lengkapLokal = hari(11, 24);
    const sel = tgl.map((t) => (lengkapLokal.includes(t) ? "lengkap" : t === "2026-10-25" ? "kosong" : "sebagian"));
    const lokal = ringkasHariKerja(tgl, lengkapLokal, "2026-10-26");
    const korwil = ringkasDariSel(tgl, sel, "2026-10-26");
    expect(korwil).toEqual(lokal);
  });
  it("hari tidak_ada / anomali / libur bukan hari kerja", () => {
    const r = ringkasDariSel(["2026-10-24", "2026-10-25", "2026-10-26"], ["anomali", "tidak_ada", "berjalan"], "2026-10-26");
    expect(r).toEqual({ direncanakan: 1, sudahLewat: 0, lengkap: 0, terlewat: 0, akanDatang: 0, hariIni: "berjalan" });
  });
  it("hari ini lengkap di papan Korwil tidak lagi menambah 'lengkap' hari lewat", () => {
    const r = ringkasDariSel(["2026-10-25", "2026-10-26"], ["lengkap", "lengkap"], "2026-10-26");
    expect(r.lengkap).toBe(1);
    expect(r.hariIni).toBe("lengkap");
  });
});

describe("kalimatHariKerja", () => {
  it("kalimat lengkap", () => {
    expect(kalimatHariKerja({ direncanakan: 31, sudahLewat: 15, lengkap: 14, terlewat: 1, akanDatang: 15, hariIni: "berjalan" })).toBe(
      "Sudah lewat 15 hari: 14 lengkap, 1 terlewat; hari ini masih bisa diisi; 15 hari lagi.",
    );
  });
  it("belum ada hari lewat", () => {
    expect(kalimatHariKerja({ direncanakan: 5, sudahLewat: 0, lengkap: 0, terlewat: 0, akanDatang: 4, hariIni: "berjalan" })).toBe("Belum ada hari yang lewat; hari ini masih bisa diisi; 4 hari lagi.");
  });
});
