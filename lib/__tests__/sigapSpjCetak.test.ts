import { describe, expect, it } from "vitest";
import { dibayarDalamRentang, kelompokRentang, namaBerkasCetak, petaTim, rentangValid, ringkasCetak, saringPeran, teksUrutan, urutkanPetugas, type PetugasCetak } from "../sigapSpjCetak";
import { jenisTemplate, teksLaporan } from "../sigapLaporanPeran";

const hari = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `2026-10-${String(a + i).padStart(2, "0")}`);
const P = (id: number, nama: string, peran: string, tim: [number, string] | null, dibayar = hari(1, 20), tarif = 170000): PetugasCetak => ({
  penugasan_id: id, akun_id: id, nama, peran, tim_akun_id: tim ? tim[0] : null, tim_nama: tim ? tim[1] : null, dibayar, tarif,
});

describe("rentang cetak", () => {
  it("rentangValid: kosong = semua; satu sisi / terbalik / format salah = tidak valid", () => {
    expect(rentangValid()).toBe(true);
    expect(rentangValid("", null)).toBe(true);
    expect(rentangValid("2026-10-01", "2026-10-20")).toBe(true);
    expect(rentangValid("2026-10-01", "2026-10-01")).toBe(true);
    expect(rentangValid("2026-10-20", "2026-10-01")).toBe(false);
    expect(rentangValid("2026-10-01", null)).toBe(false);
    expect(rentangValid("2026-10-1", "2026-10-20")).toBe(false);
    expect(rentangValid("2026-13-01", "2026-13-02")).toBe(false);
  });
  it("dibayarDalamRentang: batas inklusif, urut, unik; tanpa rentang = semua", () => {
    const d = ["2026-10-05", "2026-10-03", "2026-10-03", "2026-10-25"];
    expect(dibayarDalamRentang(d)).toEqual(["2026-10-03", "2026-10-05", "2026-10-25"]);
    expect(dibayarDalamRentang(d, "2026-10-03", "2026-10-05")).toEqual(["2026-10-03", "2026-10-05"]);
    expect(dibayarDalamRentang(d, "2026-10-06", "2026-10-24")).toEqual([]);
  });
  it("kelompokRentang: nilai kwitansi = hari dalam rentang x tarif; rentang memotong kelompok", () => {
    const k = kelompokRentang(hari(1, 31), 170000, "2026-10-01", "2026-10-20");
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ mulai: "2026-10-01", selesai: "2026-10-20", jumlah_hari: 20, nominal: 3_400_000 });
    const k2 = kelompokRentang(hari(21, 31), 170000, "2026-10-01", "2026-10-25");
    expect(k2[0]).toMatchObject({ mulai: "2026-10-21", selesai: "2026-10-25", jumlah_hari: 5, nominal: 850_000 });
  });
  it("kelompokRentang: hari bolong menjadi kelompok terpisah, nominal per kelompok", () => {
    const k = kelompokRentang([...hari(1, 3), ...hari(10, 11)], 100, "2026-10-01", "2026-10-31");
    expect(k.map((x) => [x.mulai, x.jumlah_hari, x.nominal])).toEqual([["2026-10-01", 3, 300], ["2026-10-10", 2, 200]]);
  });
  it("kelompokRentang: tanpa rentang = seluruh hari dibayar", () => {
    expect(kelompokRentang(hari(1, 5), 10)[0].nominal).toBe(50);
    expect(kelompokRentang([], 10)).toEqual([]);
  });
});

describe("peran & urutan", () => {
  const daftar = [
    P(1, "Rina PPL", "ppl", [20, "Budi PML"]),
    P(2, "Budi PML", "pml", [20, "Budi PML"]),
    P(3, "Anton PPL", "ppl", [30, "Citra PML"]),
    P(4, "Citra PML", "pml", [30, "Citra PML"]),
    P(5, "Dedi PPL", "ppl", [20, "Budi PML"]),
    P(6, "Zaki Korwil", "korwil", null),
    P(7, "Ani Korwil", "korwil", null),
    P(8, "Sup", "supervisor", null),
    P(9, "Lepas PPL", "ppl", null),
  ];
  it("saringPeran", () => {
    expect(saringPeran(daftar, "semua")).toHaveLength(9);
    expect(saringPeran(daftar, "pml").map((p) => p.nama)).toEqual(["Budi PML", "Citra PML"]);
    expect(saringPeran(daftar, "ppl")).toHaveLength(4);
    expect(saringPeran(daftar, "korwil")).toHaveLength(2);
  });
  it("tim: korwil, supervisor, lalu tiap tim (PML dulu, PPL abjad), tanpa tim di akhir", () => {
    expect(urutkanPetugas(daftar, "tim").map((p) => p.nama)).toEqual([
      "Ani Korwil", "Zaki Korwil", "Sup", "Budi PML", "Dedi PPL", "Rina PPL", "Citra PML", "Anton PPL", "Lepas PPL",
    ]);
  });
  it("tim, hanya PPL: dikelompokkan menurut nama PML-nya", () => {
    expect(urutkanPetugas(saringPeran(daftar, "ppl"), "tim").map((p) => p.nama)).toEqual(["Dedi PPL", "Rina PPL", "Anton PPL", "Lepas PPL"]);
  });
  it("tim, hanya PML: abjad nama PML", () => {
    expect(urutkanPetugas(saringPeran(daftar, "pml"), "tim").map((p) => p.nama)).toEqual(["Budi PML", "Citra PML"]);
  });
  it("abjad: nama A-Z lintas peran; tidak mengubah array asal", () => {
    const asal = [...daftar];
    expect(urutkanPetugas(daftar, "abjad").map((p) => p.nama)).toEqual(["Ani Korwil", "Anton PPL", "Budi PML", "Citra PML", "Dedi PPL", "Lepas PPL", "Rina PPL", "Sup", "Zaki Korwil"]);
    expect(daftar).toEqual(asal);
  });
  it("tim: dua PML bernama sama tetap terpisah menurut akun", () => {
    const d = [P(1, "X1", "ppl", [5, "Sama"]), P(2, "Sama", "pml", [4, "Sama"]), P(3, "X2", "ppl", [4, "Sama"]), P(4, "Sama", "pml", [5, "Sama"])];
    const o = urutkanPetugas(d, "tim");
    expect(o.map((p) => p.penugasan_id)).toEqual([2, 3, 4, 1]);
  });
});

describe("ringkas & nama", () => {
  it("ringkasCetak: hitung petugas, hari, nominal mengikuti rentang; petugas tanpa hari dalam rentang dihitung terpisah", () => {
    const d = [P(1, "A", "ppl", null, hari(1, 20)), P(2, "B", "ppl", null, hari(15, 25)), P(3, "C", "ppl", null, hari(26, 30))];
    expect(ringkasCetak(d, "2026-10-01", "2026-10-20")).toEqual({ petugas: 2, tanpaHari: 1, hari: 26, nominal: 26 * 170000 });
    expect(ringkasCetak(d)).toEqual({ petugas: 3, tanpaHari: 0, hari: 20 + 11 + 5, nominal: 36 * 170000 });
  });
  it("namaBerkasCetak", () => {
    expect(namaBerkasCetak("pascabencana-2026", "2026-10-01", "2026-10-20", 1, 1, "pdf")).toBe("SPJ_pascabencana-2026_2026-10-01_sd_2026-10-20.pdf");
    expect(namaBerkasCetak("a b", null, null, 2, 3, "zip")).toBe("SPJ_a_b_semua-hari_bagian-2-dari-3.zip");
  });
  it("teksUrutan", () => {
    expect(teksUrutan("abjad", "semua")).toMatch(/abjad/);
    expect(teksUrutan("tim", "semua")).toMatch(/korwil.*PML.*PPL/);
    expect(teksUrutan("tim", "pml")).toMatch(/hanya PML/);
    expect(teksUrutan("tim", "ppl")).toMatch(/hanya PPL/);
  });
});

describe("template laporan per peran", () => {
  const dasar = { kegiatanNama: "Pendataan Pascabencana", namaPetugas: "Budi", labelJabatan: "PML Pendataan Pascabencana", tanggalTeks: "Senin, 5 Oktober 2026", satuan: "Sub SLS", jumlahRealisasi: 4, jumlahLokasi: 2, wilayah: "Nagari A" };
  it("jenisTemplate: hanya pascabencana & peran dikenal", () => {
    expect(jenisTemplate("pascabencana-2026", "ppl")).toBe("ppl");
    expect(jenisTemplate("pascabencana-2026", "pml")).toBe("pml");
    expect(jenisTemplate("pascabencana-2026", "korwil")).toBe("korwil");
    expect(jenisTemplate("pascabencana-2026", "supervisor")).toBe("umum");
    expect(jenisTemplate("pelatihan", "pml")).toBe("umum");
    expect(jenisTemplate("pascabencana-2026", undefined)).toBe("umum");
  });
  it("umum: sama persis dengan templat lama", () => {
    const t = teksLaporan({ ...dasar, jenis: "umum" });
    expect(t.judul).toBe("Laporan Perjalanan Dinas");
    expect(t.seksiUraian).toBe("URAIAN PELAKSANAAN TUGAS");
    expect(t.labelAngka).toBe("JUMLAH SUB SLS");
    expect(t.paragraf[0]).toBe("Pada hari Senin, 5 Oktober 2026, Budi melaksanakan tugas Pendataan Pascabencana sebagai PML Pendataan Pascabencana di Nagari A.");
    expect(t.paragraf[1]).toBe("Jumlah Sub SLS yang dicatat petugas pada tanggal ini sebanyak 4 Sub SLS, pada 2 lokasi sebagaimana tercantum di bawah.");
  });
  it("tiap peran punya judul & uraian berbeda, memuat angka & nama, tanpa 'undefined'", () => {
    const j = new Set<string>();
    for (const jenis of ["ppl", "pml", "korwil"] as const) {
      const t = teksLaporan({ ...dasar, jenis, satuan: jenis === "ppl" ? "KK" : "Sub SLS" });
      j.add(t.judul);
      const semua = [t.judul, t.seksiUraian, t.seksiLokasi, t.seksiKendala, t.labelAngka, t.catatan, ...t.paragraf].join("|");
      expect(semua).not.toMatch(/undefined|NaN/);
      expect(t.paragraf.join(" ")).toContain("Budi");
      expect(t.paragraf.join(" ")).toContain("4");
    }
    expect(j.size).toBe(3);
  });
  it("tanpa wilayah/lokasi: kalimat tetap rapi", () => {
    const t = teksLaporan({ ...dasar, jenis: "ppl", satuan: "KK", wilayah: "", jumlahLokasi: 0 });
    expect(t.paragraf[0]).not.toMatch(/ di \./);
    expect(t.paragraf[1]).toBe("KK yang berhasil didata pada tanggal ini sebanyak 4.");
  });
});

describe("petaTim", () => {
  it("PML = timnya sendiri; PPL = PML atasannya; korwil/tanpa atasan/atasan tak ber-akun = tak ada", () => {
    const pen = [
      { akun_id: 1, peran: "pml", nama: "Budi" },
      { akun_id: 2, peran: "ppl", nama: "Rina" },
      { akun_id: 3, peran: "ppl", nama: "Tanpa Atasan" },
      { akun_id: 4, peran: "ppl", nama: "Atasan Tanpa Akun" },
      { akun_id: 5, peran: "korwil", nama: "Kor" },
      { akun_id: 6, peran: "ppl", nama: "Tanpa Petugas" },
    ];
    const akun = [{ id: 1, petugas_bencana_id: 10 }, { id: 2, petugas_bencana_id: 20 }, { id: 3, petugas_bencana_id: 30 }, { id: 4, petugas_bencana_id: 40 }, { id: 5, petugas_bencana_id: 50 }, { id: 6, petugas_bencana_id: null }];
    const petugas = [{ id: 10, atasan_id: null }, { id: 20, atasan_id: 10 }, { id: 30, atasan_id: null }, { id: 40, atasan_id: 99 }, { id: 50, atasan_id: null }];
    const akunAtasan = [{ id: 1, nama: "Budi", petugas_bencana_id: 10 }];
    const m = petaTim(pen, akun, petugas, akunAtasan);
    expect(m.get(1)).toEqual({ id: 1, nama: "Budi" });
    expect(m.get(2)).toEqual({ id: 1, nama: "Budi" });
    expect(m.has(3)).toBe(false);
    expect(m.has(4)).toBe(false);
    expect(m.has(5)).toBe(false);
    expect(m.has(6)).toBe(false);
  });
});
