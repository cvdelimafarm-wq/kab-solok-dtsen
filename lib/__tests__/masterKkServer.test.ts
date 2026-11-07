import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigap", () => ({}));
import { dataMasterKk, putuskanUsulanKk, terapkanUnggahKk } from "../portal/masterKk";

type Baris = Record<string, unknown>;
type Galat = { code?: string; message: string };
function dbTiruan(o: { tabel?: Record<string, Baris[] | { error: Galat }>; rpc?: Record<string, (a: Record<string, unknown>) => { data?: unknown; error?: Galat | null }> } = {}) {
  const panggilan: { nama: string; arg: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (nama: string, arg: Record<string, unknown> = {}) => {
      panggilan.push({ nama, arg });
      const f = o.rpc?.[nama];
      return f ? { data: null, error: null, ...f(arg) } : { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    },
    from(nama: string) {
      const sumber = o.tabel?.[nama];
      let hasil: Baris[] = Array.isArray(sumber) ? [...sumber] : [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { hasil = hasil.filter((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { hasil = hasil.filter((r) => (r[k] ?? null) === v); return q; },
        in: (k: string, v: unknown[]) => { hasil = hasil.filter((r) => v.includes(r[k])); return q; },
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown) => ok(Array.isArray(sumber) ? { data: hasil, error: null } : sumber ? { data: null, error: (sumber as { error: Galat }).error } : { data: null, error: { code: "42P01", message: "does not exist" } }),
      };
      return q;
    },
  };
  return { db: db as never, panggilan };
}

const baris = (n = 2) => Array.from({ length: n }, (_, i) => ({ idsubsls: "1303110005000102", nama_kk: `KK ${i}`, anggota_lain: null, patokan: null, lat: null, lng: null }));
const hasilRpc = { baris: 2, baru: 1, berubah: 1, sama: 0, diaktifkan: 0, hilang: 3, hilang_terpakai: 1, nonaktif: 2, unggah_id: 7, contoh: { baru: [{ idsubsls: "1303110005000102", nama: "Baru" }], berubah: [], hilang: [{ idsubsls: "1303110005000102", nama: "Lama", terpakai: true }] } };

describe("dataMasterKk", () => {
  it("SQL j belum dijalankan: siap false tanpa melempar", async () => {
    const { db } = dbTiruan();
    const r = await dataMasterKk(db);
    expect(r.siap).toBe(false);
    expect(r.kecamatan).toEqual([]);
  });
  it("menggabungkan ringkasan kecamatan, riwayat (nama kecamatan dan pengunggah), dan usulan", async () => {
    const { db } = dbTiruan({
      rpc: { master_kk_per_kec: () => ({ data: [{ kd_kec: "1303110", kecamatan: "KUBUNG", subsls: 161, subsls_berkk: 160, kk_aktif: 17622, terbaru: "2026-11-07T10:41:05Z" }] }) },
      tabel: {
        master_kk_unggah: [{ id: 1, kd_kec: "1303110", nama_berkas: "kubung.xlsx", dibuat_oleh: 9, dibuat_at: "2026-11-08T01:00:00Z", jumlah_baris: 10, baru: 2, berubah: 1, sama: 7, diaktifkan: 0, nonaktif: 0, nonaktifkan_hilang: false }],
        sigap_akun: [{ id: 9, nama: "M. Iqbal Hadi" }],
        sigap_sampel_ganti: [{ id: 3, kegiatan_id: 6, idsubsls: "1303110005000102", utama_kk_id: 11, alasan: "pindah", usul_master: true, status: "disetujui", diajukan_nama: "Ani", diajukan_at: "2026-11-12T01:00:00Z" }],
        master_kk: [{ id: 11, nama_kk: "Pak Uji" }],
        sigap_kegiatan: [{ id: 6, nama: "Seruti TW IV" }],
        master_wilayah: [{ idsubsls: "1303110005000102", kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN" }],
      },
    });
    const r = await dataMasterKk(db);
    expect(r.siap).toBe(true);
    expect(r.usulan_siap).toBe(true);
    expect(r.kecamatan[0]).toMatchObject({ kd_kec: "1303110", kk_aktif: 17622, subsls_berkk: 160 });
    expect(r.riwayat[0]).toMatchObject({ kecamatan: "KUBUNG", oleh: "M. Iqbal Hadi", baru: 2 });
    expect(r.usulan[0]).toMatchObject({ id: 3, kegiatan: "Seruti TW IV", nama_kk: "Pak Uji", nagari: "GANTUANG CIRI", status: "disetujui" });
  });
  it("kolom keputusan usulan belum ada: usulan_siap false, bagian lain tetap", async () => {
    const { db } = dbTiruan({
      rpc: { master_kk_per_kec: () => ({ data: [] }) },
      tabel: { master_kk_unggah: [], sigap_sampel_ganti: { error: { code: "42703", message: "column usul_putusan does not exist" } } },
    });
    const r = await dataMasterKk(db);
    expect(r.siap).toBe(true);
    expect(r.usulan_siap).toBe(false);
  });
});

describe("terapkanUnggahKk", () => {
  it("pratinjau memanggil fungsi dengan p_terapkan=false dan memetakan hasil", async () => {
    const { db, panggilan } = dbTiruan({ rpc: { master_kk_terapkan: () => ({ data: hasilRpc }) } });
    const r = await terapkanUnggahKk(db, 5, { kec: "1303110", berkas: "k.xlsx", baris: baris(), nonaktifkan: true, terapkan: false });
    expect(r).toMatchObject({ ok: true, terapkan: false, baru: 1, hilang_terpakai: 1, nonaktif: 2, unggah_id: 7 });
    expect(panggilan[0].arg).toMatchObject({ p_akun: 5, p_kec: "1303110", p_nonaktifkan: true, p_terapkan: false });
    if (r.ok) expect(r.contoh.hilang[0]).toMatchObject({ nama: "Lama", terpakai: true });
  });
  it("nonaktifkan hanya true bila tepat true", async () => {
    const { db, panggilan } = dbTiruan({ rpc: { master_kk_terapkan: () => ({ data: hasilRpc }) } });
    await terapkanUnggahKk(db, 5, { kec: "1303110", berkas: "", baris: baris(), nonaktifkan: "ya", terapkan: true });
    expect(panggilan[0].arg.p_nonaktifkan).toBe(false);
  });
  it("menolak kecamatan tidak sah, baris tak sah, dan baris di luar kecamatan terpilih tanpa memanggil basis data", async () => {
    const { db, panggilan } = dbTiruan({ rpc: { master_kk_terapkan: () => ({ data: hasilRpc }) } });
    expect(await terapkanUnggahKk(db, 5, { kec: "abc", berkas: "", baris: baris(), nonaktifkan: false, terapkan: false })).toMatchObject({ ok: false, status: 400 });
    expect(await terapkanUnggahKk(db, 5, { kec: "1303110", berkas: "", baris: [{ idsubsls: "1" }], nonaktifkan: false, terapkan: false })).toMatchObject({ ok: false, status: 400 });
    const asing = await terapkanUnggahKk(db, 5, { kec: "1303080", berkas: "", baris: baris(), nonaktifkan: false, terapkan: false });
    expect(asing).toMatchObject({ ok: false, status: 400 });
    expect(panggilan).toHaveLength(0);
  });
  it("fungsi belum ada -> 503; galat bisnis fungsi -> 400 dengan pesan aslinya; lainnya dilempar", async () => {
    expect(await terapkanUnggahKk(dbTiruan().db, 5, { kec: "1303110", berkas: "", baris: baris(), nonaktifkan: false, terapkan: true })).toMatchObject({ ok: false, status: 503 });
    const bisnis = dbTiruan({ rpc: { master_kk_terapkan: () => ({ error: { code: "P0001", message: "2 baris memuat sub SLS yang bukan milik kecamatan ini." } }) } });
    expect(await terapkanUnggahKk(bisnis.db, 5, { kec: "1303110", berkas: "", baris: baris(), nonaktifkan: false, terapkan: true })).toEqual({ ok: false, status: 400, pesan: "2 baris memuat sub SLS yang bukan milik kecamatan ini." });
    const rusak = dbTiruan({ rpc: { master_kk_terapkan: () => ({ error: { code: "XX000", message: "boom" } }) } });
    await expect(terapkanUnggahKk(rusak.db, 5, { kec: "1303110", berkas: "", baris: baris(), nonaktifkan: false, terapkan: true })).rejects.toThrow("boom");
  });
});

describe("putuskanUsulanKk", () => {
  it("meneruskan keputusan ke fungsi", async () => {
    const { db, panggilan } = dbTiruan({ rpc: { master_usul_putuskan: () => ({ data: {} }) } });
    expect(await putuskanUsulanKk(db, 5, 3, "diterapkan", "sudah pindah")).toEqual({ ok: true });
    expect(panggilan[0].arg).toEqual({ p_ganti: 3, p_akun: 5, p_putusan: "diterapkan", p_catatan: "sudah pindah" });
  });
  it("menolak masukan tak sah dan meneruskan galat bisnis", async () => {
    const { db } = dbTiruan({ rpc: { master_usul_putuskan: () => ({ error: { code: "P0001", message: "Usulan ini sudah diputuskan (diterapkan)." } }) } });
    expect(await putuskanUsulanKk(db, 5, "x", "diterapkan", "")).toMatchObject({ ok: false, status: 400 });
    expect(await putuskanUsulanKk(db, 5, 3, "hapus", "")).toMatchObject({ ok: false, status: 400 });
    expect(await putuskanUsulanKk(db, 5, 3, "ditolak", "")).toEqual({ ok: false, status: 400, pesan: "Usulan ini sudah diputuskan (diterapkan)." });
    expect(await putuskanUsulanKk(dbTiruan().db, 5, 3, "ditolak", "")).toMatchObject({ ok: false, status: 503 });
  });
});
