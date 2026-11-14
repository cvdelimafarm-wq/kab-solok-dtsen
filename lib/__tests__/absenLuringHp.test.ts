import { describe, expect, it } from "vitest";
import { bacaAbsenLuring, tambahAbsenLuring, tulisAbsenLuring } from "../absenLuringHp";
import { bersihkanSaatKeluar, catatJamServer, selisihJamServer } from "../luringSimpan";

function penyimpan() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const T = Date.parse("2026-11-20T02:00:00Z");

describe("antrean absen tanpa sinyal", () => {
  it("validasi kode, ganda, batas per hari", () => {
    const p = penyimpan();
    expect(tambahAbsenLuring(p, "A", "12", 6, 0, T).ok).toBe(false);
    expect(tambahAbsenLuring(p, "A", "123456", 6, 0, T).ok).toBe(true);
    expect(tambahAbsenLuring(p, "A", "123 456", 6, 0, T + 1).ok).toBe(false);
    tambahAbsenLuring(p, "A", "222222", 6, 0, T + 2);
    tambahAbsenLuring(p, "A", "333333", 6, 0, T + 3);
    expect(tambahAbsenLuring(p, "A", "444444", 6, 0, T + 4).ok).toBe(false);
  });
  it("menunggu tahan keluar akun; selesai lama dibuang", () => {
    const p = penyimpan();
    tambahAbsenLuring(p, "A", "123456", 6, 0, T);
    catatJamServer(p, T + 5000, T);
    expect(selisihJamServer(p)?.selisih).toBe(5000);
    expect(bersihkanSaatKeluar(p)).toBe(1); // jam dibuang, antrean ditahan
    expect(bacaAbsenLuring(p, "A").length).toBe(1);
    tulisAbsenLuring(p, "A", bacaAbsenLuring(p, "A").map((x) => ({ ...x, status: "diterima" as const })), T + 3 * 24 * 3_600_000);
    expect(p.length).toBe(0);
  });
});
