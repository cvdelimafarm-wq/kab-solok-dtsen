// lib/wilayahAlokasiPetugas.ts
//
// Helper BERSAMA utk membatasi tampilan tab "Penyisiran Usaha" (role token
// "penyisiran_petugas" SAJA -- role "penyisiran"/PIN admin & role
// identifikasi_* TIDAK disentuh, tetap bebas lihat semua data spt
// sebelumnya) supaya HANYA menampilkan keluarga/usaha yang SLS/Sub SLS-nya
// memang sudah dipilih petugas ybs sendiri lewat kartu "Identifikasi
// Wilayah Sampel SLS" (tab Perencanaan Lapangan, tabel
// penyisiran_alokasi_pilihan). Dipakai oleh 5 route:
//  - /api/penyisiran/summary, /nagari, /subsls -- lewat RPC "_wilayah"
//    (penyisiran_summary_wilayah dkk, lihat migrasi
//    alokasi_eksklusif_dan_wilayah_petugas) yg menerima wilayahKeJsonb().
//  - /api/penyisiran/list, /markers -- lewat filter PostgREST .or() dari
//    buildOrFilterWilayah() ditempel LANGSUNG di query supabase-js
//    (BUKAN RPC, krn kedua endpoint ini butuh paginasi/limit).
//
// Role PML (dikonfirmasi user): PML TIDAK memilih wilayah sendiri -- wilayah
// kerja PML adalah GABUNGAN (union) dari wilayah yang sudah dipilih SELURUH
// PPL yang diawasinya. Relasi PML->PPL memakai kolom pengawas_id yang SUDAH
// ADA di petugas_penyisiran_akun (dipakai jg oleh tab "Master Petugas",
// "satu pengawas boleh membawahi banyak PPL") -- TIDAK perlu tabel/kolom
// baru. daftarIdUntukSesi() di bawah menentukan set petugas_id yang harus
// digabung (diri sendiri + SELURUH PPL yg pengawas_id-nya = dirinya, kalau
// ADA -- itu artinya sesi ini PML; kalau tidak ada PPL yg diawasi, dianggap
// PPL biasa & hasilnya cuma [dirinya sendiri] spt sebelumnya).
//
// (28 Sep 2026, permintaan user -- import daftar usaha "DUTL & Konstruksi
// SE2026") Sebagian baris penyisiran_usaha yg ditambah manual dari daftar
// eksternal TIDAK punya kode SLS pasti (cuma sampai level kecamatan+nagari,
// mis. dari daftar UTL yg IDSBR-nya cuma 10 digit) -- `sls_kode` baris itu
// DIBIARKAN NULL, BUKAN dipaksa isi kode SLS yg belum pasti benar. Baris
// begini SENGAJA diperlakukan beda dari baris normal: bukan "tidak cocok
// SLS manapun = hilang" (spt sebelumnya, krn NULL = apapun selalu false di
// SQL), tapi "tampil ke SEMUA petugas yang punya alokasi APAPUN di
// kecamatan+nagari yg sama" (boleh dobel di banyak petugas sekaligus,
// petugas mana pun yg wilayah tugasnya ada di nagari itu bisa menemukan &
// menyisirnya, krn kita memang tidak tahu SLS pastinya). Diterapkan di 4
// tempat sekaligus, HARUS SELALU DIUBAH BARENGAN kalau logic ini diubah
// lagi ke depan: buildOrFilterWilayah() di bawah (endpoint /list &
// /markers, filter langsung PostgREST), + 3 fungsi RPC Postgres
// penyisiran_summary_wilayah/penyisiran_nagari_list_wilayah/
// penyisiran_subsls_list_wilayah (endpoint /summary, /nagari, /subsls --
// lihat query pg_get_functiondef kalau perlu baca definisi SQL persisnya,
// migrasi ini cuma catatan spt migrasi 20260919 sebelumnya).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AlokasiWilayahRow {
  kec_kode: string;
  nagari_kode: string;
  sls_kode: string;
  subsls_kode_list: string[] | null;
}

/**
 * Tentukan set petugas_id yang wilayahnya harus DIGABUNG utk sesi
 * "penyisiran_petugas" yang login (dipakai sbg pengganti [petugasId]
 * tunggal di ambilWilayahAlokasi() di bawah). Kalau petugas ini adalah PML
 * (py >=1 PPL dgn pengawas_id = dirinya), hasilnya [dirinya, ...seluruh
 * PPL yg diawasi] & isPml true -- kalau tidak, hasilnya [dirinya] saja &
 * isPml false (PPL biasa, perilaku SAMA spt sebelum fitur PML ada).
 */
export async function daftarIdUntukSesi(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  petugasId: number
): Promise<{ ids: number[]; isPml: boolean }> {
  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id")
    .eq("pengawas_id", petugasId);
  if (error) throw new Error(error.message);
  const diawasi = (data ?? []).map((r) => r.id as number);
  if (diawasi.length === 0) return { ids: [petugasId], isPml: false };
  return { ids: [petugasId, ...diawasi], isPml: true };
}

/** Ambil SEMUA baris alokasi milik satu petugas ATAU gabungan beberapa
 * petugas sekaligus (tabel penyisiran_alokasi_pilihan) -- terima array
 * utk kasus PML (lihat daftarIdUntukSesi di atas), tetap terima number
 * tunggal utk kompatibilitas pemanggil lama/PPL biasa. */
export async function ambilWilayahAlokasi(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  petugasId: number | number[]
): Promise<AlokasiWilayahRow[]> {
  const ids = Array.isArray(petugasId) ? petugasId : [petugasId];
  const { data, error } = await supabase
    .from("penyisiran_alokasi_pilihan")
    .select("kec_kode, nagari_kode, sls_kode, subsls_kode_list")
    .in("petugas_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as AlokasiWilayahRow[];
}

/** Bentuk yang diharapkan param jsonb p_wilayah di RPC "_wilayah". */
export function wilayahKeJsonb(pilihan: AlokasiWilayahRow[]) {
  return pilihan.map((p) => ({
    kec_kode: p.kec_kode,
    nagari_kode: p.nagari_kode,
    sls_kode: p.sls_kode,
    subsls_kode: p.subsls_kode_list, // null = seluruh SLS
  }));
}

/**
 * Bangun klausa PostgREST .or() utk membatasi query LANGSUNG ke tabel
 * penyisiran_usaha (dipakai /api/penyisiran/list & /markers, yg butuh
 * paginasi/limit shg tidak lewat RPC jsonb spt 3 endpoint dropdown).
 * Return null kalau petugas belum py alokasi SAMA SEKALI -- pemanggil
 * WAJIB memperlakukan ini sbg "jangan tampilkan apa pun" (bukan "berarti
 * tampilkan semua", krn justru sebaliknya: belum ada alokasi = belum ada
 * yg BOLEH ditampilkan sama sekali).
 *
 * (28 Sep 2026) SELAIN klausa exact-match SLS spt sebelumnya, ditambahkan
 * klausa KEDUA per kecamatan+nagari UNIK yg petugas ini py alokasi apapun
 * di dalamnya -- match baris `sls_kode IS NULL` (baris "nagari-only", lihat
 * komentar besar di atas file ini). SATU petugas cuma py alokasi di 1-2
 * nagari biasanya, jd `Set` di sini kecil, aman dipanggil per-request.
 */
export function buildOrFilterWilayah(pilihan: AlokasiWilayahRow[]): string | null {
  if (pilihan.length === 0) return null;
  const klausaSlsPersis = pilihan.map((p) => {
    const dasar = `kec_kode.eq.${p.kec_kode},nagari_kode.eq.${p.nagari_kode},sls_kode.eq.${p.sls_kode}`;
    if (p.subsls_kode_list && p.subsls_kode_list.length > 0) {
      const daftar = p.subsls_kode_list.map((k) => `"${k}"`).join(",");
      return `and(${dasar},subsls_kode.in.(${daftar}))`;
    }
    return `and(${dasar})`;
  });
  const kecNagariUnik = new Set(pilihan.map((p) => `${p.kec_kode}|${p.nagari_kode}`));
  const klausaNagariSaja = Array.from(kecNagariUnik).map((key) => {
    const [kec, nagari] = key.split("|");
    return `and(kec_kode.eq.${kec},nagari_kode.eq.${nagari},sls_kode.is.null)`;
  });
  return [...klausaSlsPersis, ...klausaNagariSaja].join(",");
}
