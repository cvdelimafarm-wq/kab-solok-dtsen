// lib/vanguardAnjuran.ts  (murni)
//
// (3 Nov 2026) Pop-up ANJURAN Vanguard di tab Hari ini untuk peserta yang Vanguard-nya TIDAK wajib (mode opsional / tanpa runtutan): permintaan Iqbal agar Vanguard
// disorot dan memunculkan pop-up. Sengaja ringan: paling banyak SEKALI sehari dan hanya selama peserta belum pernah menjawab satu kasus pun dengan benar.
// Mode "wajib" tetap memakai ModalVanguardWajib (urgent, lib/vanguardPengingat.ts) -- keduanya tidak pernah tampil bersamaan.

export type CatatanAnjuran = { hari: string };

const WIB_MS = 7 * 3600_000;
export const hariWib = (nowMs: number): string => new Date(nowMs + WIB_MS).toISOString().slice(0, 10);

/** Catatan dari penyimpanan HP -> bentuk sah (sembarang isi tidak dipercaya). */
export function bacaCatatanAnjuran(mentah: unknown): CatatanAnjuran | null {
  const h = (mentah as { hari?: unknown } | null)?.hari;
  return typeof h === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h) ? { hari: h } : null;
}

/** Tampilkan pop-up anjuran? wajib = mode wajib (dipegang modal urgent), benar = jumlah kasus benar, catatan = terakhir kali tampil. */
export function putuskanAnjuran(m: { wajib: boolean; benar: number }, catatan: CatatanAnjuran | null, nowMs: number): boolean {
  if (m.wajib || m.benar > 0) return false;
  return catatan?.hari !== hariWib(nowMs);
}
