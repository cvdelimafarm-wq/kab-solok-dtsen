// lib/tampilanBeranda.ts
//
// (3 Nov 2026) Pilihan tampilan "Kegiatan saya" di Beranda SIGAP: KARTU (bawaan; satu kartu per kegiatan dengan poin mendesak) atau IKON (ikon bulat
// bercincin progres, banyak kegiatan terlihat sekaligus). Pilihan disimpan di perangkat per akun. Murni (tanpa React).

export type TampilanBeranda = "kartu" | "ikon";

export const DAFTAR_TAMPILAN: readonly TampilanBeranda[] = ["kartu", "ikon"];
export const LABEL_TAMPILAN: Record<TampilanBeranda, string> = { kartu: "Kartu", ikon: "Ikon" };
export const KUNCI_TAMPILAN_BERANDA = "sigap_beranda_tampilan";

/** Nilai tersimpan -> tampilan; selain "ikon" (kosong, rusak, nilai lama) = kartu. */
export function bacaTampilanBeranda(mentah: string | null | undefined): TampilanBeranda {
  return mentah === "ikon" ? "ikon" : "kartu";
}

/** Kunci penyimpanan per akun (akun tidak dikenal = 0). */
export const kunciTampilanBeranda = (akunId: number | null | undefined): string => `${KUNCI_TAMPILAN_BERANDA}_${akunId ?? 0}`;
