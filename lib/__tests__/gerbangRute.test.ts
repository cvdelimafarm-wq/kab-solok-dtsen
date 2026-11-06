// lib/__tests__/gerbangRute.test.ts
// (6 Nov 2026) Uji pembungkus penjaga rute admin Pendataan Pascabencana (audit Kelola K04a-A1/A2).
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji";

const dbUji = {} as never;
const akunUji = { id: 7, nama: "Uji", jenis: "organik", token: "t", petugas_bencana_id: null, aktif: true };

vi.mock("@/lib/portal/server", async () => {
  const akses = await vi.importActual<typeof import("@/lib/sigapAkses")>("@/lib/sigapAkses");
  return {
    dbPortal: vi.fn(() => dbUji),
    akunDariSesi: vi.fn(async (_db: unknown, h: Headers) => (akses.sesiDariHeader(h) ? akunUji : null)),
  };
});
vi.mock("@/lib/sigapAkses", async () => {
  const asli = await vi.importActual<typeof import("@/lib/sigapAkses")>("@/lib/sigapAkses");
  return { ...asli, izinAkun: vi.fn(), catatAudit: vi.fn() };
});

import { gerbangBencanaAdmin, levelUntukMetode, pemegangIzinPsp, samarkanTelp } from "@/lib/gerbangRute";
import * as server from "@/lib/portal/server";
import * as akses from "@/lib/sigapAkses";

const izinAkunMock = akses.izinAkun as unknown as ReturnType<typeof vi.fn>;
const auditMock = akses.catatAudit as unknown as ReturnType<typeof vi.fn>;
const akunDariSesiMock = server.akunDariSesi as unknown as ReturnType<typeof vi.fn>;

const sesi = () => akses.buatSesi(7).sesi;
const sesiMasukSebagai = () => akses.buatSesi(7, 99).sesi;
const req = (metode: string, token: string | null = sesi()) =>
  new Request("https://contoh.test/api/bencana/alokasi/reset-semua", { method: metode, headers: token ? { Authorization: `Bearer ${token}` } : {} });

const izinKelolaPsp = { "bencana.admin": { level: "kelola" as const, semua: false, kegiatan: [1] } };
const izinKelolaSemua = { "bencana.admin": { level: "kelola" as const, semua: true, kegiatan: [] } };
const izinLihatPsp = { "bencana.admin": { level: "lihat" as const, semua: false, kegiatan: [1] } };
const izinKelolaSpdt = { "bencana.admin": { level: "kelola" as const, semua: false, kegiatan: [2] } };

beforeEach(() => {
  izinAkunMock.mockReset();
  auditMock.mockReset();
  akunDariSesiMock.mockClear();
  auditMock.mockResolvedValue(undefined);
});

async function status(h: Awaited<ReturnType<typeof gerbangBencanaAdmin>>) {
  return h.ok ? 200 : h.res.status;
}

describe("levelUntukMetode", () => {
  it("GET/HEAD/OPTIONS = lihat, lainnya = kelola", () => {
    expect(levelUntukMetode("GET")).toBe("lihat");
    expect(levelUntukMetode("head")).toBe("lihat");
    expect(levelUntukMetode("OPTIONS")).toBe("lihat");
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) expect(levelUntukMetode(m)).toBe("kelola");
  });
});

describe("gerbangBencanaAdmin", () => {
  it("tanpa sesi -> 401 dan tidak menyentuh izin", async () => {
    const h = await gerbangBencanaAdmin(req("GET", null));
    expect(await status(h)).toBe(401);
    expect(izinAkunMock).not.toHaveBeenCalled();
  });

  it("sesi dipalsukan -> 401", async () => {
    const h = await gerbangBencanaAdmin(req("POST", "1.9999999999999.palsu"));
    expect(await status(h)).toBe(401);
  });

  it("sesi sah tetapi tanpa izin bencana.admin -> 403", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: {} });
    expect(await status(await gerbangBencanaAdmin(req("GET")))).toBe(403);
  });

  it("pengelola SPDT NTP (kelola, kegiatan 2) tidak boleh membuka data PSP -> 403 pada GET maupun POST", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaSpdt });
    expect(await status(await gerbangBencanaAdmin(req("GET")))).toBe(403);
    expect(await status(await gerbangBencanaAdmin(req("POST")))).toBe(403);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("izin lihat PSP: GET lolos, POST ditolak 403", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinLihatPsp });
    expect(await status(await gerbangBencanaAdmin(req("GET")))).toBe(200);
    expect(await status(await gerbangBencanaAdmin(req("POST")))).toBe(403);
    expect(await status(await gerbangBencanaAdmin(req("PATCH")))).toBe(403);
  });

  it("izin kelola PSP atau semua kegiatan: POST lolos dan dicatat audit dengan metode dan jalur", async () => {
    for (const izin of [izinKelolaPsp, izinKelolaSemua]) {
      auditMock.mockClear();
      izinAkunMock.mockResolvedValue({ peran: [], izin });
      const h = await gerbangBencanaAdmin(req("POST"));
      expect(h.ok).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      expect(auditMock).toHaveBeenCalledWith(dbUji, 7, "bencana_admin_tulis", { metode: "POST", jalur: "/api/bencana/alokasi/reset-semua" });
    }
  });

  it("GET tidak dicatat audit", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaPsp });
    expect((await gerbangBencanaAdmin(req("GET"))).ok).toBe(true);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("tanpaAudit mematikan pencatatan", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaPsp });
    expect((await gerbangBencanaAdmin(req("POST"), { tanpaAudit: true })).ok).toBe(true);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("gagal mencatat audit tidak menggagalkan permintaan", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaPsp });
    auditMock.mockRejectedValue(new Error("db mati"));
    expect((await gerbangBencanaAdmin(req("POST"))).ok).toBe(true);
  });

  it("sesi 'masuk sebagai': tulis ditolak 403, baca dibolehkan", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaPsp });
    expect(await status(await gerbangBencanaAdmin(req("POST", sesiMasukSebagai())))).toBe(403);
    expect(await status(await gerbangBencanaAdmin(req("GET", sesiMasukSebagai())))).toBe(200);
  });

  it("galat basis data saat memeriksa sesi -> 500 (bukan 401, supaya klien tidak membuang sesi)", async () => {
    akunDariSesiMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await status(await gerbangBencanaAdmin(req("GET")))).toBe(500);
  });

  it("galat basis data saat memeriksa izin -> 500", async () => {
    izinAkunMock.mockRejectedValue(new Error("timeout"));
    expect(await status(await gerbangBencanaAdmin(req("GET")))).toBe(500);
  });
});

describe("pemegangIzinPsp", () => {
  it("true hanya untuk sesi sah dengan izin lihat PSP", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinLihatPsp });
    expect(await pemegangIzinPsp(req("GET"))).toBe(true);
    expect(await pemegangIzinPsp(req("GET", null))).toBe(false);
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinKelolaSpdt });
    expect(await pemegangIzinPsp(req("GET"))).toBe(false);
    izinAkunMock.mockRejectedValue(new Error("x"));
    expect(await pemegangIzinPsp(req("GET"))).toBe(false);
  });
});

describe("samarkanTelp", () => {
  it("menyamarkan bagian tengah, menjaga panjang", () => {
    expect(samarkanTelp("081234567890")).toBe("0812******90");
    expect(samarkanTelp("0812345")).toBe("0812*45");
  });
  it("nomor pendek disamarkan seluruhnya; kosong menjadi null", () => {
    expect(samarkanTelp("12345")).toBe("*****");
    expect(samarkanTelp(null)).toBeNull();
    expect(samarkanTelp("")).toBeNull();
  });
});
