// lib/sigapPresensi.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- presensi di lokasi pelatihan (radius dari Mami Hotel Solok) & label foto Transport Lokal.
// Logika murni (tanpa akses database) -- dipakai server (penilaian akhir) dan klien (tampilan jarak sebelum menekan tombol).
// Keputusan user: radius 300 m, presensi dibuka 06.00 s.d. 18.00 WIB di hari kegiatan, presensi sekali saja,
// bila lokasi gagal terbaca panitia dapat mencatat presensi manual (dengan alasan).

export type PengaturanPresensi = {
  lat: number;
  lng: number;
  radius_m: number;
  buka_at: string; // ISO
  tutup_at: string; // ISO
  akurasi_maks_m: number;
  tempat: string | null;
};

export type PosisiPeserta = { lat: number; lng: number; akurasi: number };

/** Label 5 foto Transport Lokal (urut slot 1..5) utk tampilan ringkas. */
export const LABEL_SLOT_FOTO = ["Berangkat", "Tiba di lokasi", "Kegiatan", "Pulang", "Tiba di rumah"] as const;

/** Jarak dua titik (meter), rumus haversine. */
export function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type KodeNilaiPresensi = "ok" | "belum_buka" | "sudah_tutup" | "akurasi" | "luar";
export type HasilNilaiPresensi = { kode: KodeNilaiPresensi; jarak_m: number; pesan: string };

export function posisiValid(p: unknown): p is PosisiPeserta {
  if (!p || typeof p !== "object") return false;
  const { lat, lng, akurasi } = p as Record<string, unknown>;
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    typeof akurasi === "number" && Number.isFinite(akurasi) && akurasi >= 0
  );
}

const bulatkan = (n: number) => Math.round(n);
const teksJarak = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${bulatkan(m)} m`);
export { teksJarak };

/** Nilai satu percobaan presensi. Urutan cek: jam -> akurasi GPS -> jarak. */
export function nilaiPresensi(pos: PosisiPeserta, p: PengaturanPresensi, sekarang: Date): HasilNilaiPresensi {
  const jarak = jarakMeter(pos.lat, pos.lng, p.lat, p.lng);
  const t = sekarang.getTime();
  if (t < new Date(p.buka_at).getTime()) return { kode: "belum_buka", jarak_m: jarak, pesan: "Presensi belum dibuka." };
  if (t >= new Date(p.tutup_at).getTime()) return { kode: "sudah_tutup", jarak_m: jarak, pesan: "Presensi sudah ditutup. Hubungi panitia." };
  if (pos.akurasi > p.akurasi_maks_m)
    return { kode: "akurasi", jarak_m: jarak, pesan: `Sinyal lokasi (GPS) lemah: akurasi ±${bulatkan(pos.akurasi)} m, maksimal ±${p.akurasi_maks_m} m. Pindah ke area terbuka lalu segarkan lokasi.` };
  if (jarak > p.radius_m) return { kode: "luar", jarak_m: jarak, pesan: `Anda berada ${teksJarak(jarak)} dari lokasi, di luar radius ${p.radius_m} m.` };
  return { kode: "ok", jarak_m: jarak, pesan: `Anda berada ${teksJarak(jarak)} dari lokasi (dalam radius ${p.radius_m} m).` };
}
