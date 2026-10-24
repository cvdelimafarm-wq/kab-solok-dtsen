// lib/keu/glp039-xlsx.ts
//
// (24 Okt 2026) Pembungkus klien: berkas Excel GLP039 -> HasilGlp (lib/keu/glp039.ts) + hash SHA-256 isi berkas.
// SheetJS dimuat dinamis (hanya saat bendahara memilih berkas). Sel dibaca sebagai larik-of-larik mulai A1 supaya indeks kolom
// sama dengan posisi kolom di lembar (kolom angka mulai indeks 16) walaupun rujukan lembar (`!ref`) dimulai lebih bawah.

import { uraiGlp039, type HasilGlp } from "@/lib/keu/glp039";

export const MAKS_BYTE_BERKAS = 8 * 1024 * 1024; // 8 MB; laporan seluruh satker hanya beberapa ratus KB

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type HasilBerkas = { nama: string; ukuran: number; hash: string; hasil: HasilGlp };

/** Membaca lembar pertama. Melempar Error berpesan bahasa Indonesia bila berkas bukan Excel yang dapat dibaca. */
export async function bacaBerkasGlp(buf: ArrayBuffer, nama: string): Promise<HasilBerkas> {
  if (buf.byteLength === 0) throw new Error("Berkas kosong.");
  if (buf.byteLength > MAKS_BYTE_BERKAS) throw new Error("Berkas terlalu besar (maksimum 8 MB).");
  const XLSX = await import("xlsx");
  let rows: unknown[][];
  try {
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws["!ref"]) throw new Error("kosong");
    const r = XLSX.utils.decode_range(ws["!ref"]);
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true, defval: null, range: { s: { r: 0, c: 0 }, e: r.e } });
  } catch {
    throw new Error("Berkas tidak dapat dibaca sebagai Excel (.xlsx). Gunakan berkas asli dari laporan GLP039.");
  }
  const hash = await sha256Hex(buf);
  return { nama, ukuran: buf.byteLength, hash, hasil: uraiGlp039(rows) };
}

/** Argumen keu_realisasi_masuk (p_akun diisi server). */
export function argsRealisasiMasuk(tahun: number, sampai: string, nama: string, hash: string, hasil: HasilGlp): Record<string, unknown> {
  return { p_tahun: tahun, p_sampai: sampai, p_nama: nama.slice(0, 200), p_hash: hash, p_item: hasil.item };
}

/** Pemeriksaan sebelum kirim; null = boleh. */
export function periksaUnggahan(b: HasilBerkas | null, sampai: string): string | null {
  if (!b) return "Pilih berkas Excel terlebih dahulu.";
  if (!b.hasil.ok) return "Berkas belum lolos pemeriksaan; perbaiki berkas dan pilih ulang.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sampai) || Number.isNaN(Date.parse(sampai))) return "Isi tanggal data (s.d. tanggal) dengan benar.";
  return null;
}
