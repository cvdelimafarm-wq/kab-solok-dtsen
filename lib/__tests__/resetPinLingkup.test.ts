// lib/__tests__/resetPinLingkup.test.ts
// (6 Nov 2026) Uji resetPinOlehAdmin dan akunTerlindungi dengan basis data tiruan (audit Kelola K01-E3-1 / K06b-A1).
import { describe, expect, it, vi } from "vitest";

process.env.SUPABASE_SERVICE_ROLE_KEY = "kunci-uji";

vi.mock("@/lib/undangan", () => ({ cekPin: vi.fn(() => false), hashPin: vi.fn(() => ({ hash: "h", salt: "s" })), normNama: (n: string) => n.toLowerCase() }));
vi.mock("@/lib/sigapMasukNama", () => ({ PIN_AWAL: "1303" }));
vi.mock("@/lib/sigapAkses", () => ({ catatAudit: vi.fn(async () => undefined) }));

import { akunTerlindungi, resetPinOlehAdmin } from "@/lib/sigapPin";
import * as akses from "@/lib/sigapAkses";

type Baris = Record<string, unknown>;
type Tabel = Record<string, Baris[]>;

/** Basis data tiruan: from().select().eq()/in()/limit() lalu await, maybeSingle(), update(), delete(). */
function dbTiruan(tabel: Tabel) {
  const tulis: { tabel: string; nilai: Baris }[] = [];
  const db = {
    tulis,
    from(nama: string) {
      let baris = [...(tabel[nama] ?? [])];
      let aksi: "baca" | "ubah" | "hapus" = "baca";
      let nilai: Baris = {};
      const b: Record<string, unknown> = {
        select: () => b,
        update: (v: Baris) => ((aksi = "ubah"), (nilai = v), b),
        delete: () => ((aksi = "hapus"), b),
        eq: (k: string, v: unknown) => ((baris = baris.filter((r) => r[k] === v)), b),
        in: (k: string, v: unknown[]) => ((baris = baris.filter((r) => v.includes(r[k]))), b),
        limit: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: baris[0] ?? null, error: null }),
        then: (res: (x: unknown) => unknown) => {
          if (aksi === "ubah") tulis.push({ tabel: nama, nilai });
          return Promise.resolve({ data: baris, error: null }).then(res);
        },
      };
      return b;
    },
  };
  return db as unknown as Parameters<typeof resetPinOlehAdmin>[0] & { tulis: typeof tulis };
}

const tabelDasar = (): Tabel => ({
  sigap_akun: [
    { id: 10, nama: "Petugas Satu", aktif: true, petugas_bencana_id: null },
    { id: 11, nama: "Petugas Dua", aktif: true, petugas_bencana_id: null },
    { id: 12, nama: "Pengelola Lain", aktif: true, petugas_bencana_id: null },
    { id: 13, nama: "Admin Anggaran", aktif: true, petugas_bencana_id: null },
    { id: 14, nama: "Nonaktif", aktif: false, petugas_bencana_id: null },
  ],
  sigap_penugasan: [
    { akun_id: 10, kegiatan_id: 3, aktif: true },
    { akun_id: 11, kegiatan_id: 5, aktif: true },
    { akun_id: 12, kegiatan_id: 3, aktif: true },
    { akun_id: 13, kegiatan_id: 3, aktif: true },
    { akun_id: 14, kegiatan_id: 3, aktif: true },
  ],
  sigap_akun_peran: [
    { akun_id: 12, peran_id: 100 },
    { akun_id: 13, peran_id: 101 },
  ],
  sigap_peran: [
    { id: 100, kode: "pengelola_psp" },
    { id: 101, kode: "admin_anggaran" },
  ],
  sigap_peran_izin: [{ peran_id: 100, menu_kode: "translok.penugasan", level: "kelola" }],
});

const aktor = (lingkup: "semua" | number[], adminAplikasi = false) => ({ akunId: 1, nama: "Aktor", adminAplikasi, lingkup });

describe("resetPinOlehAdmin berlingkup", () => {
  it("berhasil untuk petugas yang bertugas di kegiatan aktor, dan mencatat audit tanpa PIN", async () => {
    const db = dbTiruan(tabelDasar());
    const r = await resetPinOlehAdmin(db, aktor([3]), 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pin).toMatch(/^\d{4}$/);
    expect(db.tulis.some((t: { tabel: string; nilai: Baris }) => t.tabel === "sigap_akun" && "pin_hash" in t.nilai)).toBe(true);
    const audit = vi.mocked(akses.catatAudit).mock.calls.at(-1);
    expect(audit?.[2]).toBe("reset_pin_admin");
    expect(JSON.stringify(audit?.[3])).not.toMatch(/"pin"/);
  });
  it("ditolak 403 untuk petugas di kegiatan lain dan TIDAK menulis hash", async () => {
    const db = dbTiruan(tabelDasar());
    const r = await resetPinOlehAdmin(db, aktor([3]), 11);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
    expect(db.tulis.length).toBe(0);
  });
  it("pemegang izin kelola dan admin anggaran dilindungi bagi aktor non-admin-aplikasi", async () => {
    for (const id of [12, 13]) {
      const db = dbTiruan(tabelDasar());
      const r = await resetPinOlehAdmin(db, aktor("semua"), id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
      expect(db.tulis.length).toBe(0);
    }
  });
  it("Admin Aplikasi boleh mereset pemegang izin kelola dan petugas kegiatan mana pun", async () => {
    for (const id of [10, 11, 12, 13]) {
      const db = dbTiruan(tabelDasar());
      expect((await resetPinOlehAdmin(db, aktor("semua", true), id)).ok).toBe(true);
    }
  });
  it("akun nonaktif -> 409; akun sendiri -> 400; tidak ditemukan -> 404", async () => {
    const db = dbTiruan(tabelDasar());
    const a = await resetPinOlehAdmin(db, aktor("semua", true), 14);
    expect(!a.ok && a.status).toBe(409);
    const b = await resetPinOlehAdmin(db, aktor("semua", true), 1);
    expect(!b.ok && b.status).toBe(400);
    const c = await resetPinOlehAdmin(db, aktor("semua", true), 999);
    expect(!c.ok && c.status).toBe(404);
  });
  it("pemanggil lama tanpa lingkup gagal dengan aman (403), bukan terbuka", async () => {
    const db = dbTiruan(tabelDasar());
    const r = await resetPinOlehAdmin(db, { akunId: 1, nama: "Lama", adminAplikasi: false }, 10);
    expect(!r.ok && r.status).toBe(403);
    expect(db.tulis.length).toBe(0);
  });
});

describe("akunTerlindungi", () => {
  it("mengembalikan akun berperan admin atau berizin kelola saja", async () => {
    const db = dbTiruan(tabelDasar());
    const s = await akunTerlindungi(db, [10, 11, 12, 13]);
    expect(Array.from(s).sort()).toEqual([12, 13]);
  });
  it("daftar kosong menghasilkan himpunan kosong", async () => {
    expect((await akunTerlindungi(dbTiruan(tabelDasar()), [])).size).toBe(0);
  });
});
