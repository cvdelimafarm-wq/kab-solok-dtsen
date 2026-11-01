// lib/kunciPenandaan.ts  (murni; dipakai klien. Server/database tetap yang memutuskan -- SQL 20261101za)
//
// (1 Nov 2026) KUNCI PENANDAAN PER HARI -- permintaan user: hasil KK yang ditandai pada suatu hari tidak bisa diganti setelah harinya (WIB)
// lewat, kecuali lewat revisit. File ini hanya mencerminkan aturan database supaya tombol tidak menjanjikan hal yang pasti ditolak.

export const PESAN_HARI_TERKUNCI = "Penandaan hari sebelumnya sudah dikunci. Hasil ini hanya bisa diubah lewat revisit.";
export const KETERANGAN_TERKUNCI = "Dikunci: penandaan hari lalu tidak bisa diubah, kecuali lewat revisit.";

const WIB_MS = 7 * 3_600_000;

/** Tanggal kalender WIB (YYYY-MM-DD) dari sebuah waktu; null bila waktu tidak sah. */
export function hariWib(waktu: string | number | Date | null | undefined): string | null {
  if (waktu === null || waktu === undefined || waktu === "") return null;
  const t = new Date(waktu).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + WIB_MS).toISOString().slice(0, 10);
}

type KkKunci = { hasil: string | null; status_at: string | null };

/** KK terkunci bila sudah punya hasil dan tanggal WIB penandaannya lebih awal dari hari ini. */
export function penandaanTerkunci(k: KkKunci, sekarang: number | Date = Date.now()): boolean {
  if (!k.hasil) return false;
  const hariKk = hariWib(k.status_at);
  const hariIni = hariWib(sekarang);
  if (!hariKk || !hariIni) return false;
  return hariKk < hariIni;
}

/**
 * Pilihan yang masih boleh pada KK terkunci: hanya revisit (Sub SLS ditandai revisit, hasil sekarang bukan 'terdampak').
 * Cermin cabang revisit di fungsi database.
 */
export function bolehRevisitTerkunci(k: KkKunci, subDitandaiRevisit: boolean | undefined): boolean {
  return subDitandaiRevisit === true && !!k.hasil && k.hasil !== "terdampak";
}

/**
 * Apakah tindakan ini boleh dicoba? `revisit` = pilihan "Tidak terdampak, revisit menjadi terdampak".
 * Kiriman identik (hasil sama oleh petugas yang sama) dianggap bukan perubahan oleh database, jadi tetap diizinkan.
 */
export function tindakanDiizinkan(
  k: KkKunci & { ppl_akun_id: number | null; revisit?: boolean },
  tindakan: { hasil: string; revisit: boolean },
  sayaAkun: number | null,
  subDitandaiRevisit: boolean | undefined,
  sekarang: number | Date = Date.now(),
): boolean {
  if (!penandaanTerkunci(k, sekarang)) return true;
  if (tindakan.hasil === k.hasil && k.ppl_akun_id === sayaAkun && tindakan.revisit === (k.revisit === true)) return true;
  return tindakan.revisit && tindakan.hasil === "terdampak" && bolehRevisitTerkunci(k, subDitandaiRevisit);
}
