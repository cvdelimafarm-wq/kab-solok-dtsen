// lib/vanguard/pembinaan/segar.ts  (murni)
//
// (1 Nov 2026) VANGUARD V8a: kesegaran sertifikat (re-sertifikasi berkala). Sertifikat TETAP dimiliki; yang berubah hanya statusnya:
//   segar   : umur <= 75 hari
//   segera  : 76–90 hari (sisa <= 14 hari menjelang jatuh tempo: ajakan menyegarkan)
//   perlu   : lewat 90 hari (sertifikat "perlu disegarkan" lewat sertifikasi ulang)
// Tidak berdampak ke penilaian atau penugasan mana pun.

export const MASA_SEGAR_HARI = 90;
export const PERINGATAN_HARI = 14;
export type Kesegaran = { status: "segar" | "segera" | "perlu"; umurHari: number; sisaHari: number; jatuhTempo: string };

export function statusKesegaran(selesaiIso: string, sekarang: Date): Kesegaran {
  const t = new Date(selesaiIso).getTime();
  const umurHari = Math.max(0, Math.floor((sekarang.getTime() - t) / 86_400_000));
  const sisaHari = MASA_SEGAR_HARI - umurHari;
  const status = sisaHari < 0 ? "perlu" : sisaHari <= PERINGATAN_HARI ? "segera" : "segar";
  return { status, umurHari, sisaHari, jatuhTempo: new Date(t + MASA_SEGAR_HARI * 86_400_000).toISOString() };
}

export const LABEL_KESEGARAN: Record<Kesegaran["status"], string> = { segar: "Segar", segera: "Segera disegarkan", perlu: "Perlu disegarkan" };
