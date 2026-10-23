import { beforeAll, describe, expect, it } from "vitest";

// (23 Okt 2026) Token paket vs token biasa (server). Kunci HMAC diambil dari SUPABASE_SERVICE_ROLE_KEY, jadi diset sebelum modul dimuat.
let buatTokenPotret: typeof import("../sigapFotoServer").buatTokenPotret;
let bacaTokenPotret: typeof import("../sigapFotoServer").bacaTokenPotret;
let buatPaketToken: typeof import("../sigapFotoServer").buatPaketToken;

beforeAll(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji-rahasia";
  ({ buatTokenPotret, bacaTokenPotret, buatPaketToken } = await import("../sigapFotoServer"));
});

describe("token potret biasa vs paket", () => {
  it("token biasa terbaca dan bukan paket", () => {
    const { token, t } = buatTokenPotret(7, 1_000_000);
    const b = bacaTokenPotret(token, 7);
    expect(b?.t).toBe(t);
    expect(b?.paket).toBe(false);
  });
  it("token paket terbaca sebagai paket dan nonce berawalan P~", () => {
    const { token } = buatTokenPotret(7, 1_000_000, { paket: true });
    const b = bacaTokenPotret(token, 7);
    expect(b?.paket).toBe(true);
    expect(b?.nonce.startsWith("P~")).toBe(true);
  });
  it("paket berisi jumlah token yang diminta, semuanya unik, bercap waktu sama, sah untuk akun itu saja", () => {
    const p = buatPaketToken(7, 30, 5_000_000);
    expect(p.tokens).toHaveLength(30);
    expect(new Set(p.tokens).size).toBe(30);
    for (const tk of p.tokens) {
      const b = bacaTokenPotret(tk, 7);
      expect(b?.t).toBe(5_000_000);
      expect(b?.paket).toBe(true);
      expect(bacaTokenPotret(tk, 8)).toBeNull();
    }
  });
  it("nonce unik antar token paket (kolom token_nonce harus unik)", () => {
    const p = buatPaketToken(7, 30, 1);
    expect(new Set(p.tokens.map((x) => bacaTokenPotret(x, 7)?.nonce)).size).toBe(30);
  });
  it("token biasa tidak bisa dijadikan paket dengan menambah awalan (tanda tangan gagal)", () => {
    const { token } = buatTokenPotret(7, 1_000_000);
    const p = token.split(".");
    p[2] = "P~" + p[2];
    expect(bacaTokenPotret(p.join("."), 7)).toBeNull();
  });
  it("token paket tidak bisa disamarkan menjadi token biasa (buang awalan -> tanda tangan gagal)", () => {
    const { token } = buatTokenPotret(7, 1_000_000, { paket: true });
    const p = token.split(".");
    p[2] = p[2].slice(2);
    expect(bacaTokenPotret(p.join("."), 7)).toBeNull();
  });
  it("jumlah dibatasi 1..100", () => {
    expect(buatPaketToken(7, 0).tokens).toHaveLength(1);
    expect(buatPaketToken(7, 5000).tokens).toHaveLength(100);
  });
});
