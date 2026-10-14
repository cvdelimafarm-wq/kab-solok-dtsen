// lib/sigapTautanKerja.ts
//
// (14 Okt 2026) Tautan dalam halaman kerja Transport Lokal (/sigap/translok/<token>?p=<id>&tab=&tgl=&fokus=): pengingat dan kartu Beranda membuka TEPAT
// tab, hari, dan bagian (laporan/foto) yang kurang. Murni (tanpa React/DOM) supaya mudah diuji. Semua nilai di-whitelist: nilai asing diabaikan
// (tidak pernah menjadi galat), tanggal hanya yang ada di daftar hari penugasan.

export type TabKerja = "hari_ini" | "hari_kerja" | "arsip";
export type BagianKerja = "laporan" | "foto";
export type TautanKerja = { tab: TabKerja; tgl: string | null; fokus: BagianKerja | null };

const TAB: TabKerja[] = ["hari_ini", "hari_kerja", "arsip"];
const BAGIAN: BagianKerja[] = ["laporan", "foto"];

/**
 * Baca ?tab=&tgl=&fokus= dari query string. `tanggalAda` = tanggal hari kerja penugasan yang sedang dibuka; `hariIni` = tanggal hari ini (WIB).
 * Mengembalikan null bila tidak ada satu pun parameter yang sah. Bila `tab` tidak diberikan: tanggal hari ini/ bagian tanpa tanggal -> "hari_ini",
 * tanggal lain -> "hari_kerja". Bila `fokus` diberikan tanpa `tgl`, tanggalnya hari ini.
 */
export function bacaTautanKerja(search: string, tanggalAda: string[], hariIni: string): TautanKerja | null {
  const q = new URLSearchParams(search);
  const tabMentah = q.get("tab");
  const tglMentah = q.get("tgl");
  const fokusMentah = q.get("fokus");
  const tab = TAB.find((t) => t === tabMentah) ?? null;
  const tglSah = tglMentah && /^\d{4}-\d{2}-\d{2}$/.test(tglMentah) && tanggalAda.includes(tglMentah) ? tglMentah : null;
  const fokus = BAGIAN.find((b) => b === fokusMentah) ?? null;
  if (!tab && !tglSah && !fokus) return null;
  const tgl = tglSah ?? (fokus ? hariIni : null);
  const tabAkhir: TabKerja = tab ?? (tgl && tgl !== hariIni ? "hari_kerja" : "hari_ini");
  // tanggal & bagian hanya bermakna di tab hari ini / hari kerja
  return { tab: tabAkhir, tgl: tabAkhir === "arsip" ? null : tgl, fokus: tabAkhir === "arsip" ? null : fokus };
}

/** Alamat saat ini tanpa tab/tgl/fokus (parameter lain, mis. ?p=, dipertahankan) supaya muat ulang halaman tidak membuka bagian itu lagi. */
export function tanpaTautanKerja(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  for (const k of ["tab", "tgl", "fokus"]) q.delete(k);
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}
