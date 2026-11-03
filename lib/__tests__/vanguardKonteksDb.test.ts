// Menguji lib/vanguardKonteksDb.ts dengan db tiruan: siapa peserta pelatihan, kegiatan mana yang dipilih, tenggat eksplisit vs Pretest, dan tahan SQL belum dijalankan.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tesDaftar: Record<string, unknown>[] = [];
vi.mock("@/lib/sigapTesDb", () => ({ muatTesDaftar: async () => tesDaftar }));
vi.mock("@/lib/sigapAbsenDb", () => ({ pesertaKelas: async () => [] }));
const menyalaMock = vi.fn();
vi.mock("@/lib/vanguardAkses", () => ({ KODE_FITUR_VANGUARD: "vanguard", keadaanVanguard: (...a: unknown[]) => menyalaMock(...a) }));
// (3 Nov 2026) gerbang undangan: bawaan boleh; tes khusus di bawah memeriksa yang belum menerima undangan
const gerbangMock = vi.fn(async (..._a: unknown[]) => "boleh");
vi.mock("@/lib/sigapPelatihanBaruDb", () => ({ periksaGerbang: (...a: unknown[]) => gerbangMock(...a) }));

import { muatKonteksPelatihan } from "../vanguardKonteksDb";
import { muatRuntutanBatch, muatTenggatVanguard, simpanAturanVanguard, simpanTenggatVanguard } from "../vanguardRuntutanDb";
import { tentukanTenggat } from "../runtutanVanguard";

type Baris = Record<string, unknown>;
function fakeDb(tabel: Record<string, Baris[]>, tolakKolom: string[] = []) {
  return {
    from(nama: string) {
      let op: "select" | "insert" | "update" = "select";
      let payload: Baris = {};
      let kolom = "";
      const saring: ((r: Baris) => boolean)[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: Record<string, any> = {
        select: (k?: string) => { kolom = k ?? ""; return q; },
        insert: (x: Baris) => { op = "insert"; payload = x; return q; },
        update: (x: Baris) => { op = "update"; payload = x; return q; },
        eq: (k: string, v: unknown) => { saring.push((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { saring.push((r) => v.includes(r[k])); return q; },
        gte: (k: string, v: string) => { saring.push((r) => String(r[k]) >= v); return q; },
        not: (k: string) => { saring.push((r) => r[k] !== null && r[k] !== undefined); return q; },
        or: () => q,
        order: () => q,
        limit: () => q,
        run() {
          const bukan = Object.keys(payload).concat(kolom.split(",").map((x) => x.trim())).find((k) => tolakKolom.includes(`${nama}.${k}`));
          if (bukan) return { data: null, error: { message: `column "${bukan}" does not exist` } };
          const t = (tabel[nama] ??= []);
          if (op === "insert") { t.push({ ...payload }); return { data: [payload], error: null }; }
          const cocok = t.filter((r) => saring.every((f) => f(r)));
          if (op === "update") { cocok.forEach((r) => Object.assign(r, payload)); return { data: cocok, error: null }; }
          return { data: cocok, error: null };
        },
        maybeSingle() { const r = q.run() as { data: Baris[] | null; error: unknown }; return Promise.resolve({ data: r.data ? r.data[0] ?? null : null, error: r.error }); },
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) { return Promise.resolve(q.run()).then(ok, ko); },
      };
      return q;
    },
  } as never;
}

// Senin 2 Nov 2026 12.00 WIB
const NOW = new Date("2026-11-02T05:00:00Z").getTime();
const ujian = (akun: number, tgl: string, o: Baris = {}): Baris => ({ akun_id: akun, jenis: "harian", selesai_at: `${tgl}T05:00:00Z`, skor: 50, ...o });
const kegPelatihan = { id: 7, nama: "Pelatihan Petugas Seruti Triwulan IV 2026", jenis: "pelatihan", aktif: true, tanggal_mulai: "2026-11-09", tanggal_selesai: "2026-11-09" };
const tabelDasar = (): Record<string, Baris[]> => ({
  sigap_penugasan: [{ akun_id: 444, kegiatan_id: 7, aktif: true, sumber: null }, { akun_id: 444, kegiatan_id: 6, aktif: true, sumber: null }],
  sigap_kegiatan: [kegPelatihan, { id: 6, nama: "Seruti TW IV", jenis: "pendataan", aktif: true, tanggal_mulai: "2026-11-10", tanggal_selesai: "2026-11-20" }],
  sigap_pelatihan_aturan: [{ kegiatan_id: 7, vanguard_mode: "wajib", vanguard_hari_berturut: 3, vanguard_sesi_min_per_hari: 1, vanguard_nilai_minimal: 0, vanguard_tenggat: "2026-11-08" }],
  sigap_tes: [], sigap_vanguard_ujian: [],
});

beforeEach(() => {
  tesDaftar.length = 0;
  menyalaMock.mockReset();
  menyalaMock.mockResolvedValue({ menyala: true, sumber: "centang", fungsi: null });
  gerbangMock.mockReset();
  gerbangMock.mockResolvedValue("boleh");
});

describe("tenggat murni", () => {
  it("eksplisit menang; cadangan sehari sebelum Pretest; tidak ada = null", () => {
    expect(tentukanTenggat("2026-11-08", "2026-11-12")).toEqual({ tenggat: "2026-11-08", sumber: "atur", acuan: "2026-11-09" });
    expect(tentukanTenggat(null, "2026-11-09")).toEqual({ tenggat: "2026-11-08", sumber: "pretest", acuan: "2026-11-09" });
    expect(tentukanTenggat(undefined, null)).toEqual({ tenggat: null, sumber: null, acuan: null });
    expect(tentukanTenggat("bukan-tanggal", "2026-11-09").sumber).toBe("pretest");
    expect(tentukanTenggat("2026-02-30", null).tenggat).toBeNull();
  });
});

describe("tenggat di database", () => {
  it("baca: kolom belum ada = null; simpan memperbarui baris dan menolak tanggal tidak sah", async () => {
    expect(await muatTenggatVanguard(fakeDb(tabelDasar()), 7)).toBe("2026-11-08");
    expect(await muatTenggatVanguard(fakeDb(tabelDasar(), ["sigap_pelatihan_aturan.vanguard_tenggat"]), 7)).toBeNull();
    const t = tabelDasar();
    expect(await simpanTenggatVanguard(fakeDb(t), 7, "2026-11-07", "Budi")).toEqual({ ok: true });
    expect(t.sigap_pelatihan_aturan[0]).toMatchObject({ vanguard_tenggat: "2026-11-07", diubah_oleh: "Budi" });
    expect(await simpanTenggatVanguard(fakeDb(t), 7, null, "Budi")).toEqual({ ok: true });
    expect(t.sigap_pelatihan_aturan[0].vanguard_tenggat).toBeNull();
    expect((await simpanTenggatVanguard(fakeDb(t), 7, "31-12-2026", "Budi")).ok).toBe(false);
    const gagal = await simpanTenggatVanguard(fakeDb(t, ["sigap_pelatihan_aturan.vanguard_tenggat"]), 7, "2026-11-08", "Budi");
    expect(gagal.ok).toBe(false);
    expect(!gagal.ok && gagal.pesan).toContain("20261102zq");
  });
  it("aturan tetap terbaca walau kolom tenggat belum ada (SQL zq belum dijalankan)", async () => {
    const b = await muatRuntutanBatch(fakeDb(tabelDasar(), ["sigap_pelatihan_aturan.vanguard_tenggat"]), 7, [444], NOW, "2026-11-09");
    expect(b.mengunci).toBe(true);
    expect(b.tenggat).toBe("2026-11-08");
    expect(b.tenggat_sumber).toBe("pretest");
  });
  it("tenggat eksplisit menggeser kelayakan: tenggat 3 Nov, hari ini 2 Nov, N=3 -> tidak mungkin tuntas", async () => {
    const t = tabelDasar();
    t.sigap_pelatihan_aturan[0].vanguard_tenggat = "2026-11-03";
    const b = await muatRuntutanBatch(fakeDb(t), 7, [444], NOW, "2026-11-20");
    expect(b.tenggat).toBe("2026-11-03");
    expect(b.peta.get(444)?.kelayakan.mungkin).toBe(false);
  });
});

describe("muatKonteksPelatihan", () => {
  it("bukan peserta pelatihan (hanya kegiatan pendataan atau tanpa penugasan) = null", async () => {
    const t = tabelDasar();
    t.sigap_penugasan = [{ akun_id: 444, kegiatan_id: 6, aktif: true, sumber: null }];
    expect(await muatKonteksPelatihan(fakeDb(t), 444, NOW)).toBeNull();
    expect(await muatKonteksPelatihan(fakeDb(tabelDasar()), 999, NOW)).toBeNull();
  });
  it("penugasan nonaktif tidak dihitung", async () => {
    const t = tabelDasar();
    t.sigap_penugasan = [{ akun_id: 444, kegiatan_id: 7, aktif: false, sumber: null }];
    expect(await muatKonteksPelatihan(fakeDb(t), 444, NOW)).toBeNull();
  });
  it("Vanguard tidak menyala di pelatihan itu = null", async () => {
    menyalaMock.mockResolvedValue({ menyala: false, sumber: "mati", fungsi: null });
    expect(await muatKonteksPelatihan(fakeDb(tabelDasar()), 444, NOW)).toBeNull();
  });
  it("pelatihan yang sudah lewat tanggalnya atau tidak aktif diabaikan", async () => {
    const t = tabelDasar();
    t.sigap_kegiatan[0] = { ...kegPelatihan, tanggal_selesai: "2026-10-31" };
    expect(await muatKonteksPelatihan(fakeDb(t), 444, NOW)).toBeNull();
    const t2 = tabelDasar();
    t2.sigap_kegiatan[0] = { ...kegPelatihan, aktif: false };
    expect(await muatKonteksPelatihan(fakeDb(t2), 444, NOW)).toBeNull();
  });
  it("mode wajib + tenggat eksplisit: runtutan, tenggat, dan batas mulai", async () => {
    const k = await muatKonteksPelatihan(fakeDb(tabelDasar()), 444, NOW);
    expect(k).toMatchObject({ kegiatan_id: 7, mode: "wajib", hari_berturut: 3, tenggat: "2026-11-08", tenggat_sumber: "atur", mulai_paling_lambat: "2026-11-06", hari_ini: "2026-11-02" });
    expect(k?.runtutan).toMatchObject({ berturut: 0, tuntas: false, hari_ini_sudah: false, mungkin: true });
    expect(k?.runtutan?.petak).toHaveLength(3);
  });
  it("sesi harian selesai hari ini terhitung", async () => {
    const t = tabelDasar();
    t.sigap_vanguard_ujian = [ujian(444, "2026-11-02")];
    const k = await muatKonteksPelatihan(fakeDb(t), 444, NOW);
    expect(k?.runtutan).toMatchObject({ berturut: 1, hari_ini_sudah: true, sesi_hari_ini: 1 });
  });
  it("tantangan tidak dihitung", async () => {
    const t = tabelDasar();
    t.sigap_vanguard_ujian = [ujian(444, "2026-11-02", { jenis: "tantangan" })];
    const k = await muatKonteksPelatihan(fakeDb(t), 444, NOW);
    expect(k?.runtutan?.berturut).toBe(0);
  });
  it("tanpa tenggat eksplisit: tenggat = sehari sebelum Pretest dibuka", async () => {
    const t = tabelDasar();
    t.sigap_pelatihan_aturan[0].vanguard_tenggat = null;
    t.sigap_tes = [{ kegiatan_id: 7, jenis: "pretest", aktif: true, buka_at: "2026-11-09T01:00:00Z" }];
    const k = await muatKonteksPelatihan(fakeDb(t), 444, NOW);
    expect(k).toMatchObject({ tenggat: "2026-11-08", tenggat_sumber: "pretest" });
  });
  it("tanpa tenggat dan tanpa Pretest: tenggat null (tidak mengarang)", async () => {
    const t = tabelDasar();
    t.sigap_pelatihan_aturan[0].vanguard_tenggat = null;
    const k = await muatKonteksPelatihan(fakeDb(t), 444, NOW);
    expect(k).toMatchObject({ tenggat: null, tenggat_sumber: null, mulai_paling_lambat: null });
    expect(k?.runtutan?.mungkin).toBeNull();
  });
  it("kolom aturan belum ada (SQL zp belum dijalankan) = mode tidak_ada: tetap peserta pelatihan, tanpa runtutan", async () => {
    const k = await muatKonteksPelatihan(fakeDb(tabelDasar(), ["sigap_pelatihan_aturan.vanguard_mode"]), 444, NOW);
    expect(k).toMatchObject({ kegiatan_id: 7, mode: "tidak_ada", tenggat: null, runtutan: null });
  });
  it("beberapa pelatihan: yang punya aturan (wajib/opsional) didahulukan", async () => {
    const t = tabelDasar();
    t.sigap_penugasan.push({ akun_id: 444, kegiatan_id: 5, aktif: true, sumber: null });
    t.sigap_kegiatan.push({ id: 5, nama: "UJI Pelatihan", jenis: "pelatihan", aktif: true, tanggal_mulai: "2026-11-05", tanggal_selesai: "2026-11-05" });
    const k = await muatKonteksPelatihan(fakeDb(t), 444, NOW);
    expect(k?.kegiatan_id).toBe(7);
    t.sigap_pelatihan_aturan[0].vanguard_mode = "tidak_ada";
    expect((await muatKonteksPelatihan(fakeDb(t), 444, NOW))?.kegiatan_id).toBe(5); // sama-sama tanpa aturan: yang paling dekat tanggalnya
  });
  it("(3 Nov 2026) undangan belum diterima: pelatihan itu tidak dihitung (Vanguard belum terbuka); pelatihan lain yang sudah diterima tetap", async () => {
    const t = tabelDasar();
    t.sigap_penugasan.push({ akun_id: 444, kegiatan_id: 5, aktif: true, sumber: null });
    t.sigap_kegiatan.push({ id: 5, nama: "UJI Pelatihan", jenis: "pelatihan", aktif: true, tanggal_mulai: "2026-11-05", tanggal_selesai: "2026-11-05" });
    gerbangMock.mockImplementation(async (_db: unknown, kegiatanId: unknown) => (kegiatanId === 7 ? "belum" : "boleh"));
    expect((await muatKonteksPelatihan(fakeDb(t), 444, NOW))?.kegiatan_id).toBe(5);
    gerbangMock.mockResolvedValue("belum");
    expect(await muatKonteksPelatihan(fakeDb(tabelDasar()), 444, NOW)).toBeNull();
  });
  it("galat tak terduga = null (layar tetap tampil seperti biasa)", async () => {
    const rusak = { from() { throw new Error("putus"); } } as never;
    expect(await muatKonteksPelatihan(rusak, 444, NOW)).toBeNull();
  });
});

describe("simpanAturan tetap bekerja", () => {
  it("menyimpan aturan tidak menyentuh tenggat", async () => {
    const t = tabelDasar();
    expect(await simpanAturanVanguard(fakeDb(t), 7, { mode: "opsional", hari_berturut: 2, sesi_min_per_hari: 1, nilai_minimal: 0 }, "Budi")).toEqual({ ok: true });
    expect(t.sigap_pelatihan_aturan[0].vanguard_tenggat).toBe("2026-11-08");
  });
});
