// Menguji route /api/sigap/pelatihan/materi: siapa boleh membaca / melapor / mengelola, validasi masukan, bentuk jawaban. Semua dependensi dipalsukan.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));

const st = {
  akun: { id: 11, nama: "Ani" } as { id: number; nama: string } | null,
  peserta: { penugasan_id: 1, peran: "ppl", kelas: 1 } as { penugasan_id: number; peran: string; kelas: number | null } | null,
  lihat: false,
  kelola: false,
  materi: [] as Record<string, unknown>[],
  tersedia: true,
  progres: new Map<number, Map<number, unknown>>(),
};
const lapor = vi.fn(), buka = vi.fn(), manual = vi.fn(), simpan = vi.fn(), sembunyi = vi.fn(), audit = vi.fn();

vi.mock("@/lib/sigapTesDb", () => ({
  akunDariRequest: async () => st.akun,
  dbAdmin: () => ({}),
  idKegiatanPelatihan: async () => 7,
  pesertaPelatihan: async () => st.peserta,
}));
vi.mock("@/lib/sigapAkses", () => ({
  izinAkun: async () => ({ izin: {} }),
  boleh: (_i: unknown, _m: string, level: string) => (level === "lihat" ? st.lihat || st.kelola : st.kelola),
  catatAudit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/sigapMateriDb", () => ({
  muatMateri: async () => ({ tersedia: st.tersedia, materi: st.materi }),
  muatProgresBatch: async () => st.progres,
  laporPutar: (...a: unknown[]) => lapor(...a),
  catatBuka: (...a: unknown[]) => buka(...a),
  catatManual: (...a: unknown[]) => manual(...a),
  simpanMateri: (...a: unknown[]) => simpan(...a),
  nonaktifkanMateri: (...a: unknown[]) => sembunyi(...a),
}));

import { GET, POST } from "../../app/api/sigap/pelatihan/materi/route";

const req = (body?: unknown) => ({ url: "http://x/api", json: async () => body }) as never;
const hasil = async (p: Promise<unknown>) => (await p) as { status: number; body: Record<string, unknown> };
const prog = { segmen: [], detik_unik: 40, selesai_at: null, selesai_manual: false, putar_terakhir_at: null };

beforeEach(() => {
  st.akun = { id: 11, nama: "Ani" };
  st.peserta = { penugasan_id: 1, peran: "ppl", kelas: 1 };
  st.lihat = false; st.kelola = false; st.tersedia = true; st.progres = new Map();
  st.materi = [
    { id: 1, urutan: 1, jenis: "video", judul: "Pengantar", url: "https://youtu.be/dQw4w9WgXcQ", youtube_id: "dQw4w9WgXcQ", durasi_detik: 100, wajib: true, aktif: true },
    { id: 2, urutan: 2, jenis: "tautan", judul: "Buku pedoman", url: "https://x.id/a", youtube_id: null, durasi_detik: null, wajib: true, aktif: true },
  ];
  for (const f of [lapor, buka, manual, simpan, sembunyi, audit]) f.mockReset();
  lapor.mockResolvedValue({ ok: true, progres: { ...prog }, selesai_baru: false, dipangkas: false, durasi: 100 });
  buka.mockResolvedValue({ ok: true, progres: { ...prog, selesai_at: "2026-11-09T04:00:00Z" } });
  manual.mockResolvedValue({ ok: true, progres: { ...prog, selesai_at: "2026-11-09T04:00:00Z", selesai_manual: true } });
  simpan.mockResolvedValue({ ok: true, id: 9 });
  sembunyi.mockResolvedValue({ ok: true, judul: "Pengantar" });
});

describe("GET", () => {
  it("peserta: daftar materi dengan progres sendiri dan ringkasan wajib", async () => {
    st.progres = new Map([[11, new Map([[1, { ...prog, detik_unik: 50 }]])]]);
    const r = await hasil(GET(req()));
    expect(r.status).toBe(200);
    const b = r.body as { materi: { id: number; progres: { persen: number; selesai: boolean } }[]; ringkasan: Record<string, unknown>; bisa_lapor: boolean; boleh_kelola: boolean };
    expect(b.bisa_lapor).toBe(true);
    expect(b.boleh_kelola).toBe(false);
    expect(b.materi[0].progres).toMatchObject({ persen: 50, selesai: false });
    expect(b.materi[1].progres).toMatchObject({ persen: 0, selesai: false });
    expect(b.ringkasan).toMatchObject({ wajib_total: 2, belum: 2, video_wajib_ada: true });
  });
  it("pengelola bukan peserta: melihat daftar tanpa progres, tidak bisa melapor", async () => {
    st.peserta = null; st.lihat = true;
    const b = (await hasil(GET(req()))).body as { materi: { progres: unknown }[]; bisa_lapor: boolean };
    expect(b.bisa_lapor).toBe(false);
    expect(b.materi.every((m) => m.progres === null)).toBe(true);
  });
  it("bukan peserta dan tanpa izin: 403; tanpa sesi: 401", async () => {
    st.peserta = null;
    expect((await hasil(GET(req()))).status).toBe(403);
    st.akun = null;
    expect((await hasil(GET(req()))).status).toBe(401);
  });
  it("SQL belum dijalankan: 200, tersedia=false, daftar kosong", async () => {
    st.tersedia = false; st.materi = [];
    const r = await hasil(GET(req()));
    expect(r).toMatchObject({ status: 200, body: { tersedia: false, materi: [] } });
  });
});

describe("POST peserta", () => {
  it("lapor: meneruskan laporan yang sudah diperiksa", async () => {
    const r = await hasil(POST(req({ aksi: "lapor", materi_id: 1, segmen: [[0, 5], [6, 10]], durasi: 100 })));
    expect(r.status).toBe(200);
    expect(lapor).toHaveBeenCalledWith(expect.anything(), 7, 11, { materi_id: 1, segmen: [[0, 5], [6, 10]], durasi: 100 }, expect.any(Number));
    expect(r.body).toMatchObject({ ok: true, selesai_baru: false, dipangkas: false });
  });
  it("lapor tidak valid: 400 dan tidak menyimpan", async () => {
    for (const b of [{ aksi: "lapor", materi_id: 1, segmen: [] }, { aksi: "lapor", materi_id: 1, segmen: [[5, 5]] }, { aksi: "lapor", materi_id: 1, segmen: [[0, 99]] }, { aksi: "lapor", segmen: [[0, 5]] }]) {
      expect((await hasil(POST(req(b)))).status).toBe(400);
    }
    expect(lapor).not.toHaveBeenCalled();
  });
  it("galat dari lapisan DB diteruskan dengan status-nya", async () => {
    lapor.mockResolvedValue({ ok: false, pesan: "Materi tidak ditemukan.", status: 404 });
    expect(await hasil(POST(req({ aksi: "lapor", materi_id: 1, segmen: [[0, 5]] })))).toMatchObject({ status: 404, body: { error: "Materi tidak ditemukan." } });
  });
  it("buka tautan dan tandai manual", async () => {
    expect(await hasil(POST(req({ aksi: "buka", materi_id: 2 })))).toMatchObject({ status: 200, body: { ok: true, progres: { selesai: true, manual: false } } });
    expect(buka).toHaveBeenCalledWith(expect.anything(), 7, 11, 2, expect.any(Number));
    expect(await hasil(POST(req({ aksi: "manual", materi_id: 1 })))).toMatchObject({ status: 200, body: { progres: { selesai: true, manual: true } } });
    expect((await hasil(POST(req({ aksi: "buka", materi_id: "x" })))).status).toBe(400);
  });
  it("bukan peserta (mis. pengelola) tidak dicatat progresnya: 403", async () => {
    st.peserta = null; st.kelola = true;
    for (const b of [{ aksi: "lapor", materi_id: 1, segmen: [[0, 5]] }, { aksi: "buka", materi_id: 2 }, { aksi: "manual", materi_id: 1 }]) expect((await hasil(POST(req(b)))).status).toBe(403);
    expect(lapor).not.toHaveBeenCalled();
  });
});

describe("POST pengelola", () => {
  beforeEach(() => { st.kelola = true; });
  const isi = { aksi: "simpan", jenis: "video", judul: "Pengantar Seruti", url: "https://youtu.be/dQw4w9WgXcQ", wajib: true };
  it("simpan: diperiksa, disimpan, diaudit", async () => {
    const r = await hasil(POST(req(isi)));
    expect(r).toMatchObject({ status: 200, body: { ok: true, id: 9 } });
    expect(simpan).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ jenis: "video", youtube_id: "dQw4w9WgXcQ", wajib: true }), "Ani");
    expect(audit).toHaveBeenCalledWith(expect.anything(), 11, "pelatihan_materi_simpan", expect.objectContaining({ materi_id: 9 }));
  });
  it("isian salah: 400 (bukan YouTube, judul pendek)", async () => {
    expect((await hasil(POST(req({ ...isi, url: "https://vimeo.com/1" })))).status).toBe(400);
    expect((await hasil(POST(req({ ...isi, judul: "ab" })))).status).toBe(400);
    expect(simpan).not.toHaveBeenCalled();
  });
  it("sembunyikan: diaudit; id salah 400; tidak ada 404", async () => {
    expect((await hasil(POST(req({ aksi: "sembunyikan", id: 1 })))).status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 11, "pelatihan_materi_sembunyikan", expect.objectContaining({ materi_id: 1 }));
    expect((await hasil(POST(req({ aksi: "sembunyikan", id: 0 })))).status).toBe(400);
    sembunyi.mockResolvedValue({ ok: false, pesan: "Materi tidak ditemukan.", status: 404 });
    expect((await hasil(POST(req({ aksi: "sembunyikan", id: 99 })))).status).toBe(404);
  });
  it("tanpa izin kelola: 403 (peserta biasa tidak bisa menambah / menyembunyikan)", async () => {
    st.kelola = false;
    expect((await hasil(POST(req(isi)))).status).toBe(403);
    expect((await hasil(POST(req({ aksi: "sembunyikan", id: 1 })))).status).toBe(403);
    expect(simpan).not.toHaveBeenCalled();
    expect(sembunyi).not.toHaveBeenCalled();
  });
});

describe("umum", () => {
  it("aksi tidak dikenal 400; badan rusak 400; tanpa sesi 401", async () => {
    st.kelola = true;
    expect((await hasil(POST(req({ aksi: "hapus" })))).status).toBe(400);
    expect((await hasil(POST({ url: "x", json: async () => { throw new Error("x"); } } as never))).status).toBe(400);
    st.akun = null;
    expect((await hasil(POST(req({ aksi: "buka", materi_id: 2 })))).status).toBe(401);
  });
});
