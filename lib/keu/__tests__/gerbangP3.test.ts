// (6 Nov 2026) P3 audit Kelola: gerbang menolak `keu_jadwal_aksi`+sah dan membatasi penautan/penerapan penugasan ke kegiatan yang boleh dikelola.
import { describe, expect, it, vi, beforeEach } from "vitest";

const izinAkunMock = vi.fn();
vi.mock("@/lib/sigapAkses", () => ({ izinAkun: (...a: unknown[]) => izinAkunMock(...a) }));

import { tanganiPanggil, PESAN_SAH_LEWAT_STATUS } from "@/lib/keu/gerbang";
import type { Db } from "@/lib/sigap";

const rpc = vi.fn();
const db = { rpc } as unknown as Db;
const sesi = { akunId: 7, aktorId: null };
const izinSemua = { "translok.penugasan": { level: "kelola", semua: true, kegiatan: [] } };
const izinK1 = { "translok.penugasan": { level: "kelola", semua: false, kegiatan: [1] } };
const izinLihat = { "translok.penugasan": { level: "lihat", semua: true, kegiatan: [] } };

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { ok: 1 }, error: null }); izinAkunMock.mockReset(); });

describe("keu_jadwal_aksi + sah", () => {
  it("ditolak 403 tanpa menyentuh basis data", async () => {
    const r = await tanganiPanggil(db, sesi, { fungsi: "keu_jadwal_aksi", args: { p_jadwal: 1, p_aksi: "sah", p_nomor: "X", p_tanggal: "2026-11-01" } });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe(PESAN_SAH_LEWAT_STATUS);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("tidak terkecoh huruf besar atau spasi", async () => {
    const r = await tanganiPanggil(db, sesi, { fungsi: "keu_jadwal_aksi", args: { p_jadwal: 1, p_aksi: " SAH " } });
    expect(r.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("aksi lain tetap diteruskan", async () => {
    const r = await tanganiPanggil(db, sesi, { fungsi: "keu_jadwal_aksi", args: { p_jadwal: 1, p_aksi: "buka" } });
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("jalur pengesahan lewat keu_jadwal_langkah tidak terhalang", async () => {
    const r = await tanganiPanggil(db, sesi, { fungsi: "keu_jadwal_langkah", args: { p_jadwal: 1, p_langkah: "sah" } });
    expect(r.status).toBe(200);
  });
});

describe("penautan dan penerapan penugasan per kegiatan", () => {
  const tautkan = (k: unknown) => ({ fungsi: "keu_ident_kegiatan_tautkan", args: { p_ident: 5, p_kegiatan: k, p_fungsi: "x" } });
  const terapkan = (k: unknown) => ({ fungsi: "keu_usulan_terapkan", args: { p_ident: 5, p_kegiatan: k, p_kode: ["a"] } });

  it("pemegang kelola semua kegiatan lolos untuk keduanya", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinSemua });
    expect((await tanganiPanggil(db, sesi, tautkan(3))).status).toBe(200);
    expect((await tanganiPanggil(db, sesi, terapkan(3))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("kelola terbatas kegiatan 1: lolos di 1, ditolak di 3", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinK1 });
    expect((await tanganiPanggil(db, sesi, tautkan(1))).status).toBe(200);
    rpc.mockClear();
    const r = await tanganiPanggil(db, sesi, terapkan(3));
    expect(r.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("izin hanya lihat ditolak", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: izinLihat });
    expect((await tanganiPanggil(db, sesi, tautkan(1))).status).toBe(403);
  });
  it("tanpa izin sama sekali ditolak", async () => {
    izinAkunMock.mockResolvedValue({ peran: [], izin: {} });
    expect((await tanganiPanggil(db, sesi, terapkan(1))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("id kegiatan tidak valid ditolak 400 sebelum membaca izin", async () => {
    for (const k of [undefined, null, 0, -1, 1.5, "abc"]) {
      const r = await tanganiPanggil(db, sesi, tautkan(k));
      expect(r.status).toBe(400);
    }
    expect(izinAkunMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("fungsi lain tidak memicu pemeriksaan izin menu", async () => {
    const r = await tanganiPanggil(db, sesi, { fungsi: "keu_ident_hak", args: {} });
    expect(r.status).toBe(200);
    expect(izinAkunMock).not.toHaveBeenCalled();
  });
  it("tanpa sesi tetap 401", async () => {
    expect((await tanganiPanggil(db, null, tautkan(1))).status).toBe(401);
  });
  it("masuk-sebagai tetap ditolak sebelum pemeriksaan lain", async () => {
    const r = await tanganiPanggil(db, { akunId: 7, aktorId: 1 }, tautkan(1));
    expect(r.status).toBe(403);
    expect(izinAkunMock).not.toHaveBeenCalled();
  });
});
