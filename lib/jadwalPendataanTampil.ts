// lib/jadwalPendataanTampil.ts  (murni; dipakai klien dan server)
//
// (3 Nov 2026) Teks kartu "Jadwal pendataan" (tab Hari ini): rentang tanggal LENGKAP dengan nama hari, lama (hari), status terhadap hari ini, dan penanda Fix / Perkiraan.
// Tanggal berformat YYYY-MM-DD (WIB); `hariIni` diberikan pemanggil supaya fungsi ini tetap murni dan mudah diuji.

export type PeriodeJadwalKartu = { periode: string; mulai: string; selesai: string; perkiraan: boolean };
export type JadwalPendataanKartu = { sumber: string; periode: PeriodeJadwalKartu[] };

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const utc = (t: string): number | null => {
  if (!TGL.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const c = new Date(ms);
  return c.getUTCFullYear() === y && c.getUTCMonth() === m - 1 && c.getUTCDate() === d ? ms : null;
};
const selisih = (a: string, b: string): number => Math.round(((utc(a) ?? 0) - (utc(b) ?? 0)) / 86_400_000);

/** "2026-11-10" -> "Senin, 10 November 2026" (selain tanggal sah dikembalikan apa adanya). */
export function tanggalLengkap(t: string): string {
  const ms = utc(t);
  if (ms === null) return t;
  const d = new Date(ms);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type RingkasPeriode = {
  mulaiTeks: string;
  selesaiTeks: string;
  /** Jumlah hari kalender inklusif. */
  hari: number;
  status: "belum" | "berjalan" | "selesai";
  /** Kalimat status: "Dimulai 7 hari lagi", "Berjalan: hari ke-3 dari 21", "Selesai". */
  ket: string;
  /** 0..100, hanya bermakna saat berjalan / selesai. */
  persen: number;
};

export function ringkasPeriode(p: Pick<PeriodeJadwalKartu, "mulai" | "selesai">, hariIni: string): RingkasPeriode | null {
  if (utc(p.mulai) === null || utc(p.selesai) === null || p.selesai < p.mulai) return null;
  const hari = selisih(p.selesai, p.mulai) + 1;
  const base = { mulaiTeks: tanggalLengkap(p.mulai), selesaiTeks: tanggalLengkap(p.selesai), hari };
  if (hariIni < p.mulai) {
    const n = selisih(p.mulai, hariIni);
    return { ...base, status: "belum", ket: n === 1 ? "Dimulai besok" : `Dimulai ${n} hari lagi`, persen: 0 };
  }
  if (hariIni > p.selesai) return { ...base, status: "selesai", ket: "Selesai", persen: 100 };
  const ke = selisih(hariIni, p.mulai) + 1;
  const sisa = hari - ke;
  return { ...base, status: "berjalan", ket: `Berjalan: hari ke-${ke} dari ${hari}${sisa === 0 ? " (hari terakhir)" : ""}`, persen: Math.round((ke / hari) * 100) };
}
