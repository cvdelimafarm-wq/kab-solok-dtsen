// lib/delego/teknis.ts
//
// (26 Okt 2026, tahap 39) Delego untuk pekerjaan teknis kantor: logika murni (tanpa jaringan) yang mencerminkan aturan di berkas SQL 20261026i.
// Yang memutuskan tetap basis data; berkas ini hanya agar layar menampilkan hal yang sama dan menolak isian keliru sebelum dikirim.
//
// Ukuran beban: poin (kapasitas 70 poin per hari kerja = 7,5 jam). Katalog jenis menetapkan poin tetap per satuan (dokumen, peta, laporan, ...).
// Untuk delegasi berjenis, target_total dan target_harian berupa POIN; laporan harian diisi dalam jumlah satuan (poin = jumlah x poin_per_satuan).

import { angka, bulat, hariKe, hariKerjaAntara, KAPASITAS_HARIAN, tambahHari } from "./hitung";
import type { Delegasi, HasilKerja, JenisPekerjaan, Langkah, Laporan, Rutin } from "./tipe";

export const MENIT_KERJA_HARIAN = 450; // 7,5 jam
export const MAKS_LANGKAH = 20;
export const MAKS_LANGKAH_BAWAAN = 12;

// ------------------------------------------------------------------ Poin dan satuan
/** Delegasi berjenis = melapor dalam jumlah satuan. */
export const berjenis = (d: Pick<Delegasi, "poin_per_satuan">): boolean => d.poin_per_satuan !== null && d.poin_per_satuan !== undefined && angka(d.poin_per_satuan) > 0;

/** Satuan untuk angka target/capaian yang tersimpan: delegasi berjenis tersimpan dalam poin, selain itu satuan bebas. */
export const satuanAngka = (d: Pick<Delegasi, "poin_per_satuan" | "satuan">): string => (berjenis(d) ? "poin" : d.satuan || "poin");

export const poinDariJumlah = (pps: number, jumlah: number): number => bulat(pps * jumlah, 2);
export const jumlahDariPoin = (pps: number, poin: number): number => (pps > 0 ? bulat(poin / pps, 2) : 0);

/** "3 dokumen (27 poin)" untuk delegasi berjenis, "27 poin" selain itu. */
export function teksJumlah(d: Pick<Delegasi, "poin_per_satuan" | "satuan">, poin: number, fmt: (n: number) => string = (n) => String(bulat(n, 1))): string {
  if (!berjenis(d)) return `${fmt(poin)} ${d.satuan || "poin"}`;
  return `${fmt(jumlahDariPoin(angka(d.poin_per_satuan), poin))} ${d.satuan} (${fmt(poin)} poin)`;
}

/** Perkiraan lama pengerjaan dari poin, dalam menit (sebesar kapasitas harian: 75 poin = 450 menit, jadi 1 poin = 6 menit). */
export const menitDariPoin = (poin: number): number => Math.round((poin / KAPASITAS_HARIAN) * MENIT_KERJA_HARIAN);

/** "1,5 jam", "45 menit", "1 hari kerja" untuk membantu Ketua Tim menimbang poin. */
export function teksDurasi(poin: number): string {
  const m = menitDariPoin(poin);
  if (m < 60) return `${m} menit`;
  if (m >= MENIT_KERJA_HARIAN - 10) return `${bulat(m / MENIT_KERJA_HARIAN, 1).toLocaleString("id-ID")} hari kerja`;
  return `${bulat(m / 60, 1).toLocaleString("id-ID")} jam`;
}

/** Target total dan harian untuk delegasi berjenis: sama dengan keu_dlg_buat (total = jumlah x poin, harian = total / hari kerja, minimal 1 hari). */
export function hitungTargetJenis(pps: number, jumlah: number, mulai: string, tenggat: string, hk: number[]): { total: number; harian: number; hariKerja: number } {
  const total = poinDariJumlah(pps, jumlah);
  const hariKerja = Math.max(1, hariKerjaAntara(mulai, tenggat, hk));
  return { total, harian: bulat(total / hariKerja, 2), hariKerja };
}

// ------------------------------------------------------------------ Langkah (checklist)
export type KemajuanLangkah = { selesai: number; total: number; persen: number };
export function kemajuanLangkah(langkah: Pick<Langkah, "selesai">[]): KemajuanLangkah {
  const total = langkah.length;
  const selesai = langkah.filter((l) => l.selesai).length;
  return { selesai, total, persen: total === 0 ? 0 : Math.round((selesai / total) * 100) };
}

/** Teks satu langkah per baris -> larik langkah rapi (buang baris kosong, penomoran/tanda di awal baris, ganda berurutan). */
export function bacaBarisLangkah(teks: string, maks = MAKS_LANGKAH): { langkah: string[]; galat: string | null } {
  const baris = teks
    .split(/\r?\n/)
    .map((b) => b.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((b) => b.length > 0);
  if (baris.length > maks) return { langkah: baris.slice(0, maks), galat: `Paling banyak ${maks} langkah.` };
  const pendek = baris.find((b) => b.length < 2 || b.length > 150);
  if (pendek !== undefined) return { langkah: baris, galat: "Tiap langkah 2 sampai 150 huruf." };
  return { langkah: baris, galat: null };
}

// ------------------------------------------------------------------ Hasil kerja dan tinjau
export type KeadaanHasil = "tidak_perlu" | "belum" | "menunggu_tinjau" | "perlu_revisi" | "diterima" | "diserahkan";

export const hasilDelegasi = (hasil: HasilKerja[] | undefined, id: number): HasilKerja[] =>
  (hasil ?? []).filter((h) => h.delegasi_id === id).sort((a, z) => a.nomor - z.nomor);

/**
 * Keadaan hasil kerja suatu delegasi:
 *  tidak_perlu     delegasi tidak meminta hasil;
 *  belum           belum pernah diserahkan;
 *  menunggu_tinjau versi terakhir diserahkan dan menunggu pemberi;
 *  perlu_revisi    versi terakhir diminta direvisi;
 *  diterima        ada versi diterima;
 *  diserahkan      sudah diserahkan tanpa tinjau (tidak perlu_tinjau) dan belum ditandai diterima.
 */
export function keadaanHasil(d: Pick<Delegasi, "perlu_hasil" | "perlu_tinjau">, hasil: HasilKerja[]): KeadaanHasil {
  if (!d.perlu_hasil) return "tidak_perlu";
  if (hasil.length === 0) return "belum";
  if (hasil.some((h) => h.status === "diterima")) return "diterima";
  const akhir = hasil[hasil.length - 1];
  if (akhir.status === "diserahkan") return d.perlu_tinjau ? "menunggu_tinjau" : "diserahkan";
  return "perlu_revisi";
}

/** Penerima boleh menyerahkan hasil: delegasi meminta hasil, masih baru/berjalan, dan tidak ada versi yang menunggu tinjau. */
export function bolehSerahHasil(d: Pick<Delegasi, "perlu_hasil" | "status">, hasil: HasilKerja[]): boolean {
  return !!d.perlu_hasil && (d.status === "baru" || d.status === "berjalan") && !hasil.some((h) => h.status === "diserahkan") && !hasil.some((h) => h.status === "diterima");
}

/** Pesan bila delegasi belum boleh ditandai selesai lewat menu Ubah (mencerminkan keu_dlg_ubah), selain itu null. */
export function halanganSelesai(d: Pick<Delegasi, "perlu_hasil" | "perlu_tinjau">, hasil: HasilKerja[]): string | null {
  if (d.perlu_tinjau && !hasil.some((h) => h.status === "diterima")) return "Hasil kerja belum diterima. Tinjau hasilnya dulu, atau matikan \"perlu tinjau\".";
  if (d.perlu_hasil && !d.perlu_tinjau && hasil.length === 0) return "Hasil kerja belum diserahkan. Minta penerima menyerahkannya, atau matikan \"perlu hasil\".";
  return null;
}

/** Cermin keu_dlg_tuntas: delegasi dianggap tuntas bila hasil sudah diserahkan/diterima (perlu hasil) atau ada laporan pada/setelah tenggat. */
export function tuntas(d: Pick<Delegasi, "id" | "perlu_hasil" | "tenggat">, hasil: HasilKerja[], laporan: Pick<Laporan, "delegasi_id" | "tanggal">[]): boolean {
  if (d.perlu_hasil) return hasil.some((h) => h.delegasi_id === d.id && (h.status === "diserahkan" || h.status === "diterima"));
  return laporan.some((l) => l.delegasi_id === d.id && l.tanggal >= d.tenggat);
}

/** Butir hasil yang berupa tautan web (boleh diklik). Hanya http/https. */
export const tautanButir = (teks: string): string | null => (/^https?:\/\/[^\s]+$/i.test(teks.trim()) ? teks.trim() : null);

// ------------------------------------------------------------------ Tenggat jam
const MS_JAM = 3_600_000;
/** "09:30" (WIB) dari instan ISO, atau null. */
export function jamTenggat(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 7 * MS_JAM).toISOString().slice(11, 16);
}

export type StatusTenggatJam =
  | { tipe: "tanpa" }
  | { tipe: "jauh"; sisaMenit: number; teks: string }
  | { tipe: "menjelang"; sisaMenit: number; teks: string }
  | { tipe: "lewat"; lewatMenit: number; teks: string }
  | { tipe: "tuntas"; teks: string };

const teksSisa = (m: number): string => {
  if (m < 60) return `${Math.max(1, Math.round(m))} menit`;
  if (m < 36 * 60) {
    const j = Math.floor(m / 60);
    const s = Math.round(m % 60);
    return s === 0 ? `${j} jam` : `${j} jam ${s} menit`;
  }
  return `${Math.round(m / 1440)} hari`;
};

/** Keadaan tenggat jam suatu delegasi pada instan `sekarang`. "menjelang" = kurang dari 2 jam (sama dengan pengingat otomatis). */
export function statusTenggatJam(d: Pick<Delegasi, "tenggat_waktu">, sekarang: Date, selesai: boolean | string = false): StatusTenggatJam {
  if (!d.tenggat_waktu) return { tipe: "tanpa" };
  if (selesai) return { tipe: "tuntas", teks: `Tenggat pukul ${jamTenggat(d.tenggat_waktu)} WIB, ${typeof selesai === "string" ? selesai : "sudah tuntas"}` };
  const t = Date.parse(d.tenggat_waktu);
  if (!Number.isFinite(t)) return { tipe: "tanpa" };
  const selisihMenit = (t - sekarang.getTime()) / 60_000;
  const jam = jamTenggat(d.tenggat_waktu);
  if (selisihMenit <= 0) return { tipe: "lewat", lewatMenit: -selisihMenit, teks: `Lewat tenggat pukul ${jam} WIB (${teksSisa(-selisihMenit)} lalu)` };
  if (selisihMenit <= 120) return { tipe: "menjelang", sisaMenit: selisihMenit, teks: `Tenggat pukul ${jam} WIB, sisa ${teksSisa(selisihMenit)}` };
  return { tipe: "jauh", sisaMenit: selisihMenit, teks: `Tenggat pukul ${jam} WIB` };
}

// ------------------------------------------------------------------ Templat berulang
export const NAMA_HARI_PANJANG = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** "Setiap Senin" atau "Setiap tanggal 5". */
export const teksJadwalRutin = (r: Pick<Rutin, "frekuensi" | "hari">): string => (r.frekuensi === "mingguan" ? `Setiap ${NAMA_HARI_PANJANG[r.hari] ?? "?"}` : `Setiap tanggal ${r.hari}`);

/** Apakah templat jatuh pada tanggal ini (sama dengan keu_dlg_rutin_jalan). */
export function rutinJatuhPada(r: Pick<Rutin, "frekuensi" | "hari" | "aktif" | "mulai_berlaku" | "berakhir">, tanggal: string): boolean {
  if (!r.aktif || tanggal < r.mulai_berlaku || (r.berakhir && tanggal > r.berakhir)) return false;
  return r.frekuensi === "mingguan" ? hariKe(tanggal) === r.hari : Number(tanggal.slice(8, 10)) === r.hari;
}

/** Tanggal berikutnya (mulai dari `dari`, termasuk hari itu) templat akan membuat delegasi, atau null dalam 400 hari. */
export function rutinBerikutnya(r: Pick<Rutin, "frekuensi" | "hari" | "aktif" | "mulai_berlaku" | "berakhir">, dari: string): string | null {
  for (let i = 0; i <= 400; i++) {
    const t = tambahHari(dari, i);
    if (rutinJatuhPada(r, t)) return t;
  }
  return null;
}

// ------------------------------------------------------------------ Pemeriksaan isian formulir (cermin SQL)
export type FormJenis = { kode: string; nama: string; satuan: string; poin: string; uraian: string; perluHasil: boolean; perluTinjau: boolean; langkah: string; urut: string };

export function periksaJenis(f: FormJenis, baru: boolean): string[] {
  const g: string[] = [];
  if (baru && !/^[a-z0-9_]{3,30}$/.test(f.kode.trim())) g.push("Kode 3 sampai 30 karakter: huruf kecil, angka, garis bawah.");
  if (f.nama.trim().length < 3 || f.nama.trim().length > 80) g.push("Nama 3 sampai 80 huruf.");
  if (f.satuan.trim().length < 1 || f.satuan.trim().length > 30) g.push("Satuan 1 sampai 30 huruf.");
  const p = Number(f.poin.replace(",", "."));
  if (!(p > 0 && p <= 1000)) g.push("Poin per satuan harus lebih dari 0 dan paling banyak 1000.");
  if (f.uraian.length > 300) g.push("Uraian maksimal 300 huruf.");
  if (f.perluTinjau && !f.perluHasil) g.push("Tinjau hasil hanya bermakna bila jenis ini meminta hasil kerja.");
  const u = f.urut.trim() === "" ? 50 : Number(f.urut);
  if (!Number.isInteger(u) || u < 0 || u > 999) g.push("Urutan 0 sampai 999.");
  const l = bacaBarisLangkah(f.langkah, MAKS_LANGKAH_BAWAAN);
  if (l.galat) g.push(l.galat);
  return g;
}

export function jenisKeForm(j: JenisPekerjaan): FormJenis {
  return { kode: j.kode, nama: j.nama, satuan: j.satuan, poin: String(angka(j.poin_per_satuan)).replace(".", ","), uraian: j.uraian, perluHasil: j.perlu_hasil, perluTinjau: j.perlu_tinjau, langkah: (j.langkah_bawaan ?? []).join("\n"), urut: String(j.urut) };
}

export type FormRutin = {
  judul: string; kelompok: string; jenisId: string; jumlah: string; bobot: string; frekuensi: "mingguan" | "bulanan"; hari: string; durasi: string;
  hk: number[]; mulai: string; berakhir: string; jumlahPenerima: number;
};

export function periksaRutin(f: FormRutin): string[] {
  const g: string[] = [];
  if (f.judul.trim().length < 3 || f.judul.trim().length > 150) g.push("Judul 3 sampai 150 huruf.");
  if (!f.kelompok) g.push("Pilih Pekerjaan tim.");
  if (!f.jenisId) g.push("Pilih jenis pekerjaan.");
  const j = Number(f.jumlah.replace(",", "."));
  if (!(j > 0 && j <= 100000)) g.push("Jumlah per periode harus lebih dari 0.");
  const h = Number(f.hari);
  if (!Number.isInteger(h) || (f.frekuensi === "mingguan" ? h < 1 || h > 7 : h < 1 || h > 28)) g.push(f.frekuensi === "mingguan" ? "Pilih hari dalam seminggu." : "Tanggal 1 sampai 28.");
  const d = Number(f.durasi);
  if (!Number.isInteger(d) || d < 1 || d > 60) g.push("Durasi 1 sampai 60 hari.");
  if (f.hk.length === 0) g.push("Pilih sedikitnya satu hari kerja.");
  if (!f.mulai) g.push("Isi tanggal mulai berlaku.");
  if (f.berakhir && f.mulai && f.berakhir < f.mulai) g.push("Tanggal berakhir tidak boleh sebelum tanggal mulai berlaku.");
  if (f.jumlahPenerima < 1) g.push("Pilih sedikitnya satu penerima.");
  if (f.jumlahPenerima > 40) g.push("Paling banyak 40 penerima.");
  return g;
}
