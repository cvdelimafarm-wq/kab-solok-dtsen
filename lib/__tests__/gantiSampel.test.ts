import { describe, expect, it } from "vitest";
import { bisaMengajukanGanti, cadanganTersedia, kkSedangDiajukan, periksaIsianGanti, rekapGanti, ringkasGantiAdmin, type GantiRow } from "../gantiSampel";
import type { TagKk } from "../tagSampel";

const g = (o: Partial<GantiRow>): GantiRow => ({
  id: 1, idsubsls: "1303110005000101", utama_kk_id: 1, cadangan_kk_id: 3, utama_nama: "A", cadangan_nama: "C", alasan: "menolak", catatan: null, status: "menunggu",
  usul_master: false, diajukan_oleh: 7, diajukan_nama: "Ani", diajukan_at: "2026-11-10T01:00:00.000Z", diputus_nama: null, diputus_at: null, putus_sebagai: null, catatan_putus: null, ...o,
});
const tag = (kk: number, peran: "utama" | "cadangan", hasil: TagKk["hasil"] = null): TagKk => ({ kk_id: kk, peran, hasil, via: "hp" });
const semua = [tag(1, "utama"), tag(2, "utama", "didata"), tag(3, "cadangan"), tag(4, "cadangan")];

describe("gantiSampel", () => {
  it("cadanganTersedia: hanya cadangan tanpa hasil dan belum dipakai pengajuan menunggu", () => {
    expect(cadanganTersedia(semua, []).map((t) => t.kk_id)).toEqual([3, 4]);
    expect(cadanganTersedia(semua, [g({ cadangan_kk_id: 3 })]).map((t) => t.kk_id)).toEqual([4]);
    expect(cadanganTersedia(semua, [g({ cadangan_kk_id: 3, status: "ditolak" })]).map((t) => t.kk_id)).toEqual([3, 4]);
    expect(cadanganTersedia([tag(3, "cadangan", "menolak")], [])).toEqual([]);
  });

  it("kkSedangDiajukan memeriksa peran utama maupun cadangan, hanya yang menunggu", () => {
    const d = [g({}), g({ id: 2, utama_kk_id: 5, cadangan_kk_id: 6, status: "disetujui" })];
    expect(kkSedangDiajukan(d, 1)).toBe(true);
    expect(kkSedangDiajukan(d, 3)).toBe(true);
    expect(kkSedangDiajukan(d, 5)).toBe(false);
  });

  const dasar = { jendela: "terkunci" as const, bolehGanti: true, daftar: [] as GantiRow[], tag_sub: semua };
  it("tombol ganti: hanya setelah terkunci, utama belum didata, ada cadangan, tidak sedang diajukan", () => {
    expect(bisaMengajukanGanti({ ...dasar, tag: tag(1, "utama") }).bisa).toBe(true);
    expect(bisaMengajukanGanti({ ...dasar, tag: tag(1, "utama", "menolak") }).bisa).toBe(true);
    expect(bisaMengajukanGanti({ ...dasar, tag: tag(2, "utama", "didata") }).bisa).toBe(false);
    expect(bisaMengajukanGanti({ ...dasar, tag: tag(3, "cadangan") }).bisa).toBe(false);
    expect(bisaMengajukanGanti({ ...dasar, tag: undefined }).bisa).toBe(false);
    expect(bisaMengajukanGanti({ ...dasar, jendela: "terbuka", tag: tag(1, "utama") })).toMatchObject({ bisa: false });
    expect(bisaMengajukanGanti({ ...dasar, jendela: "terbuka", tag: tag(1, "utama") }).alasan).toMatch(/lepas atau tandai ulang/);
    expect(bisaMengajukanGanti({ ...dasar, jendela: "belum", tag: tag(1, "utama") }).bisa).toBe(false);
    expect(bisaMengajukanGanti({ ...dasar, bolehGanti: false, tag: tag(1, "utama") }).alasan).toMatch(/tidak mengizinkan/);
    expect(bisaMengajukanGanti({ ...dasar, daftar: [g({})], tag: tag(1, "utama") }).alasan).toMatch(/Menunggu keputusan PML/);
    expect(bisaMengajukanGanti({ ...dasar, tag_sub: [tag(1, "utama")], tag: tag(1, "utama") }).alasan).toMatch(/Tidak ada cadangan/);
  });

  it("periksaIsianGanti: cadangan, alasan, catatan 'lainnya' minimal 5 huruf, maksimal 500", () => {
    expect(periksaIsianGanti("menolak", "", null)).toMatch(/cadangan/);
    expect(periksaIsianGanti("", "", 3)).toMatch(/alasan/);
    expect(periksaIsianGanti("lainnya", "abcd", 3)).toMatch(/wajib/);
    expect(periksaIsianGanti("lainnya", "  abcde ", 3)).toBeNull();
    expect(periksaIsianGanti("menolak", "", 3)).toBeNull();
    expect(periksaIsianGanti("menolak", "x".repeat(501), 3)).toMatch(/maksimal/);
  });

  it("rekapGanti menghitung per status dan usulan master yang masih hidup", () => {
    const r = rekapGanti([g({ usul_master: true }), g({ status: "disetujui", usul_master: true }), g({ status: "ditolak", usul_master: true }), g({ status: "dibatalkan" })]);
    expect(r).toEqual({ menunggu: 1, disetujui: 1, ditolak: 1, dibatalkan: 1, usul_master: 2 });
  });

  it("ringkasGantiAdmin: tingkat = disetujui / total target; per PPL hanya yang punya pengajuan", () => {
    const wil = [
      { idsubsls: "1303110005000101", target: 10, ppl_nama: "Ani", pml_nama: "Budi" },
      { idsubsls: "1303110005000102", target: 10, ppl_nama: "Dedi", pml_nama: "Budi" },
      { idsubsls: "1303110005000103", target: 10, ppl_nama: null, pml_nama: null },
    ];
    const d = [g({ status: "disetujui" }), g({ id: 2, status: "disetujui", utama_kk_id: 9, cadangan_kk_id: 10 }), g({ id: 3, idsubsls: "1303110005000102", status: "menunggu" }), g({ id: 4, status: "ditolak", utama_kk_id: 11, cadangan_kk_id: 12 })];
    const r = ringkasGantiAdmin(d, wil);
    expect(r.tingkat).toBeCloseTo(2 / 30);
    expect(r.per_ppl.map((b) => b.ppl_nama)).toEqual(["Ani", "Dedi"]);
    expect(r.per_ppl[0]).toMatchObject({ target: 10, disetujui: 2, menunggu: 0, ditolak: 1 });
    expect(r.per_ppl[1]).toMatchObject({ disetujui: 0, menunggu: 1 });
    expect(ringkasGantiAdmin([], []).tingkat).toBe(0);
  });
});
