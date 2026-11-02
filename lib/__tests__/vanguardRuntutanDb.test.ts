// Menguji lib/vanguardRuntutanDb.ts dengan db tiruan: aturan (tahan SQL belum dijalankan), sesi, runtutan banyak akun, simpan aturan, dan sambungan ke muatTahapanBatch.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tesDaftar: Record<string, unknown>[] = [];
vi.mock("@/lib/sigapTesDb", () => ({ muatTesDaftar: async () => tesDaftar }));
vi.mock("@/lib/sigapAbsenDb", () => ({ pesertaKelas: async () => [] }));
const menyalaMock = vi.fn();
vi.mock("@/lib/vanguardAkses", () => ({ KODE_FITUR_VANGUARD: "vanguard", keadaanVanguard: (...a: unknown[]) => menyalaMock(...a) }));

import { muatAturanVanguard, muatRuntutanBatch, muatSesiVanguard, PESAN_SQL_VANGUARD, ringkasRuntutanAkun, simpanAturanVanguard, tanggalBukaPretest } from "../vanguardRuntutanDb";
import { muatTahapanBatch } from "../sigapTahapanDb";
import { hitungTahapan } from "../sigapTahapan";

type Baris = Record<string, unknown>;
function fakeDb(tabel: Record<string, Baris[]>, tolak: string[] = []) {
  return {
    from(nama: string) {
      let op: "select" | "insert" | "update" = "select";
      let payload: Baris = {};
      const saring: ((r: Baris) => boolean)[] = [];
      let batas = Infinity;
      const q: Record<string, unknown> & { run: () => { data: Baris[] | null; error: { message: string } | null } } = {
        select: () => q,
        insert: (x: Baris) => { op = "insert"; payload = x; return q; },
        update: (x: Baris) => { op = "update"; payload = x; return q; },
        eq: (k: string, v: unknown) => { saring.push((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { saring.push((r) => v.includes(r[k])); return q; },
        gte: (k: string, v: string) => { saring.push((r) => String(r[k]) >= v); return q; },
        not: (k: string) => { saring.push((r) => r[k] !== null && r[k] !== undefined); return q; },
        order: () => q,
        limit: (n: number) => { batas = n; return q; },
        run() {
          if (tolak.includes(nama)) return { data: null, error: { message: `column "vanguard_mode" does not exist` } };
          const t = (tabel[nama] ??= []);
          if (op === "insert") { t.push({ ...payload }); return { data: [payload], error: null }; }
          const cocok = t.filter((r) => saring.every((f) => f(r)));
          if (op === "update") { cocok.forEach((r) => Object.assign(r, payload)); return { data: cocok, error: null }; }
          return { data: cocok.slice(0, batas), error: null };
        },
        maybeSingle() { const r = q.run(); return Promise.resolve({ data: r.data ? r.data[0] ?? null : null, error: r.error }); },
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) { return Promise.resolve(q.run()).then(ok, ko); },
      };
      return q;
    },
  } as never;
}

// 2026-11-04 12.00 WIB
const NOW = new Date("2026-11-04T05:00:00Z").getTime();
const ujian = (akun: number, tgl: string, o: Baris = {}): Baris => ({ akun_id: akun, jenis: "latihan", selesai_at: `${tgl}T05:00:00Z`, skor: 50, ...o });
const aturanWajib = { kegiatan_id: 7, vanguard_mode: "wajib", vanguard_hari_berturut: 3, vanguard_sesi_min_per_hari: 1, vanguard_nilai_minimal: 0 };

beforeEach(() => {
  tesDaftar.length = 0;
  tesDaftar.push({ id: 1, jenis: "pretest", aktif: true, wajib_100: false, buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-09T09:00:00Z" });
  menyalaMock.mockReset();
  menyalaMock.mockResolvedValue({ menyala: true, sumber: "centang", fungsi: null });
});

describe("aturan", () => {
  it("tanpa baris / kolom belum ada = tidak_ada (tidak mengubah perilaku)", async () => {
    expect((await muatAturanVanguard(fakeDb({}), 7)).mode).toBe("tidak_ada");
    expect((await muatAturanVanguard(fakeDb({ sigap_pelatihan_aturan: [aturanWajib] }, ["sigap_pelatihan_aturan"]), 7)).mode).toBe("tidak_ada");
    expect(await muatAturanVanguard(fakeDb({ sigap_pelatihan_aturan: [aturanWajib] }), 7)).toEqual({ mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 });
  });
  it("simpan: memperbarui baris yang ada tanpa menyentuh aturan nilai; membuat baris bila belum ada (versi menurut kode kegiatan)", async () => {
    const tabel = { sigap_pelatihan_aturan: [{ kegiatan_id: 7, aturan_versi: 2, blokir_tahap: true, izin_ajukan: false }] as Baris[], sigap_kegiatan: [{ id: 3, kode: "pelatihan_psp_pascabencana_2026" }, { id: 8, kode: "lain" }] as Baris[] };
    const db = fakeDb(tabel);
    expect(await simpanAturanVanguard(db, 7, { mode: "wajib", hari_berturut: 4, sesi_min_per_hari: 2, nilai_minimal: 10 }, "Budi")).toEqual({ ok: true });
    expect(tabel.sigap_pelatihan_aturan[0]).toMatchObject({ aturan_versi: 2, blokir_tahap: true, vanguard_mode: "wajib", vanguard_hari_berturut: 4, vanguard_sesi_min_per_hari: 2, vanguard_nilai_minimal: 10, diubah_oleh: "Budi" });
    await simpanAturanVanguard(db, 3, { mode: "opsional", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 }, "Budi");
    await simpanAturanVanguard(db, 8, { mode: "opsional", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 }, "Budi");
    expect(tabel.sigap_pelatihan_aturan.find((r) => r.kegiatan_id === 3)).toMatchObject({ aturan_versi: 1, blokir_tahap: false });
    expect(tabel.sigap_pelatihan_aturan.find((r) => r.kegiatan_id === 8)).toMatchObject({ aturan_versi: 2, vanguard_mode: "opsional" });
  });
  it("simpan menunjuk ke berkas SQL bila kolom belum ada", async () => {
    const r = await simpanAturanVanguard(fakeDb({}, ["sigap_pelatihan_aturan"]), 7, { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 }, "Budi");
    expect(r).toEqual({ ok: false, pesan: PESAN_SQL_VANGUARD });
  });
});

describe("sesi dan runtutan", () => {
  it("hanya sesi selesai dari jenis latihan / harian / sertifikasi (bukan tantangan, bukan yang belum selesai)", async () => {
    const db = fakeDb({ sigap_vanguard_ujian: [ujian(1, "2026-11-03"), ujian(1, "2026-11-03", { jenis: "tantangan" }), ujian(1, "2026-11-02", { selesai_at: null }), ujian(2, "2026-11-03", { jenis: "harian" }), ujian(9, "2026-11-03")] });
    const peta = await muatSesiVanguard(db, [1, 2], NOW);
    expect(peta.get(1)).toHaveLength(1);
    expect(peta.get(2)).toHaveLength(1);
    expect(peta.has(9)).toBe(false);
  });
  it("tanggal buka Pretest = hari WIB paling awal", () => {
    expect(tanggalBukaPretest([{ jenis: "pretest", aktif: true, buka_at: "2026-11-08T18:00:00Z" }, { jenis: "posttest", buka_at: "2026-11-01T00:00:00Z" }])).toBe("2026-11-09");
    expect(tanggalBukaPretest([])).toBeNull();
  });
  it("batch: tidak_ada atau Vanguard tidak menyala = tidak berlaku, tanpa kueri sesi", async () => {
    const db = fakeDb({ sigap_pelatihan_aturan: [{ ...aturanWajib, vanguard_mode: "tidak_ada" }] });
    expect((await muatRuntutanBatch(db, 7, [1], NOW, null)).berlaku).toBe(false);
    menyalaMock.mockResolvedValue({ menyala: false, sumber: "mati", fungsi: null });
    const b = await muatRuntutanBatch(fakeDb({ sigap_pelatihan_aturan: [aturanWajib] }), 7, [1], NOW, null);
    expect(b).toMatchObject({ berlaku: false, mengunci: false });
  });
  it("batch: runtutan per akun dan kelayakan terhadap Pretest", async () => {
    const db = fakeDb({
      sigap_pelatihan_aturan: [aturanWajib],
      sigap_vanguard_ujian: [ujian(1, "2026-11-02"), ujian(1, "2026-11-03"), ujian(1, "2026-11-04"), ujian(2, "2026-11-03")],
    });
    const b = await muatRuntutanBatch(db, 7, [1, 2, 3], NOW, "2026-11-09");
    expect(b).toMatchObject({ berlaku: true, mengunci: true, hari_ini: "2026-11-04" });
    expect(b.peta.get(1)).toMatchObject({ tuntas: true });
    expect(b.peta.get(2)).toMatchObject({ tuntas: false, berturut: 1, hari_ini_sudah: false });
    expect(b.peta.get(3)).toMatchObject({ tuntas: false, berturut: 0, terputus: false });
    expect(b.peta.get(3)!.kelayakan).toMatchObject({ batas_mulai: "2026-11-06", mungkin: true });
  });
  it("ringkasRuntutanAkun: null bila tidak diatur; ada isi bila diatur dan menyala", async () => {
    expect(await ringkasRuntutanAkun(fakeDb({}), 7, 1, NOW)).toBeNull();
    const db = fakeDb({ sigap_pelatihan_aturan: [{ ...aturanWajib, vanguard_mode: "opsional" }], sigap_tes: [{ kegiatan_id: 7, jenis: "pretest", aktif: true, buka_at: "2026-11-09T01:00:00Z" }], sigap_vanguard_ujian: [ujian(1, "2026-11-03")] });
    const r = await ringkasRuntutanAkun(db, 7, 1, NOW);
    expect(r).toMatchObject({ mode: "opsional", berturut: 1, tanggal_pretest: "2026-11-09", hari_ini: "2026-11-04" });
  });
});

describe("sambungan ke tahapan (kunci Pretest)", () => {
  const tabel = () => ({
    sigap_pelatihan_aturan: [aturanWajib],
    sigap_vanguard_ujian: [ujian(1, "2026-11-02"), ujian(1, "2026-11-03"), ujian(1, "2026-11-04"), ujian(2, "2026-11-04")],
  });
  it("mode wajib: yang belum tuntas terkunci di Pretest oleh Vanguard; yang tuntas tidak", async () => {
    const m = await muatTahapanBatch(fakeDb(tabel()), 7, [1, 2], NOW, { versi: 2, blokir_tahap: true, izin_ajukan: false, eksplisit: true });
    expect(m.masukan.get(1)!.vanguard).toEqual({ ada: true, tuntas: true });
    expect(m.masukan.get(2)!.vanguard).toEqual({ ada: true, tuntas: false });
    const h2 = hitungTahapan(m.masukan.get(2)!, true, [], NOW);
    expect(h2.find((x) => x.kode === "pretest")).toMatchObject({ terkunci: true, kunci_oleh: "vanguard", pesan: "Selesaikan Vanguard dulu." });
    expect(hitungTahapan(m.masukan.get(1)!, true, [], NOW).find((x) => x.kode === "pretest")!.terkunci).toBe(false);
  });
  it("izin buka kunci menembus kunci Vanguard", async () => {
    const m = await muatTahapanBatch(fakeDb(tabel()), 7, [2], NOW, { versi: 2, blokir_tahap: true, izin_ajukan: false, eksplisit: true });
    const izin = [{ tahap: "pretest", status: "disetujui", berlaku_sampai: new Date(NOW + 3600_000).toISOString() }];
    expect(hitungTahapan(m.masukan.get(2)!, true, izin, NOW).find((x) => x.kode === "pretest")).toMatchObject({ terkunci: false, dibuka_izin: true });
  });
  it("opsional / tidak_ada / Vanguard mati: tidak mengunci", async () => {
    for (const mode of ["opsional", "tidak_ada"]) {
      const t = tabel();
      t.sigap_pelatihan_aturan = [{ ...aturanWajib, vanguard_mode: mode }];
      const m = await muatTahapanBatch(fakeDb(t), 7, [2], NOW, { versi: 2, blokir_tahap: true, izin_ajukan: false, eksplisit: true });
      expect(m.masukan.get(2)!.vanguard.ada).toBe(false);
    }
    menyalaMock.mockResolvedValue({ menyala: false, sumber: "mati", fungsi: null });
    const m = await muatTahapanBatch(fakeDb(tabel()), 7, [2], NOW, { versi: 2, blokir_tahap: true, izin_ajukan: false, eksplisit: true });
    expect(m.masukan.get(2)!.vanguard.ada).toBe(false);
  });
});
