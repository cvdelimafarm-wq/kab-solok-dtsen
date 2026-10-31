// (31 Okt 2026) Pelatihan per kegiatan: pembaca ?kegiatan=ID, info undangan turunan, dan pemilihan kegiatan pelatihan.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/sigapAkses", () => ({ sesiDariHeader: () => null }));

import { KODE_KEGIATAN_PELATIHAN, UNDANGAN, kegiatanDariParam, tanggalPanjangId, undanganDariKegiatan } from "@/lib/sigapTes";
import { idKegiatanPelatihan, kegiatanDiminta, undanganUntuk } from "@/lib/sigapTesDb";

describe("kegiatanDariParam", () => {
  it("menerima bilangan bulat positif", () => {
    expect(kegiatanDariParam("3")).toBe(3);
    expect(kegiatanDariParam(" 12 ")).toBe(12);
  });
  it("menolak kosong, nol, negatif, pecahan, huruf, terlalu panjang", () => {
    for (const v of [null, undefined, "", "0", "-1", "1.5", "abc", "3;drop", "1234567890123"]) expect(kegiatanDariParam(v)).toBeNull();
  });
});

describe("kegiatanDiminta", () => {
  it("membaca dari nextUrl.searchParams", () => {
    expect(kegiatanDiminta({ nextUrl: { searchParams: new URLSearchParams("kegiatan=7&x=1") } })).toBe(7);
    expect(kegiatanDiminta({ nextUrl: { searchParams: new URLSearchParams("x=1") } })).toBeNull();
    expect(kegiatanDiminta(undefined)).toBeNull();
    expect(kegiatanDiminta(null)).toBeNull();
  });
});

describe("tanggalPanjangId", () => {
  it("memformat tanggal Indonesia", () => {
    expect(tanggalPanjangId("2026-10-08")).toBe("Kamis, 8 Oktober 2026");
    expect(tanggalPanjangId("2026-11-01")).toBe("Minggu, 1 November 2026");
  });
  it("kosong bila tidak sah", () => {
    expect(tanggalPanjangId("2026-02-30")).toBe("");
    expect(tanggalPanjangId("")).toBe("");
    expect(tanggalPanjangId("8 Oktober 2026")).toBe("");
  });
});

describe("undanganDariKegiatan", () => {
  it("hanya memuat yang diketahui; tidak mengarang surat, jadwal, ketentuan", () => {
    const u = undanganDariKegiatan({ nama: "Pelatihan Seruti TW IV", tanggal_mulai: "2026-11-10" }, { tempat: " Aula BPS ", presensi_buka_at: "2026-11-10T00:30:00Z", presensi_tutup_at: "2026-11-10T09:00:00Z" }, "2026-10-31");
    expect(u.turunan).toBe(true);
    expect(u.hal).toBe("Pelatihan Seruti TW IV");
    expect(u.tanggal_iso).toBe("2026-11-10");
    expect(u.hari_tanggal).toBe("Selasa, 10 November 2026");
    expect(u.tempat).toBe("Aula BPS");
    expect(u.pukul).toBe("07.30–16.00 WIB");
    expect(u.nomor).toBe("");
    expect(u.pdf).toBe("");
    expect(u.jadwal).toHaveLength(0);
    expect(u.ketentuan).toHaveLength(0);
  });
  it("tanpa pengaturan: pukul dan tempat kosong; tanggal jatuh ke hari ini bila kegiatan tak bertanggal", () => {
    const u = undanganDariKegiatan({ nama: "X", tanggal_mulai: null }, null, "2026-10-31");
    expect(u.tanggal_iso).toBe("2026-10-31");
    expect(u.pukul).toBe("");
    expect(u.tempat).toBe("");
  });
});

// ---- db palsu: from(tabel).select().eq()/in()/or()/limit().maybeSingle() ----
type Baris = Record<string, unknown>;
function dbPalsu(tabel: Record<string, Baris[]>) {
  return {
    from(nama: string) {
      let rows = [...(tabel[nama] ?? [])];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), b),
        in: (k: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[k]))), b),
        or: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (x: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return b;
    },
  } as never;
}
const req = (q: string) => ({ nextUrl: { searchParams: new URLSearchParams(q) } });
const KEG = [
  { id: 3, kode: KODE_KEGIATAN_PELATIHAN, jenis: "pelatihan", aktif: true, nama: "PSP", tanggal_mulai: "2026-10-08" },
  { id: 9, kode: "pelatihan_seruti_tw4", jenis: "pelatihan", aktif: true, nama: "Pelatihan Seruti TW IV", tanggal_mulai: "2026-11-10" },
  { id: 10, kode: "pelatihan_lain", jenis: "pelatihan", aktif: true, nama: "Lain", tanggal_mulai: "2026-11-12" },
  { id: 1, kode: "pascabencana_2026", jenis: "pendataan", aktif: true, nama: "Pendataan", tanggal_mulai: "2026-10-10" },
];

describe("idKegiatanPelatihan", () => {
  it("tanpa parameter dan tanpa akun: pelatihan bawaan (perilaku lama)", async () => {
    expect(await idKegiatanPelatihan(dbPalsu({ sigap_kegiatan: KEG }))).toBe(3);
    expect(await idKegiatanPelatihan(dbPalsu({ sigap_kegiatan: KEG }), req(""))).toBe(3);
  });
  it("?kegiatan=ID: hanya kegiatan berjenis pelatihan", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG });
    expect(await idKegiatanPelatihan(db, req("kegiatan=9"))).toBe(9);
    expect(await idKegiatanPelatihan(db, req("kegiatan=1"))).toBeNull(); // pendataan
    expect(await idKegiatanPelatihan(db, req("kegiatan=999"))).toBeNull();
  });
  it("peserta pelatihan bawaan tetap di bawaan", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG, sigap_penugasan: [{ akun_id: 101, kegiatan_id: 3, aktif: true, sumber: null }] });
    expect(await idKegiatanPelatihan(db, req(""), 101)).toBe(3);
  });
  it("bukan peserta bawaan tetapi peserta tepat satu pelatihan lain: pelatihan itu", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG, sigap_penugasan: [{ akun_id: 202, kegiatan_id: 9, aktif: true, sumber: null }, { akun_id: 202, kegiatan_id: 1, aktif: true, sumber: null }] });
    expect(await idKegiatanPelatihan(db, req(""), 202)).toBe(9);
  });
  it("peserta dua pelatihan lain atau tidak punya penugasan: bawaan", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG, sigap_penugasan: [{ akun_id: 303, kegiatan_id: 9, aktif: true, sumber: null }, { akun_id: 303, kegiatan_id: 10, aktif: true, sumber: null }] });
    expect(await idKegiatanPelatihan(db, req(""), 303)).toBe(3);
    expect(await idKegiatanPelatihan(db, req(""), 404)).toBe(3);
  });
  it("?kegiatan=ID mengalahkan pemilihan otomatis", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG, sigap_penugasan: [{ akun_id: 505, kegiatan_id: 9, aktif: true, sumber: null }] });
    expect(await idKegiatanPelatihan(db, req("kegiatan=10"), 505)).toBe(10);
  });
});

describe("undanganUntuk", () => {
  it("PSP: UNDANGAN resmi", async () => {
    expect(await undanganUntuk(dbPalsu({ sigap_kegiatan: KEG }), 3)).toBe(UNDANGAN);
  });
  it("pelatihan lain: turunan dari kegiatan dan pengaturan presensi", async () => {
    const db = dbPalsu({ sigap_kegiatan: KEG, sigap_pelatihan_pengaturan: [{ kegiatan_id: 9, tempat: "Aula", presensi_buka_at: null, presensi_tutup_at: null }] });
    const u = await undanganUntuk(db, 9);
    expect(u.turunan).toBe(true);
    expect(u.tanggal_iso).toBe("2026-11-10");
    expect(u.tempat).toBe("Aula");
    expect(u.pdf).toBe("");
  });
});
