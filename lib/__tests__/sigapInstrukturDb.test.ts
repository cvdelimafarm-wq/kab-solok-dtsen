// (3 Nov 2026) Instruktur kelas per pelatihan: muat, kelas tersedia, cari akun, tetapkan, lepas.
import { describe, expect, it } from "vitest";
import { KELAS_MAKS, cariAkun, kelasSah, kelasTersedia, lepasInstruktur, muatInstruktur, tetapkanInstruktur } from "../sigapInstrukturDb";

type Tabel = Record<string, unknown[]>;

// (8 Nov 2026) kelas kini milik pelatihan (tabel sigap_pelatihan_kelas); tetapkanInstruktur hanya menerima kelas yang ada di daftar itu
const KELAS_1_2 = { sigap_pelatihan_kelas: [{ nomor: 1, nama: "Kelas 1", kuota: null }, { nomor: 2, nama: "Kelas 2", kuota: null }] };

/** Penyusun kueri tiruan: mencatat panggilan, mengembalikan data tabel; galat bisa dipaksa per tabel. */
function dbTiruan(tabel: Tabel, galat: Record<string, boolean> = {}) {
  const catatan: { t: string; op: string; arg?: unknown }[] = [];
  const db = {
    from(t: string) {
      const q: Record<string, unknown> = {};
      const rantai = () => q;
      for (const m of ["select", "eq", "in", "ilike", "order", "limit", "not", "or"]) q[m] = (...a: unknown[]) => (catatan.push({ t, op: m, arg: a }), rantai());
      q.maybeSingle = async () => ({ data: (tabel[t] ?? [])[0] ?? null, error: null });
      q.upsert = async (v: unknown, o: unknown) => (catatan.push({ t, op: "upsert", arg: [v, o] }), { error: galat[t] ? { message: "x" } : null });
      q.delete = () => ({ eq: () => ({ eq: async () => (catatan.push({ t, op: "delete" }), { error: galat[t] ? { message: "x" } : null }) }) });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: tabel[t] ?? [], error: null }).then(res);
      return q;
    },
  };
  return { db, catatan };
}

describe("kelasSah", () => {
  it("bilangan bulat 1..KELAS_MAKS", () => {
    expect(kelasSah(1)).toBe(true);
    expect(kelasSah(KELAS_MAKS)).toBe(true);
    for (const x of [0, -1, KELAS_MAKS + 1, 1.5, "2", null, NaN]) expect(kelasSah(x)).toBe(false);
  });
});

describe("muatInstruktur", () => {
  it("memberi nama dan mengurutkan menurut kelas lalu nama", async () => {
    const { db } = dbTiruan({
      sigap_kuis_instruktur_kelas: [{ akun_id: 3, kelas: 2 }, { akun_id: 1, kelas: 1 }, { akun_id: 2, kelas: 2 }],
      sigap_akun: [{ id: 1, nama: "Budi" }, { id: 2, nama: "Ani" }, { id: 3, nama: "Zed" }],
    });
    const r = await muatInstruktur(db, 7);
    expect(r.map((x) => `${x.kelas}:${x.nama}`)).toEqual(["1:Budi", "2:Ani", "2:Zed"]);
  });
  it("kosong -> daftar kosong tanpa membaca tabel akun", async () => {
    const { db, catatan } = dbTiruan({ sigap_kuis_instruktur_kelas: [] });
    expect(await muatInstruktur(db, 7)).toEqual([]);
    expect(catatan.some((c) => c.t === "sigap_akun")).toBe(false);
  });
});

describe("kelasTersedia", () => {
  it("kelas peserta aktif digabung kelas instruktur, urut naik tanpa duplikat", async () => {
    const { db } = dbTiruan({ sigap_penugasan: [{ kelas: 3 }, { kelas: 1 }, { kelas: 3 }, { kelas: null }] });
    expect(await kelasTersedia(db, 7, [{ akun_id: 1, nama: "A", kelas: 5 }])).toEqual([1, 3, 5]);
  });
  it("tanpa data sama sekali -> hanya Kelas 1 (bukan lagi 1 sampai 4)", async () => {
    const { db } = dbTiruan({ sigap_penugasan: [] });
    expect(await kelasTersedia(db, 7, [])).toEqual([1]);
  });
  it("memakai daftar kelas milik pelatihan (tabel kelas) ditambah kelas terpakai dan kelas instruktur", async () => {
    const { db } = dbTiruan({ ...KELAS_1_2, sigap_penugasan: [{ kelas: 4 }] });
    expect(await kelasTersedia(db, 7, [{ akun_id: 1, nama: "A", kelas: 6 }])).toEqual([1, 2, 4, 6]);
  });
});

describe("cariAkun", () => {
  it("kata kurang dari 2 huruf tidak mencari", async () => {
    const { db, catatan } = dbTiruan({ sigap_akun: [{ id: 1, nama: "Ani", jenis: "pegawai" }] });
    expect(await cariAkun(db, " a ")).toEqual([]);
    expect(catatan).toHaveLength(0);
  });
  it("karakter khusus pola dibersihkan; hasil dipetakan", async () => {
    const { db, catatan } = dbTiruan({ sigap_akun: [{ id: 9, nama: "Iqbal", jenis: null }] });
    expect(await cariAkun(db, "iq%b_al")).toEqual([{ akun_id: 9, nama: "Iqbal", jenis: null }]);
    const ilike = catatan.find((c) => c.op === "ilike")!.arg as string[];
    expect(ilike[1]).toBe("%iq b al%");
  });
});

describe("tetapkanInstruktur / lepasInstruktur", () => {
  it("menolak kelas tidak sah dan akun tak dikenal atau tidak aktif", async () => {
    expect(await tetapkanInstruktur(dbTiruan({}).db, 7, 1, 0)).toMatchObject({ ok: false });
    expect(await tetapkanInstruktur(dbTiruan({ ...KELAS_1_2, sigap_akun: [{ id: 1, aktif: true }] }).db, 7, 1, 3)).toEqual({ ok: false, pesan: "Kelas itu tidak ada di pelatihan ini. Atur kelas di Pengaturan kelas." });
    expect(await tetapkanInstruktur(dbTiruan({ ...KELAS_1_2, sigap_akun: [] }).db, 7, 1, 2)).toEqual({ ok: false, pesan: "Akun tidak ditemukan." });
    expect(await tetapkanInstruktur(dbTiruan({ ...KELAS_1_2, sigap_akun: [{ id: 1, aktif: false }] }).db, 7, 1, 2)).toEqual({ ok: false, pesan: "Akun itu tidak aktif." });
  });
  it("menyimpan lewat upsert pada kunci kegiatan+akun (memindahkan kelas tidak menimbulkan duplikat)", async () => {
    const { db, catatan } = dbTiruan({ ...KELAS_1_2, sigap_akun: [{ id: 354, aktif: true }] });
    expect(await tetapkanInstruktur(db, 7, 354, 2)).toEqual({ ok: true });
    const up = catatan.find((c) => c.op === "upsert")!;
    expect(up.t).toBe("sigap_kuis_instruktur_kelas");
    expect(up.arg).toEqual([{ kegiatan_id: 7, akun_id: 354, kelas: 2 }, { onConflict: "kegiatan_id,akun_id" }]);
  });
  it("galat basis data dilaporkan, bukan ditelan", async () => {
    const { db } = dbTiruan({ ...KELAS_1_2, sigap_akun: [{ id: 1, aktif: true }] }, { sigap_kuis_instruktur_kelas: true });
    expect(await tetapkanInstruktur(db, 7, 1, 2)).toEqual({ ok: false, pesan: "Gagal menyimpan instruktur." });
    expect(await lepasInstruktur(db, 7, 1)).toEqual({ ok: false, pesan: "Gagal melepas instruktur." });
  });
  it("melepas menghapus baris kegiatan+akun", async () => {
    const { db, catatan } = dbTiruan({});
    expect(await lepasInstruktur(db, 7, 354)).toEqual({ ok: true });
    expect(catatan.some((c) => c.op === "delete")).toBe(true);
  });
});
