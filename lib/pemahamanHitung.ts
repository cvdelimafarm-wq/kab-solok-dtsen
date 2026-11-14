// lib/pemahamanHitung.ts  (murni, tanpa basis data dan tanpa React)
//
// (14 Nov 2026) Templat monitoring pemahaman, langkah 2: SATU fungsi hitung untuk semua angka satu hari QC pemahaman.
// KPI, infografis (status, sebaran, soal, tim, petugas), tabel, dan nanti laporan serta lembar WA membaca hasil yang sama.
// Dipanggil di server (hasil QC SPDT dan Kelola Pendataan Pascabencana) dan dikirim sebagai `pemahaman`; layar memakai hasil itu.
// Bila respons lama belum membawa `pemahaman`, layar memanggil fungsi yang sama (tetap satu sumber hitung).
//
// Aturan:
//  - Orang dihitung sekali walau tercatat di dua tim (susunBarisQc menggabung baris per akun).
//  - Peserta yang belum mengerjakan tetap dihitung (dari daftar peserta), supaya "belum mengisi" tidak hilang.
//  - Definisi tertulis: lulus, terlambat, percobaan pertama, nilai terbaik.

import type { QcRekapTim } from "@/lib/sigapQc";
import { teksDefinisiTerlambat } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";
import { susunBarisQc, type BarisQc } from "@/lib/sigapQcTabel";
import {
  petugasPalingSalah,
  ringkasStatus,
  ringkasTim,
  sebaranNilaiAwal,
  sebaranPercobaan,
  soalPalingSalah,
  type InfoTim,
  type PetugasSalah,
  type RingkasStatus,
  type SoalSalahInfo,
  type TempatSebaran,
} from "@/lib/sigapQcInfo";

export type PesertaDasar = { akun_id: number; nama: string; peran: string; pml_nama?: string | null; percobaan?: number; lulus?: boolean; terlambat?: boolean; skor_terbaik?: number | null };

export type HitunganKelompok = { peserta: number; mengisi: number; belum: number; lulus: number; belum_lulus: number };

export type RingkasPemahaman = HitunganKelompok & {
  terlambat: number;
  rata_pertama: number | null;
  rata_terbaik: number | null;
  per_peran: { pml: HitunganKelompok; ppl: HitunganKelompok };
};

export type DefinisiPemahaman = { lulus: string; terlambat: string; pertama: string; terbaik: string };

export type HasilPemahaman = {
  versi: 1;
  nilai_lulus: number;
  kolom: number;
  jumlah_soal: number;
  definisi: DefinisiPemahaman;
  /** satu baris per orang (PML dan PPL) */
  baris: BarisQc[];
  ringkas: RingkasPemahaman;
  status: RingkasStatus;
  soal: SoalSalahInfo[];
  tim: InfoTim[];
  petugas_salah: PetugasSalah[];
  sebaran_pertama: TempatSebaran[];
  sebaran_percobaan: TempatSebaran[];
};

export type MasukanPemahaman = {
  rekap: QcRekapTim[];
  rincian: RincianQc | undefined;
  /** daftar peserta lengkap (PML + PPL); boleh kosong pada data lama */
  peserta?: readonly PesertaDasar[];
  nilaiLulus: number;
  kolom: number;
  jumlahSoal: number;
  batasJam?: string | null;
};

const hitungKelompok = (baris: readonly BarisQc[]): HitunganKelompok => {
  const mengisi = baris.filter((b) => b.percobaan > 0).length;
  const lulus = baris.filter((b) => b.lulus).length;
  return { peserta: baris.length, mengisi, belum: baris.length - mengisi, lulus, belum_lulus: mengisi - lulus };
};

export function definisiPemahaman(nilaiLulus: number, batasJam: string | null | undefined): DefinisiPemahaman {
  return {
    lulus: nilaiLulus >= 100 ? "Lulus = salah satu percobaan menjawab semua soal dengan benar (nilai 100)." : `Lulus = salah satu percobaan bernilai ${nilaiLulus} atau lebih.`,
    terlambat: teksDefinisiTerlambat(batasJam),
    pertama: "Percobaan pertama = nilai saat pertama kali mengerjakan soal hari itu, sebelum melihat pembahasan.",
    terbaik: "Nilai terbaik = nilai tertinggi dari semua percobaan hari itu.",
  };
}

/** Satu-satunya penghitung angka QC pemahaman satu hari. */
export function hitungPemahaman(m: MasukanPemahaman): HasilPemahaman {
  const baris = susunBarisQc(m.rekap, m.rincian, m.kolom);
  // peserta yang tidak muncul di rekap (mis. belum punya tim, atau hari tanpa rekap) tetap dihitung sekali
  const ada = new Set(baris.map((b) => b.akun_id));
  for (const p of m.peserta ?? []) {
    if (ada.has(p.akun_id)) continue;
    if (p.peran !== "pml" && p.peran !== "ppl") continue;
    ada.add(p.akun_id);
    const nilai: (number | null)[] = Array.from({ length: m.kolom }, () => null);
    const daftar = m.rincian?.percobaan[p.akun_id] ?? [];
    for (const x of daftar) if (x.ke >= 1 && x.ke <= m.kolom) nilai[x.ke - 1] = x.skor;
    const percobaan = Math.max(p.percobaan ?? 0, daftar.length);
    const terbaik = daftar.length ? Math.max(...daftar.map((x) => x.skor)) : (p.skor_terbaik ?? null);
    const lulus = p.lulus ?? daftar.some((x) => x.jumlah > 0 && x.benar * 100 >= m.nilaiLulus * x.jumlah);
    baris.push({ akun_id: p.akun_id, nama: p.nama, peran: p.peran === "pml" ? "PML" : "PPL", pml: p.peran === "ppl" ? (p.pml_nama ?? null) : null, percobaan, nilai, terbaik, lulus, terlambat: !!p.terlambat || daftar.some((x) => x.terlambat) });
  }
  const status = ringkasStatus(baris);
  const semua = hitungKelompok(baris);
  const ringkas: RingkasPemahaman = {
    ...semua,
    terlambat: status.terlambat.length,
    rata_pertama: status.rataAwal,
    rata_terbaik: status.rataTerbaik,
    per_peran: { pml: hitungKelompok(baris.filter((b) => b.peran === "PML")), ppl: hitungKelompok(baris.filter((b) => b.peran === "PPL")) },
  };
  return {
    versi: 1,
    nilai_lulus: m.nilaiLulus,
    kolom: m.kolom,
    jumlah_soal: m.jumlahSoal,
    definisi: definisiPemahaman(m.nilaiLulus, m.batasJam),
    baris,
    ringkas,
    status,
    soal: soalPalingSalah(baris, m.rekap, m.rincian),
    tim: ringkasTim(m.rekap, m.rincian),
    petugas_salah: petugasPalingSalah(baris, m.rincian, 60),
    sebaran_pertama: sebaranNilaiAwal(baris),
    sebaran_percobaan: sebaranPercobaan(baris, m.kolom),
  };
}
