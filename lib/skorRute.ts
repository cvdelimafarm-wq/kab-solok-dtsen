// lib/skorRute.ts  (murni: tanpa database, tanpa jaringan)
//
// (15 Okt 2026) Bahan jarak untuk skor kinerja harian (lihat lib/skorKinerja.ts). Keputusan user: jarak dihitung SATU KALI per hari
// per Sub SLS, rute rumah domisili petugas -> Sub SLS A -> Sub SLS B -> ... -> rumah, dijumlahkan (jarak jalan; garis lurus x 1,3 bila peta jalan belum tersedia).
// Titik Sub SLS = pusat (rata-rata) koordinat KK di Sub SLS itu. Urutan Sub SLS = menurut waktu penandaan KK pertama hari itu.

import { haversineKm } from "@/lib/jarakJalan";

export type Titik = { lat: number; lng: number };

/** Pengali garis lurus -> jarak jalan perkiraan (dipakai hanya bila OSRM tidak tersedia). */
export const FAKTOR_JALAN = 1.3;

/** Tanggal WIB (YYYY-MM-DD) dari waktu (ms epoch atau teks ISO). */
export function tanggalWibDari(t: number | string | Date): string {
  return new Date(new Date(t).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export type Penandaan = { tanggal: string; idsubsls: string; waktu: number };

/** Per tanggal: daftar idsubsls berbeda, terurut menurut waktu penandaan paling awal hari itu. */
export function urutanSubPerHari(baris: Penandaan[]): Map<string, string[]> {
  const awal = new Map<string, Map<string, number>>();
  for (const b of baris) {
    if (!b.idsubsls || !Number.isFinite(b.waktu)) continue;
    let m = awal.get(b.tanggal);
    if (!m) awal.set(b.tanggal, (m = new Map()));
    const lama = m.get(b.idsubsls);
    if (lama === undefined || b.waktu < lama) m.set(b.idsubsls, b.waktu);
  }
  const hasil = new Map<string, string[]>();
  for (const [tanggal, m] of awal) hasil.set(tanggal, [...m.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id));
  return hasil;
}

/** Titik pusat (rata-rata) dari beberapa koordinat; null bila kosong. Koordinat tidak sah dilewati. */
export function pusatTitik(titik: Titik[]): Titik | null {
  const sah = titik.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng));
  if (sah.length === 0) return null;
  return { lat: sah.reduce((a, t) => a + t.lat, 0) / sah.length, lng: sah.reduce((a, t) => a + t.lng, 0) / sah.length };
}

/** Rute harian rumah -> pusat tiap Sub SLS (berurutan) -> rumah. null bila rumah atau semua pusat tidak ada. */
export function ruteHari(rumah: Titik | null, pusat: (Titik | null)[]): Titik[] | null {
  if (!rumah || !Number.isFinite(rumah.lat) || !Number.isFinite(rumah.lng)) return null;
  const titik = pusat.filter((p): p is Titik => !!p);
  if (titik.length === 0) return null;
  return [rumah, ...titik, rumah];
}

/** Jarak perkiraan (km) sepanjang rute: jumlah garis lurus antar titik berurutan x faktor jalan. */
export function jarakPerkiraanKm(rute: Titik[], faktor: number = FAKTOR_JALAN): number {
  let km = 0;
  for (let i = 1; i < rute.length; i++) km += haversineKm(rute[i - 1].lat, rute[i - 1].lng, rute[i].lat, rute[i].lng);
  return Math.round(km * faktor * 100) / 100;
}

/** Kunci simpanan jarak: koordinat dibulatkan 5 desimal (±1 m) supaya rute yang sama tidak dihitung ulang. */
export const kunciRute = (rute: Titik[]): string => rute.map((t) => `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`).join(";");
