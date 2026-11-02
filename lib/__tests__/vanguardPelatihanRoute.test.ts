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
  blokir: true,
  gagalAturan: false,
  tenggat: null as string | null,
  gagalTenggat: false,
  aturanV: { mode: "tidak_ada", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 } as { mode: string; hari_berturut: number; sesi_min_per_hari: number; nilai_minimal: number },
};
const simpanAturan = vi.fn();
const simpanTenggat = vi.fn();
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
    if (tabel === "sigap_penugasan") return { select: () => ({ eq: () => ({ eq: () => ({ or: () => ({ limit: async () => ({ data: [{ akun_id: 1 }, { akun_id: 2 }] }) }) }) }) }) };
    return { select: () => ({ eq: async () => ({ count: 4 }) }) }; // sigap_vanguard_percobaan
  },
};

vi.mock("@/lib/sigapTesDb", () => ({ akunDariRequest: async () => st.akun, dbAdmin: () => fakeDb, idKegiatanPelatihan: async () => 7, muatTesDaftar: async () => [{ jenis: "pretest", aktif: true, buka_at: "2026-11-09T01:00:00Z" }] }));
vi.mock("@/lib/sigapAturanDb", () => ({ muatAturan: async () => ({ versi: 2, blokir_tahap: st.blokir, izin_ajukan: false, eksplisit: true }) }));
vi.mock("@/lib/vanguardRuntutanDb", () => ({
  muatAturanVanguard: async () => st.aturanV,
  simpanAturanVanguard: async (...a: unknown[]) => { simpanAturan(...a); return st.gagalAturan ? { ok: false, pesan: "Kolom aturan Vanguard belum ada" } : (st.aturanV = a[2] as typeof st.aturanV, { ok: true }); },
  muatTenggatVanguard: async () => st.tenggat,
  simpanTenggatVanguard: async (...a: unknown[]) => { simpanTenggat(...a); if (st.gagalTenggat) return { ok: false, pesan: "Kolom tenggat Vanguard belum ada. Jalankan SQL 20261102zq" }; st.tenggat = a[2] as string | null; return { ok: true }; },
  tanggalBukaPretest: () => "2026-11-09",
  muatRuntutanBatch: async () => ({ peta: new Map([[1, { tuntas: true, terputus: false, berturut: 3, kelayakan: { mungkin: true } }], [2, { tuntas: false, terputus: false, berturut: 0, kelayakan: { mungkin: false } }]]) }),
}));
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
  st.blokir = true;
  st.gagalAturan = false;
  st.tenggat = null;
  st.gagalTenggat = false;
  simpanTenggat.mockClear();
  st.aturanV = { mode: "tidak_ada", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
  simpanAturan.mockClear();
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

describe("aturan latihan N hari berturut-turut", () => {
  it("GET membawa aturan, batas mulai, dan blokir_tahap; ringkasan hanya bila mode diatur dan Vanguard menyala", async () => {
    const a = (await hasil(GET(req()))).body;
    expect(a).toMatchObject({ aturan: { mode: "tidak_ada" }, blokir_tahap: true, tanggal_pretest: "2026-11-09", batas_mulai: "2026-11-06", ringkas: null });
    st.centang = true;
    st.aturanV = { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
    const b = (await hasil(GET(req()))).body as { ringkas: { total: number; tuntas: number; lewat_batas: number; belum_mulai: number } };
    expect(b.ringkas).toMatchObject({ total: 2, tuntas: 1, belum_mulai: 1, lewat_batas: 1 });
  });
  it("batas mulai mengikuti jumlah hari", async () => {
    st.aturanV = { mode: "opsional", hari_berturut: 5, sesi_min_per_hari: 1, nilai_minimal: 0 };
    expect((await hasil(GET(req()))).body.batas_mulai).toBe("2026-11-04");
  });
  it("POST aturan menyimpan, mencatat audit, dan mengembalikan keadaan baru", async () => {
    const r = await hasil(POST(req({ aturan: { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 } })));
    expect(r.status).toBe(200);
    expect(simpanAturan).toHaveBeenCalledTimes(1);
    expect(r.body.aturan).toMatchObject({ mode: "wajib", hari_berturut: 3 });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 1, "pelatihan_vanguard_aturan", expect.objectContaining({ kegiatan_id: 7, mode: "wajib" }));
    expect(tulis.upsert).not.toHaveBeenCalled(); // penyalaan tidak tersentuh
  });
  it("POST aturan menolak isi tidak sah, tanpa izin kelola, dan SQL belum dijalankan", async () => {
    expect((await hasil(POST(req({ aturan: { mode: "wajib", hari_berturut: 0, sesi_min_per_hari: 1, nilai_minimal: 0 } })))).status).toBe(400);
    st.kelola = false;
    expect((await hasil(POST(req({ aturan: { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 } })))).status).toBe(403);
    st.kelola = true;
    st.gagalAturan = true;
    const r = await hasil(POST(req({ aturan: { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 } })));
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toMatch(/Kolom aturan Vanguard/);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("tenggat eksplisit (SQL 20261102zq)", () => {
  const aturan = { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
  it("GET: tanpa tenggat atur, tenggat = sehari sebelum Pretest; dengan tenggat atur, batas mulai mengikutinya", async () => {
    expect((await hasil(GET(req()))).body).toMatchObject({ tenggat_atur: null, tenggat: "2026-11-08", tenggat_sumber: "pretest", batas_mulai: "2026-11-06" });
    st.tenggat = "2026-11-12";
    expect((await hasil(GET(req()))).body).toMatchObject({ tenggat_atur: "2026-11-12", tenggat: "2026-11-12", tenggat_sumber: "atur", batas_mulai: "2026-11-10", tanggal_pretest: "2026-11-09" });
  });
  it("POST aturan + tenggat menyimpan keduanya dan mencatatnya di audit", async () => {
    const r = await hasil(POST(req({ aturan, tenggat: "2026-11-08" })));
    expect(r.status).toBe(200);
    expect(simpanTenggat).toHaveBeenCalledWith(expect.anything(), 7, "2026-11-08", "Budi");
    expect(r.body).toMatchObject({ tenggat_atur: "2026-11-08", tenggat_sumber: "atur" });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 1, "pelatihan_vanguard_aturan", expect.objectContaining({ tenggat: "2026-11-08" }));
  });
  it("POST tanpa kunci tenggat tidak menyentuh tenggat", async () => {
    st.tenggat = "2026-11-08";
    await hasil(POST(req({ aturan })));
    expect(simpanTenggat).not.toHaveBeenCalled();
    expect(st.tenggat).toBe("2026-11-08");
  });
  it("kosong / null menghapus tenggat; bila memang belum ada, tidak menulis apa pun (aman sebelum SQL zq)", async () => {
    st.tenggat = "2026-11-08";
    await hasil(POST(req({ aturan, tenggat: "" })));
    expect(simpanTenggat).toHaveBeenCalledWith(expect.anything(), 7, null, "Budi");
    simpanTenggat.mockClear();
    st.tenggat = null;
    st.gagalTenggat = true;
    const r = await hasil(POST(req({ aturan, tenggat: null })));
    expect(r.status).toBe(200);
    expect(simpanTenggat).not.toHaveBeenCalled();
  });
  it("menolak tanggal tidak sah sebelum menyimpan apa pun; SQL zq belum dijalankan = 409 dengan petunjuk", async () => {
    const buruk = await hasil(POST(req({ aturan, tenggat: "08-11-2026" })));
    expect(buruk.status).toBe(400);
    expect(simpanAturan).not.toHaveBeenCalled();
    st.gagalTenggat = true;
    const r = await hasil(POST(req({ aturan, tenggat: "2026-11-08" })));
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toContain("20261102zq");
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
