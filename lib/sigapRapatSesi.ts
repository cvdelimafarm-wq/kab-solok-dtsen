// lib/sigapRapatSesi.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Rapat Zoom pada kegiatan PELATIHAN sekaligus menjadi presensi sesi: hadir lewat token pada rapat dicatat juga sebagai presensi sesi pelatihan yang
// jendelanya (buka-tutup) beririsan dengan jam rapat. Dipilih sesi dengan irisan terpanjang; sesi yang sudah tercatat tidak ditimpa.

export type SesiJadwal = { kunci: string; tanggal: string; no: number; nama: string; buka_at: string; tutup_at: string };

const ms = (iso: string) => new Date(iso).getTime();

/** Lama irisan dua rentang waktu (ms); 0 bila tidak beririsan atau ada yang tidak sah. */
export function irisanMs(a: { mulai: number; selesai: number }, b: { mulai: number; selesai: number }): number {
  if (![a.mulai, a.selesai, b.mulai, b.selesai].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(a.selesai, b.selesai) - Math.max(a.mulai, b.mulai));
}

/**
 * Sesi presensi yang cocok dengan rapat [mulai, selesai]: irisan terpanjang dengan jendela [buka_at, tutup_at]; seri -> yang lebih awal. Null bila tak ada irisan.
 * `sudahTercatat` (kunci sesi) dilewati supaya presensi yang sudah ada tidak ditimpa.
 */
export function pilihSesiRapat(jadwal: readonly SesiJadwal[], rapatMulai: string, rapatSelesai: string, sudahTercatat: ReadonlySet<string> = new Set()): SesiJadwal | null {
  const r = { mulai: ms(rapatMulai), selesai: ms(rapatSelesai) };
  let terbaik: { s: SesiJadwal; lama: number } | null = null;
  for (const s of jadwal) {
    if (sudahTercatat.has(s.kunci)) continue;
    const lama = irisanMs(r, { mulai: ms(s.buka_at), selesai: ms(s.tutup_at) });
    if (lama <= 0) continue;
    if (!terbaik || lama > terbaik.lama || (lama === terbaik.lama && ms(s.buka_at) < ms(terbaik.s.buka_at))) terbaik = { s, lama };
  }
  return terbaik ? terbaik.s : null;
}

/** Presensi dari rapat terlambat bila hadir sesudah sesi ditutup. */
export const terlambatPresensi = (hadirAtMs: number, sesi: Pick<SesiJadwal, "tutup_at">): boolean => hadirAtMs > ms(sesi.tutup_at);
