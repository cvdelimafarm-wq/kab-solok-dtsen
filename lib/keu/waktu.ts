// lib/keu/waktu.ts
//
// (28 Okt 2026) Jadwal sesi (briefing, pelatihan) dan rapat dengan penanda Perkiraan atau Fix.
//  - Perkiraan: cukup bulan + minggu ke-n (minggu = Senin sampai Jumat; minggu ke-n = minggu yang Senin-nya adalah Senin ke-n pada bulan itu).
//  - Fix: satu tanggal, rentang tanggal, atau minggu (tanggal Senin sampai Jumat dihitung otomatis).
// Bulan/minggu perkiraan SELALU dikonversi ke tanggal mulai dan selesai (disimpan pada rekaman yang sama), sehingga semua aturan lama yang
// membaca tanggal (pelatihan sebelum pendataan, geser periode turunan, agenda Delego) tetap berfungsi. Fungsi murni, aman di klien dan server.

export type ModeFix = "tgl" | "rentang" | "minggu";
export const MODE_FIX: readonly { id: ModeFix; nama: string }[] = [
  { id: "tgl", nama: "Satu tanggal" },
  { id: "rentang", nama: "Rentang tanggal" },
  { id: "minggu", nama: "Minggu" },
];

/** Satu rekaman jadwal. Rekaman lama hanya punya mulai dan selesai (dianggap Fix bila terisi). */
export type WaktuRec = { mulai: string; selesai: string; perk?: boolean; mode?: ModeFix; bulan?: number; minggu?: number };

const jepit = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hariDalamBulan = (tahun: number, bulan0: number) => new Date(Date.UTC(tahun, bulan0 + 1, 0)).getUTCDate();

/** Senin sampai Jumat minggu ke-n pada bulan ke-bulan0 (0 = Januari) tahun `tahun`. Bila Senin ke-n tidak ada, dipakai Senin terakhir bulan itu. */
export function mingguKe(tahun: number, bulan0: number, n: number): { mulai: string; selesai: string } {
  const b = jepit(Math.trunc(bulan0), 0, 11);
  const ke = jepit(Math.trunc(n), 1, 5);
  const dow = new Date(Date.UTC(tahun, b, 1)).getUTCDay(); // 0 = Minggu
  let hari = 1 + ((8 - dow) % 7) + 7 * (ke - 1); // Senin pertama + (n-1) minggu
  const dim = hariDalamBulan(tahun, b);
  while (hari > dim) hari -= 7;
  const senin = new Date(Date.UTC(tahun, b, hari));
  const jumat = new Date(Date.UTC(tahun, b, hari + 4));
  return { mulai: ymd(senin), selesai: ymd(jumat) };
}

/** Rekaman dianggap Perkiraan bila ditandai demikian; tanpa tanda: Perkiraan bila belum ada tanggal, Fix bila sudah (data lama). */
export function recPerk(r: WaktuRec | null | undefined): boolean {
  if (r && typeof r.perk === "boolean") return r.perk;
  return !(r && r.mulai);
}

/** Mode Fix efektif: yang tersimpan, atau (data lama tanpa mode) "rentang" bila mulai dan selesai berbeda, selain itu "tgl". */
export function modeRec(r: WaktuRec | null | undefined): ModeFix {
  if (r && (r.mode === "tgl" || r.mode === "rentang" || r.mode === "minggu")) return r.mode;
  return r && r.mulai && r.selesai && r.mulai !== r.selesai ? "rentang" : "tgl";
}

/** Melengkapi rekaman: bulan/minggu (perkiraan atau mode minggu) diubah menjadi tanggal; "satu tanggal" menyamakan selesai dengan mulai. */
export function isiRec(r: WaktuRec, tahun: number): WaktuRec {
  const perk = recPerk(r);
  const mode: ModeFix = modeRec(r);
  if (perk || mode === "minggu") {
    if (r.bulan === undefined || r.bulan === null) return { ...r, perk, mode };
    const bulan = jepit(Math.trunc(r.bulan), 0, 11);
    const minggu = jepit(Math.trunc(r.minggu ?? 1), 1, 5);
    return { ...r, perk, mode, bulan, minggu, ...mingguKe(tahun, bulan, minggu) };
  }
  if (mode === "tgl") return { ...r, perk, mode, selesai: r.mulai };
  return { ...r, perk, mode };
}

/** Mengubah sebagian isi rekaman lalu melengkapinya. */
export function ubahRec(r: WaktuRec | null | undefined, patch: Partial<WaktuRec>, tahun: number): WaktuRec {
  return isiRec({ mulai: "", selesai: "", ...(r ?? {}), ...patch }, tahun);
}

/** Memulihkan rekaman dari jsonb agar berbatas wajar (dipakai normalisasi). */
export function rapikanRec(x: unknown): WaktuRec {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const teks = (v: unknown) => (typeof v === "string" ? v : "");
  const out: WaktuRec = { mulai: teks(o.mulai), selesai: teks(o.selesai) };
  if (typeof o.perk === "boolean") out.perk = o.perk;
  if (o.mode === "tgl" || o.mode === "rentang" || o.mode === "minggu") out.mode = o.mode;
  if (typeof o.bulan === "number" && Number.isFinite(o.bulan)) out.bulan = jepit(Math.trunc(o.bulan), 0, 11);
  if (typeof o.minggu === "number" && Number.isFinite(o.minggu)) out.minggu = jepit(Math.trunc(o.minggu), 1, 5);
  return out;
}

const NAMA_BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const namaBulan = (b0: number): string => NAMA_BLN[jepit(Math.trunc(b0), 0, 11)];

/** Kalimat ringkas: "minggu ke-2 November" atau "12/11/2026" atau "12/11/2026 s.d. 14/11/2026". Kosong bila belum diisi. */
export function ringkasRec(r: WaktuRec | null | undefined): string {
  if (!r || !r.mulai) return "";
  const tgl = (d: string) => d.split("-").reverse().join("/");
  if (recPerk(r) && r.bulan !== undefined && r.minggu !== undefined) return `minggu ke-${r.minggu} ${namaBulan(r.bulan)} (${tgl(r.mulai)} s.d. ${tgl(r.selesai)})`;
  return !r.selesai || r.selesai === r.mulai ? tgl(r.mulai) : `${tgl(r.mulai)} s.d. ${tgl(r.selesai)}`;
}

