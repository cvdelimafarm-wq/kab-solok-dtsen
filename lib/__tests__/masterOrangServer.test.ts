import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigap", () => ({}));
import { dataMasterOrang, tahunWib } from "../portal/masterOrang";

type Baris = Record<string, unknown>;
function dbTiruan(tabel: Record<string, Baris[] | { error: { code: string; message: string } }>) {
  const diminta: Record<string, string> = {};
  const db = {
    from(nama: string) {
      const sumber = tabel[nama];
      let hasil: Baris[] = Array.isArray(sumber) ? [...sumber] : [];
      const q: Record<string, unknown> = {
        select: (k: string) => { diminta[nama] = k; return q; },
        order: () => q,
        range: (a: number, b: number) => { hasil = hasil.slice(a, b + 1); return q; },
        then: (ok: (v: unknown) => unknown) => ok(Array.isArray(sumber) ? { data: hasil, error: null } : { data: null, error: (sumber as { error: unknown } | undefined)?.error ?? { code: "42P01", message: "does not exist" } }),
      };
      return q;
    },
  };
  return { db: db as never, diminta };
}

describe("tahunWib", () => {
  it("memakai tahun kalender WIB", () => {
    expect(tahunWib(new Date("2026-12-31T20:00:00Z"))).toBe(2027);
    expect(tahunWib(new Date("2026-11-07T10:00:00Z"))).toBe(2026);
  });
});

describe("dataMasterOrang", () => {
  it("menggabungkan akun, pool, dan profil; tidak meminta kolom pribadi", async () => {
    const { db, diminta } = dbTiruan({
      sigap_akun: [
        { id: 1, nama: "Ani", jenis: "mitra", aktif: true, magang: false, alamat_kecamatan: "KUBUNG", terakhir_masuk_at: "2026-11-01T00:00:00Z" },
        { id: 2, nama: "Budi", jenis: "mitra", aktif: true, magang: false, alamat_kecamatan: null, terakhir_masuk_at: null },
      ],
      sigap_mitra_pool: [{ akun_id: 1, tahun: 2026, status: "aktif" }],
      sigap_pegawai_profil: [],
    });
    const r = await dataMasterOrang(db, new Date("2026-11-07T10:00:00Z"));
    expect(r.siap).toBe(true);
    expect(r.tahun).toBe(2026);
    expect(r.temuan.find((t) => t.kode === "mitra_tanpa_pool")?.contoh.map((x) => x.nama)).toEqual(["Budi"]);
    expect(r.ringkas.belum_pernah_masuk).toBe(1);
    expect(diminta.sigap_akun).not.toMatch(/nik|nip|no_hp|token|pin_|email/);
  });
  it("tabel akun belum ada: siap false tanpa melempar; pool/profil belum ada dianggap kosong", async () => {
    expect((await dataMasterOrang(dbTiruan({}).db)).siap).toBe(false);
    const r = await dataMasterOrang(dbTiruan({ sigap_akun: [{ id: 1, nama: "Ani", jenis: "organik", aktif: true, magang: false, alamat_kecamatan: "X", terakhir_masuk_at: "2026-11-01T00:00:00Z" }] }).db);
    expect(r.siap).toBe(true);
    expect(r.temuan.some((t) => t.kode === "organik_tanpa_profil")).toBe(true);
  });
  it("membaca lebih dari satu halaman akun", async () => {
    const akun = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, nama: `Orang ${i}`, jenis: "mitra", aktif: true, magang: false, alamat_kecamatan: "X", terakhir_masuk_at: "2026-11-01T00:00:00Z" }));
    const r = await dataMasterOrang(dbTiruan({ sigap_akun: akun, sigap_mitra_pool: akun.map((a) => ({ akun_id: a.id, tahun: 2026, status: "aktif" })), sigap_pegawai_profil: [] }).db, new Date("2026-11-07T10:00:00Z"));
    expect(r.ringkas.mitra_aktif).toBe(1500);
    expect(r.temuan).toEqual([]);
  });
});
