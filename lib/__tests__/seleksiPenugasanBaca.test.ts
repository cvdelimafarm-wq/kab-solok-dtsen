import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

import { tugaskanPeserta } from "../portal/seleksiPenugasan";

type Tabel = Record<string, { data: unknown; error?: unknown }>;
/** Database tiruan: baca per tabel, insert/update dicatat. */
function dbTiruan(t: Tabel) {
  const catat: { tabel: string; op: string; isi: unknown }[] = [];
  const db = {
    from(nama: string) {
      const hasil = t[nama] ?? { data: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: Array.isArray(hasil.data) ? (hasil.data[0] ?? null) : hasil.data, error: hasil.error ?? null });
      q.insert = async (isi: unknown) => { catat.push({ tabel: nama, op: "insert", isi }); return { error: null }; };
      q.update = (isi: unknown) => { catat.push({ tabel: nama, op: "update", isi }); return q; };
      q.then = (res: (v: unknown) => unknown) => res({ data: hasil.data, error: hasil.error ?? null });
      return q;
    },
  };
  return { db: db as never, catat };
}

const isiKelas = (kelas: unknown[]) => ({ v: 1, wilayah: "", kelas, peran: {}, petugas: [] });
const kelas = (o: Record<string, unknown> = {}) => ({ id: "k1", nama: "Kelas A", sesi: "pelatihan", periode: "", metode: "Daring", tempat: "", lokasi: "", paket: "", oh: 1, mulai: "2026-11-02", selesai: "2026-11-02", untuk: ["ppl"], fix: true, instruktur: [], ...o });
const tertaut = (kls: unknown[]) => ({
  keu_ident_kegiatan: { data: [{ ident_id: 7 }] },
  keu_ident_lanjutan: { data: [{ ident_id: 7, ver: 1, status: "final", isi: isiKelas(kls) }] },
  keu_ident: { data: { nama: "Ident" } },
});
const sisipan = (c: { tabel: string; op: string; isi: unknown }[]) => c.find((x) => x.tabel === "sigap_penugasan" && x.op === "insert")?.isi as Record<string, unknown>;

describe("tugaskanPeserta + kelas", () => {
  it("tanpa tautan identifikasi: penugasan tanpa kelas (perilaku lama)", async () => {
    const { db, catat } = dbTiruan({ sigap_penugasan: { data: null }, keu_ident_kegiatan: { data: [] } });
    const r = await tugaskanPeserta(db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "ppl" });
    expect(r.hasil).toBe("ditambahkan");
    expect(sisipan(catat)).not.toHaveProperty("kelas");
  });
  it("satu kelas untuk perannya: kelas otomatis", async () => {
    const { db, catat } = dbTiruan({ sigap_penugasan: { data: null }, ...tertaut([kelas({ id: "a", untuk: ["ppl"] }), kelas({ id: "b", untuk: ["pml"] })]), sigap_seleksi_peserta: { data: { kelas_pilihan: null } } });
    await tugaskanPeserta(db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "pml" });
    expect(sisipan(catat)).toMatchObject({ kelas: 2, peran: "pml", sumber: "seleksi_1" });
  });
  it("beberapa kelas: memakai pilihan Mitra; tanpa pilihan -> tanpa kelas", async () => {
    const dua = [kelas({ id: "a", untuk: ["ppl"] }), kelas({ id: "b", untuk: ["ppl"] })];
    const a = dbTiruan({ sigap_penugasan: { data: null }, ...tertaut(dua), sigap_seleksi_peserta: { data: { kelas_pilihan: 2 } } });
    await tugaskanPeserta(a.db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "ppl" });
    expect(sisipan(a.catat)).toMatchObject({ kelas: 2 });
    const b = dbTiruan({ sigap_penugasan: { data: null }, ...tertaut(dua), sigap_seleksi_peserta: { data: { kelas_pilihan: null } } });
    await tugaskanPeserta(b.db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "ppl" });
    expect(sisipan(b.catat)).not.toHaveProperty("kelas");
  });
  it("kolom kelas_pilihan belum ada (galat baca): tetap bertugas, kelas dari aturan satu-kelas", async () => {
    const { db, catat } = dbTiruan({ sigap_penugasan: { data: null }, ...tertaut([kelas({ id: "a", untuk: ["ppl"] })]), sigap_seleksi_peserta: { data: null, error: { code: "42703" } } });
    await tugaskanPeserta(db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "ppl" });
    expect(sisipan(catat)).toMatchObject({ kelas: 1 });
  });
  it("penugasan sudah ada: tidak menyisipkan dan tidak mengubah kelas", async () => {
    const { db, catat } = dbTiruan({ sigap_penugasan: { data: { id: 5 } }, ...tertaut([kelas()]) });
    const r = await tugaskanPeserta(db, { seleksiId: 1, kegiatanId: 2, akunId: 9, peran: "ppl" });
    expect(r.hasil).toBe("sudah_ada");
    expect(sisipan(catat)).toBeUndefined();
  });
});
