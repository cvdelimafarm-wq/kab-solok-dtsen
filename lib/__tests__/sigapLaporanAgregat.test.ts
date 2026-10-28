import { describe, expect, it } from "vitest";
import { agregatIdentifikasi, agregatPendataan, agregatQc, gabungHarian, type AnggotaIsi, type BarisHarian } from "../sigapLaporanAgregat";

const b = (t: string, a: number, h: string, n: number, extra: Partial<BarisHarian> = {}): BarisHarian => ({ t, a, h, al: null, s: null, j: null, js: null, n, ...extra });
const anggota: AnggotaIsi[] = [
  { akun_id: 1, nama: "Rina", peran: "ppl", tim: "Budi" },
  { akun_id: 2, nama: "Sari", peran: "ppl", tim: "Budi" },
  { akun_id: 3, nama: "Tono", peran: "ppl", tim: "Ani" },
];

describe("agregatPendataan", () => {
  const baris: BarisHarian[] = [
    b("2026-10-14", 1, "terdampak", 4, { s: "S1", j: 3, js: "riil" }),
    b("2026-10-14", 1, "tidak_ditemukan", 2, { al: "Pindah", s: "S1", j: 3, js: "riil" }),
    b("2026-10-14", 2, "tidak_terdampak", 5, { s: "S2", j: 7.5, js: "perkiraan_nagari" }),
    b("2026-10-14", 3, "tidak_ditemukan", 1, { al: null, s: "S3" }),
    b("2026-10-15", 1, "terdampak", 9),
    b("2026-10-15", 1, "belum", 99),
  ];
  it("PML: total, alasan, per PPL, jarak (pasangan unik, perkiraan, tanpa data)", () => {
    const m = agregatPendataan("pml", baris, anggota);
    const d = m.get("2026-10-14")!;
    expect(d.pendataan!.hasil).toEqual({ terdampak: 4, tidak_terdampak: 5, tidak_ditemukan: 3 });
    expect(d.pendataan!.alasan.sort((x, y) => x.alasan.localeCompare(y.alasan))).toEqual([{ alasan: "Pindah", n: 2 }, { alasan: "Tanpa alasan", n: 1 }]);
    expect(d.pendataan!.petugas.map((p) => p.nama)).toEqual(["Rina", "Sari", "Tono"]);
    expect(d.jarak).toEqual({ pasangan: 2, rataKm: 5.25, maksKm: 7.5, perkiraan: 1, tanpa: 1 });
    expect(m.get("2026-10-15")!.jarak).toBeNull();
    expect(m.get("2026-10-15")!.pendataan!.hasil).toEqual({ terdampak: 9, tidak_terdampak: 0, tidak_ditemukan: 0 });
  });
  it("korwil: rincian per tim; PPL: tanpa rincian petugas", () => {
    const k = agregatPendataan("korwil", baris, anggota).get("2026-10-14")!;
    expect(k.pendataan!.petugas.map((p) => [p.nama, p.hasil.terdampak + p.hasil.tidak_terdampak + p.hasil.tidak_ditemukan])).toEqual([["Ani", 1], ["Budi", 11]]);
    expect(agregatPendataan("ppl", baris, anggota).get("2026-10-14")!.pendataan!.petugas).toEqual([]);
  });
  it("tanpa baris -> peta kosong", () => {
    expect(agregatPendataan("ppl", [], []).size).toBe(0);
  });
});

describe("agregatIdentifikasi", () => {
  it("per tanggal WIB: Sub SLS berbeda & jumlah variabel", () => {
    const m = agregatIdentifikasi([
      { idsubsls: "A", diisi_at: "2026-10-10T17:30:00Z", kk_terdampak: 10, rusak_berat: "3", korban: null }, // 11 Okt 00.30 WIB
      { idsubsls: "B", diisi_at: "2026-10-11T03:00:00Z", kk_terdampak: 5, rusak_berat: 1 },
      { idsubsls: "B", diisi_at: "2026-10-11T04:00:00Z", kk_terdampak: 1 },
      { idsubsls: "C", diisi_at: null, kk_terdampak: 99 },
    ]);
    expect([...m.keys()]).toEqual(["2026-10-11"]);
    expect(m.get("2026-10-11")).toMatchObject({ subsls: 2, nilai: { kk_terdampak: 16, rusak_berat: 4, korban: 0 } });
  });
});

describe("agregatQc & gabungHarian", () => {
  it("lembar QC dijumlah per tanggal; ringkas rusak tidak membuat galat", () => {
    const m = agregatQc([
      { tanggal: "2026-10-27", ringkas: { kategori: "Cukup", sesuai: 9, perlu_perbaikan: 3, tidak_sesuai: 0 } },
      { tanggal: "2026-10-27", ringkas: { kategori: "Baik", sesuai: 12, perlu_perbaikan: 0, tidak_sesuai: 0 } },
      { tanggal: "2026-10-27", ringkas: null },
    ]);
    expect(m.get("2026-10-27")).toEqual({ lembar: 3, kategori: { Cukup: 1, Baik: 1, "Belum dinilai": 1 }, sesuai: 21, perluPerbaikan: 3, tidakSesuai: 0 });
    const g = gabungHarian({ qc: m, identifikasi: agregatIdentifikasi([{ idsubsls: "A", diisi_at: "2026-10-27T01:00:00Z" }]), pendataan: null });
    expect(g.get("2026-10-27")!.qc!.lembar).toBe(3);
    expect(g.get("2026-10-27")!.identifikasi!.subsls).toBe(1);
  });
});
