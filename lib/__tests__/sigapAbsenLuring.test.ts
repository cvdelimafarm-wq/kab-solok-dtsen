import { describe, expect, it } from "vitest";
import { putuskanKodeLuring } from "../sigapAbsenLuring";

const B = Date.parse("2026-11-20T02:00:00Z");
const sesi = [
  { id: 1, kelas: 1, kode: "111111", metode: ["kode"], dibuka_at: new Date(B).toISOString(), tutup_at: new Date(B + 30 * 60_000).toISOString(), ditutup_at: null },
  { id: 2, kelas: 2, kode: "222222", metode: ["kode"], dibuka_at: new Date(B).toISOString(), tutup_at: new Date(B + 30 * 60_000).toISOString(), ditutup_at: new Date(B + 10 * 60_000).toISOString() },
];
const k = (kode: string, menit: number) => ({ kode, hp_ms: B + menit * 60_000 - 5000, selisih_ms: 5000, kirim_hp_ms: B + 60 * 60_000 - 5000 });

describe("absen sesi tanpa sinyal", () => {
  it("kode + jendela cocok -> diterima pada jam ketik", () => {
    const h = putuskanKodeLuring(sesi, k("111111", 5), 1, B + 60 * 60_000);
    expect(h).toEqual({ ok: true, sesi_id: 1, t: B + 5 * 60_000, catatan: [] });
  });
  it("kelas lain / salah kode / sesudah ditutup instruktur / lewat 24 jam ditolak", () => {
    expect(putuskanKodeLuring(sesi, k("222222", 5), 1, B + 60 * 60_000).ok).toBe(false);
    const salah = putuskanKodeLuring(sesi, k("999999", 5), 1, B + 60 * 60_000);
    expect(salah.ok === false && salah.salah_kode).toBe(true);
    expect(putuskanKodeLuring(sesi, k("222222", 20), 2, B + 60 * 60_000).ok).toBe(false);
    expect(putuskanKodeLuring(sesi, k("111111", 5), 1, B + 25 * 3_600_000).ok).toBe(false);
  });
});
