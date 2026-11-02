// Menguji pemblokiran tahapan + jendela pribadi (izin buka kunci) pada route tes peserta. Akses data dipalsukan; aturan tahapan dan tes memakai kode asli.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));

const NOW = new Date("2026-11-09T10:00:00Z").getTime(); // 17.00 WIB; tes ditutup 16.00 WIB
const tutupAsli = "2026-11-09T09:00:00Z";
const st = {
  aturan: { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true },
  izinBaris: [] as Record<string, unknown>[],
  masukan: { video: { ada: false, tuntas: false }, vanguard: { ada: false, tuntas: false }, pretest: { ada: true, tuntas: false }, kuis: { ada: false, tuntas: false }, posttest: { ada: true, tuntas: false } },
  sesi: null as Record<string, unknown> | null,
};
const tesPost = { id: 2, kegiatan_id: 7, jenis: "posttest", judul: "Posttest", buka_at: "2026-11-09T02:00:00Z", tutup_at: tutupAsli, durasi_menit: 30, aktif: true, ulang_maks: 1, nilai_lulus: 70, wajib_lulus: false };
const susun = vi.fn(async (_db: unknown, tes: Record<string, unknown>) => ({ tes: { jenis: tes.jenis, buka_at: tes.buka_at, tutup_at: tes.tutup_at }, status: "buka" }));
const insertSesi = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/sigapTesDb", () => ({
  akunDariRequest: async () => ({ id: 11, nama: "Ani" }),
  dbAdmin: () => ({ from: () => ({ insert: insertSesi }) }),
  finalisasiBilaKedaluwarsa: async (_d: unknown, s: unknown) => s,
  finalisasiSesi: async () => ({}),
  idKegiatanPelatihan: async () => 7,
  muatSesi: async () => st.sesi,
  muatSoal: async () => [{ nomor: 1 }],
  muatTes: async () => ({ ...tesPost }),
  mulaiUlang: async () => ({ ok: true }),
  pesertaPelatihan: async () => ({ penugasan_id: 1, peran: "ppl", kelas: 1 }),
  susunKeadaan: (...a: Parameters<typeof susun>) => susun(...a),
  KOLOM_SESI_PUBLIK: "id",
}));
vi.mock("@/lib/sigapAturanDb", () => ({ muatAturan: async () => st.aturan }));
vi.mock("@/lib/sigapTahapanDb", () => {
  return {
    izinBerlakuPerTahap: (b: Record<string, unknown>[] | undefined, s: number) => {
      const cari = (t: string) => (b ?? []).find((x) => x.tahap === t && x.status === "disetujui" && new Date(String(x.berlaku_sampai)).getTime() > s) ?? null;
      return { pretest: cari("pretest"), posttest: cari("posttest") };
    },
    muatIzin: async () => ({ tersedia: true, peta: new Map([[11, st.izinBaris]]) }),
    muatTahapanBatch: async () => ({ aturan: st.aturan, tes: [], masukan: new Map([[11, st.masukan]]), kuis_ada: false }),
  };
});

import { GET, POST } from "../../app/api/sigap/pelatihan/tes/[jenis]/route";

const ctx = { params: Promise.resolve({ jenis: "posttest" }) };
const req = (body?: unknown) => ({ url: "http://x", json: async () => body }) as never;
const hasil = async (p: Promise<unknown>) => (await p) as { status: number; body: Record<string, unknown> };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  st.aturan = { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true };
  st.izinBaris = [];
  st.masukan = { video: { ada: false, tuntas: false }, vanguard: { ada: false, tuntas: false }, pretest: { ada: true, tuntas: false }, kuis: { ada: false, tuntas: false }, posttest: { ada: true, tuntas: false } };
  st.sesi = null;
  susun.mockClear();
  insertSesi.mockClear();
});

describe("GET keadaan", () => {
  it("blokir mati: tidak terkunci walau pretest belum dikerjakan", async () => {
    st.aturan.blokir_tahap = false;
    const r = await hasil(GET(req(), ctx));
    expect(r.body.terkunci).toBeNull();
  });
  it("blokir nyala dan pretest belum tuntas: posttest terkunci oleh Pretest, membawa status izin dan boleh_minta", async () => {
    const r = await hasil(GET(req(), ctx));
    expect(r.body.terkunci).toMatchObject({ oleh: "pretest", oleh_label: "Pretest", pesan: "Selesaikan Pretest dulu.", izin: null, boleh_minta: true });
  });
  it("pretest tuntas: tidak terkunci", async () => {
    st.masukan.pretest.tuntas = true;
    expect((await hasil(GET(req(), ctx))).body.terkunci).toBeNull();
  });
  it("status permintaan menunggu ikut dilaporkan; pengajuan dimatikan -> boleh_minta false", async () => {
    st.izinBaris = [{ tahap: "posttest", status: "menunggu", dibuat_at: new Date(NOW - 60_000).toISOString(), alasan: "Kendala HP" }];
    st.aturan.izin_ajukan = false;
    const r = await hasil(GET(req(), ctx));
    expect(r.body.terkunci).toMatchObject({ izin: { status: "menunggu", alasan: "Kendala HP" }, boleh_minta: false });
  });
  it("izin berlaku: tidak terkunci dan jendela tes diperpanjang sampai 23.59 WIB", async () => {
    st.izinBaris = [{ tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: new Date(NOW - 60_000).toISOString() }];
    const r = await hasil(GET(req(), ctx));
    expect(r.body.terkunci).toBeNull();
    const tesDipakai = susun.mock.calls[0][1] as { tutup_at: string };
    expect(tesDipakai.tutup_at).toBe("2026-11-09T16:59:59.000Z");
  });
  it("tanpa izin jendela tes tidak berubah", async () => {
    await GET(req(), ctx);
    expect((susun.mock.calls[0][1] as { tutup_at: string }).tutup_at).toBe(tutupAsli);
  });
});

describe("POST mulai", () => {
  it("terkunci: 409 dengan pesan dan rincian kunci, sesi tidak dibuat", async () => {
    const r = await hasil(POST(req({ aksi: "mulai" }), ctx));
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Selesaikan Pretest dulu.");
    expect(r.body.terkunci).toMatchObject({ oleh: "pretest" });
    expect(insertSesi).not.toHaveBeenCalled();
  });
  it("sesi sudah berjalan: dilanjutkan, tidak diputus oleh kunci", async () => {
    st.sesi = { id: 5, tes_id: 2, akun_id: 11 };
    const r = await hasil(POST(req({ aksi: "mulai" }), ctx));
    expect(r.status).toBe(200);
    expect(insertSesi).not.toHaveBeenCalled();
  });
  it("tidak terkunci tetapi jendela sudah tutup: 409 'sudah ditutup'", async () => {
    st.masukan.pretest.tuntas = true;
    const r = await hasil(POST(req({ aksi: "mulai" }), ctx));
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toContain("ditutup");
  });
  it("izin berlaku: boleh mulai walau jendela sudah tutup dan tahapan sebelumnya belum tuntas", async () => {
    st.izinBaris = [{ tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: new Date(NOW - 60_000).toISOString() }];
    const r = await hasil(POST(req({ aksi: "mulai" }), ctx));
    expect(r.status).toBe(200);
    expect(insertSesi).toHaveBeenCalledTimes(1);
    const isi = (insertSesi.mock.calls[0] as unknown as [Record<string, string>])[0];
    // batas_at = sekarang + 30 menit (tidak dipotong tutup_at asli yang sudah lewat)
    expect(new Date(isi.batas_at).getTime()).toBe(NOW + 30 * 60_000);
  });
  it("izin untuk tahapan lain tidak membuka posttest", async () => {
    st.izinBaris = [{ tahap: "pretest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: new Date(NOW - 60_000).toISOString() }];
    const r = await hasil(POST(req({ aksi: "mulai" }), ctx));
    expect(r.status).toBe(409);
    expect(r.body.terkunci).toBeTruthy();
  });
  it("izin kedaluwarsa tidak membuka", async () => {
    st.izinBaris = [{ tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-09T09:30:00.000Z", dibuat_at: new Date(NOW - 3600_000).toISOString() }];
    expect((await hasil(POST(req({ aksi: "mulai" }), ctx))).status).toBe(409);
  });
});
