import { describe, expect, it } from "vitest";
import { bacaAntreVg, bacaRahasiaVg, perluRahasiaBaru, simpanRahasiaVg, tambahAntreVg, tulisAntreVg, UMUR_RAHASIA_MS } from "../vanguardLuring";
import { bersihkanSaatKeluar } from "../luringSimpan";

function penyimpan() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

describe("Vanguard latihan tanpa sinyal", () => {
  it("rahasia per pemilik, kedaluwarsa 3 hari, dibuang saat keluar", () => {
    const p = penyimpan();
    simpanRahasiaVg(p, "A", "K1", { kunci: { x: 1 } }, 1000);
    expect(bacaRahasiaVg(p, "A", "K1")?.isi).toEqual({ kunci: { x: 1 } });
    expect(bacaRahasiaVg(p, "B", "K1")).toBeNull();
    expect(perluRahasiaBaru(bacaRahasiaVg(p, "A", "K1"), 1000 + UMUR_RAHASIA_MS + 1)).toBe(true);
    expect(bersihkanSaatKeluar(p)).toBe(1);
  });
  it("antrean bertanda kotor tidak dibuang saat keluar; kosong = dihapus", () => {
    const p = penyimpan();
    const it1 = tambahAntreVg(p, "A", { kasus: "K1" }, 5);
    expect(it1.body.luring).toEqual({ dibuat_hp_ms: 5 });
    expect(bersihkanSaatKeluar(p)).toBe(0);
    expect(bacaAntreVg(p, "A").length).toBe(1);
    tulisAntreVg(p, "A", []);
    expect(p.length).toBe(0);
  });
});
