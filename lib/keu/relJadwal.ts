// lib/keu/relJadwal.ts
//
// (28 Okt 2026) Isian jadwal RELATIF tahap (Updating, Pengolahan, Pasca pengolahan, Diseminasi) dibuat berbentuk kalimat:
// "[10] hari [sesudah] [selesai] pendataan". Selisih hari tersimpan tetap satu angka bertanda (negatif = sebelum), jadi data lama tidak berubah.
// Fungsi murni, aman dipakai di klien dan server.

export type ArahSelisih = "sesudah" | "sebelum";

/** Selisih bertanda -> jumlah hari (mutlak) dan arah. 0 dihitung "sesudah" (tampilan memakai "tepat pada"). */
export function pecahSelisih(d: number): { n: number; arah: ArahSelisih } {
  const x = Number.isFinite(d) ? Math.trunc(d) : 0;
  return { n: Math.abs(x), arah: x < 0 ? "sebelum" : "sesudah" };
}

/** Jumlah hari + arah -> selisih bertanda. */
export function gabungSelisih(n: number, arah: ArahSelisih): number {
  const m = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  return arah === "sebelum" && m > 0 ? -m : m;
}

/** Kalimat ringkas satu sisi, mis. "10 hari sesudah selesai pendataan" atau "tepat pada mulai pendataan". */
export function kalimatSelisih(d: number, acuan: "mulai" | "selesai", namaAcuan: string): string {
  const { n, arah } = pecahSelisih(d);
  return n === 0 ? `tepat pada ${acuan} ${namaAcuan}` : `${n} hari ${arah} ${acuan} ${namaAcuan}`;
}

/** Peringatan bila tanggal selesai hasil hitung lebih awal dari tanggal mulai (format YYYY-MM-DD); null bila wajar atau belum lengkap. */
export function peringatanRentang(mulai: string | null | undefined, selesai: string | null | undefined): string | null {
  if (!mulai || !selesai) return null;
  return selesai < mulai ? "Tanggal selesai lebih awal dari tanggal mulai. Mohon periksa kembali selisih harinya." : null;
}
