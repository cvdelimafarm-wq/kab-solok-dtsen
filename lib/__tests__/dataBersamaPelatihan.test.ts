import { beforeAll, describe, expect, it, vi } from "vitest";

// Peramban tiruan secukupnya: localStorage, window (alamat + sessionStorage), dan fetch.
const lokal = new Map<string, string>();
const sesiTab = new Map<string, string>();
const panggilan: { url: string; metode: string }[] = [];

type Api = typeof import("@/app/sigap/admin/api");
type Simpanan = typeof import("@/app/portal/dataBersama");
let api: Api;
let simpanan: Simpanan;

beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: (k: string) => lokal.get(k) ?? null, setItem: (k: string, v: string) => void lokal.set(k, String(v)), removeItem: (k: string) => void lokal.delete(k) });
  vi.stubGlobal("window", {
    addEventListener: () => undefined,
    location: { pathname: "/sigap/pelatihan/hari-ini", search: "", replace: () => undefined },
    sessionStorage: { getItem: (k: string) => sesiTab.get(k) ?? null, setItem: (k: string, v: string) => void sesiTab.set(k, String(v)) },
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    panggilan.push({ url, metode: (init?.method ?? "GET").toUpperCase() });
    return { status: 200, ok: true, json: async () => ({}), headers: { get: () => null } };
  });
  lokal.set("sigap_sesi", "5.tokenuji");
  lokal.set("sigap_sesi_sampai", new Date(Date.now() + 86_400_000).toISOString());
  simpanan = await import("@/app/portal/dataBersama");
  api = await import("@/app/sigap/admin/api");
});

describe("profil simpanan data pelatihan", () => {
  it("tab pelatihan punya profil sendiri: segar sebentar, tidak dibuang karena deploy, basi saat ganti hari", () => {
    for (const p of ["/api/sigap/pelatihan", "/api/sigap/pelatihan/ketentuan", "/api/sigap/pelatihan/instrumen", "/api/sigap/pelatihan/materi", "/api/sigap/pelatihan/monitoring", "/api/sigap/pelatihan/kelas"]) {
      const pr = simpanan.profilDari(p);
      expect(pr.hariBaru, p).toBe(true);
      expect(pr.umurMaksMs, p).toBe(12 * 60 * 60_000);
      expect(pr.segarMs, p).toBeLessThanOrEqual(5 * 60_000);
    }
  });
  it("hub dan monitoring diperbarui berkala; ketentuan, instrumen, materi, kelas hanya saat dibuka", () => {
    expect(simpanan.profilDari("/api/sigap/pelatihan").interval).toBe(60_000);
    expect(simpanan.profilDari("/api/sigap/pelatihan/monitoring").interval).toBe(60_000);
    for (const p of ["/api/sigap/pelatihan/ketentuan", "/api/sigap/pelatihan/instrumen", "/api/sigap/pelatihan/materi", "/api/sigap/pelatihan/kelas", "/api/sigap/pelatihan/info"]) expect(simpanan.profilDari(p).interval, p).toBe(0);
  });
  it("alamat dengan ?kegiatan= memakai profil yang sama", () => {
    expect(simpanan.profilDari("/api/sigap/pelatihan/instrumen?kegiatan=7")).toBe(simpanan.profilDari("/api/sigap/pelatihan/instrumen"));
  });
});

describe("fetchJson: penulisan pelatihan menandai simpanan basi", () => {
  const KUNCI = "/api/sigap/pelatihan/ketentuan?kegiatan=7";
  const isi = () => simpanan.isiCache(KUNCI, { kegiatan_id: 7 });

  it("GET tidak mengubah apa pun; data tetap segar", async () => {
    isi();
    expect(simpanan.basi(KUNCI)).toBe(false);
    await api.fetchJson("/api/sigap/pelatihan/ketentuan?kegiatan=7");
    expect(simpanan.basi(KUNCI)).toBe(false);
  });
  it("POST ke API pelatihan: data ditandai basi (tetap bisa ditampilkan, diperbarui di belakang)", async () => {
    isi();
    expect(simpanan.basi(KUNCI)).toBe(false);
    await api.fetchJson("/api/sigap/pelatihan/presensi", { method: "POST", body: "{}" });
    expect(simpanan.basi(KUNCI)).toBe(true);
    expect(simpanan.bacaCache(KUNCI)?.data).toEqual({ kegiatan_id: 7 });
  });
  it("POST ke API lain tidak menyentuh simpanan pelatihan", async () => {
    isi();
    await api.fetchJson("/api/sigap/admin", { method: "POST", body: "{}" });
    expect(simpanan.basi(KUNCI)).toBe(false);
  });
  it("POST yang gagal tidak menandai basi", async () => {
    isi();
    const asli = globalThis.fetch;
    vi.stubGlobal("fetch", async () => ({ status: 500, ok: false, json: async () => ({ error: "x" }), headers: { get: () => null } }));
    await expect(api.fetchJson("/api/sigap/pelatihan/presensi", { method: "POST", body: "{}" })).rejects.toThrow();
    expect(simpanan.basi(KUNCI)).toBe(false);
    vi.stubGlobal("fetch", asli);
  });
});
