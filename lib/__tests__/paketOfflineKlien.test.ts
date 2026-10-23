import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// (23 Okt 2026) Penyimpanan paket token di HP (app/sigap/foto/paketOffline.ts) dengan localStorage/jam palsu.
const ambilJson = vi.fn();
vi.mock("@/app/portal/sesi", () => ({ pemilikSesi: () => 7, bacaSesi: () => "7.x" }));
vi.mock("@/app/sigap/foto/klien", () => ({ ambilJson: (...a: unknown[]) => ambilJson(...a) }));

const simpanan = new Map<string, string>();
const T0 = Date.UTC(2026, 9, 23, 0, 0, 0);

async function muat() {
  vi.resetModules();
  return import("@/app/sigap/foto/paketOffline");
}
const jawab = (n = 30, t = T0) => ({ t, tokens: Array.from({ length: n }, (_, i) => `tk${i}`) });

beforeEach(() => {
  simpanan.clear();
  ambilJson.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(T0 + 1000);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => simpanan.get(k) ?? null,
    setItem: (k: string, v: string) => void simpanan.set(k, v),
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("performance", { now: () => 5000, timeOrigin: 42.5 });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("paketOffline (klien)", () => {
  it("online: mengambil paket sekali dan menyimpannya; panggilan berikutnya tidak mengambil lagi", async () => {
    ambilJson.mockResolvedValue(jawab());
    const m = await muat();
    await m.siapkanPaket();
    expect(ambilJson).toHaveBeenCalledTimes(1);
    expect(ambilJson).toHaveBeenCalledWith("/api/sigap/foto/paket");
    expect(m.sisaTokenPaket()).toBe(30);
    await m.siapkanPaket();
    expect(ambilJson).toHaveBeenCalledTimes(1);
  });
  it("tanpa sambungan (navigator.onLine false) tidak memanggil server", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const m = await muat();
    await m.siapkanPaket();
    expect(ambilJson).not.toHaveBeenCalled();
  });
  it("gagal ambil (tanpa sinyal) diam saja dan tidak merusak simpanan", async () => {
    ambilJson.mockRejectedValue(new Error("x"));
    const m = await muat();
    await expect(m.siapkanPaket()).resolves.toBeUndefined();
    expect(m.sisaTokenPaket()).toBe(0);
  });
  it("ambilTokenPaket: tiap foto mendapat token berbeda, selang waktu dari jam dinding, sisa berkurang", async () => {
    ambilJson.mockResolvedValue(jawab());
    const m = await muat();
    await m.siapkanPaket();
    vi.setSystemTime(T0 + 1000 + 2 * 3_600_000);
    const a = m.ambilTokenPaket();
    const b = m.ambilTokenPaket();
    expect(a?.token).toBe("tk0");
    expect(b?.token).toBe("tk1");
    expect(a?.wall).toBe(2 * 3_600_000);
    expect(a?.mono).toBe(0); // halaman yang sama (timeOrigin sama), jam monotonik tidak bergerak di tes ini
    expect(m.sisaTokenPaket()).toBe(28);
  });
  it("sesudah halaman dimuat ulang (timeOrigin beda) selang monotonik null, selang jam dinding tetap ada", async () => {
    ambilJson.mockResolvedValue(jawab());
    const m = await muat();
    await m.siapkanPaket();
    vi.stubGlobal("performance", { now: () => 10, timeOrigin: 999.75 });
    vi.setSystemTime(T0 + 1000 + 3 * 3_600_000);
    const a = m.ambilTokenPaket();
    expect(a?.mono).toBeNull();
    expect(a?.wall).toBe(3 * 3_600_000);
  });
  it("lebih dari 48 jam -> tidak ada token; tanpa paket -> null", async () => {
    ambilJson.mockResolvedValue(jawab());
    const m = await muat();
    expect(m.ambilTokenPaket()).toBeNull();
    await m.siapkanPaket();
    vi.setSystemTime(T0 + 1000 + 49 * 3_600_000);
    expect(m.ambilTokenPaket()).toBeNull();
  });
  it("paket menipis (< 8) atau lebih dari 6 jam -> diminta ulang saat ada sinyal", async () => {
    ambilJson.mockResolvedValue(jawab());
    const m = await muat();
    await m.siapkanPaket();
    for (let i = 0; i < 23; i++) m.ambilTokenPaket(); // sisa 7
    await m.siapkanPaket();
    expect(ambilJson).toHaveBeenCalledTimes(2);
    vi.setSystemTime(T0 + 1000 + 7 * 3_600_000);
    await m.siapkanPaket();
    expect(ambilJson).toHaveBeenCalledTimes(3);
  });
});
