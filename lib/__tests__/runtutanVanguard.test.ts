import { describe, expect, it } from "vitest";
import { ATURAN_VANGUARD_BAWAAN, hariWib, hitungRuntutanVanguard, periksaAturanVanguard, periksaKelayakan, rapikanAturanVanguard, selisihHari, tambahHari, type AturanVanguard } from "../runtutanVanguard";

const A: AturanVanguard = { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
// 12.00 WIB = 05.00 UTC pada tanggal itu
const s = (tgl: string, skor: number | null = 50) => ({ selesai_at: `${tgl}T05:00:00Z`, skor });

describe("tanggal WIB", () => {
  it("memetakan ke hari kalender WIB (lewat tengah malam UTC+7)", () => {
    expect(hariWib("2026-11-02T16:59:00Z")).toBe("2026-11-02");
    expect(hariWib("2026-11-02T17:00:00Z")).toBe("2026-11-03");
    expect(hariWib(null)).toBeNull();
    expect(hariWib("bukan tanggal")).toBeNull();
  });
  it("tambah dan selisih hari", () => {
    expect(tambahHari("2026-11-30", 1)).toBe("2026-12-01");
    expect(tambahHari("2026-11-02", -3)).toBe("2026-10-30");
    expect(selisihHari("2026-11-09", "2026-11-02")).toBe(7);
  });
});

describe("hitungRuntutanVanguard", () => {
  it("tiga hari penuh = tuntas, semua petak selesai", () => {
    const r = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-04", A);
    expect(r).toMatchObject({ tuntas: true, berturut: 3, hari_ini_sudah: true, terputus: false });
    expect(r.petak.map((p) => p.status)).toEqual(["selesai", "selesai", "selesai"]);
    expect(r.petak.map((p) => p.tanggal)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("hari ini belum: runtutan berakhir kemarin, petak berikutnya = hari ini", () => {
    const r = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-03")], "2026-11-04", A);
    expect(r).toMatchObject({ tuntas: false, berturut: 2, hari_ini_sudah: false, terputus: false });
    expect(r.petak.map((p) => p.status)).toEqual(["selesai", "selesai", "hari_ini"]);
  });
  it("hari terlewat memutus: mulai lagi dari 0 dan ditandai terputus", () => {
    const r = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-03")], "2026-11-05", A);
    expect(r).toMatchObject({ tuntas: false, berturut: 0, terputus: true });
    expect(r.petak.map((p) => p.status)).toEqual(["hari_ini", "belum", "belum"]);
  });
  it("belum pernah berlatih: bukan terputus", () => {
    const r = hitungRuntutanVanguard([], "2026-11-02", A);
    expect(r).toMatchObject({ tuntas: false, berturut: 0, terputus: false, hari_ini_sudah: false, sesi_hari_ini: 0 });
  });
  it("akhir pekan ikut memutus (Jumat, Senin tidak bersambung)", () => {
    // 2026-11-06 Jumat, 2026-11-09 Senin
    const r = hitungRuntutanVanguard([s("2026-11-05"), s("2026-11-06"), s("2026-11-09")], "2026-11-09", A);
    expect(r.tuntas).toBe(false);
    expect(r.berturut).toBe(1);
  });
  it("dua sesi sehari dihitung satu hari; minimal sesi per hari diterapkan", () => {
    const dua = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-04", A);
    expect(dua.tuntas).toBe(true);
    expect(dua.sesi_hari_ini).toBe(1);
    const min2 = { ...A, sesi_min_per_hari: 2 };
    const r = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-02"), s("2026-11-03"), s("2026-11-04"), s("2026-11-04")], "2026-11-04", min2);
    expect(r.tuntas).toBe(false); // 3 November hanya satu sesi
    expect(r.berturut).toBe(1);
  });
  it("nilai minimal: sesi di bawah nilai tidak dihitung; skor kosong dianggap 0", () => {
    const m = { ...A, nilai_minimal: 60 };
    const r = hitungRuntutanVanguard([s("2026-11-02", 70), s("2026-11-03", 59), s("2026-11-04", 90)], "2026-11-04", m);
    expect(r.tuntas).toBe(false);
    expect(hitungRuntutanVanguard([s("2026-11-04", null)], "2026-11-04", A).hari_ini_sudah).toBe(true);
    expect(hitungRuntutanVanguard([s("2026-11-04", null)], "2026-11-04", m).hari_ini_sudah).toBe(false);
  });
  it("tuntas bersifat tetap walau sesudahnya terlewat", () => {
    const r = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-08", A);
    expect(r).toMatchObject({ tuntas: true, terputus: false });
    expect(r.petak.every((p) => p.status === "selesai")).toBe(true);
  });
  it("sesi tanpa selesai_at diabaikan; hari berturut dapat diatur", () => {
    const r = hitungRuntutanVanguard([{ selesai_at: null, skor: 100 }, s("2026-11-04")], "2026-11-04", { ...A, hari_berturut: 2 });
    expect(r.berturut).toBe(1);
    expect(r.petak).toHaveLength(2);
    expect(r.petak.map((p) => p.status)).toEqual(["selesai", "belum"]);
  });
});

describe("periksaKelayakan (batas mulai)", () => {
  const belum = (hariIni: string, sesi: ReturnType<typeof s>[] = []) => hitungRuntutanVanguard(sesi, hariIni, A);
  it("batas mulai = tanggal buka Pretest dikurangi hari berturut-turut", () => {
    const k = periksaKelayakan(belum("2026-11-02"), "2026-11-02", "2026-11-09");
    expect(k.batas_mulai).toBe("2026-11-06");
    expect(k.mungkin).toBe(true);
    expect(k.cadangan_hari).toBe(4); // 2,3,4,5,6,7,8 = 7 hari tersedia, butuh 3
  });
  it("hari terakhir untuk mulai", () => {
    const k = periksaKelayakan(belum("2026-11-06"), "2026-11-06", "2026-11-09");
    expect(k).toMatchObject({ mungkin: true, cadangan_hari: 0, hari_terakhir_mulai: true });
  });
  it("lewat batas mulai: tidak mungkin tuntas sebelum Pretest", () => {
    const k = periksaKelayakan(belum("2026-11-07"), "2026-11-07", "2026-11-09");
    expect(k).toMatchObject({ mungkin: false, cadangan_hari: null, hari_terakhir_mulai: false });
  });
  it("sudah memulai: hari ini sudah memenuhi dihitung, sisa hari besok dst.", () => {
    const r = belum("2026-11-07", [s("2026-11-07")]);
    const k = periksaKelayakan(r, "2026-11-07", "2026-11-09");
    expect(k.mungkin).toBe(false); // tersisa hanya 8 Nov (1 hari), butuh 2 lagi
    const r2 = hitungRuntutanVanguard([s("2026-11-06"), s("2026-11-07")], "2026-11-07", A);
    expect(periksaKelayakan(r2, "2026-11-07", "2026-11-09")).toMatchObject({ mungkin: true, cadangan_hari: 0 });
  });
  it("tuntas selalu mungkin; tanggal buka tidak diketahui", () => {
    const t = hitungRuntutanVanguard([s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-10", A);
    expect(periksaKelayakan(t, "2026-11-10", "2026-11-09").mungkin).toBe(true);
    expect(periksaKelayakan(belum("2026-11-02"), "2026-11-02", null)).toMatchObject({ batas_mulai: null, mungkin: null });
  });
});

describe("aturan", () => {
  it("rapikan: kosong/rusak = bawaan, angka dibatasi", () => {
    expect(rapikanAturanVanguard(null)).toEqual(ATURAN_VANGUARD_BAWAAN);
    expect(rapikanAturanVanguard({ vanguard_mode: "ngawur" }).mode).toBe("tidak_ada");
    expect(rapikanAturanVanguard({ vanguard_mode: "wajib", vanguard_hari_berturut: 99, vanguard_sesi_min_per_hari: 0, vanguard_nilai_minimal: 500 })).toEqual({ mode: "wajib", hari_berturut: 14, sesi_min_per_hari: 1, nilai_minimal: 100 });
  });
  it("periksa: menolak nilai di luar rentang atau bukan bilangan bulat", () => {
    expect(periksaAturanVanguard({ mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 })).toEqual({ ok: true, aturan: A });
    expect(periksaAturanVanguard({ mode: "x", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 }).ok).toBe(false);
    expect(periksaAturanVanguard({ mode: "wajib", hari_berturut: 0, sesi_min_per_hari: 1, nilai_minimal: 0 }).ok).toBe(false);
    expect(periksaAturanVanguard({ mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1.5, nilai_minimal: 0 }).ok).toBe(false);
    expect(periksaAturanVanguard({ mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 101 }).ok).toBe(false);
    expect(periksaAturanVanguard("x").ok).toBe(false);
  });
});
