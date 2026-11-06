// lib/__tests__/penandaKinerja.test.ts
// (6 Nov 2026) Penanda red flag / rekomendasi PML lintas kegiatan dan tulis ganda dari daftar petugas lama.
import { describe, expect, it } from "vitest";
import { gabungPenanda, penandaPerAkun, salinDariRosterLama, KOLOM_PENANDA_LAMA } from "@/lib/penandaKinerja";

type Baris = Record<string, unknown>;
type Panggilan = { tabel: string; aksi: string; nilai?: Baris; opsi?: unknown; saring: [string, unknown][] };

function dbTiruan(tabel: Record<string, Baris[]>, galatDi?: string) {
  const log: Panggilan[] = [];
  const db = {
    log,
    from(nama: string) {
      let baris = [...(tabel[nama] ?? [])];
      const p: Panggilan = { tabel: nama, aksi: "baca", saring: [] };
      const galat = galatDi === nama ? { message: "basis data galat" } : null;
      const b: Record<string, unknown> = {
        select: () => b,
        update: (v: Baris) => ((p.aksi = "ubah"), (p.nilai = v), b),
        delete: () => ((p.aksi = "hapus"), b),
        upsert: (v: Baris, o: unknown) => ((p.aksi = "upsert"), (p.nilai = v), (p.opsi = o), b),
        eq: (k: string, v: unknown) => ((baris = baris.filter((r) => r[k] === v)), p.saring.push([k, v]), b),
        in: (k: string, v: unknown[]) => ((baris = baris.filter((r) => v.includes(r[k]))), b),
        maybeSingle: async () => ({ data: baris[0] ?? null, error: galat }),
        then: (res: (x: unknown) => unknown) => {
          if (p.aksi !== "baca") log.push(p);
          return Promise.resolve({ data: baris, error: galat }).then(res);
        },
      };
      return b;
    },
  };
  return db as unknown as Parameters<typeof penandaPerAkun>[0] & { log: Panggilan[] };
}

describe("gabungPenanda", () => {
  it("red flag di kegiatan mana pun berlaku untuk akun itu; akun lain tidak terpengaruh", () => {
    const m = gabungPenanda([
      { akun_id: 1, red_flag: true, rekomendasi_pml: false },
      { akun_id: 1, red_flag: false, rekomendasi_pml: true },
      { akun_id: 2, red_flag: false, rekomendasi_pml: true },
      { akun_id: 3, red_flag: null, rekomendasi_pml: null },
    ]);
    expect(m.get(1)).toEqual({ red_flag: true, rekomendasi_pml: true });
    expect(m.get(2)).toEqual({ red_flag: false, rekomendasi_pml: true });
    expect(m.get(3)).toEqual({ red_flag: false, rekomendasi_pml: false });
    expect(m.get(4)).toBeUndefined();
  });
});

describe("penandaPerAkun", () => {
  it("membaca sigap_penilaian_flag dan menggabungkan per akun", async () => {
    const db = dbTiruan({ sigap_penilaian_flag: [
      { akun_id: 5, kolom_id: 1, red_flag: true, rekomendasi_pml: false },
      { akun_id: 5, kolom_id: 2, red_flag: false, rekomendasi_pml: true },
      { akun_id: 6, kolom_id: 1, red_flag: false, rekomendasi_pml: true },
    ] });
    const m = await penandaPerAkun(db, [5, 6, 7, 5]);
    expect(m.get(5)).toEqual({ red_flag: true, rekomendasi_pml: true });
    expect(m.get(6)?.red_flag).toBe(false);
    expect(m.has(7)).toBe(false);
  });
  it("daftar kosong -> peta kosong; galat basis data dilempar", async () => {
    expect((await penandaPerAkun(dbTiruan({}), [])).size).toBe(0);
    await expect(penandaPerAkun(dbTiruan({}, "sigap_penilaian_flag"), [1])).rejects.toThrow("basis data galat");
  });
});

describe("salinDariRosterLama", () => {
  const dasar = () => ({
    sigap_akun: [{ id: 50, petugas_bencana_id: 9 }],
    bencana_petugas: [
      { id: 9, red_flag_kinerja: true, rekomendasi_pml: false, pendaftaran_bencana_konfirmasi: true },
      { id: 10, red_flag_kinerja: false, rekomendasi_pml: false, pendaftaran_bencana_konfirmasi: false },
      { id: 11, red_flag_kinerja: false, rekomendasi_pml: true, pendaftaran_bencana_konfirmasi: null },
    ],
  });
  it("penanda menyala -> upsert pada kolom SE2026 dan konfirmasi disalin ke penugasan PSP aktif", async () => {
    const db = dbTiruan(dasar());
    expect(await salinDariRosterLama(db, 9)).toEqual({ ok: true });
    const up = db.log.find((x) => x.aksi === "upsert");
    expect(up?.tabel).toBe("sigap_penilaian_flag");
    expect(up?.nilai).toMatchObject({ akun_id: 50, kolom_id: KOLOM_PENANDA_LAMA, red_flag: true, rekomendasi_pml: false });
    expect(up?.opsi).toEqual({ onConflict: "akun_id,kolom_id" });
    const ub = db.log.find((x) => x.aksi === "ubah");
    expect(ub?.tabel).toBe("sigap_penugasan");
    expect(ub?.nilai).toEqual({ konfirmasi_pendaftaran: true });
    expect(ub?.saring).toEqual([["akun_id", 50], ["kegiatan_id", 1], ["aktif", true]]);
  });
  it("kedua penanda mati -> baris penanda lama dihapus (tidak ada baris kosong)", async () => {
    const t = dasar();
    t.sigap_akun = [{ id: 51, petugas_bencana_id: 10 }];
    const db = dbTiruan(t);
    expect(await salinDariRosterLama(db, 10)).toEqual({ ok: true });
    const h = db.log.find((x) => x.aksi === "hapus");
    expect(h?.tabel).toBe("sigap_penilaian_flag");
    expect(h?.saring).toEqual([["akun_id", 51], ["kolom_id", KOLOM_PENANDA_LAMA]]);
    expect(db.log.find((x) => x.aksi === "upsert")).toBeUndefined();
  });
  it("konfirmasi null tidak menimpa penugasan", async () => {
    const t = dasar();
    t.sigap_akun = [{ id: 52, petugas_bencana_id: 11 }];
    const db = dbTiruan(t);
    await salinDariRosterLama(db, 11);
    expect(db.log.find((x) => x.aksi === "ubah")).toBeUndefined();
  });
  it("tanpa akun tertaut atau petugas tidak ada -> ok tanpa menulis apa pun", async () => {
    const db = dbTiruan({ ...dasar(), sigap_akun: [] });
    expect(await salinDariRosterLama(db, 9)).toEqual({ ok: true });
    expect(await salinDariRosterLama(db, 999)).toEqual({ ok: true });
    expect(db.log.length).toBe(0);
  });
  it("galat basis data dilaporkan sebagai ok:false", async () => {
    const r = await salinDariRosterLama(dbTiruan(dasar(), "sigap_penilaian_flag"), 9);
    expect(r).toEqual({ ok: false, error: "basis data galat" });
  });
});
