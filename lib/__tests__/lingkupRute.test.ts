// lib/__tests__/lingkupRute.test.ts
// (6 Nov 2026) Uji rute: laporan-isi, konfig, dan monitoring identifikasi tidak lagi bocor lintas kegiatan (audit Kelola K04c-A1/K10-A1).
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji";

const akunUji = { id: 7, nama: "Uji" };
const dbUji = {} as never;

vi.mock("@/lib/portal/server", async () => {
  const akses = await vi.importActual<typeof import("@/lib/sigapAkses")>("@/lib/sigapAkses");
  return { dbPortal: vi.fn(() => dbUji), akunDariSesi: vi.fn(async (_db: unknown, h: Headers) => (akses.sesiDariHeader(h) ? akunUji : null)) };
});
vi.mock("@/lib/sigapAkses", async () => {
  const asli = await vi.importActual<typeof import("@/lib/sigapAkses")>("@/lib/sigapAkses");
  return { ...asli, izinAkun: vi.fn(), catatAudit: vi.fn() };
});
vi.mock("@/lib/sigapGalat", () => ({ galatServer: vi.fn(() => new Response("galat", { status: 500 })) }));
vi.mock("@/lib/portal/lembarKonfig", () => {
  class GalatKonfig extends Error {
    status: number;
    constructor(m: string, s = 400) {
      super(m);
      this.status = s;
    }
  }
  return {
    GalatKonfig,
    dataAdminKonfig: vi.fn(async () => ({ kegiatan: [{ id: 1, nama: "PSP" }, { id: 2, nama: "SPDT" }], konfig: { "1": { x: 1 }, "2": { x: 2 } } })),
    simpanKonfig: vi.fn(async () => ({ konfig: {}, bawaan: false })),
  };
});
vi.mock("@/lib/portal/laporanIsiKonfig", () => ({
  dataAdminLaporan: vi.fn(async () => ({ tabel_ada: true, kegiatan: [{ id: 1, nama: "PSP" }, { id: 2, nama: "SPDT" }], konfig: { "1": { y: 1 }, "2": { y: 2 } } })),
  simpanLaporan: vi.fn(async () => ({ konfig: {}, bawaan: false })),
}));
vi.mock("@/lib/portal/identifikasi", () => ({ monitoringIdentifikasi: vi.fn(async () => ({ pml: [], status: {}, total: 0 })) }));

import * as akses from "@/lib/sigapAkses";
import * as konfigLib from "@/lib/portal/lembarKonfig";
import * as laporanLib from "@/lib/portal/laporanIsiKonfig";
import * as konfigRute from "@/app/api/portal/pendataan/konfig/route";
import * as laporanRute from "@/app/api/portal/pendataan/laporan-isi/route";
import * as monitoringRute from "@/app/api/portal/identifikasi/monitoring/route";

const izinAkunMock = akses.izinAkun as unknown as ReturnType<typeof vi.fn>;
const sesi = () => akses.buatSesi(7).sesi;
const get = (url: string) => new Request(url, { headers: { Authorization: `Bearer ${sesi()}` } }) as never;
const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { Authorization: `Bearer ${sesi()}`, "content-type": "application/json" }, body: JSON.stringify(body) }) as never;

const izin = (level: "lihat" | "kelola", kegiatan: number[], semua = false) => ({ "bencana.admin": { level, semua, kegiatan } });
const pspKelola = izin("kelola", [1]);
const spdtKelola = izin("kelola", [2]);
const semuaKelola = izin("kelola", [], true);

const URL_L = "https://contoh.test/api/portal/pendataan/laporan-isi";
const URL_K = "https://contoh.test/api/portal/pendataan/konfig";
const URL_M = "https://contoh.test/api/portal/identifikasi/monitoring";

beforeEach(() => {
  izinAkunMock.mockReset();
  vi.mocked(konfigLib.simpanKonfig).mockClear();
  vi.mocked(laporanLib.simpanLaporan).mockClear();
});

describe("laporan-isi", () => {
  it("POST kegiatan di luar lingkup -> 403 dan tidak menyimpan", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: spdtKelola });
    const r = await laporanRute.POST(post(URL_L, { kegiatan_id: 1, konfig: null }));
    expect(r.status).toBe(403);
    expect(laporanLib.simpanLaporan).not.toHaveBeenCalled();
  });
  it("POST kegiatan dalam lingkup -> 200 dan menyimpan", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: spdtKelola });
    const r = await laporanRute.POST(post(URL_L, { kegiatan_id: 2, konfig: null }));
    expect(r.status).toBe(200);
    expect(laporanLib.simpanLaporan).toHaveBeenCalledTimes(1);
  });
  it("lingkup semua boleh kegiatan mana pun", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: semuaKelola });
    expect((await laporanRute.POST(post(URL_L, { kegiatan_id: 2, konfig: null }))).status).toBe(200);
  });
  it("GET hanya memuat kegiatan dalam lingkup", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: spdtKelola });
    const j = await (await laporanRute.GET(get(URL_L))).json();
    expect(j.kegiatan.map((k: { id: number }) => k.id)).toEqual([2]);
    expect(Object.keys(j.konfig)).toEqual(["2"]);
  });
  it("tanpa sesi -> 401", async () => {
    expect((await laporanRute.GET(new Request(URL_L) as never)).status).toBe(401);
  });
});

describe("konfig lembar pendataan", () => {
  it("pengelola PSP tidak dapat mengubah kegiatan lain (2) -> 403", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: pspKelola });
    const r = await konfigRute.POST(post(URL_K, { kegiatan_id: 2, konfig: null }));
    expect(r.status).toBe(403);
    expect(konfigLib.simpanKonfig).not.toHaveBeenCalled();
  });
  it("pengelola PSP dapat mengubah kegiatan 1", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: pspKelola });
    expect((await konfigRute.POST(post(URL_K, { kegiatan_id: 1, konfig: null }))).status).toBe(200);
  });
  it("pengelola SPDT (tanpa lingkup PSP) ditolak sejak gerbang -> 403", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: spdtKelola });
    expect((await konfigRute.POST(post(URL_K, { kegiatan_id: 2, konfig: null }))).status).toBe(403);
    expect((await konfigRute.GET(get(URL_K))).status).toBe(403);
  });
  it("GET pengelola PSP hanya memuat kegiatan dalam lingkupnya", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: pspKelola });
    const j = await (await konfigRute.GET(get(URL_K))).json();
    expect(j.kegiatan.map((k: { id: number }) => k.id)).toEqual([1]);
    expect(Object.keys(j.konfig)).toEqual(["1"]);
  });
  it("mode masuk sebagai tetap ditolak untuk tulis", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: semuaKelola });
    const req = new Request(URL_K, { method: "POST", headers: { Authorization: `Bearer ${akses.buatSesi(7, 99).sesi}`, "content-type": "application/json" }, body: JSON.stringify({ kegiatan_id: 1, konfig: null }) }) as never;
    expect((await konfigRute.POST(req)).status).toBe(403);
  });
});

describe("monitoring identifikasi (data PSP)", () => {
  it("pengelola SPDT (kegiatan 2) -> 403", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izin("lihat", [2]) });
    expect((await monitoringRute.GET(get(URL_M))).status).toBe(403);
  });
  it("pengelola PSP -> 200", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izin("lihat", [1]) });
    expect((await monitoringRute.GET(get(URL_M))).status).toBe(200);
  });
  it("lingkup semua -> 200; tanpa izin -> 403; tanpa sesi -> 401", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izin("lihat", [], true) });
    expect((await monitoringRute.GET(get(URL_M))).status).toBe(200);
    izinAkunMock.mockResolvedValue({ peran: [], izin: {} });
    expect((await monitoringRute.GET(get(URL_M))).status).toBe(403);
    expect((await monitoringRute.GET(new Request(URL_M) as never)).status).toBe(401);
  });
});
