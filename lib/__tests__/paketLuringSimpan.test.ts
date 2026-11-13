import { describe, expect, it } from "vitest";
import { bacaPaket, buangPaket, kunciPaket, simpanPaket, statusPaket } from "../paketLuringSimpan";
import { bersihkanSaatKeluar } from "../luringSimpan";
import type { PaketTes } from "../sigapTesLuring";

function penyimpan() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const paket = (tutup = "2026-11-20T10:00:00.000Z"): PaketTes => ({ v: 1, tes_id: 5, kegiatan_id: 9, jenis: "pretest", judul: "Pretest", durasi_menit: 30, buka_at: "2026-11-20T08:00:00.000Z", tutup_at: tutup, dimulai_instruktur: true, jumlah_soal: 10, versi: "abc", diunduh_at: "2026-11-19T08:00:00.000Z", tersandi: { v: 1, garam: "g", iv: "i", iterasi: 1, data: "d" } });

describe("paket luring di HP", () => {
  it("simpan, baca milik sendiri saja, buang", () => {
    const p = penyimpan();
    expect(simpanPaket(p, "pretest", "A", paket())).toBe(true);
    expect(bacaPaket(p, "pretest", "A")?.tes_id).toBe(5);
    expect(bacaPaket(p, "pretest", "B")).toBeNull();
    buangPaket(p, "pretest");
    expect(p.getItem(kunciPaket("pretest"))).toBeNull();
  });
  it("status: siap / belum / kedaluwarsa / tidak perlu", () => {
    const sebelum = Date.parse("2026-11-20T09:00:00.000Z");
    expect(statusPaket(paket(), "2026-11-20T10:00:00.000Z", sebelum)).toBe("siap");
    expect(statusPaket(null, "2026-11-20T10:00:00.000Z", sebelum)).toBe("belum");
    expect(statusPaket(paket("2026-11-19T10:00:00.000Z"), "2026-11-20T10:00:00.000Z", sebelum)).toBe("belum");
    expect(statusPaket(paket(), "2026-11-20T08:30:00.000Z", sebelum)).toBe("tidak_perlu");
  });
  it("ikut dibuang saat keluar akun (tidak kotor)", () => {
    const p = penyimpan();
    simpanPaket(p, "pretest", "A", paket());
    expect(bersihkanSaatKeluar(p)).toBe(1);
    expect(p.length).toBe(0);
  });
});
