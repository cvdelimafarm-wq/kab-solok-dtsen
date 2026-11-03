// Bank soal Vanguard untuk peserta pelatihan: pengaturan tersimpan (mode uji, nilai lulus, batas percobaan, jadwal) TIDAK berlaku; kegiatan lain tidak berubah.
import { describe, expect, it } from "vitest";
import { kegiatanBerjenisPelatihan, muatPengaturanPeserta } from "../vanguardPengaturanDb";
import { PENGATURAN_BAWAAN, bolehMencoba, ujiBerlaku } from "../vanguard/pengaturan";

type Tabel = Record<string, Record<string, unknown>[]>;
function dbPalsu(tabel: Tabel, galatTabel: string[] = []) {
  return {
    from(nama: string) {
      const saring: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { saring.push((r) => r[k] === v || (k === "id" && r.id === v) || (k === "kegiatan_id" && r.kegiatan_id === v)); return q; },
        maybeSingle: async () => {
          if (galatTabel.includes(nama)) return { data: null, error: { message: "tidak ada" } };
          return { data: (tabel[nama] ?? []).find((r) => saring.every((f) => f(r))) ?? null, error: null };
        },
      };
      return q;
    },
  } as never;
}

const SEKARANG = Date.parse("2026-11-03T05:00:00Z");
const tabel = (): Tabel => ({
  sigap_kegiatan: [{ id: 7, jenis: "pelatihan" }, { id: 1, jenis: "pendataan" }],
  sigap_vanguard_pengaturan: [
    { kegiatan_id: 7, mode: "uji", level_dibuka: ["A"], nilai_lulus: 70, maks_percobaan: 3, buka_at: "2026-11-02T14:06:00Z", tutup_at: "2026-11-09T16:59:00Z" },
    { kegiatan_id: 1, mode: "uji", level_dibuka: [], nilai_lulus: 60, maks_percobaan: 2, buka_at: null, tutup_at: null },
  ],
});

describe("kegiatanBerjenisPelatihan", () => {
  it("true untuk pelatihan, false untuk jenis lain, kegiatan tak dikenal, atau galat baca", async () => {
    expect(await kegiatanBerjenisPelatihan(dbPalsu(tabel()), 7)).toBe(true);
    expect(await kegiatanBerjenisPelatihan(dbPalsu(tabel()), 1)).toBe(false);
    expect(await kegiatanBerjenisPelatihan(dbPalsu(tabel()), 99)).toBe(false);
    expect(await kegiatanBerjenisPelatihan(dbPalsu(tabel(), ["sigap_kegiatan"]), 7)).toBe(false);
  });
});

describe("muatPengaturanPeserta", () => {
  it("pelatihan: bawaan (latihan, semua level, tanpa batas, tanpa jadwal, tanpa nilai lulus) walau pengaturan tersimpan bermode uji", async () => {
    const p = await muatPengaturanPeserta(dbPalsu(tabel()), 7);
    expect(p).toEqual(PENGATURAN_BAWAAN);
    expect(p.mode).toBe("latihan");
    expect(ujiBerlaku(p, SEKARANG)).toBe(false);
    expect(p.nilai_lulus).toBeNull();
    expect(p.maks_percobaan).toBeNull();
    // percobaan ke-50 pada kasus level C tetap boleh
    expect(bolehMencoba(p, { level: "C" }, 50, SEKARANG)).toEqual({ boleh: true });
    // dan tetap boleh sesudah tanggal tutup lama
    expect(bolehMencoba(p, { level: "A" }, 0, Date.parse("2026-12-01T00:00:00Z"))).toEqual({ boleh: true });
  });
  it("kegiatan bukan pelatihan: pengaturan tersimpan tetap berlaku", async () => {
    const p = await muatPengaturanPeserta(dbPalsu(tabel()), 1);
    expect(p.mode).toBe("uji");
    expect(p.nilai_lulus).toBe(60);
    expect(p.maks_percobaan).toBe(2);
  });
  it("galat baca jenis kegiatan: jatuh ke pengaturan tersimpan (perilaku lama, tidak membuka kunci tanpa sengaja)", async () => {
    const p = await muatPengaturanPeserta(dbPalsu(tabel(), ["sigap_kegiatan"]), 7);
    expect(p.mode).toBe("uji");
  });
});
