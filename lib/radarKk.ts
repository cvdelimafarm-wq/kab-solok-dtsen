// lib/radarKk.ts  (murni, tanpa database, tanpa GPS)
//
// (27 Okt 2026) "Radar sekitar" di Lembar Pendataan: selagi PPL bergerak di lapangan, hitung KK di Sub SLS yang sedang dibuka yang berada dalam radius tertentu
// dari posisinya -- berapa KK ada, berapa sudah punya hasil (terdampak / tidak terdampak / tidak ditemukan) dan berapa belum -- beserta KK yang BELUM didata
// terdekat (jarak dan arah mata angin). Pembacaan GPS dan tampilan ada di app/sigap/pendataan/RadarSekitar.tsx.
// Catatan: KK tanpa koordinat tidak bisa dihitung; hanya KK Sub SLS yang sedang dibuka (daftar yang dimuat layar).

export type TitikRadar = { lat: number; lng: number };
export type KkRadar = { id: number; nama_kk: string; no_urut?: number | null; lat: number | null; lng: number | null; hasil: string | null; ppl_akun_id: number | null };

export const RADIUS_PILIHAN = [50, 100, 200, 500] as const; // pintasan; radius bebas diatur 10 sampai 1000 m
export const RADIUS_AWAL = 100;
export const RADIUS_MIN = 10;
export const RADIUS_MAKS = 1000;

/** Radius (meter) yang diketik pengguna -> bilangan bulat dalam batas; tidak valid -> `cadangan`. */
export function normalisasiRadius(nilai: unknown, cadangan: number = RADIUS_AWAL, min: number = RADIUS_MIN, maks: number = RADIUS_MAKS): number {
  const n = typeof nilai === "number" ? nilai : typeof nilai === "string" && nilai.trim() !== "" ? Number(nilai.trim().replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return cadangan;
  return Math.min(maks, Math.max(min, Math.round(n)));
}
/** Posisi dianggap bergerak bila bergeser sekurang-kurangnya sekian meter, atau sudah sekian detik sejak pembaruan terakhir. */
export const GERAK_MINIMAL_M = 8;
export const JEDA_PEMBARUAN_DETIK = 10;
const BATAS_AKURASI_BAIK_M = 20;
const BATAS_AKURASI_CUKUP_M = 50;
const MAKS_TERDEKAT = 5;

/** Jarak garis lurus (meter), rumus haversine. */
export function jarakM(a: TitikRadar, b: TitikRadar): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ARAH = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"] as const;
/** Arah mata angin dari titik `dari` menuju titik `ke` (8 arah). */
export function arahMataAngin(dari: TitikRadar, ke: TitikRadar): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLng = rad(ke.lng - dari.lng);
  const y = Math.sin(dLng) * Math.cos(rad(ke.lat));
  const x = Math.cos(rad(dari.lat)) * Math.sin(rad(ke.lat)) - Math.sin(rad(dari.lat)) * Math.cos(rad(ke.lat)) * Math.cos(dLng);
  const derajat = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return ARAH[Math.round(derajat / 45) % 8];
}

export type KkTerdekat = { id: number; nama: string; no: number | null; jarak: number; arah: string };
export type HasilRadar = {
  radius: number;
  total: number; // KK berkoordinat dalam radius
  sudah: number; // punya hasil (terdampak / tidak terdampak / tidak ditemukan)
  belum: number;
  oleh_saya: number; // dari "sudah": ditandai akun sendiri
  terdampak: number;
  tidak_terdampak: number;
  tidak_ditemukan: number;
  persen: number; // % sudah dari total (0 bila total 0)
  tanpa_koordinat: number; // KK Sub SLS ini yang tidak bisa dihitung
  terdekat_belum: KkTerdekat[]; // paling dekat lebih dulu, paling banyak 5
  terdekat_belum_jauh: KkTerdekat | null; // KK belum didata terdekat DI LUAR radius (bila di dalam radius tidak ada)
};

export function hitungRadar(kk: readonly KkRadar[], posisi: TitikRadar, radius: number, sayaAkun: number | null): HasilRadar {
  const r: HasilRadar = { radius, total: 0, sudah: 0, belum: 0, oleh_saya: 0, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0, persen: 0, tanpa_koordinat: 0, terdekat_belum: [], terdekat_belum_jauh: null };
  const belumDalam: KkTerdekat[] = [];
  let belumLuar: KkTerdekat | null = null;
  for (const k of kk) {
    if (k.lat === null || k.lng === null || !Number.isFinite(k.lat) || !Number.isFinite(k.lng)) {
      r.tanpa_koordinat++;
      continue;
    }
    const titik = { lat: k.lat, lng: k.lng };
    const jarak = jarakM(posisi, titik);
    const dalam = jarak <= radius;
    if (dalam) {
      r.total++;
      if (k.hasil) {
        r.sudah++;
        if (sayaAkun !== null && k.ppl_akun_id === sayaAkun) r.oleh_saya++;
        if (k.hasil === "terdampak") r.terdampak++;
        else if (k.hasil === "tidak_terdampak") r.tidak_terdampak++;
        else if (k.hasil === "tidak_ditemukan") r.tidak_ditemukan++;
      } else r.belum++;
    }
    if (!k.hasil) {
      const item: KkTerdekat = { id: k.id, nama: k.nama_kk, no: k.no_urut ?? null, jarak, arah: arahMataAngin(posisi, titik) };
      if (dalam) belumDalam.push(item);
      else if (!belumLuar || jarak < belumLuar.jarak) belumLuar = item;
    }
  }
  belumDalam.sort((a, b) => a.jarak - b.jarak);
  r.terdekat_belum = belumDalam.slice(0, MAKS_TERDEKAT);
  r.terdekat_belum_jauh = r.terdekat_belum.length === 0 ? belumLuar : null;
  r.persen = r.total > 0 ? Math.round((r.sudah / r.total) * 100) : 0;
  return r;
}

/** Perlu memperbarui hitungan? (hindari menghitung ulang tiap kedipan GPS) */
export function perluPerbarui(
  lama: { posisi: TitikRadar; waktu: number } | null,
  baru: { posisi: TitikRadar; waktu: number },
  aturan: { gerak_m: number; jeda_detik: number } = { gerak_m: GERAK_MINIMAL_M, jeda_detik: JEDA_PEMBARUAN_DETIK }
): boolean {
  if (!lama) return true;
  if (jarakM(lama.posisi, baru.posisi) >= aturan.gerak_m) return true;
  return baru.waktu - lama.waktu >= aturan.jeda_detik * 1000;
}

export type MutuGps = "baik" | "cukup" | "lemah";
export function mutuGps(akurasiM: number | null | undefined): MutuGps {
  if (akurasiM === null || akurasiM === undefined || !Number.isFinite(akurasiM)) return "lemah";
  return akurasiM <= BATAS_AKURASI_BAIK_M ? "baik" : akurasiM <= BATAS_AKURASI_CUKUP_M ? "cukup" : "lemah";
}

/** Pembulatan jarak untuk tampilan: <100 m kelipatan 5, selebihnya kelipatan 10; >= 1 km dalam km. */
export function teksJarak(m: number): string {
  if (!Number.isFinite(m)) return "";
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
  const k = m < 100 ? 5 : 10;
  return `${Math.max(k, Math.round(m / k) * k)} m`;
}

/** Kalimat ringkas satu baris. */
export function teksRingkasRadar(r: HasilRadar): string {
  if (r.total === 0) return `Tidak ada KK dalam ${r.radius} m`;
  return `${r.total} KK dalam ${r.radius} m · ${r.sudah} sudah · ${r.belum} belum`;
}

/** Pesan galat GPS dari kode GeolocationPositionError (1 izin, 2 tidak tersedia, 3 waktu habis). */
export function pesanGalatRadar(kode: number | undefined): string {
  if (kode === 1) return "Izin lokasi ditolak. Aktifkan izin lokasi untuk peramban/aplikasi ini di pengaturan HP.";
  if (kode === 2) return "Posisi belum bisa dibaca. Pindah ke tempat terbuka dan pastikan GPS HP menyala.";
  if (kode === 3) return "GPS lambat menjawab. Radar tetap mencoba; pastikan GPS HP menyala.";
  return "Lokasi tidak bisa dibaca.";
}

// ---------------------------------------------------------------------------------------------------------------------
// Tampilan RADAR (seperti radar pesawat/kapal): pusat = posisi PPL, utara di atas, tiap KK dalam radius menjadi satu titik (blip).

export type Blip = {
  id: number;
  x: number; // -1 .. 1, timur positif
  y: number; // -1 .. 1, utara positif
  jarak: number; // meter
  sudut: number; // derajat dari utara searah jarum jam, 0 .. 360 (menentukan kapan titik "menyala" saat sapuan lewat)
  sudah: boolean;
  nama: string;
};
export const MAKS_BLIP = 300;

/** KK berkoordinat dalam radius sebagai titik radar; paling banyak MAKS_BLIP yang terdekat. */
export function susunBlip(kk: readonly KkRadar[], posisi: TitikRadar, radius: number): Blip[] {
  const mPerDerajat = 111195;
  const kosinus = Math.cos((posisi.lat * Math.PI) / 180);
  const hasil: Blip[] = [];
  for (const k of kk) {
    if (k.lat === null || k.lng === null || !Number.isFinite(k.lat) || !Number.isFinite(k.lng)) continue;
    const utaraM = (k.lat - posisi.lat) * mPerDerajat;
    const timurM = (k.lng - posisi.lng) * mPerDerajat * kosinus;
    const jarak = Math.hypot(utaraM, timurM);
    if (jarak > radius) continue;
    const sudut = ((Math.atan2(timurM, utaraM) * 180) / Math.PI + 360) % 360;
    hasil.push({ id: k.id, x: timurM / radius, y: utaraM / radius, jarak, sudut, sudah: !!k.hasil, nama: k.nama_kk });
  }
  hasil.sort((a, b) => a.jarak - b.jarak);
  return hasil.slice(0, MAKS_BLIP);
}
