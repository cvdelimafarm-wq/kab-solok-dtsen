// lib/jarakJalan.ts
//
// Jarak JALAN (bukan garis lurus) dari lokasi rumah petugas ke titik
// tengah (centroid) tiap SLS -- dipakai app/api/penyisiran/alokasi/
// rekomendasi/route.ts, dikonfirmasi user ("apakah bisa jarak yang
// dipakai di sistem dihitung berdasarkan jarak jalan?" -> pilih "OSRM
// self-hosted"). Lihat osrm/README.md di root repo utk cara deploy
// server OSRM-nya sendiri (Railway) -- endpoint HTTP-nya ditunjuk lewat
// env var OSRM_BASE_URL.
//
// KENAPA dihitung di Next.js, bukan langsung di SQL (spt haversine yg
// lama): Postgres/Supabase tidak bisa memanggil HTTP eksternal secara
// sinkron per baris dgn wajar (tanpa extension khusus & tanpa membuat
// query super lambat), jadi RPC penyisiran_alokasi_dasar_sls() cuma
// menghitung bagian yg TIDAK bergantung jarak (Skor Dasar, Bonus Volume,
// centroid SLS) -- jaraknya baru dihitung di sini SESUDAH data itu
// didapat, lalu skor akhir digabung di Next.js jg (lihat route.ts).
//
// STRATEGI FALLBACK (supaya fitur TIDAK PERNAH error/blank walau OSRM
// belum di-deploy atau lg down):
//  - OSRM_BASE_URL belum diset -> langsung pakai haversine, TIDAK mencoba
//    panggil OSRM sama sekali.
//  - OSRM_BASE_URL diset tapi request timeout (>4 detik)/gagal/respons
//    tidak valid -> fallback DIAM-DIAM ke haversine utk SEMUA baris
//    (bukan campuran sebagian jalan sebagian garis lurus -- supaya
//    urutan rekomendasi tetap konsisten satu metode).
//  - Request OSRM Table API di-CHUNK per 100 tujuan sekaligus (paralel)
//    krn URL GET OSRM bisa terlalu panjang kalau tujuannya ratusan titik
//    dikirim dlm 1 request -- SATU chunk gagal saja, SEMUA hasil dianggap
//    gagal (fallback haversine total), bukan parsial.
//
// CATATAN LINGKUP: cuma dipakai utk rekomendasi SLS di tab "Perencanaan
// Lapangan" (dihitung SEKALI per buka halaman, jumlah tujuan terbatas
// ~ratusan SLS). Skor prioritas per-KELUARGA & jarak navigasi LIVE di tab
// "Penyisiran Usaha" (app/seruti/penyisiran-usaha.tsx, jarakKm()) SENGAJA
// TETAP pakai haversine -- itu dihitung ulang terus-menerus tiap update
// GPS x tiap kartu keluarga (bisa ratusan kali/menit), memanggil OSRM
// sebanyak itu tidak praktis & bisa membebani server OSRM-nya sendiri.

const OSRM_CHUNK_SIZE = 100;
const OSRM_TIMEOUT_MS = 4000;

export interface Titik {
  lat: number;
  lng: number;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function ambilChunkOsrm(base: string, asal: Titik, tujuan: Titik[]): Promise<number[] | null> {
  if (tujuan.length === 0) return [];
  const koordinat = [asal, ...tujuan].map((t) => `${t.lng},${t.lat}`).join(";");
  const destinasi = tujuan.map((_, i) => i + 1).join(";");
  const url = `${base.replace(/\/+$/, "")}/table/v1/driving/${koordinat}?sources=0&destinations=${destinasi}&annotations=distance`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.code !== "Ok" || !Array.isArray(data.distances) || !Array.isArray(data.distances[0])) {
      return null;
    }
    const baris: unknown[] = data.distances[0];
    if (baris.length !== tujuan.length || baris.some((d) => typeof d !== "number")) return null;
    return (baris as number[]).map((meter) => meter / 1000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Jarak jalan (km) dari 1 titik asal ke banyak titik tujuan lewat OSRM
 * Table API. Mengembalikan null (bukan array) kalau OSRM_BASE_URL belum
 * diset ATAU ada bagian yg gagal -- pemanggil WAJIB fallback ke
 * haversineKm() utk SEMUA baris kalau hasilnya null.
 */
export async function hitungJarakJalanMassal(asal: Titik, tujuan: Titik[]): Promise<number[] | null> {
  const base = process.env.OSRM_BASE_URL;
  if (!base || tujuan.length === 0) return null;

  const chunks: Titik[][] = [];
  for (let i = 0; i < tujuan.length; i += OSRM_CHUNK_SIZE) chunks.push(tujuan.slice(i, i + OSRM_CHUNK_SIZE));

  try {
    const hasil = await Promise.all(chunks.map((c) => ambilChunkOsrm(base, asal, c)));
    if (hasil.some((h) => h === null)) return null;
    return (hasil as number[][]).flat();
  } catch {
    return null;
  }
}
