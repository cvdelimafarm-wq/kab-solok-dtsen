// lib/sigapPerbaikan.ts
//
// (15 Okt 2026) Aturan MURNI (tanpa DB/React) fitur "Perbaiki administrasi" Transport Lokal -- permintaan user (rancangan: claude/rancangan-pengawasan-pml-perbaikan-administrasi.md).
//
// ALUR
//  1. Hari kerja lampau yang belum lengkap (laporan/foto) diberi JENDELA PERBAIKAN 24 jam (tabel sigap_izin_susulan yang sudah ada).
//     Pemberi: siaran admin (pagi ini) dan nanti PML. SEKALI per tanggal: tanggal yang pernah diberi izin tidak diberi lagi.
//  2. Petugas membuka menu /sigap/perbaikan: foto = unggah ulang; laporan (kegiatan pendataan) = menandai status KK di Lembar Pendataan mode
//     perbaikan, lalu menekan "Kirim perbaikan laporan". Hasil dicatat dengan WAKTU KEJADIAN = tanggal hari kerja itu (siang 12.00 WIB), sehingga
//     laporan "dianggap" (diambil dari pendataan) otomatis terisi untuk tanggal itu. HANYA KK yang belum punya hasil yang boleh ditandai
//     (mencegah satu KK terhitung di dua tanggal).
//  3. "Tanggal ... saya tidak bekerja": hari itu ditandai bukan hari kerja (sigap_hari_kerja.uji_coba_sampai = sekarang) -- TIDAK ada data dihapus.
//  4. Selesai semua: ucapan terima kasih "seluruh administrasi translok Anda sudah lengkap sampai tgl <kemarin>".

import { hariLengkapDinilai, tglPendekKek, type IsianHari } from "@/lib/sigapKekurangan";
import type { AturanIsian } from "@/lib/sigap";

export const JENDELA_PERBAIKAN_JAM = 24;
export const MAKS_KK_PER_KIRIM = 300;
export const ALASAN_SIARAN = "Perbaikan administrasi (siaran admin)";
export const AUDIT_KIRIM_LAPORAN = "perbaikan_laporan";
export const AUDIT_TIDAK_BEKERJA = "perbaikan_tidak_bekerja";
export const AUDIT_SIARAN = "perbaikan_siaran";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TGL = /^\d{4}-\d{2}-\d{2}$/;
const HASIL = ["terdampak", "tidak_terdampak", "tidak_ditemukan"] as const;
export type HasilPerbaikan = (typeof HASIL)[number];

/** Waktu kejadian untuk hasil yang diperbaiki: siang 12.00 WIB pada tanggal hari kerja itu (ISO UTC). */
export const waktuPerbaikan = (tanggal: string): string => new Date(`${tanggal}T12:00:00+07:00`).toISOString();

/** Tanggal sebelum `hariIni` (YYYY-MM-DD). */
export function hariSebelum(hariIni: string): string {
  return new Date(Date.parse(`${hariIni}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export function tglPanjangPerbaikan(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** Ucapan bila semua hari sudah lengkap. Tanggal = hari terakhir yang dinilai (kemarin), bukan tanggal tetap. */
export const ucapanLengkap = (hariIni: string): string => `Terima kasih, seluruh administrasi translok Anda sudah lengkap sampai tanggal ${tglPanjangPerbaikan(hariSebelum(hariIni))}.`;

export const peringatanSekali = "Setelah ini kesempatan memperbaiki administrasi yang tertinggal tidak akan diberikan lagi.";

// ------------------------------------------------------------------ pemeriksaan isi permintaan
export type ItemKirim = { kk_id: number; hasil: HasilPerbaikan; alasan: string | null; kunci: string };
export type IsiKirim = { penugasan_id: number; tanggal: string; items: ItemKirim[] };

export function periksaKirim(b: unknown): { ok: true; isi: IsiKirim } | { ok: false; pesan: string } {
  if (!b || typeof b !== "object") return { ok: false, pesan: "Isian tidak terbaca." };
  const r = b as Record<string, unknown>;
  const pen = Number(r.penugasan_id);
  if (!Number.isInteger(pen) || pen <= 0) return { ok: false, pesan: "Penugasan tidak dikenal." };
  const tanggal = typeof r.tanggal === "string" && TGL.test(r.tanggal) ? r.tanggal : "";
  if (!tanggal) return { ok: false, pesan: "Tanggal tidak sah." };
  const mentah = Array.isArray(r.items) ? r.items : [];
  if (mentah.length === 0) return { ok: false, pesan: "Belum ada KK yang ditandai." };
  if (mentah.length > MAKS_KK_PER_KIRIM) return { ok: false, pesan: `Maksimal ${MAKS_KK_PER_KIRIM} KK sekali kirim.` };
  const items: ItemKirim[] = [];
  const lihat = new Set<number>();
  for (const x of mentah) {
    const o = (x ?? {}) as Record<string, unknown>;
    const kk = Number(o.kk_id);
    if (!Number.isInteger(kk) || kk <= 0) return { ok: false, pesan: "KK tidak dikenal." };
    if (lihat.has(kk)) continue;
    lihat.add(kk);
    const hasil = HASIL.find((h) => h === o.hasil);
    if (!hasil) return { ok: false, pesan: "Hasil pendataan tidak dikenal." };
    const kunci = typeof o.kunci === "string" ? o.kunci : "";
    if (!UUID.test(kunci)) return { ok: false, pesan: "Kunci catatan tidak sah." };
    const alasan = typeof o.alasan === "string" ? o.alasan.trim().replace(/\s+/g, " ").slice(0, 200) : "";
    items.push({ kk_id: kk, hasil, alasan: alasan || null, kunci });
  }
  return { ok: true, isi: { penugasan_id: pen, tanggal, items } };
}

export function periksaTidakBekerja(b: unknown): { ok: true; isi: { penugasan_id: number; tanggal: string } } | { ok: false; pesan: string } {
  const r = (b ?? {}) as Record<string, unknown>;
  const pen = Number(r.penugasan_id);
  const tanggal = typeof r.tanggal === "string" && TGL.test(r.tanggal) ? r.tanggal : "";
  if (!Number.isInteger(pen) || pen <= 0 || !tanggal) return { ok: false, pesan: "Isian tidak sah." };
  return { ok: true, isi: { penugasan_id: pen, tanggal } };
}

// ------------------------------------------------------------------ siaran admin
/**
 * Tanggal yang diberi jendela perbaikan: hari kerja lampau (sampai `batas`) yang belum lengkap dan BELUM PERNAH diberi izin (sekali per tanggal).
 * `pernahIzin` = semua tanggal yang pernah punya baris izin (aktif maupun habis).
 */
export function tanggalSiaran(m: { hariKerja: string[]; isian: Record<string, IsianHari>; aturan: AturanIsian; pernahIzin: Set<string>; hariIni: string; batas: string }): string[] {
  return m.hariKerja
    .filter((t) => t < m.hariIni && t <= m.batas && !m.pernahIzin.has(t) && !hariLengkapDinilai(m.isian[t], m.aturan))
    .sort();
}

/** Teks push siaran. */
export function pesanSiaran(tanggal: string[]): { judul: string; isi: string } {
  const n = tanggal.length;
  const tgl = tanggal.map((t) => tglPendekKek(t)).join(", ");
  return {
    judul: `Perbaiki administrasi translok (${n} hari)`,
    isi: `${tgl} belum lengkap. Anda diberi kesempatan memperbaiki sekali, berlaku 24 jam. Ketuk untuk melengkapi.`,
  };
}
