import { describe, expect, it } from "vitest";
import { SARINGAN_SEMUA_AWAL, daftarTimSemua, saringBarisSemua, susunSemua, urutkanSemua } from "@/lib/sigapQcSemua";
import { selisihNilai } from "@/lib/sigapQcTabel";
import type { PesertaMentah } from "@/lib/sigapQcMonitor";
import type { PercobaanRentang } from "@/lib/sigapQcRentang";

const peserta: PesertaMentah[] = [
  { akun_id: 1, nama: "Budi PML", peran: "pml", pml_akun_id: null, pml_nama: null },
  { akun_id: 2, nama: "Ani", peran: "ppl", pml_akun_id: 1, pml_nama: "Budi PML" },
  { akun_id: 3, nama: "Citra", peran: "ppl", pml_akun_id: 1, pml_nama: "Budi PML" },
  { akun_id: 9, nama: "Supervisor", peran: "supervisor", pml_akun_id: null, pml_nama: null },
];
const c = (akun_id: number, tanggal: string, ke: number, skor: number, terlambat = false): PercobaanRentang => ({ akun_id, tanggal, ke, skor, terlambat });
const hari = ["2026-10-27", "2026-10-28", "2026-10-29"];
const percobaan: PercobaanRentang[] = [
  // Ani: hari 1 -> 60 lalu 100; hari 2 -> 80 langsung
  c(2, "2026-10-27", 1, 60), c(2, "2026-10-27", 2, 100), c(2, "2026-10-28", 1, 80),
  // Citra: hari 1 -> 40, 70, 100 ; hari 3 -> 100 (terlambat)
  c(3, "2026-10-27", 1, 40), c(3, "2026-10-27", 2, 70), c(3, "2026-10-27", 3, 100), c(3, "2026-10-29", 1, 100, true),
  // diabaikan: akun asing, tanggal di luar hari, supervisor
  c(77, "2026-10-27", 1, 10), c(2, "2026-10-01", 1, 5), c(9, "2026-10-27", 1, 50),
];

describe("susunSemua", () => {
  const d = susunSemua({ hari, peserta, percobaan, nilaiLulus: 100 });
  it("hanya PML dan PPL; kolom = percobaan terbanyak", () => {
    expect(d.peserta).toBe(3);
    expect(d.kolom).toBe(3);
    expect(d.dari).toBe("2026-10-27");
    expect(d.sampai).toBe("2026-10-29");
  });
  it("rata-rata per percobaan per petugas", () => {
    const ani = d.baris.find((b) => b.nama === "Ani")!;
    expect(ani.rata_p).toEqual([70, 100, null]); // P1: (60+80)/2, P2: 100
    expect(ani.hari_p).toEqual([2, 1, 0]);
    expect(ani.hari_terisi).toBe(2);
    expect(ani.hari_lulus).toBe(1);
    expect(ani.total_percobaan).toBe(3);
    expect(ani.rata_awal).toBe(70);
    expect(ani.rata_terbaik).toBe(90); // (100+80)/2
    expect(ani.naik).toBe(20);
    const citra = d.baris.find((b) => b.nama === "Citra")!;
    expect(citra.rata_p).toEqual([70, 70, 100]);
    expect(citra.pernah_terlambat).toBe(true);
    expect(citra.hari_kosong).toBe(1);
  });
  it("petugas yang tidak pernah mengisi", () => {
    const pml = d.baris.find((b) => b.nama === "Budi PML")!;
    expect(pml.hari_terisi).toBe(0);
    expect(pml.rata_p).toEqual([null, null, null]);
    expect(pml.naik).toBeNull();
    expect(d.tidak_pernah).toBe(1);
  });
  it("rata-rata keseluruhan dan per hari", () => {
    expect(d.rata_p_semua).toEqual([70, 85, 100]); // P1: (60+80+40+100)/4=70, P2: (100+70)/2=85, P3: 100
    expect(d.jumlah_p_semua).toEqual([4, 2, 1]);
    const h1 = d.per_hari[0];
    expect(h1).toMatchObject({ tanggal: "2026-10-27", sudah: 2, lulus: 2, rata_awal: 50, rata_terbaik: 100 });
    expect(d.per_hari[2]).toMatchObject({ sudah: 1, lulus: 1 });
    expect(d.kepatuhan_persen).toBe(Math.round((4 / 9) * 100));
  });
  it("tanpa hari: kosong tetapi aman", () => {
    const k = susunSemua({ hari: [], peserta, percobaan: [], nilaiLulus: 80 });
    expect(k.dari).toBeNull();
    expect(k.kolom).toBe(1);
    expect(k.kepatuhan_persen).toBeNull();
    expect(k.tidak_pernah).toBe(0);
    expect(k.rata_p_semua).toEqual([null]);
  });
  it("kolom dibatasi 10", () => {
    const banyak = Array.from({ length: 14 }, (_, i) => c(2, "2026-10-27", i + 1, 50));
    const k = susunSemua({ hari: ["2026-10-27"], peserta, percobaan: banyak, nilaiLulus: 100 });
    expect(k.kolom).toBe(10);
  });
});

describe("saringan dan urutan", () => {
  const d = susunSemua({ hari, peserta, percobaan, nilaiLulus: 100 });
  it("saring peran, tim, dan kata", () => {
    expect(saringBarisSemua(d.baris, { ...SARINGAN_SEMUA_AWAL, peran: "PPL" }).map((b) => b.nama).sort()).toEqual(["Ani", "Citra"]);
    expect(saringBarisSemua(d.baris, { ...SARINGAN_SEMUA_AWAL, pml: "Budi PML" })).toHaveLength(3);
    expect(saringBarisSemua(d.baris, { ...SARINGAN_SEMUA_AWAL, cari: "cit" }).map((b) => b.nama)).toEqual(["Citra"]);
    expect(daftarTimSemua(d.baris)).toEqual(["Budi PML"]);
  });
  it("urut: nilai terendah menaruh yang belum mengisi paling atas; kenaikan terbesar", () => {
    expect(urutkanSemua(d.baris, "nilai_rendah")[0].nama).toBe("Budi PML");
    expect(urutkanSemua(d.baris, "nilai_tinggi")[0].nama).toBe("Citra");
    expect(urutkanSemua(d.baris, "paling_sedikit")[0].nama).toBe("Budi PML");
    expect(urutkanSemua(d.baris, "naik_terbesar")[0].nama).toBe("Citra"); // naik 30 vs 20
    expect(urutkanSemua(d.baris, "nama").map((b) => b.nama)).toEqual(["Ani", "Budi PML", "Citra"]);
  });
});

describe("selisihNilai", () => {
  it("terakhir dikurangi pertama; null bila kurang dari dua nilai", () => {
    expect(selisihNilai([53, 100, null, null])).toBe(47);
    expect(selisihNilai([40, 33, 87, 100])).toBe(60);
    expect(selisihNilai([100, 80])).toBe(-20);
    expect(selisihNilai([53, null, null, null])).toBeNull();
    expect(selisihNilai([null, null])).toBeNull();
    expect(selisihNilai([null, 50, 70])).toBe(20);
  });
});
