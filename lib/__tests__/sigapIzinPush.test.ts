import { beforeEach, describe, expect, it, vi } from "vitest";

const kirimKeAkun = vi.fn();
vi.mock("@/lib/sigapPush", () => ({ kirimKeAkun: (...a: unknown[]) => kirimKeAkun(...a) }));

import { akunInstrukturKelas, akunPanitiaPelatihan, beritahuIzinDibuka, beritahuIzinDiminta, beritahuIzinDiputuskan } from "../sigapIzinPush";

type Tabel = Record<string, unknown[] | "galat">;
// db palsu: select().eq().in().limit() semuanya dapat dirantai; hasil diambil dari tabel[nama]
function dbPalsu(tabel: Tabel) {
  return {
    from: (nama: string) => {
      const rantai: Record<string, unknown> = {};
      const hasil = () => (tabel[nama] === "galat" ? Promise.reject(new Error("x")) : Promise.resolve({ data: tabel[nama] ?? [] }));
      for (const m of ["select", "eq", "in", "limit"]) rantai[m] = () => rantai;
      rantai.then = (ok: (v: unknown) => unknown, ng: (e: unknown) => unknown) => hasil().then(ok, ng);
      return rantai;
    },
  } as never;
}

beforeEach(() => {
  kirimKeAkun.mockReset();
  kirimKeAkun.mockResolvedValue({ terkirim: 2 });
});

describe("akunPanitiaPelatihan", () => {
  it("menggabungkan peran berizin kelola pelatihan + admin_aplikasi, hanya akun aktif", async () => {
    const db = dbPalsu({ sigap_peran_izin: [{ peran_id: 1 }], sigap_peran: [{ id: 2 }], sigap_akun_peran: [{ akun_id: 10 }, { akun_id: 11 }], sigap_akun: [{ id: 10 }] });
    expect(await akunPanitiaPelatihan(db)).toEqual([10]);
  });
  it("tidak ada peran: kosong; galat tabel: kosong", async () => {
    expect(await akunPanitiaPelatihan(dbPalsu({}))).toEqual([]);
    expect(await akunPanitiaPelatihan(dbPalsu({ sigap_peran_izin: "galat" }))).toEqual([]);
  });
});

describe("akunInstrukturKelas", () => {
  const db = dbPalsu({ sigap_kuis_instruktur_kelas: [{ akun_id: 1, kelas: 1 }, { akun_id: 2, kelas: 2 }, { akun_id: 3, kelas: null }] });
  it("kelas 1: instruktur kelas 1 dan instruktur semua kelas", async () => expect(await akunInstrukturKelas(db, 7, 1)).toEqual([1, 3]));
  it("peserta tanpa kelas: semua instruktur", async () => expect(await akunInstrukturKelas(db, 7, null)).toEqual([1, 2, 3]));
  it("galat: kosong", async () => expect(await akunInstrukturKelas(dbPalsu({ sigap_kuis_instruktur_kelas: "galat" }), 7, 1)).toEqual([]));
});

describe("beritahuIzinDiminta", () => {
  it("mengirim ke panitia + instruktur kelas, tanpa peserta pengaju, tanpa duplikat", async () => {
    const db = dbPalsu({ sigap_peran_izin: [{ peran_id: 1 }], sigap_akun_peran: [{ akun_id: 10 }, { akun_id: 11 }], sigap_akun: [{ id: 10 }, { id: 11 }], sigap_kuis_instruktur_kelas: [{ akun_id: 10, kelas: 1 }, { akun_id: 20, kelas: 1 }, { akun_id: 21, kelas: 2 }] });
    const n = await beritahuIzinDiminta(db, 7, { id: 11, nama: "Ani", kelas: 1 }, "posttest", "Kendala HP", 4);
    expect(n).toBe(2);
    const [, penerima, pesan] = kirimKeAkun.mock.calls[0];
    expect(penerima).toEqual([10, 20]);
    expect(pesan).toMatchObject({ judul: "Permintaan buka kunci Posttest", tag: "izin-minta-4" });
  });
  it("tidak ada penerima: tidak memanggil pengirim", async () => {
    expect(await beritahuIzinDiminta(dbPalsu({}), 7, { id: 11, nama: "Ani", kelas: 1 }, "pretest", "Kendala HP")).toBe(0);
    expect(kirimKeAkun).not.toHaveBeenCalled();
  });
  it("pengirim gagal: tidak melempar, hasil 0", async () => {
    kirimKeAkun.mockRejectedValue(new Error("vapid"));
    const db = dbPalsu({ sigap_kuis_instruktur_kelas: [{ akun_id: 20, kelas: 1 }] });
    await expect(beritahuIzinDiminta(db, 7, { id: 11, nama: "Ani", kelas: 1 }, "pretest", "Kendala HP")).resolves.toBe(0);
  });
});

describe("beritahuIzinDiputuskan / Dibuka", () => {
  it("diputuskan: hanya peserta pengaju", async () => {
    expect(await beritahuIzinDiputuskan(dbPalsu({}), 11, true, "posttest", "Budi", 4)).toBe(2);
    expect(kirimKeAkun.mock.calls[0][1]).toEqual([11]);
    expect(kirimKeAkun.mock.calls[0][2]).toMatchObject({ judul: "Posttest dibuka" });
  });
  it("dibuka: peserta bersangkutan; gagal kirim = 0", async () => {
    expect(await beritahuIzinDibuka(dbPalsu({}), 12, "pretest", "Budi")).toBe(2);
    kirimKeAkun.mockRejectedValue(new Error("x"));
    expect(await beritahuIzinDibuka(dbPalsu({}), 12, "pretest", "Budi")).toBe(0);
  });
});
