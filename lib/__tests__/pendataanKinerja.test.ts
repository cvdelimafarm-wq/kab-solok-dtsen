import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Uji modul server Fase 2-4 dengan Db palsu (hanya baca) dan OSRM palsu.
const tabel: Record<string, any[]> = {};
function pembangun(nama: string) {
  let baris = [...(tabel[nama] ?? [])];
  const q: any = {
    select: () => q,
    eq: (k: string, v: any) => ((baris = baris.filter((r) => r[k] === v)), q),
    in: (k: string, vs: any[]) => ((baris = baris.filter((r) => vs.includes(r[k]))), q),
    not: (k: string, _op: string, v: any) => ((baris = baris.filter((r) => r[k] !== v)), q),
    gte: (k: string, v: string) => ((baris = baris.filter((r) => r[k] >= v)), q),
    order: () => q,
    range: (a: number, b: number) => ((baris = baris.slice(a, b + 1)), q),
    then: (ok: any, ng: any) => Promise.resolve({ data: baris, error: null }).then(ok, ng),
  };
  return q;
}
const db: any = { from: (t: string) => pembangun(t) };

const lapBaris = (akun: number, nama: string, peran: string, pml: number | null, tanggal: string, o: any = {}) => ({ akun_id: akun, nama, peran, pml_id: pml, pml_nama: pml ? "PML Satu" : null, tanggal, sub_idf: 0, kk_berhasil: 0, kk_tdk_ditemukan: 0, agg_sub: 0, agg_kk: 0, hari_kerja: true, ada_laporan: true, jumlah_foto: 5, ...o });

vi.mock("@/lib/portal/lapangan", () => ({
  monitoringLapangan: async () => ({
    aturan: { jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 },
    kegiatan: { id: 1, nama: "x" },
    baris: [
      lapBaris(111, "Ani", "ppl", 1, "2026-10-15", { kk_berhasil: 10 }),
      lapBaris(111, "Ani", "ppl", 1, "2026-10-16", { kk_berhasil: 2, ada_laporan: false, jumlah_foto: 0 }),
      lapBaris(112, "Budi", "ppl", 1, "2026-10-15"),
      lapBaris(101, "PML Satu", "pml", 1, "2026-10-15", { sub_idf: 1 }),
    ],
  }),
}));
vi.mock("@/lib/portal/pendataanMonitor", () => ({
  muatMonitoringPendataan: async () => ({
    data: { sekarang: "", tim: [], total: {}, ppl: [{ petugas_id: 11, akun_id: 111, nama: "Ani", pml_id: 1, pml_nama: "PML Satu", target: 50, hasil: { terdampak: 8, tidak_terdampak: 4, tidak_ditemukan: 1 } }, { petugas_id: 12, akun_id: 112, nama: "Budi", pml_id: 1, pml_nama: "PML Satu", target: 50, hasil: { terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 } }] },
    mentah: {
      petugas: [{ petugas_id: 1, nama: "PML Satu", peran: "pml", atasan_id: null, akun_ids: [101] }, { petugas_id: 11, nama: "Ani", peran: "ppl", atasan_id: 1, akun_ids: [111] }, { petugas_id: 12, nama: "Budi", peran: "ppl", atasan_id: 1, akun_ids: [112] }],
      sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S2", pml_id: 1 }],
      nonaktif: new Set<string>(),
      baris: [{ pml_id: 1, idsubsls: "S1", ppl_akun_id: null, hasil: null, jumlah: 30 }, { pml_id: 1, idsubsls: "S2", ppl_akun_id: null, hasil: null, jumlah: 10 }],
      idf: [],
    },
  }),
}));

const waktu = (iso: string) => iso;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T05:00:00Z")); // 16 Okt 12:00 WIB
  tabel.sigap_akun = [{ id: 111, domisili_lat: -0.8, domisili_lng: 100.6 }, { id: 112, domisili_lat: null, domisili_lng: null }];
  tabel.sigap_kegiatan_tarif = [{ kegiatan_id: 1, peran: "ppl", tarif: 170000, kuota_ok: 3458 }, { kegiatan_id: 1, peran: "pml", tarif: 170000, kuota_ok: 980 }];
  tabel.bencana_pendataan_kk = [
    // marks Ani 15 Okt (WIB): 2 terdampak S1, 1 tidak terdampak S2 ; 16 Okt: 1 terdampak S1
    { id: 1, idsubsls: "S1", hasil: "terdampak", status_at: "2026-10-15T02:00:00Z", ppl_akun_id: 111, aktif: true, lat: -0.8, lng: 100.7 },
    { id: 2, idsubsls: "S1", hasil: "terdampak", status_at: "2026-10-15T03:00:00Z", ppl_akun_id: 111, aktif: true, lat: -0.8, lng: 100.7 },
    { id: 3, idsubsls: "S2", hasil: "tidak_terdampak", status_at: "2026-10-15T04:00:00Z", ppl_akun_id: 111, aktif: true, lat: -0.8, lng: 100.8 },
    { id: 4, idsubsls: "S1", hasil: "terdampak", status_at: "2026-10-16T01:00:00Z", ppl_akun_id: 111, aktif: true, lat: -0.8, lng: 100.7 },
    { id: 5, idsubsls: "S1", hasil: "terdampak", status_at: "2026-10-09T01:00:00Z", ppl_akun_id: 111, aktif: true, lat: -0.8, lng: 100.7 }, // sebelum mulai
    { id: 6, idsubsls: "S1", hasil: null, status_at: null, ppl_akun_id: null, aktif: true, lat: -0.8, lng: 100.7 },
  ];
  const m = await import("@/lib/portal/pendataanKinerja");
  m._kosongkanCache();
  delete process.env.OSRM_BASE_URL;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.OSRM_BASE_URL;
});

describe("kinerjaPendataan", () => {
  it("menghitung KK per tanggal WIB, hari kerja, lengkap, dan sisa KK (tanpa OSRM -> perkiraan)", async () => {
    const { kinerjaPendataan } = await import("@/lib/portal/pendataanKinerja");
    const d = await kinerjaPendataan(db, true);
    expect(d.hari_ini).toBe("2026-10-16");
    expect(d.osrm).toBe(false);
    expect(d.tarif.ppl).toBe(170000);
    expect(d.kuota.ppl).toBe(3458);
    const ani = d.orang.find((o) => o.nama === "Ani")!;
    expect(ani.sisa_kk).toBe(38); // 50 - (8 + 4)
    expect(ani.rumah_ke_sisa_km).not.toBeNull();
    const h15 = ani.hari.find((h) => h.tanggal === "2026-10-15")!;
    expect(h15).toMatchObject({ terdampak: 2, tidak_terdampak: 1, lengkap: true, aktif: true, metode: "perkiraan" });
    expect(h15.km).toBeGreaterThan(0);
    const h16 = ani.hari.find((h) => h.tanggal === "2026-10-16")!;
    expect(h16).toMatchObject({ terdampak: 1, lengkap: false, ada_laporan: false });
    // Budi tanpa koordinat rumah
    const budi = d.orang.find((o) => o.nama === "Budi")!;
    expect(budi.hari[0]).toMatchObject({ terdampak: 0, metode: "tidak_ada" });
    const pml = d.orang.find((o) => o.peran === "pml")!;
    expect(pml.hari[0].aktif).toBe(true);
  });

  it("OSRM tersedia: jarak jalan dipakai dan disimpan di cache", async () => {
    process.env.OSRM_BASE_URL = "http://osrm.test";
    const fetchPalsu = vi.fn(async () => ({ ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 12345 }] }) }) as any);
    vi.stubGlobal("fetch", fetchPalsu);
    const { kinerjaPendataan } = await import("@/lib/portal/pendataanKinerja");
    const d = await kinerjaPendataan(db, true);
    expect(d.osrm).toBe(true);
    expect(d.tertunda).toBe(0);
    const h15 = d.orang.find((o) => o.nama === "Ani")!.hari.find((h) => h.tanggal === "2026-10-15")!;
    expect(h15).toMatchObject({ metode: "jalan", km: 12.35 });
    const panggilan = fetchPalsu.mock.calls.length;
    expect(panggilan).toBeGreaterThanOrEqual(2);
    await kinerjaPendataan(db, true); // dari cache jalan
    expect(fetchPalsu.mock.calls.length).toBe(panggilan);
    vi.unstubAllGlobals();
  });

  it("OSRM gagal: kembali ke perkiraan tanpa merusak data", async () => {
    process.env.OSRM_BASE_URL = "http://osrm.test";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("jaringan"); }));
    const { kinerjaPendataan } = await import("@/lib/portal/pendataanKinerja");
    const d = await kinerjaPendataan(db, true);
    const h15 = d.orang.find((o) => o.nama === "Ani")!.hari.find((h) => h.tanggal === "2026-10-15")!;
    expect(h15.metode).toBe("perkiraan");
    expect(d.tertunda).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
