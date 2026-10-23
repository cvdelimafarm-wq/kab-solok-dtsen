import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cekAksesIsian, type Db } from "../sigap";

// (23 Okt 2026) cekAksesIsian: foto yang dipotret tanpa sinyal (opsi.toleransiOfflineHari) boleh terkirim sampai N hari sesudah tanggalnya.
// Hanya alasan "terlewat" yang dilonggarkan; kunci SPJ, arsip, bukan hari kerja, dan tanggal masa depan tetap ditolak.

const pen = { id: 1, kegiatan_id: 1, peran: "ppl", maks_hari: null, surat_tugas_id: null, dikunci_at: null as string | null };
const keg = { id: 1, kode: "K1", nama: "Kegiatan Uji", kode_anggaran: "X", satuan_realisasi: "ruta", aktif: true, tanggal_mulai: "2026-10-01", tanggal_selesai: "2026-12-31", hari_tenggang: 7, dibuka_sampai: null, jenis: null, wajib_laporan: true, jumlah_foto: 5 };

function dbPalsu(o: { hariKerja?: boolean; izin?: boolean; penugasan?: Partial<typeof pen>; kegiatan?: Partial<typeof keg> } = {}): Db {
  const tabel: Record<string, unknown[]> = {
    sigap_penugasan: [{ ...pen, ...o.penugasan }],
    sigap_kegiatan: [{ ...keg, ...o.kegiatan }],
    sigap_kegiatan_tarif: [],
    sigap_hari_kerja: o.hariKerja === false ? [] : [{ id: 1 }],
    sigap_izin_susulan: o.izin ? [{ berlaku_sampai: "2099-01-01T00:00:00Z" }] : [],
  };
  const bangun = (nama: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "gt", "order", "limit"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: (tabel[nama] ?? [])[0] ?? null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabel[nama] ?? [] }).then(ok);
    return b;
  };
  return { from: (nama: string) => bangun(nama) } as unknown as Db;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T03:00:00Z")); // 10.00 WIB, 23 Okt 2026
});
afterEach(() => vi.useRealTimers());

describe("cekAksesIsian: toleransi kirim foto tanpa sinyal", () => {
  it("tanpa opsi: hari lampau tanpa izin tetap ditolak (perilaku lama)", async () => {
    const r = await cekAksesIsian(dbPalsu(), 7, 1, "2026-10-22");
    expect(r).toMatchObject({ status: 403 });
  });
  it("dengan toleransi 2 hari: kemarin dan 2 hari lalu diterima, bukan susulan", async () => {
    for (const tgl of ["2026-10-22", "2026-10-21"]) {
      const r = await cekAksesIsian(dbPalsu(), 7, 1, tgl, { toleransiOfflineHari: 2 });
      expect(r).toMatchObject({ tanggal: tgl, susulan: false });
    }
  });
  it("3 hari lalu tetap ditolak walau ada toleransi", async () => {
    expect(await cekAksesIsian(dbPalsu(), 7, 1, "2026-10-20", { toleransiOfflineHari: 2 })).toMatchObject({ status: 403 });
  });
  it("tanggal masa depan tetap ditolak", async () => {
    expect(await cekAksesIsian(dbPalsu(), 7, 1, "2026-10-24", { toleransiOfflineHari: 2 })).toMatchObject({ status: 403 });
  });
  it("bukan hari kerja tetap ditolak (400)", async () => {
    expect(await cekAksesIsian(dbPalsu({ hariKerja: false }), 7, 1, "2026-10-22", { toleransiOfflineHari: 2 })).toMatchObject({ status: 400 });
  });
  it("SPJ sudah dikunci admin tetap ditolak", async () => {
    expect(await cekAksesIsian(dbPalsu({ penugasan: { dikunci_at: "2026-10-22T00:00:00Z" } }), 7, 1, "2026-10-22", { toleransiOfflineHari: 2 })).toMatchObject({ status: 403 });
  });
  it("periode arsip tetap ditolak", async () => {
    const r = await cekAksesIsian(dbPalsu({ kegiatan: { tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-02-01", hari_tenggang: 0 } }), 7, 1, "2026-10-22", { toleransiOfflineHari: 2 });
    expect(r).toMatchObject({ status: 403 });
  });
  it("hari ini tetap lolos dan izin susulan tetap bertanda susulan", async () => {
    expect(await cekAksesIsian(dbPalsu(), 7, 1, "2026-10-23", { toleransiOfflineHari: 2 })).toMatchObject({ susulan: false });
    expect(await cekAksesIsian(dbPalsu({ izin: true }), 7, 1, "2026-10-19", { toleransiOfflineHari: 2 })).toMatchObject({ susulan: true });
  });
});
