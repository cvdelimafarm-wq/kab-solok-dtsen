// Menguji route /api/sigap/pelatihan/izin-buka: siapa boleh minta / membuka / memutuskan. Semua dependensi dipalsukan.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));

const st = {
  akun: { id: 1, nama: "Budi" } as { id: number; nama: string } | null,
  pengguna: { jenis: "panitia" } as { jenis: string; kelas?: number | null },
  peserta: {} as Record<number, { penugasan_id: number; peran: string; kelas: number | null } | null>,
  aturan: { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true },
  izin: null as null | { id: number; akun_id: number; tahap: string },
};
const ajukan = vi.fn(), buka = vi.fn(), putus = vi.fn(), menunggu = vi.fn(), audit = vi.fn();

vi.mock("@/lib/sigapTesDb", () => ({
  akunDariRequest: async () => st.akun,
  dbAdmin: () => ({}),
  idKegiatanPelatihan: async () => 7,
  pesertaPelatihan: async (_db: unknown, akunId: number) => st.peserta[akunId] ?? null,
}));
vi.mock("@/lib/sigapAkses", () => ({ izinAkun: async () => ({ izin: {} }), catatAudit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/sigapPelatihanBaruDb", () => ({ tentukanPengguna: async () => st.pengguna }));
const beritahu = { minta: vi.fn(), putus: vi.fn(), buka: vi.fn() };
vi.mock("@/lib/sigapIzinPush", () => ({
  beritahuIzinDiminta: (...a: unknown[]) => beritahu.minta(...a),
  beritahuIzinDiputuskan: (...a: unknown[]) => beritahu.putus(...a),
  beritahuIzinDibuka: (...a: unknown[]) => beritahu.buka(...a),
}));
vi.mock("@/lib/sigapAturanDb", () => ({ muatAturan: async () => st.aturan }));
vi.mock("@/lib/sigapTahapanDb", () => ({
  ajukanIzin: (...a: unknown[]) => ajukan(...a),
  bukaLangsung: (...a: unknown[]) => buka(...a),
  putuskanIzin: (...a: unknown[]) => putus(...a),
  daftarMenunggu: (...a: unknown[]) => menunggu(...a),
  ambilIzin: async () => st.izin,
}));

import { GET, POST } from "../../app/api/sigap/pelatihan/izin-buka/route";

const req = (body?: unknown) => ({ url: "http://x/api", json: async () => body }) as never;
const hasil = async (p: Promise<unknown>) => (await p) as { status: number; body: Record<string, unknown> };

beforeEach(() => {
  st.akun = { id: 1, nama: "Budi" };
  st.pengguna = { jenis: "panitia" };
  st.peserta = { 11: { penugasan_id: 1, peran: "ppl", kelas: 1 }, 12: { penugasan_id: 2, peran: "ppl", kelas: 2 } };
  st.aturan = { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true };
  st.izin = null;
  for (const f of [ajukan, buka, putus, menunggu, audit, beritahu.minta, beritahu.putus, beritahu.buka]) f.mockReset();
  beritahu.minta.mockResolvedValue(3);
  beritahu.putus.mockResolvedValue(1);
  beritahu.buka.mockResolvedValue(1);
  ajukan.mockResolvedValue({ ok: true, id: 1 });
  buka.mockResolvedValue({ ok: true, id: 2 });
  putus.mockResolvedValue({ ok: true, id: 1 });
  menunggu.mockResolvedValue([]);
});

describe("GET", () => {
  it("peserta biasa: bukan pengelola, daftar kosong (kartu tidak tampil)", async () => {
    st.pengguna = { jenis: "peserta" };
    const r = await hasil(GET(req()));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ pengelola: false, kelas: null, menunggu: [] });
    expect(menunggu).not.toHaveBeenCalled();
  });
  it("panitia: semua kelas (kelas null)", async () => {
    menunggu.mockResolvedValue([{ id: 1 }]);
    const r = await hasil(GET(req()));
    expect(r.body).toMatchObject({ pengelola: true, kelas: null, menunggu: [{ id: 1 }] });
    expect(menunggu).toHaveBeenCalledWith(expect.anything(), 7, null);
  });
  it("instruktur berkelas: dibatasi kelasnya", async () => {
    st.pengguna = { jenis: "instruktur", kelas: 2 };
    await GET(req());
    expect(menunggu).toHaveBeenCalledWith(expect.anything(), 7, 2);
  });
  it("tanpa sesi: 401", async () => {
    st.akun = null;
    expect((await hasil(GET(req()))).status).toBe(401);
  });
});

describe("POST minta (peserta)", () => {
  beforeEach(() => { st.akun = { id: 11, nama: "Ani" }; st.pengguna = { jenis: "peserta" }; });
  it("berhasil bila pengajuan aktif", async () => {
    const r = await hasil(POST(req({ aksi: "minta", tahap: "posttest", alasan: "Kendala HP / sinyal" })));
    expect(r.status).toBe(200);
    expect(ajukan).toHaveBeenCalledWith(expect.anything(), 7, 11, "posttest", "Kendala HP / sinyal");
    expect(audit).toHaveBeenCalled();
  });
  it("pengajuan dimatikan: 403 dan tidak menyimpan", async () => {
    st.aturan.izin_ajukan = false;
    const r = await hasil(POST(req({ aksi: "minta", tahap: "posttest", alasan: "Kendala HP" })));
    expect(r.status).toBe(403);
    expect(ajukan).not.toHaveBeenCalled();
  });
  it("bukan peserta: 403", async () => {
    st.akun = { id: 99, nama: "X" };
    expect((await hasil(POST(req({ aksi: "minta", tahap: "posttest", alasan: "Kendala HP" })))).status).toBe(403);
  });
  it("alasan kosong / tahap salah: 400", async () => {
    expect((await hasil(POST(req({ aksi: "minta", tahap: "posttest", alasan: "a" })))).status).toBe(400);
    expect((await hasil(POST(req({ aksi: "minta", tahap: "kuis", alasan: "Kendala HP" })))).status).toBe(400);
    expect(ajukan).not.toHaveBeenCalled();
  });
  it("permintaan yang sudah menunggu tidak diaudit ulang", async () => {
    ajukan.mockResolvedValue({ ok: true, id: 1, sudah: true });
    const r = await hasil(POST(req({ aksi: "minta", tahap: "pretest", alasan: "Terlambat datang" })));
    expect(r.body).toMatchObject({ ok: true, sudah_menunggu: true });
    expect(audit).not.toHaveBeenCalled();
  });
  it("peserta tidak bisa membuka kunci atau memutuskan", async () => {
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 12, tahap: "pretest", alasan: "Kendala HP" })))).status).toBe(403);
    expect((await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: true })))).status).toBe(403);
    expect(buka).not.toHaveBeenCalled();
    expect(putus).not.toHaveBeenCalled();
  });
});

describe("POST buka langsung (pengelola)", () => {
  it("panitia membuka untuk kelas mana pun", async () => {
    const r = await hasil(POST(req({ aksi: "buka", akun_id: 12, tahap: "pretest", alasan: "Terlambat datang" })));
    expect(r.status).toBe(200);
    expect(buka).toHaveBeenCalledWith(expect.anything(), 7, 12, "pretest", "Terlambat datang", "Budi", expect.any(Number));
  });
  it("instruktur kelas 1 tidak boleh membuka peserta kelas 2", async () => {
    st.pengguna = { jenis: "instruktur", kelas: 1 };
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 12, tahap: "pretest", alasan: "Kendala HP" })))).status).toBe(403);
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 11, tahap: "pretest", alasan: "Kendala HP" })))).status).toBe(200);
  });
  it("instruktur tanpa kelas terkunci boleh semua kelas (sama dengan absen)", async () => {
    st.pengguna = { jenis: "instruktur", kelas: null };
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 12, tahap: "posttest", alasan: "Kendala HP" })))).status).toBe(200);
  });
  it("akun bukan peserta: 404; alasan hilang: 400", async () => {
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 77, tahap: "pretest", alasan: "Kendala HP" })))).status).toBe(404);
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 11, tahap: "pretest" })))).status).toBe(400);
  });
  it("pembukaan langsung tetap bisa walau pengajuan petugas dimatikan", async () => {
    st.aturan.izin_ajukan = false;
    expect((await hasil(POST(req({ aksi: "buka", akun_id: 11, tahap: "pretest", alasan: "Kendala HP" })))).status).toBe(200);
  });
  it("galat penyimpanan diteruskan 500 dengan pesan", async () => {
    buka.mockResolvedValue({ ok: false, pesan: "Tabel izin buka kunci belum ada" });
    const r = await hasil(POST(req({ aksi: "buka", akun_id: 11, tahap: "pretest", alasan: "Kendala HP" })));
    expect(r).toMatchObject({ status: 500, body: { error: "Tabel izin buka kunci belum ada" } });
  });
});

describe("POST putuskan (pengelola)", () => {
  it("setuju oleh panitia", async () => {
    st.izin = { id: 1, akun_id: 11, tahap: "posttest" };
    const r = await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: true })));
    expect(r.status).toBe(200);
    expect(putus).toHaveBeenCalledWith(expect.anything(), 7, 1, true, "Budi", expect.any(Number));
    expect(audit).toHaveBeenCalledWith(expect.anything(), 1, "pelatihan_izin_disetujui", expect.objectContaining({ akun_id: 11 }));
  });
  it("tolak dicatat sebagai ditolak", async () => {
    st.izin = { id: 1, akun_id: 11, tahap: "posttest" };
    await POST(req({ aksi: "putuskan", id: 1, setuju: false }));
    expect(audit).toHaveBeenCalledWith(expect.anything(), 1, "pelatihan_izin_ditolak", expect.anything());
  });
  it("instruktur kelas lain: 403", async () => {
    st.pengguna = { jenis: "instruktur", kelas: 1 };
    st.izin = { id: 1, akun_id: 12, tahap: "posttest" };
    expect((await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: true })))).status).toBe(403);
    expect(putus).not.toHaveBeenCalled();
  });
  it("sudah diputuskan: 409; tidak ada: 404; keputusan tidak valid: 400", async () => {
    st.izin = { id: 1, akun_id: 11, tahap: "posttest" };
    putus.mockResolvedValue({ ok: false, pesan: "Permintaan ini sudah diputuskan." });
    expect((await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: true })))).status).toBe(409);
    st.izin = null;
    expect((await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: true })))).status).toBe(404);
    expect((await hasil(POST(req({ aksi: "putuskan", id: 1, setuju: "ya" })))).status).toBe(400);
  });
});

describe("umum", () => {
  it("aksi tidak dikenal: 400; badan rusak: 400", async () => {
    expect((await hasil(POST(req({ aksi: "hapus" })))).status).toBe(400);
    expect((await hasil(POST({ url: "x", json: async () => { throw new Error("x"); } } as never))).status).toBe(400);
  });
});

describe("notifikasi (Tahap G)", () => {
  it("minta: kabari panitia/instruktur dengan data peserta, kelas, tahap dan alasan", async () => {
    st.akun = { id: 11, nama: "Ani" }; st.pengguna = { jenis: "peserta" };
    const r = await hasil(POST(req({ aksi: "minta", tahap: "posttest", alasan: "Kendala HP / sinyal" })));
    expect(beritahu.minta).toHaveBeenCalledWith(expect.anything(), 7, { id: 11, nama: "Ani", kelas: 1 }, "posttest", "Kendala HP / sinyal", 1);
    expect(r.body).toMatchObject({ ok: true, diberitahu: 3 });
  });
  it("minta yang sudah menunggu tidak mengirim ulang", async () => {
    st.akun = { id: 11, nama: "Ani" }; st.pengguna = { jenis: "peserta" };
    ajukan.mockResolvedValue({ ok: true, id: 1, sudah: true });
    await POST(req({ aksi: "minta", tahap: "pretest", alasan: "Terlambat datang" }));
    expect(beritahu.minta).not.toHaveBeenCalled();
  });
  it("putuskan: peserta yang mengajukan dikabari (setuju / tolak)", async () => {
    st.izin = { id: 5, akun_id: 11, tahap: "posttest" };
    await POST(req({ aksi: "putuskan", id: 5, setuju: true }));
    expect(beritahu.putus).toHaveBeenCalledWith(expect.anything(), 11, true, "posttest", "Budi", 5);
    await POST(req({ aksi: "putuskan", id: 5, setuju: false }));
    expect(beritahu.putus).toHaveBeenLastCalledWith(expect.anything(), 11, false, "posttest", "Budi", 5);
  });
  it("putuskan gagal (sudah diputuskan): tidak mengirim", async () => {
    st.izin = { id: 5, akun_id: 11, tahap: "posttest" };
    putus.mockResolvedValue({ ok: false, pesan: "Permintaan ini sudah diputuskan." });
    await POST(req({ aksi: "putuskan", id: 5, setuju: true }));
    expect(beritahu.putus).not.toHaveBeenCalled();
  });
  it("buka langsung: peserta bersangkutan dikabari; gagal simpan tidak mengirim", async () => {
    await POST(req({ aksi: "buka", akun_id: 12, tahap: "pretest", alasan: "Terlambat datang" }));
    expect(beritahu.buka).toHaveBeenCalledWith(expect.anything(), 12, "pretest", "Budi");
    beritahu.buka.mockClear();
    buka.mockResolvedValue({ ok: false, pesan: "x" });
    await POST(req({ aksi: "buka", akun_id: 12, tahap: "pretest", alasan: "Terlambat datang" }));
    expect(beritahu.buka).not.toHaveBeenCalled();
  });
});
