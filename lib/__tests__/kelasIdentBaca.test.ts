import { describe, expect, it } from "vitest";
import { muatKelasTertaut } from "../portal/kelasIdent";

// Database tiruan: setiap metode rantai mengembalikan dirinya sendiri; hasil diambil per tabel.
type Tabel = Record<string, { data: unknown; error?: unknown }>;
function dbTiruan(t: Tabel) {
  return {
    from(nama: string) {
      const hasil = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(hasil.data) ? (hasil.data[0] ?? null) : hasil.data, error: hasil.error ?? null });
      q.then = (res: (v: unknown) => unknown) => res({ data: hasil.data, error: hasil.error ?? null });
      return q;
    },
  } as never;
}

const isiKelas = (kelas: unknown[]) => ({ v: 1, wilayah: "", kelas, peran: {}, petugas: [] });
const kelasSah = (o: Record<string, unknown> = {}) => ({ id: "k1", nama: "Pelatihan A", sesi: "pelatihan", periode: "", metode: "Daring", tempat: "", lokasi: "", paket: "", oh: 1, mulai: "2026-11-02", selesai: "2026-11-02", untuk: ["ppl"], fix: true, instruktur: [], ...o });

describe("muatKelasTertaut", () => {
  it("tanpa tautan -> tidak tersambung", async () => {
    const r = await muatKelasTertaut(dbTiruan({ keu_ident_kegiatan: { data: [] } }), 3, true);
    expect(r.tersambung).toBe(false);
    expect(r.kelas).toEqual([]);
  });
  it("galat tabel (belum ada) -> tidak tersambung, tidak melempar", async () => {
    const r = await muatKelasTertaut(dbTiruan({ keu_ident_kegiatan: { data: null, error: { code: "42P01" } } }), 3, true);
    expect(r.tersambung).toBe(false);
  });
  it("tertaut tanpa lanjutan -> tersambung, kelas kosong", async () => {
    const r = await muatKelasTertaut(dbTiruan({ keu_ident_kegiatan: { data: [{ ident_id: 7 }] }, keu_ident_lanjutan: { data: [] } }), 3, true);
    expect(r.tersambung).toBe(true);
    expect(r.ident_id).toBe(7);
    expect(r.kelas).toEqual([]);
  });
  it("memilih versi final dibanding draf yang lebih baru", async () => {
    const r = await muatKelasTertaut(
      dbTiruan({
        keu_ident_kegiatan: { data: [{ ident_id: 7 }] },
        keu_ident_lanjutan: { data: [{ ident_id: 7, ver: 3, status: "draf", isi: isiKelas([kelasSah({ nama: "Draf" })]) }, { ident_id: 7, ver: 2, status: "final", isi: isiKelas([kelasSah({ nama: "Final" })]) }] },
        keu_ident: { data: [{ nama: "Seruti TW IV" }] },
      }),
      3, true,
    );
    expect(r.status_lanjutan).toBe("final");
    expect(r.versi).toBe(2);
    expect(r.ident_nama).toBe("Seruti TW IV");
    expect(r.kelas[0].nama).toBe("Final");
    expect(r.kelas[0].metode).toBe("Daring");
  });
  it("isi rusak tidak melempar", async () => {
    const r = await muatKelasTertaut(dbTiruan({ keu_ident_kegiatan: { data: [{ ident_id: 7 }] }, keu_ident_lanjutan: { data: [{ ident_id: 7, ver: 1, status: "final", isi: "rusak" }] } }), 3, true);
    expect(r.tersambung).toBe(true);
    expect(r.kelas).toEqual([]);
  });
});
