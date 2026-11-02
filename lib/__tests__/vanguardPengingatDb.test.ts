// Menguji lib/vanguardPengingatDb.ts dengan db tiruan: hanya di jendela, hanya mode wajib, anti-ganda, uji kering, pesan PJ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const kirim = vi.fn();
vi.mock("@/lib/sigapPush", () => ({ kirimKeAkun: (...a: unknown[]) => kirim(...a) }));
vi.mock("@/lib/sigapIzinPush", () => ({ akunPanitiaPelatihan: async () => [900, 901] }));
const klaim = vi.fn();
const selesai = vi.fn();
const denyut = vi.fn();
vi.mock("@/lib/portal/pushTerkelola", () => ({ klaimTahap: (...a: unknown[]) => klaim(...a), selesaiKlaim: (...a: unknown[]) => selesai(...a), catatDenyut: (...a: unknown[]) => denyut(...a) }));
const batch = vi.fn();
vi.mock("@/lib/vanguardRuntutanDb", () => ({ muatRuntutanBatch: (...a: unknown[]) => batch(...a), tanggalBukaPretest: () => "2026-11-09" }));

import { jalankanPengingatVanguard } from "../vanguardPengingatDb";

type Baris = Record<string, unknown>;
function fakeDb(tabel: Record<string, Baris[]>, galatAturan = false) {
  return {
    from(nama: string) {
      let op: "select" | "insert" = "select";
      let payload: Baris = {};
      const saring: ((r: Baris) => boolean)[] = [];
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (x: Baris) => { op = "insert"; payload = x; return q; },
        eq: (k: string, v: unknown) => { saring.push((r) => r[k] === v); return q; },
        gte: () => q,
        or: () => q,
        limit: () => q,
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) {
          if (nama === "sigap_pelatihan_aturan" && galatAturan) return Promise.resolve({ data: null, error: { message: "column does not exist" } }).then(ok, ko);
          const t = (tabel[nama] ??= []);
          if (op === "insert") { t.push({ ...payload }); return Promise.resolve({ data: [payload], error: null }).then(ok, ko); }
          return Promise.resolve({ data: t.filter((r) => saring.every((f) => f(r))), error: null }).then(ok, ko);
        },
      };
      return q;
    },
  } as never;
}

const SORE = new Date("2026-11-04T16:10:00+07:00").getTime();
const PAGI = new Date("2026-11-04T07:10:00+07:00").getTime();
const SIANG = new Date("2026-11-04T12:10:00+07:00").getTime();
const kel = (o: Baris = {}) => ({ mungkin: true, hari_terakhir_mulai: false, batas_mulai: "2026-11-06", cadangan_hari: 1, ...o });
const r = (o: Baris = {}) => ({ tuntas: false, hari_ini_sudah: false, terputus: false, berturut: 0, hari_berturut: 3, petak: [], kelayakan: kel(), ...o });

function tabelDasar(): Record<string, Baris[]> {
  return { sigap_pelatihan_aturan: [{ kegiatan_id: 7, vanguard_mode: "wajib" }], sigap_penugasan: [{ akun_id: 1, kegiatan_id: 7, aktif: true, sumber: null }, { akun_id: 2, kegiatan_id: 7, aktif: true, sumber: null }, { akun_id: 3, kegiatan_id: 7, aktif: true, sumber: null }], sigap_tes: [], sigap_push_log: [] };
}

beforeEach(() => {
  kirim.mockReset(); klaim.mockReset(); selesai.mockReset(); denyut.mockReset(); batch.mockReset();
  kirim.mockResolvedValue({ akun_berlangganan: [1], perangkat: 1, terkirim: 1, gagal: 0 });
  klaim.mockResolvedValue("baru");
  batch.mockResolvedValue({ mengunci: true, peta: new Map([[1, r()], [2, r({ hari_ini_sudah: true })], [3, r({ tuntas: true })]]) });
});

describe("jalankanPengingatVanguard", () => {
  it("di luar jendela: selesai tanpa kueri", async () => {
    const h = await jalankanPengingatVanguard(fakeDb(tabelDasar()), SIANG, false);
    expect(h.dilewati).toBe("di luar jendela");
    expect(batch).not.toHaveBeenCalled();
    expect(kirim).not.toHaveBeenCalled();
  });
  it("kolom aturan belum ada / tidak ada kegiatan wajib: tidak mengirim", async () => {
    expect((await jalankanPengingatVanguard(fakeDb(tabelDasar(), true), PAGI, false)).dilewati).toBe("kolom aturan belum ada");
    const t = tabelDasar(); t.sigap_pelatihan_aturan = [{ kegiatan_id: 7, vanguard_mode: "opsional" }];
    expect((await jalankanPengingatVanguard(fakeDb(t), PAGI, false)).dilewati).toMatch(/tidak ada kegiatan/);
    expect(kirim).not.toHaveBeenCalled();
  });
  it("hanya peserta yang hari ini belum berlatih dan belum tuntas yang dikirimi, lalu dicatat di log", async () => {
    const t = tabelDasar();
    const h = await jalankanPengingatVanguard(fakeDb(t), PAGI, false);
    expect(h.dikirim).toBe(1);
    expect(kirim).toHaveBeenCalledTimes(1);
    expect(kirim.mock.calls[0][1]).toEqual([1]);
    expect(h.per_kejadian).toEqual({ mulai: 1 });
    expect(t.sigap_push_log).toHaveLength(1);
    expect(t.sigap_push_log[0]).toMatchObject({ oleh_akun_id: 1, jenis: "vanguard_runtutan", isi: "[kunci] vg|7|mulai|pagi|2026-11-04" });
    expect(selesai).toHaveBeenCalled();
    expect(denyut).toHaveBeenCalled();
  });
  it("sudah dikirim di jendela yang sama (log) = tidak diulang; klaim 'sudah' = lewati kegiatan", async () => {
    const t = tabelDasar();
    t.sigap_push_log = [{ oleh_akun_id: 1, jenis: "vanguard_runtutan", isi: "[kunci] vg|7|mulai|pagi|2026-11-04" }];
    const h = await jalankanPengingatVanguard(fakeDb(t), PAGI, false);
    expect(h.dikirim).toBe(0);
    expect(kirim).not.toHaveBeenCalled();
    klaim.mockResolvedValue("sudah");
    expect((await jalankanPengingatVanguard(fakeDb(tabelDasar()), PAGI, false)).kegiatan).toEqual([]);
  });
  it("perangkat tidak ada (terkirim 0) = dihitung gagal dan tidak dicatat sebagai terkirim", async () => {
    kirim.mockResolvedValue({ akun_berlangganan: [], perangkat: 0, terkirim: 0, gagal: 0 });
    const t = tabelDasar();
    const h = await jalankanPengingatVanguard(fakeDb(t), PAGI, false);
    expect(h.dikirim).toBe(0);
    expect(h.gagal).toBe(1);
    expect(t.sigap_push_log).toHaveLength(0);
  });
  it("uji kering: menghitung saja, tanpa klaim, kirim, atau catatan; jendela bisa dipaksa", async () => {
    const t = tabelDasar();
    const h = await jalankanPengingatVanguard(fakeDb(t), SIANG, true, "pagi");
    expect(h.dikirim).toBe(1);
    expect(klaim).not.toHaveBeenCalled();
    expect(kirim).not.toHaveBeenCalled();
    expect(t.sigap_push_log).toHaveLength(0);
    expect((await jalankanPengingatVanguard(fakeDb(t), SIANG, false, "pagi")).dilewati).toBe("di luar jendela");
  });
  it("Vanguard tidak mengunci (mode berlaku mati): tidak ada kiriman", async () => {
    batch.mockResolvedValue({ mengunci: false, peta: new Map([[1, r()]]) });
    const h = await jalankanPengingatVanguard(fakeDb(tabelDasar()), PAGI, false);
    expect(h.dikirim).toBe(0);
    expect(kirim).not.toHaveBeenCalled();
  });
  it("PJ: pesan gabungan sekali sehari hanya di jendela sore, bila ada yang lewat batas", async () => {
    batch.mockResolvedValue({ mengunci: true, peta: new Map([[1, r({ kelayakan: kel({ mungkin: false }) })], [2, r({ kelayakan: kel({ mungkin: false }) })], [3, r()]]) });
    const t = tabelDasar();
    const pagi = await jalankanPengingatVanguard(fakeDb(t), PAGI, false);
    expect(pagi.pj_dikirim).toBe(0);
    const sore = await jalankanPengingatVanguard(fakeDb(t), SORE, false);
    expect(sore.pj_dikirim).toBe(1);
    const panggilanPj = kirim.mock.calls.filter((c) => (c[1] as number[]).includes(900));
    expect(panggilanPj).toHaveLength(1);
    expect(panggilanPj[0][2]).toMatchObject({ url: expect.stringContaining("monitoring") });
    kirim.mockClear();
    const ulang = await jalankanPengingatVanguard(fakeDb(t), SORE, false);
    expect(ulang.pj_dikirim).toBe(0);
    expect(kirim.mock.calls.filter((c) => (c[1] as number[]).includes(900))).toHaveLength(0);
  });
});
