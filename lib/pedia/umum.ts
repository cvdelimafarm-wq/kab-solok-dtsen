// lib/pedia/umum.ts
//
// (7 Okt 2026) SIGAP PEDIA -- konstanta & utilitas bersama (aman dipakai di server maupun browser).

export const BUCKET_PEDIA = "sigap-pedia";
export const MAKS_BYTE_FILE = 25 * 1024 * 1024; // 25 MB per file (permintaan user)

export const KANAL: Record<string, string> = {
  hai_djpb: "HAI-DJPb / Halo Kemenkeu",
  kppn: "KPPN",
  kanwil_djpb: "Kanwil DJPb",
  biro_keuangan_bps: "Biro Keuangan BPS",
  inspektorat_bps: "Inspektorat Utama BPS",
  lainnya: "Lainnya",
};

export const SIFAT: Record<string, string> = {
  referensi: "Referensi tidak mengikat",
  mengikat: "Surat resmi / mengikat",
};

export const STATUS: Record<string, { label: string; w: "ok" | "wait" | "bad" | "mut" | "navy" | "vio" }> = {
  diajukan: { label: "Diajukan", w: "wait" },
  dijawab: { label: "Dijawab", w: "navy" },
  ditindaklanjuti: { label: "Ditindaklanjuti", w: "vio" },
  final: { label: "Final", w: "ok" },
  dibatalkan: { label: "Dibatalkan", w: "bad" },
};

export const JENIS_FILE: Record<string, string> = {
  eml: "Email asli (.eml)",
  html: "Halaman portal (HTML/MHTML SingleFile)",
  pdf: "PDF export portal",
  dkim_screenshot: "Tangkapan \"Show original\" (DKIM PASS)",
  lampiran: "Lampiran lain",
};

export const JENIS_TAUTAN: Record<string, string> = {
  kegiatan: "Kegiatan SIGAP",
  penugasan: "SPJ transport lokal (petugas)",
  kontrak_paket: "Paket pengadaan / kontrak",
  perjadin: "Perjalanan dinas",
  akun_anggaran: "Akun / MAK anggaran",
  lainnya: "Lainnya",
};

export const JENIS_REGULASI = ["UU", "PP", "Perpres", "PMK", "KMK", "PER", "Perka BPS", "SE", "Lainnya"] as const;

/** Nama aman utk path storage (tanpa mengubah file aslinya). */
export function slug(s: string, maks = 80): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, maks) || "file"
  );
}

/** "SP/PD.04/0001/2026" -> "SP_PD.04_0001_2026" */
export const slugNomor = (nomor: string) => nomor.replace(/\//g, "_");

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Waktu ISO (UTC) -> "7 Oktober 2026 14.03.05 WIB" */
export function waktuWibPanjang(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}.${p(d.getUTCMinutes())}.${p(d.getUTCSeconds())} WIB`;
}

/** Tanggal ISO (yyyy-mm-dd) -> "2 Oktober 2026" */
export function tanggalIndo(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function ukuranRapi(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
