// lib/__tests__/atasanPenugasan.test.ts
// (6 Nov 2026) Tahap 3c: atasan & tim dibaca dari sigap_penugasan.atasan_akun_id, bukan bencana_petugas.atasan_id.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigapAkses", () => ({ KEGIATAN_PSP: 1, boleh: vi.fn(), izinAkun: vi.fn() }));
vi.mock("@/lib/sigap", () => ({ kelompokTanggal: vi.fn() }));

import { gabungAtasan } from "@/lib/atasanPenugasan";
import { petaAtasanAkun } from "@/lib/translokBlokirDb";
import { petaTim } from "@/lib/sigapSpjCetak";
import { rincianPerAkun } from "@/lib/portal/rincianAkun";

type Baris = Record<string, unknown>;

function dbTiruan(tabel: Record<string, Baris[]>) {
  const dibaca: string[] = [];
  const db = {
    from(nama: string) {
      dibaca.push(nama);
      let baris = [...(tabel[nama] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: unknown) => ((baris = baris.filter((r) => r[k] === v)), b),
        in: (k: string, v: unknown[]) => ((baris = baris.filter((r) => v.includes(r[k]))), b),
        not: () => b,
        order: () => b,
        range: () => b,
        maybeSingle: async () => ({ data: baris[0] ?? null, error: null }),
        then: (res: (x: unknown) => unknown) => Promise.resolve({ data: baris, error: null }).then(res),
      };
      return b;
    },
  };
  return Object.assign(db, { dibaca }) as unknown as Parameters<typeof petaAtasanAkun>[0] & { dibaca: string[] };
}

describe("gabungAtasan", () => {
  it("kegiatan menimpa PSP, sigap_tim menimpa kegiatan; null tidak menimpa", () => {
    const m = gabungAtasan(
      [{ akun_id: 1, atasan_akun_id: 10 }, { akun_id: 2, atasan_akun_id: 10 }, { akun_id: 3, atasan_akun_id: null }],
      [{ akun_id: 1, atasan_akun_id: 11 }, { akun_id: 2, atasan_akun_id: null }, { akun_id: 4, atasan_akun_id: null }],
      [{ akun_id: 1, atasan_akun_id: 12 }, { akun_id: 3, atasan_akun_id: 13 }]
    );
    expect(m.get(1)).toBe(12);
    expect(m.get(2)).toBe(10);
    expect(m.get(3)).toBe(13);
    expect(m.get(4)).toBeNull();
  });
  it("atasan = diri sendiri diabaikan", () => {
    expect(gabungAtasan([{ akun_id: 1, atasan_akun_id: 10 }], [{ akun_id: 1, atasan_akun_id: 1 }], []).get(1)).toBe(10);
  });
});

describe("petaAtasanAkun", () => {
  const tabel = {
    sigap_penugasan: [
      { id: 1, akun_id: 5, kegiatan_id: 1, atasan_akun_id: 20, aktif: true },
      { id: 2, akun_id: 6, kegiatan_id: 1, atasan_akun_id: 20, aktif: true },
      { id: 3, akun_id: 7, kegiatan_id: 1, atasan_akun_id: 21, aktif: false }, // nonaktif: tidak dihitung
      { id: 4, akun_id: 5, kegiatan_id: 2, atasan_akun_id: 22, aktif: true },
      { id: 5, akun_id: 8, kegiatan_id: 3, atasan_akun_id: 23, aktif: true }, // kegiatan lain
    ],
    sigap_tim: [{ akun_id: 6, kegiatan_id: 2, atasan_akun_id: 24 }],
  };
  it("kegiatan 2: PSP lalu penugasan kegiatan 2 lalu sigap_tim; tidak membaca bencana_petugas", async () => {
    const db = dbTiruan(tabel);
    const peta = await petaAtasanAkun(db, 2);
    expect(peta.get(5)).toBe(22);
    expect(peta.get(6)).toBe(24);
    expect(peta.has(7)).toBe(false);
    expect(peta.has(8)).toBe(false);
    expect(db.dibaca).not.toContain("bencana_petugas");
  });
  it("kegiatan 1 (PSP): hanya penugasan PSP", async () => {
    const peta = await petaAtasanAkun(dbTiruan(tabel), 1);
    expect(peta.get(5)).toBe(20);
    expect(peta.get(6)).toBe(20);
  });
});

describe("petaTim", () => {
  it("PML = timnya sendiri; PPL = PML atasannya; peran lain atau tanpa atasan tidak punya tim", () => {
    const m = petaTim(
      [
        { akun_id: 1, peran: "pml", nama: "Pml Satu" },
        { akun_id: 2, peran: "ppl", nama: "Ppl A" },
        { akun_id: 3, peran: "ppl", nama: "Ppl B" },
        { akun_id: 4, peran: "korwil", nama: "Kor" },
        { akun_id: 5, peran: "ppl", nama: "Ppl C" },
      ],
      new Map<number, number | null>([[2, 1], [3, null], [5, 99]]),
      new Map([[1, "Pml Satu"]])
    );
    expect(m.get(1)).toEqual({ id: 1, nama: "Pml Satu" });
    expect(m.get(2)).toEqual({ id: 1, nama: "Pml Satu" });
    expect(m.has(3)).toBe(false);
    expect(m.has(4)).toBe(false);
    expect(m.has(5)).toBe(false); // atasan tak dikenal namanya
  });
});

describe("rincianPerAkun", () => {
  it("nagari & HP dari sigap_akun; nilai dari sigap_penilaian_mitra; tidak membaca bencana_petugas", async () => {
    const db = dbTiruan({
      sigap_akun: [{ id: 1, alamat_nagari: "Nagari Koto", no_hp: "0812" }],
      sigap_penilaian_kolom: [{ id: 1, kode: "SE2026" }],
      sigap_penilaian_mitra: [{ akun_id: 1, kolom_id: 1, nilai: 4 }],
    });
    const m = await rincianPerAkun(db, [{ id: 1, mitra_id: null, petugas_bencana_id: 77 }]);
    expect(m.get(1)).toMatchObject({ nagari: "Nagari Koto", no_hp: "0812", nilai_se2026: 4 });
    expect(db.dibaca).not.toContain("bencana_petugas");
  });
});
