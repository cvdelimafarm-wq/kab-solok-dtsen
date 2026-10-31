import { describe, expect, it } from "vitest";
import { hasilSeleksiIdent } from "../portal/seleksiHasil";

type Tabel = Record<string, { data: unknown; error?: unknown }>;
function dbTiruan(t: Tabel) {
  return {
    from(nama: string) {
      const hasil = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "is", "in", "like", "order", "limit"]) q[m] = () => q;
      q.then = (res: (v: unknown) => unknown) => res({ data: hasil.data, error: hasil.error ?? null });
      return q;
    },
  } as never;
}
const semua = () => true;

describe("hasilSeleksiIdent", () => {
  it("tanpa tautan -> tidak tersambung", async () => {
    const r = await hasilSeleksiIdent(dbTiruan({ keu_ident_kegiatan: { data: [] } }), 1, semua);
    expect(r).toMatchObject({ tersambung: false, kegiatan: [], seleksi: [] });
  });
  it("tertaut tetapi tidak berizin -> tersambung, kosong", async () => {
    const r = await hasilSeleksiIdent(dbTiruan({ keu_ident_kegiatan: { data: [{ kegiatan_id: 2 }] }, sigap_kegiatan: { data: [{ id: 2, nama: "SPDT NTP" }] } }), 1, () => false);
    expect(r.tersambung).toBe(true);
    expect(r.kegiatan).toEqual([]);
  });
  it("ringkasan seleksi + penugasan bersumber seleksi", async () => {
    const r = await hasilSeleksiIdent(
      dbTiruan({
        keu_ident_kegiatan: { data: [{ kegiatan_id: 2 }] },
        sigap_kegiatan: { data: [{ id: 2, nama: "SPDT NTP" }] },
        sigap_seleksi: { data: [{ id: 5, kegiatan_id: 2, nama: "Seleksi A", jalur: "seleksi", status: "selesai", kebutuhan_ppl: 4, kebutuhan_pml: 1, sudah_ppl: 1, sudah_pml: 0 }] },
        sigap_seleksi_peserta: { data: [{ seleksi_id: 5, peran: "ppl", status: "terdaftar", hasil: "lulus", konfirmasi: "bersedia", ditugaskan_at: "2026-11-01T00:00:00Z" }] },
        sigap_penugasan: { data: [{ peran: "ppl", sumber: "seleksi_5" }, { peran: "ppl", sumber: "seleksi_5" }] },
      }),
      1, semua,
    );
    expect(r.kegiatan).toEqual([{ id: 2, nama: "SPDT NTP" }]);
    expect(r.seleksi).toHaveLength(1);
    expect(r.seleksi[0]).toMatchObject({ id: 5, kegiatan_id: 2 });
    expect(r.seleksi[0].ppl).toMatchObject({ kebutuhan: 4, sisa: 3, pendaftar: 1, lulus: 1, bersedia: 1, ditugaskan: 1 });
    expect(r.ditugaskan).toEqual({ ppl: 2, pml: 0 });
  });
});
