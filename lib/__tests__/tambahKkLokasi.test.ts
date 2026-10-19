import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigapAkses", () => ({ catatAudit: vi.fn() }));
import { periksaTambahKk, tambahKk } from "@/lib/portal/pendataan";

type Panggilan = { p_lat: number | null; p_lng: number | null };
/** Db palsu: from(...).select().eq().limit().maybeSingle() + rpc() dengan jawaban berurutan. */
function dbPalsu(jawaban: { status: string; alasan?: string; kk_id?: number }[]) {
  const panggilan: Panggilan[] = [];
  const rantai: Record<string, unknown> = {};
  for (const k of ["select", "eq", "limit"]) rantai[k] = () => rantai;
  rantai.maybeSingle = async () => ({ data: { kegiatan_id: 1 } });
  const db = {
    from: () => rantai,
    rpc: async (_nama: string, arg: Panggilan) => {
      panggilan.push({ p_lat: arg.p_lat, p_lng: arg.p_lng });
      return { data: jawaban.shift(), error: null };
    },
  };
  return { db: db as never, panggilan };
}
const isi = (lat: number | null, lng: number | null) => ({ idsubsls: "1301010001000100", nama: "YUNITA NELFI", patokan: null, lat, lng, hasil: "terdampak" as const, waktu: "2026-10-19T01:00:00.000Z", kunci: "11111111-1111-4111-8111-111111111111", paksa: false });

describe("tambahKk: lokasi tidak wajib", () => {
  it("tanpa lokasi: satu panggilan, berhasil", async () => {
    const { db, panggilan } = dbPalsu([{ status: "tercatat", kk_id: 7 }]);
    expect(await tambahKk(db, 1, isi(null, null))).toEqual({ ok: true, kk_id: 7, duplikat: false });
    expect(panggilan).toEqual([{ p_lat: null, p_lng: null }]);
  });
  it("koordinat sah: dikirim apa adanya", async () => {
    const { db, panggilan } = dbPalsu([{ status: "tercatat", kk_id: 8 }]);
    await tambahKk(db, 1, isi(-0.8, 100.6));
    expect(panggilan).toEqual([{ p_lat: -0.8, p_lng: 100.6 }]);
  });
  it("koordinat ditolak database (di luar wilayah) -> diulang tanpa koordinat dan berhasil", async () => {
    const { db, panggilan } = dbPalsu([{ status: "ditolak", alasan: "koordinat_tidak_sah" }, { status: "tercatat", kk_id: 9 }]);
    expect(await tambahKk(db, 1, isi(-6.2, 106.8))).toEqual({ ok: true, kk_id: 9, duplikat: false });
    expect(panggilan).toEqual([{ p_lat: -6.2, p_lng: 106.8 }, { p_lat: null, p_lng: null }]);
  });
  it("penolakan lain tidak diulang (nama sudah ada tetap memunculkan konfirmasi)", async () => {
    const { db, panggilan } = dbPalsu([{ status: "ditolak", alasan: "nama_sudah_ada" }]);
    expect(await tambahKk(db, 1, isi(-0.8, 100.6))).toMatchObject({ ok: false, nama_ada: true });
    expect(panggilan).toHaveLength(1);
  });
  it("periksaTambahKk: koordinat tunggal (hanya lat) dibuang jadi tanpa lokasi", () => {
    const r = periksaTambahKk({ idsubsls: "1301010001000100", nama: "A", hasil: "terdampak", kunci: "11111111-1111-4111-8111-111111111111", lat: -0.8 });
    expect(r.ok && r.isi.lat === null && r.isi.lng === null).toBe(true);
  });
});
