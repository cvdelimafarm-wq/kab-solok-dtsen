import { describe, expect, it } from "vitest";
import { ambilDariPaket, paketDariJawaban, paketMasihBerlaku, perluPaketBaru, type PaketHp } from "../sigapPaketOffline";
import { UMUR_PAKET_MS } from "../sigapFoto";

const JAM = 3_600_000;
const T0 = Date.UTC(2026, 9, 23, 0, 0, 0);
const paket = (o: Partial<PaketHp> = {}): PaketHp => ({ akun_id: 7, t: T0, tokens: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"], wall_at: T0 + 1000, mono_at: 500, origin: 111.5, ...o });

describe("perluPaketBaru", () => {
  it("tidak ada / akun lain / token menipis / terlalu tua / jam HP mundur -> perlu", () => {
    expect(perluPaketBaru(null, 7, T0)).toBe(true);
    expect(perluPaketBaru(paket({ akun_id: 8 }), 7, T0 + 2000)).toBe(true);
    expect(perluPaketBaru(paket({ tokens: ["a", "b"] }), 7, T0 + 2000)).toBe(true);
    expect(perluPaketBaru(paket(), 7, T0 + 7 * JAM)).toBe(true);
    expect(perluPaketBaru(paket(), 7, T0 - 5000)).toBe(true);
  });
  it("paket segar dengan token cukup -> tidak perlu", () => {
    expect(perluPaketBaru(paket(), 7, T0 + 2 * JAM)).toBe(false);
  });
});

describe("paketMasihBerlaku", () => {
  it("berlaku sampai 48 jam, habis token / akun lain / jam mundur -> tidak", () => {
    expect(paketMasihBerlaku(paket(), 7, T0 + 47 * JAM)).toBe(true);
    expect(paketMasihBerlaku(paket(), 7, T0 + 1000 + UMUR_PAKET_MS + 1)).toBe(false);
    expect(paketMasihBerlaku(paket({ tokens: [] }), 7, T0 + JAM)).toBe(false);
    expect(paketMasihBerlaku(paket(), 9, T0 + JAM)).toBe(false);
    expect(paketMasihBerlaku(paket(), 7, T0)).toBe(false); // wall_at = T0 + 1000, sekarang lebih awal
    expect(paketMasihBerlaku(null, 7, T0)).toBe(false);
  });
});

describe("ambilDariPaket", () => {
  it("mengambil token pertama, sisa berkurang satu, asli tidak berubah", () => {
    const p = paket();
    const r = ambilDariPaket(p, 7, T0 + 1000 + 3 * JAM, 900, 111.5);
    expect(r?.token).toBe("a");
    expect(r?.paket.tokens).toHaveLength(9);
    expect(p.tokens).toHaveLength(10);
    expect(r?.elapsed_wall).toBe(3 * JAM);
  });
  it("halaman yang sama -> selang monotonik ikut dibawa", () => {
    const r = ambilDariPaket(paket(), 7, T0 + 6000, 4500, 111.5);
    expect(r?.elapsed_mono).toBe(4000);
  });
  it("halaman sudah dimuat ulang (origin beda) -> tanpa selang monotonik", () => {
    const r = ambilDariPaket(paket(), 7, T0 + 6000, 20, 999.25);
    expect(r?.elapsed_mono).toBeNull();
    expect(r?.elapsed_wall).toBe(5000);
  });
  it("token dipakai berturut-turut tidak pernah sama; habis -> null", () => {
    let p: PaketHp | null = paket({ tokens: ["x", "y"] });
    const dipakai: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = ambilDariPaket(p, 7, T0 + JAM, 1, 111.5);
      if (!r) {
        p = null;
        break;
      }
      dipakai.push(r.token);
      p = r.paket;
    }
    expect(dipakai).toEqual(["x", "y"]);
    expect(ambilDariPaket(paket({ tokens: [] }), 7, T0 + JAM, 1, 111.5)).toBeNull();
  });
  it("paket kedaluwarsa atau jam HP mundur -> null", () => {
    expect(ambilDariPaket(paket(), 7, T0 + 50 * JAM, 1, 111.5)).toBeNull();
    expect(ambilDariPaket(paket(), 7, T0 - JAM, 1, 111.5)).toBeNull();
  });
});

describe("paketDariJawaban", () => {
  it("jawaban server valid menjadi paket tersimpan", () => {
    const p = paketDariJawaban({ t: T0, tokens: ["a", "b"] }, 7, T0 + 800, 12, 5.5);
    expect(p).toEqual({ akun_id: 7, t: T0, tokens: ["a", "b"], wall_at: T0 + 800, mono_at: 12, origin: 5.5 });
  });
  it("jawaban rusak / kosong -> null; token bukan string dibuang", () => {
    expect(paketDariJawaban(null, 7, 1, 1, 1)).toBeNull();
    expect(paketDariJawaban({ t: "x", tokens: ["a"] }, 7, 1, 1, 1)).toBeNull();
    expect(paketDariJawaban({ t: 1, tokens: [] }, 7, 1, 1, 1)).toBeNull();
    expect(paketDariJawaban({ t: 1, tokens: [1, null, "ok"] }, 7, 1, 1, 1)?.tokens).toEqual(["ok"]);
  });
});
