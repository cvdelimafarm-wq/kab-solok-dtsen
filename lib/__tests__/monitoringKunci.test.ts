// Menguji bagian "kunci" dan "izin" pada route Monitoring (tab 5): kapan sebuah tes dilaporkan terkunci, dan siapa yang boleh membuka kunci.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}));

const NOW = new Date("2026-11-09T04:00:00Z").getTime();
const st = {
  pengguna: { jenis: "panitia" } as { jenis: string; kelas?: number | null; akun_id?: number },
  aturan: { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true },
  simpul: [
    { akun_id: 11, nama: "Ani", peran: "ppl", atasan_akun_id: null, kelas: 1 },
    { akun_id: 12, nama: "Beni", peran: "ppl", atasan_akun_id: null, kelas: 1 },
  ],
  masukan: new Map<number, Record<string, { ada: boolean; tuntas: boolean }>>(),
  tes: [] as Record<string, unknown>[],
  izin: new Map<number, Record<string, unknown>[]>(),
};
const dasar = (pretest: boolean, posttest = false) => ({ video: { ada: false, tuntas: false }, vanguard: { ada: false, tuntas: false }, pretest: { ada: true, tuntas: pretest }, kuis: { ada: false, tuntas: false }, posttest: { ada: true, tuntas: posttest } });
const tesBuka = (jenis: string, bukaAt: string) => ({ id: jenis === "pretest" ? 1 : 2, jenis, aktif: true, wajib_100: false, buka_at: bukaAt, tutup_at: "2026-11-09T09:00:00Z" });

vi.mock("@/lib/sigapTesDb", () => ({ akunDariRequest: async () => ({ id: 1, nama: "P" }), dbAdmin: () => ({}), idKegiatanPelatihan: async () => 7, pesertaPelatihan: async () => ({ penugasan_id: 1, peran: "ppl", kelas: 1 }) }));
vi.mock("@/lib/sigapAkses", () => ({ izinAkun: async () => ({ izin: {} }) }));
vi.mock("@/lib/sigapAturanDb", () => ({ muatAturan: async () => st.aturan }));
vi.mock("@/lib/sigapNilai", () => ({ muatNilaiAkhir: async () => ({ per: new Map(), aturan: st.aturan }) }));
vi.mock("@/lib/sigapPelatihanBaruDb", () => ({
  tentukanPengguna: async () => st.pengguna,
  muatSimpulHierarki: async () => ({ tersedia: true, simpul: st.simpul }),
  muatProgres: async (_d: unknown, _k: number, ids: number[]) => new Map(ids.map((i) => [i, { undangan: "terima", pretest: { status: "belum", skor: null }, posttest: { status: "belum", skor: null }, hadir: false }])),
}));
vi.mock("@/lib/sigapTahapanDb", () => ({
  muatIzin: async () => ({ tersedia: true, peta: st.izin }),
  muatTahapanBatch: async () => ({ aturan: st.aturan, tes: st.tes, masukan: st.masukan, kuis_ada: false }),
}));

import { GET } from "../../app/api/sigap/pelatihan/monitoring/route";

type Baris = { akun_id: number; kunci: { tahap: string; pesan: string }[]; izin: { pretest: string | null; posttest: string | null } };
const ambil = async () => (await GET({ url: "http://x" } as never)) as unknown as { status: number; body: { baris: Baris[]; ringkasan: Record<string, number>; boleh_buka_kunci: boolean; blokir_tahap: boolean } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  st.pengguna = { jenis: "panitia" };
  st.aturan = { versi: 2, blokir_tahap: true, izin_ajukan: true, eksplisit: true };
  st.masukan = new Map([[11, dasar(false)], [12, dasar(true)]]);
  st.tes = [tesBuka("pretest", "2026-11-09T01:00:00Z"), tesBuka("posttest", "2026-11-09T02:00:00Z")];
  st.izin = new Map();
});

describe("Monitoring: kunci dan izin", () => {
  it("posttest terbuka tetapi pretest belum selesai: baris dilaporkan terkunci; yang pretest-nya selesai tidak", async () => {
    const r = await ambil();
    const ani = r.body.baris.find((b) => b.akun_id === 11)!;
    const beni = r.body.baris.find((b) => b.akun_id === 12)!;
    expect(ani.kunci).toEqual([{ tahap: "posttest", oleh: "pretest", oleh_label: "Pretest", pesan: "Selesaikan Pretest dulu." }]);
    expect(beni.kunci).toEqual([]);
    expect(r.body.ringkasan.terkunci).toBe(1);
    expect(r.body.blokir_tahap).toBe(true);
  });
  it("posttest belum dibuka jadwalnya: belum dihitung terkunci (semua orang memang belum bisa)", async () => {
    st.tes = [tesBuka("pretest", "2026-11-09T01:00:00Z"), tesBuka("posttest", "2026-11-09T06:00:00Z")];
    const r = await ambil();
    expect(r.body.baris.find((b) => b.akun_id === 11)!.kunci).toEqual([]);
    expect(r.body.ringkasan.terkunci).toBe(0);
  });
  it("blokir mati: tidak ada kunci sama sekali, tombol tetap tersedia bagi pengelola", async () => {
    st.aturan.blokir_tahap = false;
    const r = await ambil();
    expect(r.body.baris.every((b) => b.kunci.length === 0)).toBe(true);
    expect(r.body.boleh_buka_kunci).toBe(true);
  });
  it("izin berlaku membuka kunci dan tampil sebagai status 'disetujui'; permintaan menunggu dihitung", async () => {
    st.izin = new Map([
      [11, [{ tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: new Date(NOW - 60_000).toISOString() }]],
      [12, [{ tahap: "pretest", status: "menunggu", dibuat_at: new Date(NOW - 60_000).toISOString() }]],
    ]);
    const r = await ambil();
    const ani = r.body.baris.find((b) => b.akun_id === 11)!;
    expect(ani.kunci).toEqual([]);
    expect(ani.izin.posttest).toBe("disetujui");
    expect(r.body.baris.find((b) => b.akun_id === 12)!.izin.pretest).toBe("menunggu");
    expect(r.body.ringkasan.izin_menunggu).toBe(1);
    expect(r.body.ringkasan.terkunci).toBe(0);
  });
  it("peserta (korwil/PML/PPL) melihat kunci bawahannya tetapi tidak boleh membuka kunci", async () => {
    st.pengguna = { jenis: "peserta", akun_id: 11 };
    const r = await ambil();
    expect(r.body.boleh_buka_kunci).toBe(false);
  });
  it("instruktur boleh membuka kunci", async () => {
    st.pengguna = { jenis: "instruktur", kelas: 1 };
    expect((await ambil()).body.boleh_buka_kunci).toBe(true);
  });
  it("galat saat menghitung tahapan: Monitoring tetap tampil tanpa kunci", async () => {
    st.masukan = undefined as never;
    const r = await ambil();
    expect(r.status).toBe(200);
    expect(r.body.baris).toHaveLength(2);
  });
});
