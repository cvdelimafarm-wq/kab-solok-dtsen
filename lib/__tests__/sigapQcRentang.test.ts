import { describe, expect, it } from "vitest";
import {
  MAKS_HARI_RENTANG,
  SARINGAN_RENTANG_AWAL,
  daftarTimRentang,
  geserTanggal,
  hariTetangga,
  hitungStatusRentang,
  jumlahHariKalender,
  periksaRentang,
  rentangTerakhir,
  saringBarisRentang,
  susunRentang,
  tanggalSahQc,
  urutkanRentang,
  type PercobaanRentang,
} from "@/lib/sigapQcRentang";
import type { PesertaMentah } from "@/lib/sigapQcMonitor";

describe("tanggal", () => {
  it("tanggalSahQc", () => {
    expect(tanggalSahQc("2026-10-30")).toBe(true);
    expect(tanggalSahQc("2026-02-30")).toBe(false);
    expect(tanggalSahQc("30/10/2026")).toBe(false);
    expect(tanggalSahQc(null)).toBe(false);
  });
  it("geserTanggal melewati batas bulan dan tahun", () => {
    expect(geserTanggal("2026-10-30", 3)).toBe("2026-11-02");
    expect(geserTanggal("2026-01-01", -1)).toBe("2025-12-31");
    expect(geserTanggal("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("jumlahHariKalender ikut kedua ujung", () => {
    expect(jumlahHariKalender("2026-10-30", "2026-10-30")).toBe(1);
    expect(jumlahHariKalender("2026-10-28", "2026-11-02")).toBe(6);
  });
  it("periksaRentang", () => {
    expect(periksaRentang("2026-10-01", "2026-10-30")).toEqual({ ok: true, dari: "2026-10-01", sampai: "2026-10-30" });
    expect(periksaRentang("2026-10-30", "2026-10-01")).toMatchObject({ ok: false });
    expect(periksaRentang("x", "2026-10-01")).toMatchObject({ ok: false });
    expect(periksaRentang("2026-01-01", geserTanggal("2026-01-01", MAKS_HARI_RENTANG))).toMatchObject({ ok: false });
    expect(periksaRentang("2026-01-01", geserTanggal("2026-01-01", MAKS_HARI_RENTANG - 1)).ok).toBe(true);
  });
  it("hariTetangga", () => {
    const ada = ["2026-10-29", "2026-10-27", "2026-10-28"];
    expect(hariTetangga(ada, "2026-10-28", -1)).toBe("2026-10-27");
    expect(hariTetangga(ada, "2026-10-28", 1)).toBe("2026-10-29");
    expect(hariTetangga(ada, "2026-10-27", -1)).toBeNull();
    expect(hariTetangga(ada, "2026-10-29", 1)).toBeNull();
    // tanggal yang tidak punya soal: tetangga terdekat
    expect(hariTetangga(ada, "2026-10-30", -1)).toBe("2026-10-29");
    expect(hariTetangga(ada, "2026-10-26", 1)).toBe("2026-10-27");
    expect(hariTetangga([], "2026-10-28", 1)).toBeNull();
    expect(hariTetangga(ada, null, -1)).toBe("2026-10-29");
  });
  it("rentangTerakhir", () => {
    expect(rentangTerakhir("2026-10-30", 7)).toEqual({ dari: "2026-10-24", sampai: "2026-10-30" });
    expect(rentangTerakhir("2026-10-30", 1)).toEqual({ dari: "2026-10-30", sampai: "2026-10-30" });
    expect(jumlahHariKalender(rentangTerakhir("2026-10-30", 999).dari, "2026-10-30")).toBe(MAKS_HARI_RENTANG);
  });
});

const P = (akun_id: number, nama: string, peran: string, pml_akun_id: number | null, pml_nama: string | null): PesertaMentah => ({ akun_id, nama, peran, pml_akun_id, pml_nama });
const peserta = [P(1, "Mega", "pml", null, null), P(2, "Andi", "ppl", 1, "Mega"), P(3, "Budi", "ppl", 1, "Mega"), P(4, "Winda", "pml", null, null), P(5, "Citra", "ppl", 4, "Winda")];
const C = (akun_id: number, tanggal: string, ke: number, skor: number, terlambat = false): PercobaanRentang => ({ akun_id, tanggal, ke, skor, terlambat });
const HARI = ["2026-10-27", "2026-10-28", "2026-10-29"];
const percobaan = [
  C(2, "2026-10-27", 1, 60), C(2, "2026-10-27", 2, 100), C(2, "2026-10-28", 1, 100), C(2, "2026-10-29", 1, 80, true),
  C(3, "2026-10-27", 1, 100),
  C(1, "2026-10-27", 1, 100), C(1, "2026-10-28", 1, 100), C(1, "2026-10-29", 1, 100),
  C(99, "2026-10-27", 1, 100), // bukan peserta
  C(5, "2026-10-26", 1, 100), // di luar hari
];
const susun = () => susunRentang({ dari: "2026-10-26", sampai: "2026-10-30", hari: [...HARI, "2026-10-29", "2026-11-05"], peserta, percobaan, nilaiLulus: 100 });

describe("susunRentang", () => {
  const r = susun();
  const by = (n: string) => r.baris.find((b) => b.nama === n)!;
  it("hari: unik, dalam rentang, urut naik", () => expect(r.hari).toEqual(HARI));
  it("semua peserta jadi baris, urut abjad", () => expect(r.baris.map((b) => b.nama)).toEqual(["Andi", "Budi", "Citra", "Mega", "Winda"]));
  it("nilai terbaik, awal, jumlah percobaan per hari", () => {
    const a = by("Andi");
    expect(a.sel[0]).toEqual({ percobaan: 2, awal: 60, terbaik: 100, lulus: true, terlambat: false });
    expect(a.sel[2]).toEqual({ percobaan: 1, awal: 80, terbaik: 80, lulus: false, terlambat: true });
    expect(a.hari_terisi).toBe(3);
    expect(a.hari_lulus).toBe(2);
    expect(a.total_percobaan).toBe(4);
    expect(a.rata_terbaik).toBe(93.3);
    expect(a.pernah_terlambat).toBe(true);
  });
  it("hari tanpa percobaan = null dan dihitung kosong", () => {
    const b = by("Budi");
    expect(b.sel).toEqual([{ percobaan: 1, awal: 100, terbaik: 100, lulus: true, terlambat: false }, null, null]);
    expect(b.hari_kosong).toBe(2);
  });
  it("tidak pernah mengisi: rata-rata null; percobaan di luar hari diabaikan", () => {
    const c = by("Citra");
    expect(c.hari_terisi).toBe(0);
    expect(c.rata_terbaik).toBeNull();
    expect(r.tidak_pernah).toBe(2); // Citra dan Winda
  });
  it("baris PML punya pml = null; PPL memuat nama PML", () => {
    expect(by("Mega").pml).toBeNull();
    expect(by("Mega").peran).toBe("PML");
    expect(by("Andi").pml).toBe("Mega");
  });
  it("akun bukan peserta diabaikan", () => expect(r.baris.some((b) => b.akun_id === 99)).toBe(false));
  it("ringkasan per hari dan kepatuhan", () => {
    expect(r.per_hari).toEqual([
      { tanggal: "2026-10-27", peserta: 5, sudah: 3, lulus: 3 },
      { tanggal: "2026-10-28", peserta: 5, sudah: 2, lulus: 2 },
      { tanggal: "2026-10-29", peserta: 5, sudah: 2, lulus: 1 },
    ]);
    expect(r.kepatuhan_persen).toBe(47); // 7 dari 15 sel
  });
  it("tanpa hari: kepatuhan null dan tidak ada yang dihitung 'tidak pernah'", () => {
    const k = susunRentang({ dari: "2026-11-01", sampai: "2026-11-03", hari: [], peserta, percobaan, nilaiLulus: 100 });
    expect(k.hari).toEqual([]);
    expect(k.kepatuhan_persen).toBeNull();
    expect(k.tidak_pernah).toBe(0);
    expect(k.baris.every((b) => b.sel.length === 0)).toBe(true);
  });
  it("peran lain (mis. admin) tidak jadi baris", () => {
    const x = susunRentang({ dari: "2026-10-27", sampai: "2026-10-27", hari: ["2026-10-27"], peserta: [...peserta, P(7, "Admin", "admin", null, null)], percobaan: [], nilaiLulus: 100 });
    expect(x.baris).toHaveLength(5);
  });
});

describe("saringan dan urutan", () => {
  const r = susun();
  const n = r.hari.length;
  it("hitungStatusRentang", () => {
    expect(hitungStatusRentang(r.baris, n)).toEqual({ semua: 5, tidak_lengkap: 3, lengkap: 2, tidak_pernah: 2, terlambat: 1 });
  });
  it("tanpa hari, status khusus tidak menyaring apa pun yang menyesatkan", () => {
    expect(hitungStatusRentang(r.baris, 0)).toMatchObject({ tidak_lengkap: 0, lengkap: 0, tidak_pernah: 0 });
  });
  it("status", () => {
    const s = (status: Parameters<typeof saringBarisRentang>[1]["status"]) => saringBarisRentang(r.baris, { ...SARINGAN_RENTANG_AWAL, status }, n).map((b) => b.nama);
    expect(s("lengkap")).toEqual(["Andi", "Mega"]);
    expect(s("tidak_pernah")).toEqual(["Citra", "Winda"]);
    expect(s("terlambat")).toEqual(["Andi"]);
    expect(s("tidak_lengkap")).toEqual(["Budi", "Citra", "Winda"]);
  });
  it("peran, tim, dan pencarian bekerja bersama", () => {
    const f = (x: Partial<typeof SARINGAN_RENTANG_AWAL>) => saringBarisRentang(r.baris, { ...SARINGAN_RENTANG_AWAL, ...x }, n).map((b) => b.nama);
    expect(f({ peran: "PML" })).toEqual(["Mega", "Winda"]);
    expect(f({ pml: "Mega" })).toEqual(["Andi", "Budi", "Mega"]); // timnya + PML-nya sendiri
    expect(f({ pml: "Winda", peran: "PPL" })).toEqual(["Citra"]);
    expect(f({ cari: " BUD " })).toEqual(["Budi"]);
    expect(f({ cari: "winda" })).toEqual(["Citra", "Winda"]); // juga cocok lewat nama PML
  });
  it("daftarTimRentang", () => expect(daftarTimRentang(r.baris)).toEqual(["Mega", "Winda"]));
  it("urutkanRentang", () => {
    const u = (x: Parameters<typeof urutkanRentang>[1]) => urutkanRentang(r.baris, x).map((b) => b.nama);
    expect(u("nama")).toEqual(["Andi", "Budi", "Citra", "Mega", "Winda"]);
    expect(u("paling_sedikit")).toEqual(["Citra", "Winda", "Budi", "Andi", "Mega"]);
    expect(u("nilai_rendah")).toEqual(["Citra", "Winda", "Andi", "Budi", "Mega"]);
    expect(u("nilai_tinggi")).toEqual(["Budi", "Mega", "Andi", "Citra", "Winda"]);
  });
  it("urutkanRentang tidak mengubah larik asal", () => {
    const asal = r.baris.map((b) => b.nama);
    urutkanRentang(r.baris, "paling_sedikit");
    expect(r.baris.map((b) => b.nama)).toEqual(asal);
  });
});
