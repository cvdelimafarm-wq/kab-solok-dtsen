// Uji sisi server impor satu kali (susunan tim + alokasi sampel) dengan basis data tiruan: pratinjau mode otomatis, bentrok peran, pemanggilan fungsi basis data, dan jalur cadangan.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigap", () => ({ penugasanAkun: async () => [] }));

import { GalatSampel, imporSampel, pratinjauSampel } from "../portal/sampel";

type Tabel = Record<string, Record<string, unknown>[]>;
type Panggilan = { fn: string; args: Record<string, unknown> };

/** Basis data tiruan minimal: from(...).select(...).eq/in/is/order/range(...) dan rpc(...). */
function dbTiruan(tabel: Tabel, rpcHasil: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }> = {}) {
  const panggilan: Panggilan[] = [];
  const from = (nama: string) => {
    let baris = [...(tabel[nama] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => ((baris = baris.filter((r) => r[k] === v)), q),
      in: (k: string, v: unknown[]) => ((baris = baris.filter((r) => v.includes(r[k]))), q),
      is: (k: string, v: unknown) => ((baris = baris.filter((r) => (v === null ? r[k] == null : r[k] === v))), q),
      order: () => q,
      range: () => q,
      maybeSingle: async () => ({ data: baris[0] ?? null, error: null }),
      then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: baris, error: null }).then(ok),
    };
    return q;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    panggilan.push({ fn, args });
    return rpcHasil[fn] ?? { data: { ok: true, unggah_id: 7, jumlah: 2, utama: 2, cadangan: 0, penugasan_baru: 3, tim: 4 }, error: null };
  };
  return { db: { from, rpc } as never, panggilan };
}

const AKUN = [
  { id: 1, nama: "Mitra A", jenis: "mitra", aktif: true },
  { id: 2, nama: "Mitra D", jenis: "mitra", aktif: true },
  { id: 3, nama: "Pegawai B, S.Tr.Stat.", jenis: "organik", aktif: true },
  { id: 5, nama: "Pegawai C, A.Md.", jenis: "organik", aktif: true },
  { id: 6, nama: "Pegawai S, S.Si.", jenis: "organik", aktif: true },
];
const baris = (o: Record<string, unknown> = {}) => ({
  "Kode Wilayah": "1303010001000100",
  "Nama Responden": "R1",
  "Status Sampel": "Utama",
  "Nama PPL": "Mitra A",
  "Nama PML": "Pegawai B",
  "Nama Korwil": "Pegawai C",
  "Nama Supervisor": "Pegawai S",
  ...o,
});
const BERKAS = [baris(), baris({ "Nama Responden": "R2", "Nama PPL": "Mitra D" })];
const KEGIATAN = [{ id: 6, nama: "Seruti TW IV" }];
const akun = { id: 99, nama: "Admin" } as never;

describe("pratinjau mode otomatis", () => {
  it("semua petugas belum ditugaskan: dicocokkan ke akun dan menjadi penugasan baru", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    const p = await pratinjauSampel(db, 6, BERKAS, true);
    expect(p.galat_total).toBe(0);
    expect(p.bisa_simpan).toBe(true);
    expect(p.otomatis).toBe(true);
    expect(p.tim.ringkas.per_peran).toEqual({ ppl: 2, pml: 1, korwil: 1, supervisor: 1 });
    expect(p.tim.baru_total).toBe(5);
    expect(p.tim.pemetaan_atasan.map((x) => x.peran)).toEqual(["korwil", "supervisor"]);
  });
  it("mode biasa (lama): petugas yang belum ditugaskan tidak ditemukan sehingga tidak bisa disimpan", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    const p = await pratinjauSampel(db, 6, BERKAS, false);
    expect(p.bisa_simpan).toBe(false);
    expect(p.galat_total).toBeGreaterThan(0);
    expect(p.galat.some((g) => g.pesan.includes("belum ditugaskan"))).toBe(true);
  });
  it("berkas lama tanpa kolom korwil/supervisor tetap berjalan; PML tanpa atasan dilaporkan", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    const lama = BERKAS.map(({ ["Nama Korwil"]: _a, ["Nama Supervisor"]: _b, ...r }) => r);
    const p = await pratinjauSampel(db, 6, lama, true);
    expect(p.bisa_simpan).toBe(true);
    expect(p.tim.ringkas.per_peran).toEqual({ ppl: 2, pml: 1, korwil: 0, supervisor: 0 });
    expect(p.tim.ringkas.tanpa_atasan.map((x) => x.peran)).toEqual(["pml"]);
  });
  it("petugas yang sudah ditugaskan dengan peran lain = galat, bukan diubah diam-diam", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [{ kegiatan_id: 6, akun_id: 3, peran: "ppl", aktif: true }] });
    const p = await pratinjauSampel(db, 6, BERKAS, true);
    expect(p.bisa_simpan).toBe(false);
    expect(p.galat.some((g) => g.pesan.includes("sudah ditugaskan sebagai PPL"))).toBe(true);
  });
  it("korwil/supervisor hanya dicari di akun organik (Mitra tidak dianggap)", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    const p = await pratinjauSampel(db, 6, [baris({ "Nama Korwil": "Mitra D" })], true);
    expect(p.bisa_simpan).toBe(false);
    expect(p.galat[0].pesan).toContain("Korwil");
  });
});

describe("imporSampel", () => {
  it("mode otomatis memanggil fungsi tunggal dengan susunan tim dan p_tugaskan benar", async () => {
    const { db, panggilan } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    const h = await imporSampel(db, akun, 6, "sampel.xlsx", BERKAS, false, true);
    expect(h).toMatchObject({ unggah_id: 7, penugasan_baru: 3, tim: 4 });
    expect(panggilan).toHaveLength(1);
    expect(panggilan[0].fn).toBe("sigap_tim_sampel_impor");
    expect(panggilan[0].args.p_tugaskan).toBe(true);
    const tim = panggilan[0].args.p_tim as { akun_id: number; peran: string; atasan_akun_id: number | null }[];
    expect(tim.find((t) => t.akun_id === 1)).toEqual({ akun_id: 1, peran: "ppl", atasan_akun_id: 3 });
    expect(tim.find((t) => t.akun_id === 3)).toEqual({ akun_id: 3, peran: "pml", atasan_akun_id: 5 });
    expect(tim.find((t) => t.akun_id === 6)).toEqual({ akun_id: 6, peran: "supervisor", atasan_akun_id: null });
    const baru = panggilan[0].args.p_baris as { ppl_akun_id: number; pml_akun_id: number }[];
    expect(baru.map((b) => [b.ppl_akun_id, b.pml_akun_id])).toEqual([[1, 3], [2, 3]]);
  });
  it("berkas bermasalah tidak memanggil basis data", async () => {
    const { db, panggilan } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] });
    await expect(imporSampel(db, akun, 6, "x.xlsx", [baris({ "Nama PPL": "Orang Asing" })], false, true)).rejects.toMatchObject({ kode: "BERKAS_BERMASALAH" });
    expect(panggilan).toHaveLength(0);
  });
  it("migrasi belum jalan: mode biasa jatuh ke fungsi lama; mode otomatis memberi pesan jelas", async () => {
    const penugasan = [
      { kegiatan_id: 6, akun_id: 1, peran: "ppl", aktif: true }, { kegiatan_id: 6, akun_id: 2, peran: "ppl", aktif: true },
      { kegiatan_id: 6, akun_id: 3, peran: "pml", aktif: true },
    ];
    const hilang = { sigap_tim_sampel_impor: { data: null, error: { code: "PGRST202", message: "Could not find the function" } } };
    const lama = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: penugasan }, hilang);
    const tanpaAtasan = BERKAS.map(({ ["Nama Korwil"]: _a, ["Nama Supervisor"]: _b, ...r }) => r);
    const h = await imporSampel(lama.db, akun, 6, "x.xlsx", tanpaAtasan, false, false);
    expect(lama.panggilan.map((x) => x.fn)).toEqual(["sigap_tim_sampel_impor", "sigap_sampel_impor"]);
    expect(h.unggah_id).toBe(7);
    const baru = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] }, hilang);
    const e = await imporSampel(baru.db, akun, 6, "x.xlsx", BERKAS, false, true).catch((x) => x);
    expect(e).toBeInstanceOf(GalatSampel);
    expect((e as GalatSampel).status).toBe(503);
    expect((e as GalatSampel).message).toContain("20261102c");
  });
  it("penolakan fungsi basis data diteruskan sebagai galat 400/409", async () => {
    const { db } = dbTiruan({ sigap_kegiatan: KEGIATAN, sigap_akun: AKUN, sigap_penugasan: [] }, { sigap_tim_sampel_impor: { data: { ok: false, kode: "ADA_PENGGANTIAN", pesan: "3 penggantian", n: 3 }, error: null } });
    const e = await imporSampel(db, akun, 6, "x.xlsx", BERKAS, false, true).catch((x) => x);
    expect((e as GalatSampel).status).toBe(409);
  });
});
