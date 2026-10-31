import { beforeEach, describe, expect, it } from "vitest";
import { aturLibur } from "../delego/hitung";
import { bebanCalon } from "../portal/bebanCalon";

type Tabel = Record<string, { data: unknown; error?: unknown }>;
function dbTiruan(t: Tabel) {
  return {
    from(nama: string) {
      const hasil = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(hasil.data) ? (hasil.data[0] ?? null) : hasil.data, error: hasil.error ?? null });
      q.then = (res: (v: unknown) => unknown) => res({ data: hasil.data, error: hasil.error ?? null });
      return q;
    },
  } as never;
}
beforeEach(() => aturLibur([]));
const HARI = new Date("2026-11-03T03:00:00Z"); // Selasa 3 Nov 2026 10.00 WIB

describe("bebanCalon", () => {
  it("akun tidak ada -> null", async () => {
    expect(await bebanCalon(dbTiruan({ sigap_akun: { data: null } }), 1, 2, HARI)).toBeNull();
  });
  it("akun ringan tanpa delegasi dan penugasan lain -> aman", async () => {
    const r = await bebanCalon(dbTiruan({ sigap_akun: { data: { id: 7, nama: "Budi", jenis: "mitra" } }, sigap_kegiatan: { data: [{ tanggal_mulai: "2026-11-01", tanggal_selesai: "2026-11-30", target_selesai: null }] } }), 7, 2, HARI);
    expect(r?.peringatan.tingkat).toBe("aman");
    expect(r?.minggu).toHaveLength(4);
    expect(r?.delegasi_aktif).toBe(0);
  });
  it("delegasi berlebih dan penugasan lain beririsan -> berat", async () => {
    const r = await bebanCalon(
      dbTiruan({
        sigap_akun: { data: { id: 7, nama: "Budi", jenis: "mitra" } },
        keu_dlg_delegasi: { data: [{ id: 5, penerima_akun: 7, status: "berjalan", mulai: "2026-11-02", tenggat: "2026-11-30", hari_kerja: [1, 2, 3, 4, 5], target_harian: "90.00", target_total: null }] },
        keu_dlg_target: { data: [] },
        sigap_penugasan: { data: [{ kegiatan_id: 9, peran: "ppl" }] },
        sigap_kegiatan: { data: [{ id: 9, nama: "Seruti TW IV", aktif: true, tanggal_mulai: "2026-11-01", tanggal_selesai: "2026-11-30", target_selesai: null }] },
      }),
      7, 2, HARI,
    );
    expect(r?.peringatan.tingkat).toBe("berat");
    expect(r?.delegasi_aktif).toBe(1);
    expect(r?.minggu[0].kategori).toBe("berlebih");
    expect(r?.penugasan_lain).toHaveLength(1);
    expect(r?.penugasan_lain[0].beririsan).toBe(true);
  });
  it("kegiatan lain nonaktif tidak dihitung (tidak ditemukan pada daftar aktif)", async () => {
    const r = await bebanCalon(
      dbTiruan({ sigap_akun: { data: { id: 7, nama: "Budi", jenis: "organik" } }, sigap_penugasan: { data: [{ kegiatan_id: 9, peran: "ppl" }] }, sigap_kegiatan: { data: [] } }),
      7, 2, HARI,
    );
    expect(r?.penugasan_lain).toEqual([]);
    expect(r?.akun.jenis).toBe("organik");
  });
});
