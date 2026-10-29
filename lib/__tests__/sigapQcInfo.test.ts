// (29 Okt 2026) Uji data infografis QC Pemahaman (lib/sigapQcInfo.ts).
import { describe, expect, it } from "vitest";
import { petugasPalingSalah, ringkasStatus, ringkasTim, sebaranNilaiAwal, sebaranPercobaan, soalPalingSalah } from "@/lib/sigapQcInfo";
import { susunBarisQc } from "@/lib/sigapQcTabel";
import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";

const mk = (ke: number, skor: number, salah: { soal_id: string; dipilih: string | null }[], terlambat = false) => ({ ke, skor, benar: 10 - salah.length, jumlah: 10, terlambat, selesai_at: "2026-10-29T03:00:00Z", salah });

const RINCIAN: RincianQc = {
  percobaan: {
    1: [mk(1, 60, [{ soal_id: "s1", dipilih: "A" }, { soal_id: "s2", dipilih: "C" }, { soal_id: "s3", dipilih: null }]), mk(2, 100, [])],
    2: [mk(1, 80, [{ soal_id: "s1", dipilih: "A" }, { soal_id: "s2", dipilih: "D" }])],
    9: [mk(1, 100, [])],
  },
  soal: {
    s1: { id: "s1", pertanyaan: "Soal satu", kunci: "B", opsi: { A: "aa", B: "bb", C: "cc" } },
    s2: { id: "s2", pertanyaan: "Soal dua", kunci: "C", opsi: { A: "a2", C: "c2", D: "d2" } },
    s3: { id: "s3", pertanyaan: "Soal tiga", kunci: "A", opsi: { A: "a3", B: "b3" } },
  },
};

const REKAP: QcRekapTim[] = [
  {
    pml_akun_id: 9,
    pml_nama: "Aprila",
    pml_sendiri: { percobaan: 1, lulus: true, skor_terbaik: 100 },
    jumlah_ppl: 3,
    sudah: 2,
    belum_mengisi: 1,
    lulus: 1,
    rata_awal: 70,
    rata_terbaik: 90,
    ppl: [
      { akun_id: 1, nama: "Ega", percobaan: 2, skor_awal: 60, skor_terbaik: 100, lulus: true, terlambat: false, status: "lulus" },
      { akun_id: 2, nama: "Nor", percobaan: 1, skor_awal: 80, skor_terbaik: 80, lulus: false, terlambat: false, status: "belum" },
      { akun_id: 3, nama: "Mirvan", percobaan: 0, skor_awal: null, skor_terbaik: null, lulus: false, terlambat: false, status: "belum" },
    ],
    salah: [
      { soal_id: "s1", pertanyaan: "Soal satu", kunci: "B", kunci_teks: "", penjelasan: "", jumlah: 2, nama: ["Ega", "Nor"] },
      { soal_id: "s9", pertanyaan: "Soal sembilan", kunci: "A", kunci_teks: "", penjelasan: "", jumlah: 1, nama: ["Nor"] },
    ],
  },
];

const baris = susunBarisQc(REKAP, RINCIAN, 4);

describe("soalPalingSalah", () => {
  it("dari percobaan PERTAMA: jumlah orang, urut terbanyak, siapa dan pilihannya", () => {
    const s = soalPalingSalah(baris, REKAP, RINCIAN);
    // jumlah sama (2) diurutkan menurut teks pertanyaan: "Soal dua" sebelum "Soal satu"
    expect(s.map((x) => [x.soal_id, x.jumlah])).toEqual([["s2", 2], ["s1", 2], ["s3", 1]]);
    const s1 = s.find((x) => x.soal_id === "s1")!;
    expect(s1.orang.map((o) => o.nama)).toEqual(["Ega", "Nor"]);
    expect(s1.kunci).toBe("B");
    expect(s1.pilihan).toEqual([
      { huruf: "A", teks: "aa", jumlah: 2, benar: false },
      { huruf: "B", teks: "bb", jumlah: 0, benar: true },
      { huruf: "C", teks: "cc", jumlah: 0, benar: false },
    ]);
  });
  it("tidak terjawab dihitung terpisah; percobaan ke-2 tidak ikut", () => {
    const s3 = soalPalingSalah(baris, REKAP, RINCIAN).find((x) => x.soal_id === "s3")!;
    expect(s3.tidakTerjawab).toBe(1);
    expect(s3.orang).toHaveLength(1);
  });
  it("tanpa rincian: jatuh ke daftar salah pada rekap tim (dengan nama)", () => {
    const s = soalPalingSalah(susunBarisQc(REKAP, undefined, 4), REKAP, undefined);
    expect(s.map((x) => [x.soal_id, x.jumlah])).toEqual([["s1", 2], ["s9", 1]]);
    expect(s[0].orang.map((o) => o.akun_id)).toEqual([1, 2]);
    expect(s[1].pertanyaan).toBe("Soal sembilan");
  });
});

describe("ringkasTim / petugasPalingSalah / sebaran / ringkasStatus", () => {
  it("ringkasTim: anggota, rata soal salah percobaan pertama", () => {
    const [t] = ringkasTim(REKAP, RINCIAN);
    expect(t.pml).toBe("Aprila");
    expect(t.akunIds).toEqual([9, 1, 2, 3]);
    // Ega 3 salah, Nor 2 salah, PML 0 salah => 5/3
    expect(t.rataSalah).toBe(1.7);
    expect(ringkasTim(REKAP, undefined)[0].rataSalah).toBeNull();
  });
  it("petugasPalingSalah: urut salah terbanyak, abaikan yang tanpa salah, hormati batas", () => {
    const p = petugasPalingSalah(baris, RINCIAN, 10);
    expect(p.map((x) => [x.nama, x.salah])).toEqual([["Ega", 3], ["Nor", 2]]);
    expect(petugasPalingSalah(baris, RINCIAN, 1)).toHaveLength(1);
    expect(petugasPalingSalah(baris, undefined)).toEqual([]);
  });
  it("sebaranNilaiAwal: kotak nilai dan belum mengisi", () => {
    const s = sebaranNilaiAwal(baris);
    const j = Object.fromEntries(s.map((x) => [x.label, x.jumlah]));
    expect(j).toEqual({ "100": 1, "90–99": 0, "80–89": 1, "70–79": 0, "60–69": 1, "< 60": 0, "Belum mengisi": 1 });
    expect(s.find((x) => x.label === "Belum mengisi")!.akunIds).toEqual([3]);
  });
  it("sebaranPercobaan: 0..kolom", () => {
    const s = sebaranPercobaan(baris, 3);
    expect(s.map((x) => x.jumlah)).toEqual([1, 2, 1, 0]);
    expect(s[0].label).toBe("Belum mengisi");
    expect(s[2].label).toBe("2 percobaan");
  });
  it("ringkasStatus: daftar akun per status dan rata-rata", () => {
    const r = ringkasStatus(baris);
    expect(r.total).toBe(4);
    expect(r.lulus).toEqual([9, 1]);
    expect(r.belumLulus).toEqual([2]);
    expect(r.belum).toEqual([3]);
    expect(r.rataAwal).toBe(80); // (100 + 60 + 80) / 3
  });
});
