import { describe, expect, it } from "vitest";
import { usulanSeleksi } from "../portal/seleksiTurunan";

type Tabel = Record<string, { data: unknown; error?: unknown }>;
function dbTiruan(t: Tabel) {
  return {
    from(nama: string) {
      const hasil = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit", "range"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(hasil.data) ? (hasil.data[0] ?? null) : hasil.data, error: hasil.error ?? null });
      q.then = (res: (v: unknown) => unknown) => res({ data: hasil.data, error: hasil.error ?? null });
      return q;
    },
  } as never;
}
const isi = (ppl: object, pml: object) => ({ v: 1, wilayah: "", kelas: [], peran: { supervisor: { on: false }, kortim: { on: false }, ppl, pml, entri: { on: false } }, petugas: [] });
const P = (nOrg: number, nMit: number, fix = true) => ({ on: true, nOrg, nMit, translok: false, penginapan: false, fix });

describe("usulanSeleksi", () => {
  it("tanpa tautan: tidak tersambung, tanpa kebutuhan, tanpa sampel", async () => {
    const u = await usulanSeleksi(dbTiruan({ keu_ident_kegiatan: { data: [] } }), 2);
    expect(u.identifikasi.tersambung).toBe(false);
    expect(u.kebutuhan).toBeNull();
    expect(u.sampel).toMatchObject({ ada: false, wilayah: [] });
  });
  it("tertaut: kebutuhan dari lanjutan; organik dihitung dari penugasan non-Mitra", async () => {
    const u = await usulanSeleksi(
      dbTiruan({
        keu_ident_kegiatan: { data: [{ ident_id: 7 }] },
        keu_ident_lanjutan: { data: [{ ident_id: 7, ver: 1, status: "final", isi: isi(P(2, 8), P(1, 3, false)) }] },
        keu_ident: { data: [{ nama: "Seruti TW IV" }] },
        sigap_penugasan: { data: [{ akun_id: 1, peran: "ppl" }, { akun_id: 2, peran: "ppl" }, { akun_id: 3, peran: "pml" }] },
        sigap_akun: { data: [{ id: 1, jenis: "organik" }, { id: 2, jenis: "mitra" }, { id: 3, jenis: "organik" }] },
      }),
      2,
    );
    expect(u.identifikasi).toMatchObject({ tersambung: true, nama: "Seruti TW IV", status_lanjutan: "final", versi: 1 });
    expect(u.kebutuhan).toMatchObject({ kebutuhan_ppl: 10, kebutuhan_pml: 4, sudah_ppl: 1, sudah_pml: 1, organik_ppl: 1, organik_pml: 1, perkiraan: true });
  });
  it("sampel: wilayah diturunkan dengan koordinat master", async () => {
    const u = await usulanSeleksi(
      dbTiruan({
        sigap_sampel: { data: [{ kode_wilayah: "1303040001000201", kode_sls: "13030400010002", status: "utama", lat: null, lng: null }] },
        bencana_subsls_koordinat: { data: [{ idsubsls: "1303040001000201", lat: -1, lon: 100 }] },
      }),
      2,
    );
    expect(u.sampel.ada).toBe(true);
    expect(u.sampel.wilayah).toHaveLength(1);
    expect(u.sampel.wilayah[0]).toMatchObject({ kode: "13030400010002", lat: -1, lng: 100, jumlah_sampel: 1 });
  });
  it("tertaut tanpa lanjutan: tersambung tetapi tanpa kebutuhan", async () => {
    const u = await usulanSeleksi(dbTiruan({ keu_ident_kegiatan: { data: [{ ident_id: 7 }] }, keu_ident_lanjutan: { data: [] } }), 2);
    expect(u.identifikasi.tersambung).toBe(true);
    expect(u.kebutuhan).toBeNull();
  });
});
