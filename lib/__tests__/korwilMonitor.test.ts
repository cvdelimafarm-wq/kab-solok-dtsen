import { describe, expect, it } from "vitest";
import type { BarisKkMon } from "@/lib/pendataanMonitor";
import { judulWilayah, labelSubKorwil, persenKorwil, susunAdministrasi, timCapaianTerendah, susunLapanganKorwil, type BarisHariKorwil, type TimKorwilMasuk } from "@/lib/korwilMonitor";

const orang = (id: number, nama: string, akun: number[]) => ({ petugas_id: id, nama, akun_ids: akun });
const TIM_A: TimKorwilMasuk = { pml: orang(1, "Pml A", [101]), ppl: [orang(11, "Ppl A1", [111]), orang(12, "Ppl A2", [112])], tampil: true };
const TIM_B: TimKorwilMasuk = { pml: orang(2, "Pml B", [102]), ppl: [orang(21, "Ppl B1", [121])], tampil: true };
const INFO = new Map([
  ["S1", { nagari: "PANINGGAHAN", sls: "JORONG GANDO", sub_sls: "01" }],
  ["S2", { nagari: "PANINGGAHAN", sls: "JORONG GANDO", sub_sls: "02" }],
  ["S3", { nagari: "MUARO PINGAI", sls: "JORONG GUCI II", sub_sls: "00" }],
]);
const kk = (pml: number, idsubsls: string, ppl_akun_id: number | null, hasil: BarisKkMon["hasil"], jumlah: number): BarisKkMon => ({ pml_id: pml, idsubsls, ppl_akun_id, hasil, jumlah });

describe("susunLapanganKorwil: Sub SLS yang hanya dipegang satu tim", () => {
  it("target = semua KK; realisasi = semua KK didata siapa pun penandanya; tidak ditemukan terpisah", () => {
    const r = susunLapanganKorwil({
      tim: [TIM_A],
      sub: [{ idsubsls: "S2", pml_id: 1 }],
      nonaktif: new Set(),
      baris: [kk(1, "S2", 111, "terdampak", 10), kk(1, "S2", 112, "tidak_terdampak", 5), kk(1, "S2", 999, "terdampak", 3), kk(1, "S2", 111, "tidak_ditemukan", 2), kk(1, "S2", null, null, 20)],
      info: INFO,
    });
    const t = r.tim[0];
    expect(t.target).toBe(40);
    expect(t.realisasi).toBe(18); // termasuk 3 KK yang ditandai akun di luar tim
    expect(t.tidak_ditemukan).toBe(2);
    expect(t.sub[0]).toMatchObject({ label: "Gando 02", nagari: "Paninggahan", kk_total: 40, dibagi: 1 });
  });
  it("kemajuan per petugas hanya dari anggotanya; PML dipisah", () => {
    const r = susunLapanganKorwil({
      tim: [TIM_A],
      sub: [{ idsubsls: "S2", pml_id: 1 }],
      nonaktif: new Set(),
      baris: [kk(1, "S2", 111, "terdampak", 10), kk(1, "S2", 112, "tidak_terdampak", 5), kk(1, "S2", 101, "terdampak", 4), kk(1, "S2", 111, "tidak_ditemukan", 2), kk(1, "S2", null, null, 20)],
      info: INFO,
    });
    const t = r.tim[0];
    expect(t.ppl.map((p) => [p.nama, p.didata, p.tidak_ditemukan])).toEqual([["Ppl A1", 10, 2], ["Ppl A2", 5, 0]]);
    expect(t.pml.didata).toBe(4);
  });
  it("Sub SLS non aktif tidak dihitung", () => {
    const r = susunLapanganKorwil({ tim: [TIM_A], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S2", pml_id: 1 }], nonaktif: new Set(["S1"]), baris: [kk(1, "S1", 111, "terdampak", 9), kk(1, "S2", 111, "terdampak", 1), kk(1, "S2", null, null, 4)], info: INFO });
    expect(r.tim[0].sub.map((s) => s.idsubsls)).toEqual(["S2"]);
    expect(r.tim[0].target).toBe(5);
    expect(r.total.sub).toBe(1);
  });
});

describe("susunLapanganKorwil: Sub SLS yang didata lebih dari satu PML (diproporsikan)", () => {
  // contoh user: 77 KK, tim A didata 30, tim B 41 -> sisa 6 -> target A = 33, target B = 44
  const baris = (didataA: number, didataB: number, belum: number): BarisKkMon[] => {
    const satuTim = (pml: number, ppl: number, n: number) => (n > 0 ? [kk(pml, "S1", ppl, "terdampak", n)] : []);
    // kedua tim melihat daftar KK yang SAMA (seluruh KK Sub SLS)
    const semua = (pml: number) => [...satuTim(1, 111, didataA).map((x) => ({ ...x, pml_id: pml })), ...satuTim(2, 121, didataB).map((x) => ({ ...x, pml_id: pml })), ...(belum > 0 ? [kk(pml, "S1", null, null, belum)] : [])];
    return [...semua(1), ...semua(2)];
  };
  it("contoh user: 77 KK, didata 30 dan 41", () => {
    const r = susunLapanganKorwil({ tim: [TIM_A, TIM_B], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S1", pml_id: 2 }], nonaktif: new Set(), baris: baris(30, 41, 6), info: INFO });
    const [a, b] = r.tim;
    expect([a.target, a.realisasi]).toEqual([33, 30]);
    expect([b.target, b.realisasi]).toEqual([44, 41]);
    expect(a.sub[0]).toMatchObject({ dibagi: 2, kk_total: 77 });
    expect(a.sub_dibagi).toBe(1);
    // angka kelompok = jumlah angka tim, tanpa hitung ganda
    expect(r.total).toMatchObject({ target: 77, realisasi: 71, sub: 1, tim: 2 });
  });
  it("sisa ganjil: satu KK lebihnya untuk tim dengan realisasi lebih besar; jumlah target tetap = total KK", () => {
    const r = susunLapanganKorwil({ tim: [TIM_A, TIM_B], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S1", pml_id: 2 }], nonaktif: new Set(), baris: baris(30, 41, 7), info: INFO });
    const [a, b] = r.tim;
    expect(a.target).toBe(33); // 30 + 3
    expect(b.target).toBe(45); // 41 + 3 + 1 (realisasi lebih besar)
    expect(a.target + b.target).toBe(78);
    expect(r.total.target).toBe(78);
  });
  it("kemajuan PPL tidak dihitung dua kali pada Sub SLS bersama", () => {
    const r = susunLapanganKorwil({ tim: [TIM_A, TIM_B], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S1", pml_id: 2 }], nonaktif: new Set(), baris: baris(30, 41, 6), info: INFO });
    expect(r.tim[0].ppl.find((p) => p.nama === "Ppl A1")?.didata).toBe(30);
    expect(r.tim[1].ppl.find((p) => p.nama === "Ppl B1")?.didata).toBe(41);
  });
  it("tim di luar kelompok (tampil=false) ikut membagi Sub SLS tetapi tidak ditampilkan", () => {
    const luar: TimKorwilMasuk = { ...TIM_B, tampil: false };
    const r = susunLapanganKorwil({ tim: [TIM_A, luar], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S1", pml_id: 2 }], nonaktif: new Set(), baris: baris(30, 41, 6), info: INFO });
    expect(r.tim).toHaveLength(1);
    expect(r.tim[0].target).toBe(33);
    expect(r.total.tim).toBe(1);
  });
  it("sisa tidak pernah negatif (data tidak wajar)", () => {
    const r = susunLapanganKorwil({ tim: [TIM_A, TIM_B], sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S1", pml_id: 2 }], nonaktif: new Set(), baris: baris(50, 40, 0), info: INFO });
    expect(r.tim[0].target).toBe(50);
    expect(r.tim[1].target).toBe(40);
  });
});

describe("rekap nagari & label", () => {
  it("rekap per nagari menjumlah target dan realisasi", () => {
    const r = susunLapanganKorwil({
      tim: [TIM_A],
      sub: [{ idsubsls: "S1", pml_id: 1 }, { idsubsls: "S2", pml_id: 1 }, { idsubsls: "S3", pml_id: 1 }],
      nonaktif: new Set(),
      baris: [kk(1, "S1", 111, "terdampak", 5), kk(1, "S1", null, null, 5), kk(1, "S2", 111, "terdampak", 2), kk(1, "S2", null, null, 8), kk(1, "S3", 112, "terdampak", 7)],
      info: INFO,
    });
    expect(r.tim[0].nagari).toEqual([
      { nagari: "Muaro Pingai", sub: 1, target: 7, realisasi: 7 },
      { nagari: "Paninggahan", sub: 2, target: 20, realisasi: 7 },
    ]);
  });
  it("label & angka romawi", () => {
    expect(labelSubKorwil("JORONG GUCI II", "00")).toBe("Guci II 00");
    expect(labelSubKorwil("JORONG GANTING PADANG PALAK", "03")).toBe("Ganting Padang Palak 03");
    expect(judulWilayah("MUARO PINGAI")).toBe("Muaro Pingai");
  });
  it("persen: tanpa target = 0, dibulatkan 1 desimal", () => {
    expect(persenKorwil(5, 0)).toBe(0);
    expect(persenKorwil(681, 1965)).toBe(34.7);
    expect(persenKorwil(10, 5)).toBe(100);
  });
});

describe("susunAdministrasi", () => {
  const hari = (akun: number, tanggal: string, o: Partial<BarisHariKorwil> = {}): BarisHariKorwil => ({ akun_id: akun, tanggal, hari_kerja: true, lengkap: false, ada_laporan: false, jumlah_foto: 0, aktif: false, ...o });
  const masuk = {
    tim: [TIM_A],
    mulai: "2026-10-10",
    hariIni: "2026-10-13",
    baris: [
      hari(101, "2026-10-10", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: true }),
      hari(111, "2026-10-10", { hari_kerja: false }),
      hari(111, "2026-10-11", { ada_laporan: true, aktif: false }), // sebagian
      hari(111, "2026-10-12", {}), // kosong
      hari(111, "2026-10-13", {}), // hari ini, belum lengkap -> berjalan
      hari(112, "2026-10-12", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: true }),
      hari(112, "2026-10-11", { hari_kerja: false, aktif: true }), // anomali
    ],
  };
  const r = susunAdministrasi(masuk);
  it("kolom tanggal dari mulai sampai hari ini", () => {
    expect(r.tanggal).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
  });
  it("kelas tiap hari memakai penilai Monitoring; hari ini yang belum lengkap = berjalan", () => {
    const a1 = r.tim[0].baris.find((b) => b.nama === "Ppl A1")!;
    expect(a1.sel).toEqual(["tidak_ada", "sebagian", "kosong", "berjalan"]);
    const a2 = r.tim[0].baris.find((b) => b.nama === "Ppl A2")!;
    expect(a2.sel).toEqual(["tidak_ada", "anomali", "lengkap", "tidak_ada"]);
    expect(r.tim[0].baris[0].peran).toBe("pml"); // PML di baris pertama
  });
  it("PML dinilai dari laporan + foto saja (tanpa syarat hasil lapangan); PPL tetap perlu hasil", () => {
    const x = susunAdministrasi({
      tim: [TIM_A],
      mulai: "2026-10-10",
      hariIni: "2026-10-12",
      baris: [hari(101, "2026-10-10", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: false }), hari(111, "2026-10-10", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: false })],
    });
    expect(x.tim[0].baris[0].sel[0]).toBe("lengkap"); // PML
    expect(x.tim[0].baris.find((b) => b.nama === "Ppl A1")!.sel[0]).toBe("sebagian"); // PPL: laporan+foto lengkap tetapi belum ada hasil
  });
  it("hitungan lengkap/wajib tidak memasukkan hari ini, libur, atau anomali", () => {
    const a1 = r.tim[0].baris.find((b) => b.nama === "Ppl A1")!;
    expect([a1.lengkap, a1.wajib]).toEqual([0, 2]);
    expect(r.tim[0].baris[0]).toMatchObject({ lengkap: 1, wajib: 1 });
  });
  it("hari ini yang sudah lengkap pun tidak masuk hitungan lengkap/wajib (sama dengan Transport Lokal)", () => {
    const x = susunAdministrasi({
      tim: [TIM_A],
      mulai: "2026-10-10",
      hariIni: "2026-10-11",
      baris: [hari(101, "2026-10-10", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: false }), hari(101, "2026-10-11", { lengkap: true, ada_laporan: true, jumlah_foto: 5, aktif: false })],
    });
    expect(x.tim[0].baris[0].sel).toEqual(["lengkap", "lengkap"]);
    expect(x.tim[0].baris[0]).toMatchObject({ lengkap: 1, wajib: 1 });
  });
  it("perhatian = hari kerja terakhir sebelum hari ini", () => {
    expect(r.perhatian).toEqual({ tanggal: "2026-10-12", kosong: ["Ppl A1"], sebagian: [] });
  });
  it("tanpa data sama sekali: semua 'tidak_ada' dan tanpa perhatian", () => {
    const k = susunAdministrasi({ ...masuk, baris: [] });
    expect(k.tim[0].baris.every((b) => b.sel.every((x) => x === "tidak_ada"))).toBe(true);
    expect(k.perhatian).toBeNull();
  });
  it("mulai setelah hari ini -> tanpa kolom", () => {
    expect(susunAdministrasi({ ...masuk, mulai: "2026-10-20" }).tanggal).toEqual([]);
  });
});

describe("timCapaianTerendah (tanda di Monitoring Korwil)", () => {
  const t = (pml_id: number, target: number, realisasi: number) => ({ pml_id, target, realisasi });
  it("menandai tim dengan capaian terendah", () => {
    expect(timCapaianTerendah([t(1, 100, 80), t(2, 100, 40), t(3, 100, 60)])).toEqual([2]);
  });
  it("seri: semua yang terendah ditandai; semua sama: tidak ada", () => {
    expect(timCapaianTerendah([t(1, 100, 40), t(2, 50, 20), t(3, 100, 90)])).toEqual([1, 2]);
    expect(timCapaianTerendah([t(1, 100, 50), t(2, 100, 50)])).toEqual([]);
  });
  it("satu tim atau tim tanpa target tidak dinilai", () => {
    expect(timCapaianTerendah([t(1, 100, 10)])).toEqual([]);
    expect(timCapaianTerendah([t(1, 100, 10), t(2, 0, 0)])).toEqual([]);
  });
});
