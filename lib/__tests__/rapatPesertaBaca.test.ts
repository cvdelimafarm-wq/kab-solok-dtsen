import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ambilRapatPeserta, hadirRapatPeserta, jembatanPresensiPelatihan } from "../portal/rapatPeserta";

// sigapTesDb memuat klien Supabase saat diimpor; pengujian ini memakai basis data tiruan sehingga klien asli tidak diperlukan.
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

type Tabel = Record<string, { data: unknown; count?: number; errorInsert?: unknown }>;
function dbTiruan(t: Tabel) {
  const catat: Record<string, unknown[]> = {};
  const db = {
    from(nama: string) {
      const h = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "is", "in", "gte", "or", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(h.data) ? (h.data[0] ?? null) : h.data, error: null });
      q.insert = async (baris: unknown) => {
        (catat[nama] ??= []).push(baris);
        return { error: h.errorInsert ?? null };
      };
      q.then = (res: (v: unknown) => unknown) => res({ data: h.data, count: h.count ?? 0, error: null });
      return q;
    },
  } as never;
  return { db, catat };
}

const rapat = (o: Record<string, unknown> = {}) => ({
  id: 7, judul: "Pelatihan hari 1", aktif: true, mulai_at: "2026-11-02T02:00:00.000Z", selesai_at: "2026-11-02T03:30:00.000Z", tautan: null, meeting_id: null, passcode: null, token: "psp2026",
  buka_menit: 15, tutup_menit: 30, sasaran_peran: "semua", sasaran_kegiatan_id: 5, akun_tambahan: [], ...o,
});
const pengaturan = { presensi_buka_at: "2026-11-02T01:00:00.000Z", presensi_tutup_at: "2026-11-02T05:00:00.000Z", presensi_sesi: [{ nama: "Sesi 1", buka: "08:00", tutup: "12:00" }], akurasi_maks_m: 100, tempat: null, presensi_susulan_sampai: null };
const dasar = (): Tabel => ({
  sigap_rapat: { data: [rapat()] },
  sigap_penugasan: { data: [{ id: 9, peran: "ppl", kelas: 1 }] },
  sigap_rapat_hadir: { data: [] },
  sigap_rapat_coba: { data: [], count: 0 },
  sigap_kegiatan: { data: [{ jenis: "pelatihan", tanggal_mulai: "2026-11-02", tanggal_selesai: "2026-11-02" }] },
  sigap_pelatihan_pengaturan: { data: [pengaturan] },
  sigap_pelatihan_titik: { data: [] },
  sigap_pelatihan_presensi: { data: [] },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T02:15:00.000Z")); // 09.15 WIB, di dalam rapat 09.00-10.30
});
afterEach(() => vi.useRealTimers());

describe("hadirRapatPeserta", () => {
  it("token benar pada rapat pelatihan: hadir tercatat dan presensi sesi ikut tercatat", async () => {
    const { db, catat } = dbTiruan(dasar());
    const j = await hadirRapatPeserta(db, 1, { rapat_id: 7, token: " PSP2026 " }, 5);
    expect(j.status).toBe(200);
    expect(j.json).toMatchObject({ ok: true, sudah: false, presensi_sesi: "Sesi 1" });
    expect(catat.sigap_rapat_hadir).toHaveLength(1);
    expect(catat.sigap_pelatihan_presensi).toHaveLength(1);
    expect(catat.sigap_pelatihan_presensi[0]).toMatchObject({ kegiatan_id: 5, akun_id: 1, penugasan_id: 9, tanggal: "2026-11-02", sesi_no: 1, diterima: true, terlambat: false, manual: false, titik_nama: "Zoom (token rapat)" });
  });
  it("token salah: ditolak 422, tidak ada yang tercatat selain percobaan gagal", async () => {
    const { db, catat } = dbTiruan(dasar());
    const j = await hadirRapatPeserta(db, 1, { rapat_id: 7, token: "salah" }, 5);
    expect(j.status).toBe(422);
    expect(j.json.kode).toBe("token_salah");
    expect(catat.sigap_rapat_hadir).toBeUndefined();
    expect(catat.sigap_pelatihan_presensi).toBeUndefined();
    expect(catat.sigap_rapat_coba).toHaveLength(1);
  });
  it("kegiatan berbeda dari yang diminta: 403", async () => {
    const { db } = dbTiruan(dasar());
    const j = await hadirRapatPeserta(db, 1, { rapat_id: 7, token: "psp2026" }, 1);
    expect(j.status).toBe(403);
  });
  it("tanpa pembatasan kegiatan (modal Beranda) tetap berfungsi", async () => {
    const { db } = dbTiruan(dasar());
    expect((await hadirRapatPeserta(db, 1, { rapat_id: 7, token: "psp2026" }, null)).status).toBe(200);
  });
  it("rapat kegiatan non-pelatihan: hadir tercatat tanpa presensi sesi", async () => {
    const t = dasar();
    t.sigap_kegiatan = { data: [{ jenis: "pendataan", tanggal_mulai: null, tanggal_selesai: null }] };
    const { db, catat } = dbTiruan(t);
    const j = await hadirRapatPeserta(db, 1, { rapat_id: 7, token: "psp2026" }, null);
    expect(j.json).toMatchObject({ ok: true, presensi_sesi: null });
    expect(catat.sigap_rapat_hadir).toHaveLength(1);
    expect(catat.sigap_pelatihan_presensi).toBeUndefined();
  });
  it("sudah hadir: jawaban sudah, jembatan dicoba lagi (idempoten)", async () => {
    const t = dasar();
    t.sigap_rapat_hadir = { data: [{ hadir_at: "2026-11-02T02:10:00.000Z" }] };
    const { db } = dbTiruan(t);
    const j = await hadirRapatPeserta(db, 1, { rapat_id: 7, token: "x" }, 5);
    expect(j.json).toMatchObject({ ok: true, sudah: true });
  });
  it("rapat tidak ada / bukan sasaran", async () => {
    expect((await hadirRapatPeserta(dbTiruan({ ...dasar(), sigap_rapat: { data: [] } }).db, 1, { rapat_id: 7, token: "x" }, 5)).status).toBe(404);
    expect((await hadirRapatPeserta(dbTiruan({ ...dasar(), sigap_penugasan: { data: [] } }).db, 1, { rapat_id: 7, token: "x" }, 5)).status).toBe(403);
    expect((await hadirRapatPeserta(dbTiruan(dasar()).db, 1, { rapat_id: "abc" }, 5)).status).toBe(400);
  });
});

describe("jembatanPresensiPelatihan", () => {
  const R = rapat() as never;
  it("tanpa pengaturan presensi: tidak mencatat", async () => {
    const t = dasar();
    t.sigap_pelatihan_pengaturan = { data: [] };
    const { db, catat } = dbTiruan(t);
    expect(await jembatanPresensiPelatihan(db, R, 1, "mandiri")).toMatchObject({ dicatat: false, alasan: "presensi_belum_diatur" });
    expect(catat.sigap_pelatihan_presensi).toBeUndefined();
  });
  it("tidak ada sesi beririsan: tidak mencatat", async () => {
    const { db } = dbTiruan(dasar());
    const r = rapat({ mulai_at: "2026-11-02T10:00:00.000Z", selesai_at: "2026-11-02T11:00:00.000Z" }) as never;
    expect(await jembatanPresensiPelatihan(db, r, 1, "mandiri")).toMatchObject({ dicatat: false, alasan: "tidak_ada_sesi_beririsan" });
  });
  it("presensi sesi yang sudah ada tidak ditimpa", async () => {
    const t = dasar();
    t.sigap_pelatihan_presensi = { data: [{ tanggal: "2026-11-02", sesi_no: 1, at: "2026-11-02T01:30:00.000Z", jarak_m: 10, manual: false, titik_nama: "Hotel", terlambat: false }] };
    const { db, catat } = dbTiruan(t);
    expect(await jembatanPresensiPelatihan(db, R, 1, "mandiri")).toMatchObject({ dicatat: false, alasan: "sesi_sudah_tercatat" });
    expect(catat.sigap_pelatihan_presensi).toBeUndefined();
  });
  it("catat manual menandai manual dan alasan", async () => {
    const { db, catat } = dbTiruan(dasar());
    expect((await jembatanPresensiPelatihan(db, R, 1, "manual")).dicatat).toBe(true);
    expect(catat.sigap_pelatihan_presensi[0]).toMatchObject({ manual: true });
    expect(String((catat.sigap_pelatihan_presensi[0] as { alasan: string }).alasan)).toContain("manual");
  });
  it("hadir sesudah sesi ditutup = terlambat", async () => {
    const { db, catat } = dbTiruan(dasar());
    await jembatanPresensiPelatihan(db, R, 1, "mandiri", new Date("2026-11-02T06:00:00.000Z")); // 13.00 WIB, sesi tutup 12.00
    expect(catat.sigap_pelatihan_presensi[0]).toMatchObject({ terlambat: true });
  });
  it("galat basis data tidak melempar", async () => {
    const t = dasar();
    t.sigap_pelatihan_presensi = { data: [], errorInsert: { code: "XX000" } };
    const { db } = dbTiruan(t);
    expect(await jembatanPresensiPelatihan(db, R, 1, "mandiri")).toMatchObject({ dicatat: false, alasan: "gagal_simpan" });
  });
});

describe("ambilRapatPeserta", () => {
  it("disaring ke satu kegiatan; tanpa saringan memilih yang paling relevan", async () => {
    const t = dasar();
    t.sigap_rapat = { data: [rapat({ id: 1, sasaran_kegiatan_id: 1 }), rapat({ id: 2, sasaran_kegiatan_id: 5 })] };
    const { db } = dbTiruan(t);
    const a = await ambilRapatPeserta(db, 1, 5);
    expect((a.json.rapat as { id: number }).id).toBe(2);
    const b = await ambilRapatPeserta(db, 1, 9);
    expect(b.json.rapat).toBeNull();
    const c = await ambilRapatPeserta(db, 1, null);
    expect((c.json.rapat as { id: number } | null)?.id).toBe(1);
  });
});
