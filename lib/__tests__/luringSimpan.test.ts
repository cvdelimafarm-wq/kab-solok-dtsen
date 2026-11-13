import { describe, expect, it } from "vitest";
import { AWALAN_LURING, baca, bersihkanSaatKeluar, gabungJawaban, galatJaringan, jamServerSekarang, kunciTesTerakhir, tandaPemilik, tulis, type Penyimpan } from "../luringSimpan";

function memori(): Penyimpan & { isi: Map<string, string> } {
  const isi = new Map<string, string>();
  return {
    isi,
    getItem: (k) => (isi.has(k) ? isi.get(k)! : null),
    setItem: (k, v) => void isi.set(k, v),
    removeItem: (k) => void isi.delete(k),
    key: (i) => [...isi.keys()][i] ?? null,
    get length() { return isi.size; },
  };
}

describe("simpanan kerja luring (L12)", () => {
  it("tulis/baca hanya untuk pemilik yang sama", () => {
    const p = memori();
    tulis(p, kunciTesTerakhir("pretest"), { pemilik: tandaPemilik("token-sesi-panjang-abc123"), jamServer: "2026-11-14T01:00:00.000Z", keadaan: { a: 1 }, jawaban: { "1": "B" }, kotor: true }, 1000);
    expect(baca(p, kunciTesTerakhir("pretest"), tandaPemilik("token-sesi-panjang-abc123"))?.jawaban).toEqual({ "1": "B" });
    expect(baca(p, kunciTesTerakhir("pretest"), tandaPemilik("token-lain-xyz"))).toBeNull();
  });
  it("jam server dipulihkan: jam saat disimpan + lama berlalu di HP", () => {
    expect(jamServerSekarang({ jamServer: "2026-11-14T01:00:00.000Z", disimpanMs: 1000 }, 61_000)).toBe("2026-11-14T01:01:00.000Z");
    expect(jamServerSekarang({ jamServer: null, disimpanMs: 0 })).toBeNull();
  });
  it("jawaban HP yang kotor menang atas server; yang bersih memakai server", () => {
    const lokal = { v: 1 as const, pemilik: "x", disimpanMs: 0, jamServer: null, keadaan: {}, jawaban: { "1": "C" }, kotor: true };
    expect(gabungJawaban({ "1": "A" }, lokal)).toEqual({ jawaban: { "1": "C" }, kotor: true });
    expect(gabungJawaban({ "1": "A" }, { ...lokal, kotor: false })).toEqual({ jawaban: { "1": "A" }, kotor: false });
  });
  it("keluar akun: yang terkirim dibuang, yang belum terkirim ditahan, kunci lain tidak disentuh", () => {
    const p = memori();
    p.setItem(`${AWALAN_LURING}tes:a`, JSON.stringify({ kotor: false }));
    p.setItem(`${AWALAN_LURING}tes:b`, JSON.stringify({ kotor: true }));
    p.setItem("lain", "1");
    expect(bersihkanSaatKeluar(p)).toBe(1);
    expect([...p.isi.keys()].sort()).toEqual(["lain", `${AWALAN_LURING}tes:b`]);
  });
  it("galat jaringan dikenali; penolakan server bukan galat jaringan", () => {
    expect(galatJaringan(new TypeError("Failed to fetch"))).toBe(true);
    expect(galatJaringan(new Error("Waktu pengerjaan sudah habis"))).toBe(false);
  });
});
