// Menguji /api/sigap/pelatihan/vanguard: siapa boleh melihat / mengubah penyalaan Vanguard pelatihan. Semua dependensi dipalsukan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PILIHAN_VANGUARD, pilihanDari, teksSumberVanguard } from "../vanguardPelatihan";

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));

const st = {
  akun: { id: 1, nama: "Budi" } as { id: number; nama: string } | null,
  lihat: true,
  kelola: true,
  centang: null as boolean | null,
  identifikasi: false,
  gagalTulis: false,
};
const audit = vi.fn();
const tulis = { upsert: vi.fn(), hapus: vi.fn() };

const fakeDb = {
  from: (tabel: string) => {
    if (tabel === "sigap_kegiatan_fitur") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: st.centang === null ? null : { aktif: st.centang } }) }) }) }),
        upsert: async (baris: unknown, opsi: unknown) => {
          tulis.upsert(baris, opsi);
          if (st.gagalTulis) return { error: { message: "x" } };
          st.centang = (baris as { aktif: boolean }).aktif;
          return { error: null };
        },
        delete: () => ({ eq: () => ({ eq: async () => { tulis.hapus(); if (st.gagalTulis) return { error: { message: "x" } }; st.centang = null; return { error: null }; } }) }),
      };
    }
    return { select: () => ({ eq: async () => ({ count: 4 }) }) }; // sigap_vanguard_percobaan
  },
};

vi.mock("@/lib/sigapTesDb", () => ({ akunDariRequest: async () => st.akun, dbAdmin: () => fakeDb, idKegiatanPelatihan: async () => 7 }));
vi.mock("@/lib/sigapAkses", () => ({
  izinAkun: async () => ({ izin: {} }),
  boleh: (_i: unknown, _k: string, tingkat: string) => (tingkat === "lihat" ? st.lihat : st.kelola),
  catatAudit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/vanguardAkses", () => ({
  KODE_FITUR_VANGUARD: "vanguard",
  keadaanVanguard: async () => (st.centang !== null ? { menyala: st.centang, sumber: st.centang ? "centang" : "mati" } : st.identifikasi ? { menyala: true, sumber: "identifikasi" } : { menyala: false, sumber: "mati" }),
}));

import { GET, POST } from "../../app/api/sigap/pelatihan/vanguard/route";

const req = (body?: unknown) => ({ url: "http://x/api", json: async () => body }) as never;
const hasil = async (p: Promise<unknown>) => (await p) as { status: number; body: Record<string, unknown> };

beforeEach(() => {
  st.akun = { id: 1, nama: "Budi" };
  st.lihat = true;
  st.kelola = true;
  st.centang = null;
  st.identifikasi = false;
  st.gagalTulis = false;
  audit.mockClear();
  tulis.upsert.mockClear();
  tulis.hapus.mockClear();
});

describe("GET vanguard pelatihan", () => {
  it("mengembalikan keadaan, centang, percobaan, dan hak kelola", async () => {
    const r = await hasil(GET(req()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kegiatan_id: 7, menyala: false, sumber: "mati", centang: null, percobaan: 4, boleh_kelola: true });
  });
  it("mengikuti Identifikasi survei bila tidak ada centang", async () => {
    st.identifikasi = true;
    expect((await hasil(GET(req()))).body).toMatchObject({ menyala: true, sumber: "identifikasi", centang: null });
  });
  it("401 tanpa sesi, 403 tanpa izin lihat", async () => {
    st.akun = null;
    expect((await hasil(GET(req()))).status).toBe(401);
    st.akun = { id: 1, nama: "Budi" };
    st.lihat = false;
    expect((await hasil(GET(req()))).status).toBe(403);
  });
  it("hanya-lihat: boleh_kelola false", async () => {
    st.kelola = false;
    expect((await hasil(GET(req()))).body.boleh_kelola).toBe(false);
  });
});

describe("POST vanguard pelatihan", () => {
  it("menyalakan: upsert centang true + audit", async () => {
    const r = await hasil(POST(req({ menyala: true })));
    expect(r.status).toBe(200);
    expect(tulis.upsert).toHaveBeenCalledTimes(1);
    expect(tulis.upsert.mock.calls[0][0]).toMatchObject({ kegiatan_id: 7, fitur: "vanguard", aktif: true, diubah_oleh: "Budi" });
    expect(tulis.upsert.mock.calls[0][1]).toEqual({ onConflict: "kegiatan_id,fitur" });
    expect(r.body).toMatchObject({ menyala: true, sumber: "centang", centang: true });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 1, "pelatihan_vanguard", { kegiatan_id: 7, menyala: true });
  });
  it("mematikan: centang false menang atas Identifikasi survei", async () => {
    st.identifikasi = true;
    const r = await hasil(POST(req({ menyala: false })));
    expect(r.body).toMatchObject({ menyala: false, centang: false });
  });
  it("null menghapus centang (ikut Identifikasi survei)", async () => {
    st.centang = true;
    const r = await hasil(POST(req({ menyala: null })));
    expect(tulis.hapus).toHaveBeenCalledTimes(1);
    expect(r.body.centang).toBeNull();
  });
  it("menolak tanpa izin kelola, pilihan tidak valid, dan galat simpan", async () => {
    st.kelola = false;
    expect((await hasil(POST(req({ menyala: true })))).status).toBe(403);
    expect(tulis.upsert).not.toHaveBeenCalled();
    st.kelola = true;
    expect((await hasil(POST(req({ menyala: "ya" })))).status).toBe(400);
    expect((await hasil(POST(req({})))).status).toBe(400);
    st.gagalTulis = true;
    expect((await hasil(POST(req({ menyala: true })))).status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("vanguardPelatihan (murni)", () => {
  it("memetakan centang ke pilihan dan sebaliknya", () => {
    expect(pilihanDari(true)).toBe("nyala");
    expect(pilihanDari(false)).toBe("mati");
    expect(pilihanDari(null)).toBe("ikut");
    expect(PILIHAN_VANGUARD.map((p) => p.nilai)).toEqual([true, false, null]);
    expect(teksSumberVanguard("identifikasi")).toMatch(/Identifikasi/);
    expect(teksSumberVanguard("mati")).toMatch(/tidak menyala/);
  });
});
