// lib/vanguard/navigasi.ts  (murni)
//
// (1 Nov 2026) VANGUARD V2b: jalan pulang "Kembali ke SIGAP". Tujuan datang dari ?dari= (kartu di tab Hari Ini membawa alamat tab itu, kartu promosi di Beranda
// membawa "/"). Hanya jalur internal SIGAP yang diterima; selain itu kembali ke Beranda. Berbeda dengan tujuanKembali di lib/lokasiMitra.ts, query (? dan &) BOLEH,
// karena alamat tab Hari Ini berbentuk /sigap/translok/<token>?k=<id>.

export const TUJUAN_BAWAAN = "/";
export const MAKS_PANJANG_TUJUAN = 300;

export function tujuanAman(mentah: string | null | undefined): string {
  if (typeof mentah !== "string") return TUJUAN_BAWAAN;
  let t = mentah.trim();
  try { t = decodeURIComponent(t); } catch { return TUJUAN_BAWAAN; }
  if (t.length === 0 || t.length > MAKS_PANJANG_TUJUAN) return TUJUAN_BAWAAN;
  if (!t.startsWith("/") || t.startsWith("//")) return TUJUAN_BAWAAN;
  if (t.includes("\\") || /[\u0000-\u001f\u007f]/.test(t)) return TUJUAN_BAWAAN;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(t)) return TUJUAN_BAWAAN; // "/javascript:..." dan sejenisnya
  const jalur = t.split(/[?#]/)[0];
  if (jalur.split("/").some((s) => s === ".." || s === ".")) return TUJUAN_BAWAAN;
  return t;
}

/** Alamat masuk Vanguard dari sebuah halaman. `kegiatan` null = simulasi bebas (tidak dicatat). */
export function alamatVanguard(o: { kegiatan: number | null; dari: string }): string {
  const q = new URLSearchParams();
  if (o.kegiatan && Number.isInteger(o.kegiatan) && o.kegiatan > 0) q.set("k", String(o.kegiatan));
  const dari = tujuanAman(o.dari);
  if (dari !== TUJUAN_BAWAAN) q.set("dari", dari);
  const s = q.toString();
  return s ? `/sigap/vanguard?${s}` : "/sigap/vanguard";
}

/** Alamat dasbor Vanguard satu kegiatan; `dari` = halaman asal untuk tombol kembali. */
export function alamatDasbor(o: { kegiatan: number; dari: string }): string {
  const q = new URLSearchParams();
  if (Number.isInteger(o.kegiatan) && o.kegiatan > 0) q.set("kegiatan", String(o.kegiatan));
  const dari = tujuanAman(o.dari);
  if (dari !== TUJUAN_BAWAAN) q.set("dari", dari);
  const t = q.toString();
  return t ? `/sigap/vanguard/dasbor?${t}` : "/sigap/vanguard/dasbor";
}
