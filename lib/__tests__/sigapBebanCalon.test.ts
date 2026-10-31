import { beforeEach, describe, expect, it } from "vitest";
import { aturLibur } from "../delego/hitung";
import type { Delegasi } from "../delego/tipe";
import { bebanMingguan, irisanPeriode, susunPeringatan, type MingguBeban, type PenugasanLain } from "../sigapBebanCalon";

beforeEach(() => aturLibur([]));

const akun = { id: 7, nama: "Budi", jenis: "mitra" as const };
const dlg = (o: Partial<Record<string, unknown>> = {}): Delegasi =>
  ({ id: 1, penerima_akun: 7, penerima_nama: "Budi", penerima_jenis: "mitra", status: "berjalan", mulai: "2026-11-02", tenggat: "2026-11-30", hari_kerja: [1, 2, 3, 4, 5], target_harian: 75, target_total: null, ...o }) as unknown as Delegasi;

describe("bebanMingguan", () => {
  it("target harian = kapasitas -> 100% (sasaran); lebih -> berlebih; tanpa delegasi -> 0% ringan", () => {
    const a = bebanMingguan([dlg()], akun, "2026-11-03", 2);
    expect(a.minggu[0]).toMatchObject({ mulai: "2026-11-02", poin: 375, kapasitas: 375, persen: 100, kategori: "sasaran" });
    expect(a.delegasiAktif).toBe(1);
    expect(bebanMingguan([dlg({ target_harian: 90 })], akun, "2026-11-03", 1).minggu[0]).toMatchObject({ persen: 120, kategori: "berlebih" });
    expect(bebanMingguan([], akun, "2026-11-03", 1).minggu[0]).toMatchObject({ poin: 0, persen: 0, kategori: "ringan" });
  });
  it("hanya delegasi baru/berjalan milik orang itu yang dihitung", () => {
    const r = bebanMingguan([dlg({ status: "selesai" }), dlg({ id: 2, penerima_akun: 99 }), dlg({ id: 3, status: "baru", target_harian: 30 })], akun, "2026-11-03", 1);
    expect(r.delegasiAktif).toBe(1);
    expect(r.minggu[0].poin).toBe(150);
  });
  it("beban mengikuti masa delegasi per pekan", () => {
    const r = bebanMingguan([dlg({ mulai: "2026-11-09", tenggat: "2026-11-13" })], akun, "2026-11-03", 3);
    expect(r.minggu.map((m) => m.mulai)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(r.minggu.map((m) => m.persen)).toEqual([0, 100, 0]);
  });
  it("libur kalender mengurangi beban", () => {
    aturLibur([{ tanggal: "2026-11-04", nama: "Libur uji", aktif: true }]);
    expect(bebanMingguan([dlg()], akun, "2026-11-03", 1).minggu[0].poin).toBe(300);
  });
  it("riwayat target: perubahan berlaku mulai tanggalnya", () => {
    const d = dlg({ target_harian: 30, riwayat_target: [{ berlaku_mulai: "2026-11-02", target_harian: 15, alasan: "awal" }, { berlaku_mulai: "2026-11-04", target_harian: 30, alasan: "naik" }] });
    expect(bebanMingguan([d], akun, "2026-11-03", 1).minggu[0].poin).toBe(15 * 2 + 30 * 3);
  });
  it("jumlah minggu dibatasi 1..12", () => {
    expect(bebanMingguan([], akun, "2026-11-03", 0).minggu).toHaveLength(1);
    expect(bebanMingguan([], akun, "2026-11-03", 99).minggu).toHaveLength(12);
  });
});

describe("irisanPeriode", () => {
  it("beririsan, tidak, dan tak pasti", () => {
    expect(irisanPeriode({ mulai: "2026-11-01", selesai: "2026-11-10" }, { mulai: "2026-11-10", selesai: "2026-11-20" })).toBe(true);
    expect(irisanPeriode({ mulai: "2026-11-01", selesai: "2026-11-09" }, { mulai: "2026-11-10", selesai: "2026-11-20" })).toBe(false);
    expect(irisanPeriode({ mulai: null, selesai: "2026-11-09" }, { mulai: "2026-11-10", selesai: "2026-11-20" })).toBeNull();
    expect(irisanPeriode({ mulai: "2026-11-01T00:00:00Z", selesai: "2026-11-09" }, { mulai: "2026-11-05", selesai: "2026-11-20" })).toBe(true);
  });
});

const m = (persen: number, mulai = "2026-11-02"): MingguBeban => ({ mulai, poin: persen * 3.75, kapasitas: 375, persen, kategori: persen < 80 ? "ringan" : persen <= 100 ? "sasaran" : "berlebih" });
const lain = (o: Partial<PenugasanLain> = {}): PenugasanLain => ({ kegiatan_id: 1, nama: "Seruti TW IV", peran: "ppl", mulai: "2026-11-01", selesai: "2026-11-30", beririsan: true, ...o });

describe("susunPeringatan", () => {
  it("aman bila ringan dan tanpa penugasan lain", () => {
    const p = susunPeringatan([m(10), m(20)], []);
    expect(p.tingkat).toBe("aman");
    expect(p.pesan[0]).toContain("Tidak ada bentrok");
  });
  it("beban sasaran = perhatian; berlebih = berat; mengambil pekan terberat", () => {
    expect(susunPeringatan([m(50), m(90, "2026-11-09")], []).tingkat).toBe("perhatian");
    const b = susunPeringatan([m(50), m(130, "2026-11-09")], []);
    expect(b.tingkat).toBe("berat");
    expect(b).toMatchObject({ maks_persen: 130, minggu_terberat: "2026-11-09" });
    expect(b.pesan[0]).toContain("130%");
  });
  it("satu penugasan beririsan = perhatian; dua = berat", () => {
    expect(susunPeringatan([m(0)], [lain()]).tingkat).toBe("perhatian");
    const p = susunPeringatan([m(0)], [lain(), lain({ kegiatan_id: 2, nama: "SPDT NTP", peran: "pml" })]);
    expect(p.tingkat).toBe("berat");
    expect(p.pesan.join(" ")).toContain("SPDT NTP (PML)");
  });
  it("periode tidak lengkap hanya keterangan; tingkat tidak naik", () => {
    const p = susunPeringatan([m(0)], [lain({ beririsan: null, mulai: null })]);
    expect(p.tingkat).toBe("aman");
    expect(p.pesan.join(" ")).toContain("tidak bisa dipastikan");
  });
  it("tidak beririsan tidak menghasilkan pesan bentrok", () => {
    const p = susunPeringatan([m(0)], [lain({ beririsan: false })]);
    expect(p.tingkat).toBe("aman");
  });
});
