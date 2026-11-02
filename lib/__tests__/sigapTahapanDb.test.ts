// Menguji lib/sigapTahapanDb.ts dengan db tiruan di memori: masukan tahapan, izin (minta/buka/putuskan), daftar menunggu, dan tahan SQL belum dijalankan.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tesDaftar: Record<string, unknown>[] = [];
const pesertaKelasMock = vi.fn();
vi.mock("@/lib/sigapTesDb", () => ({ muatTesDaftar: async () => tesDaftar }));
vi.mock("@/lib/sigapAbsenDb", () => ({ pesertaKelas: (...a: unknown[]) => pesertaKelasMock(...a) }));

import { ajukanIzin, ambilIzin, bukaLangsung, daftarMenunggu, izinBerlakuPerTahap, muatIzin, muatKuisBatch, muatTahapanBatch, putuskanIzin, PESAN_SQL_IZIN } from "../sigapTahapanDb";
import { hitungTahapan } from "../sigapTahapan";

type Baris = Record<string, unknown>;
function fakeDb(tabel: Record<string, Baris[]>, tolak: string[] = []) {
  let seq = 1000;
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
        not: () => q,
        order: () => q,
        limit: (n: number) => { batas = n; return q; },
        run() {
          if (tolak.includes(nama)) return { data: null, error: { message: `relation "public.${nama}" does not exist` } };
          const t = (tabel[nama] ??= []);
          if (op === "insert") {
            const baris = { id: ++seq, dibuat_at: new Date().toISOString(), ...payload };
            t.push(baris);
            return { data: [baris], error: null };
          }
          const cocok = t.filter((r) => saring.every((f) => f(r)));
          if (op === "update") { cocok.forEach((r) => Object.assign(r, payload)); return { data: cocok.map((r) => ({ id: r.id })), error: null }; }
          return { data: cocok.slice(0, batas), error: null };
        },
        maybeSingle() { const r = q.run(); return Promise.resolve({ data: r.data ? r.data[0] ?? null : null, error: r.error }); },
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) { return Promise.resolve(q.run()).then(ok, ko); },
      };
      return q;
    },
  } as never;
}

const NOW = new Date("2026-11-09T04:00:00Z").getTime();
const pre = { id: 1, jenis: "pretest", aktif: true, wajib_100: false, buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-09T09:00:00Z" };
const post = { id: 2, jenis: "posttest", aktif: true, wajib_100: false, buka_at: "2026-11-09T02:00:00Z", tutup_at: "2026-11-09T09:00:00Z" };
const sesi = (o: Baris): Baris => ({ selesai_at: null, batas_at: "2026-11-09T05:00:00Z", skor: null, skor_terbaik: null, ...o });

beforeEach(() => { tesDaftar.length = 0; tesDaftar.push({ ...pre }, { ...post }); pesertaKelasMock.mockReset(); });

describe("muatTahapanBatch", () => {
  it("pretest selesai tuntas; belum mengerjakan tidak; kuis tercatat ikut hanya untuk yang masuk ruang selesai", async () => {
    const db = fakeDb({
      sigap_kegiatan: [{ id: 7, kode: "pelatihan_seruti_tw4_2026" }],
      sigap_tes_sesi: [sesi({ tes_id: 1, akun_id: 11, selesai_at: "2026-11-09T02:30:00Z", skor: 60, skor_terbaik: 60 }), sesi({ tes_id: 1, akun_id: 12 })],
      sigap_kuis_ruang: [{ id: 50, status: "selesai", kegiatan_id: 7 }],
      sigap_kuis_peserta: [{ akun_id: 11, ruang_id: 50 }],
    });
    const r = await muatTahapanBatch(db, 7, [11, 12], NOW);
    expect(r.aturan.versi).toBe(2);
    expect(r.kuis_ada).toBe(true);
    expect(r.masukan.get(11)!.pretest).toEqual({ ada: true, tuntas: true });
    expect(r.masukan.get(11)!.kuis).toEqual({ ada: true, tuntas: true });
    expect(r.masukan.get(12)!.pretest).toEqual({ ada: true, tuntas: false });
    expect(r.masukan.get(12)!.kuis).toEqual({ ada: true, tuntas: false });
    expect(r.masukan.get(11)!.video).toEqual({ ada: false, tuntas: false }); // belum terhubung
  });

  it("wajib 100: skor 80 belum tuntas, 100 tuntas", async () => {
    tesDaftar[0] = { ...pre, wajib_100: true };
    const db = fakeDb({
      sigap_tes_sesi: [sesi({ tes_id: 1, akun_id: 11, selesai_at: "2026-11-09T02:30:00Z", skor: 80, skor_terbaik: 80 }), sesi({ tes_id: 1, akun_id: 12, selesai_at: "2026-11-09T02:30:00Z", skor: 100, skor_terbaik: 100 })],
    });
    const r = await muatTahapanBatch(db, 7, [11, 12], NOW);
    expect(r.masukan.get(11)!.pretest.tuntas).toBe(false);
    expect(r.masukan.get(12)!.pretest.tuntas).toBe(true);
  });

  it("sesi yang waktunya habis tetapi belum dinilai dianggap selesai (bukan untuk wajib 100)", async () => {
    const lewat = sesi({ tes_id: 1, akun_id: 11, batas_at: "2026-11-09T03:00:00Z" });
    const r = await muatTahapanBatch(fakeDb({ sigap_tes_sesi: [lewat] }), 7, [11], NOW);
    expect(r.masukan.get(11)!.pretest.tuntas).toBe(true);
    tesDaftar[0] = { ...pre, wajib_100: true };
    const r2 = await muatTahapanBatch(fakeDb({ sigap_tes_sesi: [lewat] }), 7, [11], NOW);
    expect(r2.masukan.get(11)!.pretest.tuntas).toBe(false);
  });

  it("tes tidak aktif: tahap itu tidak ada; kuis tidak ada: ada=false", async () => {
    tesDaftar[1] = { ...post, aktif: false };
    const r = await muatTahapanBatch(fakeDb({}), 7, [11], NOW);
    expect(r.masukan.get(11)!.posttest.ada).toBe(false);
    expect(r.masukan.get(11)!.kuis.ada).toBe(false);
  });

  it("kuis ada hanya konfigurasi (belum ada ruang) dengan soal: ada=true, belum ikut", async () => {
    const db = fakeDb({ sigap_kuis_kelas: [{ kegiatan_id: 7, kelas: 1, kuis_id: 3 }], sigap_kuis_soal: [{ kuis_id: 3 }] });
    const k = await muatKuisBatch(db, 7, [11]);
    expect(k.ada).toBe(true);
    expect(k.ikut.size).toBe(0);
  });

  it("tabel kuis belum ada / galat: kuis dianggap tidak ada (tidak menghalangi)", async () => {
    const k = await muatKuisBatch(fakeDb({}, ["sigap_kuis_ruang"]), 7, [11]);
    expect(k).toEqual({ ada: false, ikut: new Set() });
  });

  it("dipakai bersama hitungTahapan: posttest terkunci sampai pretest selesai", async () => {
    const db = fakeDb({ sigap_tes_sesi: [] });
    const r = await muatTahapanBatch(db, 7, [11], NOW);
    const h = hitungTahapan(r.masukan.get(11)!, true, [], NOW);
    expect(h.find((x) => x.kode === "posttest")!.kunci_oleh).toBe("pretest");
  });
});

describe("izin buka kunci", () => {
  it("minta lalu minta lagi: tidak digandakan", async () => {
    const tabel = { sigap_pelatihan_izin_buka: [] as Baris[] };
    const db = fakeDb(tabel);
    const a = await ajukanIzin(db, 7, 11, "posttest", "Kendala HP");
    const b = await ajukanIzin(db, 7, 11, "posttest", "Kendala HP");
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: true, sudah: true });
    expect(tabel.sigap_pelatihan_izin_buka).toHaveLength(1);
    expect(tabel.sigap_pelatihan_izin_buka[0]).toMatchObject({ asal: "petugas", status: "menunggu", tahap: "posttest", akun_id: 11 });
  });

  it("buka langsung tanpa permintaan: baris baru disetujui sampai 23.59 WIB", async () => {
    const tabel = { sigap_pelatihan_izin_buka: [] as Baris[] };
    const r = await bukaLangsung(fakeDb(tabel), 7, 11, "pretest", "Terlambat datang", "Budi", NOW);
    expect(r.ok).toBe(true);
    expect(tabel.sigap_pelatihan_izin_buka[0]).toMatchObject({ asal: "pengelola", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", diputuskan_oleh: "Budi" });
  });

  it("buka langsung ketika ada permintaan menunggu: permintaan itu yang disetujui (tanpa baris kedua)", async () => {
    const tabel = { sigap_pelatihan_izin_buka: [{ id: 1, kegiatan_id: 7, akun_id: 11, tahap: "posttest", status: "menunggu", asal: "petugas", dibuat_at: new Date(NOW).toISOString() }] as Baris[] };
    await bukaLangsung(fakeDb(tabel), 7, 11, "posttest", "x lainnya", "Budi", NOW);
    expect(tabel.sigap_pelatihan_izin_buka).toHaveLength(1);
    expect(tabel.sigap_pelatihan_izin_buka[0]).toMatchObject({ status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z" });
  });

  it("putuskan: setuju memberi berlaku_sampai, tolak tidak; klik ganda ditolak dengan pesan jelas", async () => {
    const tabel = { sigap_pelatihan_izin_buka: [
      { id: 1, kegiatan_id: 7, akun_id: 11, tahap: "posttest", status: "menunggu", asal: "petugas" },
      { id: 2, kegiatan_id: 7, akun_id: 12, tahap: "pretest", status: "menunggu", asal: "petugas" },
    ] as Baris[] };
    const db = fakeDb(tabel);
    expect(await putuskanIzin(db, 7, 1, true, "Budi", NOW)).toMatchObject({ ok: true });
    expect(await putuskanIzin(db, 7, 2, false, "Budi", NOW)).toMatchObject({ ok: true });
    expect(tabel.sigap_pelatihan_izin_buka[0]).toMatchObject({ status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z" });
    expect(tabel.sigap_pelatihan_izin_buka[1]).toMatchObject({ status: "ditolak", berlaku_sampai: null });
    const lagi = await putuskanIzin(db, 7, 1, false, "Sari", NOW);
    expect(lagi).toEqual({ ok: false, pesan: "Permintaan ini sudah diputuskan." });
    expect(tabel.sigap_pelatihan_izin_buka[0].status).toBe("disetujui"); // tidak berubah
  });

  it("muatIzin + izinBerlakuPerTahap: hanya yang disetujui dan belum lewat", async () => {
    const t = (o: Baris): Baris => ({ kegiatan_id: 7, akun_id: 11, dibuat_at: new Date(NOW - 3600_000).toISOString(), asal: "pengelola", ...o });
    const db = fakeDb({ sigap_pelatihan_izin_buka: [
      t({ id: 1, tahap: "pretest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z" }),
      t({ id: 2, tahap: "posttest", status: "menunggu" }),
      t({ id: 3, tahap: "posttest", status: "disetujui", berlaku_sampai: "2026-11-08T16:59:59.000Z" }),
      t({ id: 4, akun_id: 99, tahap: "pretest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z" }),
      t({ id: 5, tahap: "pretest", status: "disetujui", berlaku_sampai: "2026-11-09T16:59:59.000Z", dibuat_at: new Date(NOW - 10 * 86_400_000).toISOString() }),
    ] });
    const { tersedia, peta } = await muatIzin(db, 7, [11], NOW);
    expect(tersedia).toBe(true);
    expect(peta.get(11)!.map((b) => b.id).sort()).toEqual([1, 2, 3]);
    expect(peta.has(99)).toBe(false);
    const per = izinBerlakuPerTahap(peta.get(11), NOW);
    expect(per.pretest?.id).toBe(1);
    expect(per.posttest).toBeNull();
  });

  it("ambilIzin mengembalikan baris atau null", async () => {
    const db = fakeDb({ sigap_pelatihan_izin_buka: [{ id: 5, kegiatan_id: 7, akun_id: 11, tahap: "pretest", status: "menunggu" }] });
    expect((await ambilIzin(db, 7, 5))?.akun_id).toBe(11);
    expect(await ambilIzin(db, 7, 6)).toBeNull();
    expect(await ambilIzin(db, 8, 5)).toBeNull();
  });

  it("daftarMenunggu: hanya permintaan petugas yang menunggu dari peserta kelas yang dimaksud", async () => {
    const t = (o: Baris): Baris => ({ kegiatan_id: 7, status: "menunggu", asal: "petugas", dibuat_at: "2026-11-09T03:00:00Z", ...o });
    const db = fakeDb({ sigap_pelatihan_izin_buka: [
      t({ id: 1, akun_id: 11, tahap: "posttest", alasan: "Kendala HP / sinyal" }),
      t({ id: 2, akun_id: 12, tahap: "pretest" }),
      t({ id: 3, akun_id: 11, tahap: "pretest", status: "disetujui" }),
      t({ id: 4, akun_id: 13, tahap: "posttest", asal: "pengelola" }),
    ] });
    pesertaKelasMock.mockResolvedValue([{ akun_id: 11, nama: "Ani", kelas: 1, penugasan_id: 1 }]);
    const d = await daftarMenunggu(db, 7, 1);
    expect(pesertaKelasMock).toHaveBeenCalledWith(db, 7, 1);
    expect(d).toEqual([{ id: 1, akun_id: 11, nama: "Ani", kelas: 1, tahap: "posttest", alasan: "Kendala HP / sinyal", dibuat_at: "2026-11-09T03:00:00Z" }]);
  });
});

describe("SQL belum dijalankan", () => {
  it("baca: kosong tanpa galat", async () => {
    const db = fakeDb({}, ["sigap_pelatihan_izin_buka"]);
    expect((await muatIzin(db, 7, [11], NOW)).tersedia).toBe(false);
    expect(await daftarMenunggu(db, 7, null)).toEqual([]);
  });
  it("tulis: menolak dengan pesan yang menunjuk SQL", async () => {
    const db = fakeDb({}, ["sigap_pelatihan_izin_buka"]);
    expect(await ajukanIzin(db, 7, 11, "pretest", "abc")).toEqual({ ok: false, pesan: PESAN_SQL_IZIN });
    expect(await bukaLangsung(db, 7, 11, "pretest", "abc", "B", NOW)).toEqual({ ok: false, pesan: PESAN_SQL_IZIN });
    expect(await putuskanIzin(db, 7, 1, true, "B", NOW)).toEqual({ ok: false, pesan: PESAN_SQL_IZIN });
  });
});
