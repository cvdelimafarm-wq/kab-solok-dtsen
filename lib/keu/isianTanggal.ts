// lib/keu/isianTanggal.ts
//
// (6 Nov 2026) Pengisian jadwal Identifikasi awal dan lanjutan cukup dengan TANGGAL (permintaan user: sederhanakan, hindari tahapan berlebih).
// Fungsi MURNI (tanpa React/DB) agar teruji; tampilan hanya memanggilnya. Bentuk data formulir (jsonb keu_ident) TIDAK berubah:
//   - jadwal tahap sesudah pendataan tetap disimpan sebagai selisih hari terhadap tahap acuan (`rel`); tanggal yang diketik diubah menjadi selisih;
//   - pola jendela pendataan (`jend`) tetap bulan ke-n + hari; tanggal yang diketik pada periode pertama diubah menjadi pola, dan tanggal
//     pada periode lain (atau di luar jangkauan pola) disimpan sebagai pengecualian periode itu;
//   - rekaman WaktuRec (rapat, briefing, pelatihan) selalu berbentuk rentang mulai-selesai; satu hari = mulai sama dengan selesai.

import {
  NAMA_PERIODE, PANJANG_PERIODE, adaPeriode, daftarPeriode, jendelaPeriode, kecualiAktif, selisihHari, tglIndo,
  type Form, type Jadwal, type Jend, type Rel,
} from "./identifikasi";
import { akhirBulanDari, polaDariTanggal, ubahRec, type WaktuRec } from "./waktu";
import { jumlahHariAntara, gantiMulai, type Rentang } from "./tanggalDurasi";

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const sah = (d: string | null | undefined): d is string => typeof d === "string" && TGL.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

// ---------------------------------------------------------------------------------------------------------------------
// 1. Rentang tanggal (rapat, briefing, pelatihan, jadwal tunggal)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Pengguna mengisi tanggal mulai. Tanggal selesai yang masih kosong langsung disamakan dengan mulai (kegiatan satu hari);
 * bila sudah ada, rentangnya bergeser dengan jumlah hari tetap (lihat `gantiMulai`).
 */
export function isiMulai(r: Rentang, mulaiBaru: string): Rentang {
  if (sah(mulaiBaru) && !sah(r.selesai)) return { mulai: mulaiBaru, selesai: mulaiBaru };
  return gantiMulai(r, mulaiBaru);
}

/** Pengguna mengisi tanggal selesai. Mulai yang masih kosong disamakan dengan selesai (satu hari). */
export function isiSelesai(r: Rentang, selesaiBaru: string): Rentang {
  if (sah(selesaiBaru) && !sah(r.mulai)) return { mulai: selesaiBaru, selesai: selesaiBaru };
  return { mulai: r.mulai, selesai: selesaiBaru };
}

/** Keterangan di bawah isian rentang: jumlah hari, atau kesalahan urutan. */
export function ketRentang(mulai: string, selesai: string): { teks: string; galat: boolean } {
  const n = jumlahHariAntara(mulai, selesai);
  if (n !== null) return { teks: n === 1 ? "1 hari" : `${n} hari`, galat: false };
  if (sah(mulai) && sah(selesai)) return { teks: "Tanggal selesai mendahului tanggal mulai.", galat: true };
  return { teks: "", galat: false };
}

/**
 * Rekaman jadwal baru dari rentang yang diketik. Selalu berbentuk rentang; bulan dan minggu perkiraan dibuang (tidak dipakai lagi,
 * tanggalnya sudah ada pada mulai dan selesai). Penanda Perkiraan/Fix dipertahankan dari rekaman semula.
 */
export function rekDariRentang(rec: WaktuRec | undefined, x: Rentang, tahun: number): WaktuRec {
  const { bulan: _b, minggu: _m, ...sisa } = (rec ?? { mulai: "", selesai: "" }) as WaktuRec;
  void _b; void _m;
  return ubahRec(sisa, { mode: "rentang", mulai: x.mulai, selesai: x.selesai }, tahun);
}

/** Mengganti penanda Perkiraan/Fix tanpa menyentuh tanggal. */
export function rekDenganPerk(rec: WaktuRec | undefined, perk: boolean, tahun: number): WaktuRec {
  const { bulan: _b, minggu: _m, ...sisa } = (rec ?? { mulai: "", selesai: "" }) as WaktuRec;
  void _b; void _m;
  return ubahRec(sisa, { mode: "rentang", perk }, tahun);
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Tahap sesudah pendataan: tanggal yang diketik -> selisih hari terhadap tahap acuan
// ---------------------------------------------------------------------------------------------------------------------

/** Batas selisih hari yang disimpan formulir (sama dengan normalisasi: -60 .. 365). */
export const SELISIH_MIN = -60;
export const SELISIH_MAKS = 365;

export type HasilRel = { patch: Partial<Rel> } | { galat: string };

/**
 * Mengubah tanggal mulai atau selesai satu tahap (updating, pengolahan, pasca, diseminasi) menjadi selisih hari terhadap tahap acuannya,
 * dengan tetap memakai penanda acuan (mulai/selesai) yang sudah ada pada `rel`. `acuan` = jadwal tahap acuan yang sudah dihitung.
 */
export function relDariTanggal(rel: Rel, acuan: { mulai?: string; selesai?: string } | undefined, sisi: "mulai" | "selesai", d: string): HasilRel {
  if (!sah(d)) return { galat: "Tanggal tidak sah." };
  const a = sisi === "mulai" ? rel.aM : rel.aS;
  const tglAcuan = acuan ? (a === "mulai" ? acuan.mulai : acuan.selesai) : "";
  if (!sah(tglAcuan)) return { galat: "Tahap acuan belum punya tanggal; isi dahulu tahap sebelumnya." };
  const n = selisihHari(d, tglAcuan);
  if (n < SELISIH_MIN || n > SELISIH_MAKS) return { galat: `Terlalu jauh dari tahap acuan (paling awal ${-SELISIH_MIN} hari sebelum, paling akhir ${SELISIH_MAKS} hari sesudah ${a} tahap acuan).` };
  return { patch: sisi === "mulai" ? { dM: n } : { dS: n } };
}

/** Pengolahan disamakan dengan pendataan (bawaan): mulai-mulai dan selesai-selesai, selisih nol. */
export const relSamaDenganAcuan = (): Partial<Rel> => ({ aM: "mulai", dM: 0, aS: "selesai", dS: 0 });
export const relSudahSama = (r: Rel): boolean => r.aM === "mulai" && r.dM === 0 && r.aS === "selesai" && r.dS === 0;

// ---------------------------------------------------------------------------------------------------------------------
// 3. Pendataan lapangan: tanggal yang diketik -> pola jendela atau pengecualian periode
// ---------------------------------------------------------------------------------------------------------------------

export const ALASAN_KHUSUS = "Jadwal periode ini berbeda dari pola.";
export const ALASAN_LUAR_POLA = "Di luar jangkauan pola; jadwal diisi manual.";

export type KeputusanPendataan =
  | { aksi: "tunggal" }
  | { aksi: "pola"; patch: Partial<Jend> }
  | { aksi: "khusus"; luarPola: boolean };

/**
 * Menentukan ke mana sebuah tanggal pendataan yang diketik pada periode P disimpan:
 *   - tanpa periode: jadwal tunggal;
 *   - periode pertama (acuan) yang belum punya pengecualian: pola jendela, berlaku untuk semua periode yang belum punya pengecualian;
 *     tanggal paling akhir bulan disimpan sebagai "akhir bulan" agar mengikuti panjang bulan tiap periode;
 *   - periode lain, periode yang sudah punya pengecualian, atau tanggal di luar jangkauan pola (sebelum awal periode atau lebih dari
 *     24 bulan sesudahnya): pengecualian periode itu saja.
 */
export function putusanPendataan(f: Form, P: string, sisi: "mulai" | "selesai", d: string, tahun: number): KeputusanPendataan {
  if (!adaPeriode(f)) return { aksi: "tunggal" };
  const first = daftarPeriode(f)[0];
  if (P !== first || kecualiAktif(f, P)) return { aksi: "khusus", luarPola: false };
  const awal = NAMA_PERIODE[f.periode].indexOf(P) * PANJANG_PERIODE[f.periode];
  const p = polaDariTanggal(d, awal, tahun);
  if (!p) return { aksi: "khusus", luarPola: true };
  if (sisi === "mulai") return { aksi: "pola", patch: { mb: p.bulanKe, mj: "tgl", mn: p.hari } };
  const akhir = akhirBulanDari(d) === d;
  return { aksi: "pola", patch: akhir ? { sb: p.bulanKe, sj: "akhir", sn: 0 } : { sb: p.bulanKe, sj: "tgl", sn: p.hari } };
}

/**
 * Menerapkan tanggal pendataan yang diketik pada salinan formulir `g` (dipakai di dalam `ubah((g) => ...)`).
 * Mengembalikan keputusan yang diambil, supaya tampilan dapat memberi peringatan bila tanggalnya di luar jangkauan pola.
 */
export function terapkanTanggalPendataan(g: Form, P: string, sisi: "mulai" | "selesai", d: string, tahun: number): KeputusanPendataan {
  const k = putusanPendataan(g, P, sisi, d, tahun);
  if (k.aksi === "tunggal") {
    // Jadwal pendataan tidak menggeser sisi lain (beda dengan rapat): 1-15 lalu mulai diganti 5 tetap berakhir di 15. Sisi yang masih kosong
    // disamakan dengan tanggal yang baru diketik.
    const lain = sisi === "mulai" ? g.tunggal.selesai : g.tunggal.mulai;
    if (sisi === "mulai") { g.tunggal.mulai = d; if (!sah(lain)) g.tunggal.selesai = d; }
    else { g.tunggal.selesai = d; if (!sah(lain)) g.tunggal.mulai = d; }
  } else if (k.aksi === "pola") {
    Object.assign(g.jend, k.patch);
  } else {
    const w: Jadwal = jendelaPeriode(g, P, tahun);
    const e = g.kecuali[P]?.on ? g.kecuali[P] : { on: true, mulai: w.mulai, selesai: w.selesai, alasan: "", perk: !!w.perk };
    e[sisi] = d;
    if (!String(e.alasan || "").trim()) e.alasan = k.luarPola ? ALASAN_LUAR_POLA : ALASAN_KHUSUS;
    g.kecuali[P] = e;
  }
  return k;
}

/** Keterangan jadwal satu periode untuk tabel: "Mengikuti pola" atau "Jadwal khusus". */
export const jenisJadwalPeriode = (f: Form, P: string): "pola" | "khusus" => (kecualiAktif(f, P) ? "khusus" : "pola");

/** Ringkas tanggal "dd/mm/yyyy s.d. dd/mm/yyyy" untuk pesan. */
export const ringkasTanggal = (mulai: string, selesai: string): string => (mulai ? `${tglIndo(mulai)} s.d. ${tglIndo(selesai)}` : "belum diisi");
