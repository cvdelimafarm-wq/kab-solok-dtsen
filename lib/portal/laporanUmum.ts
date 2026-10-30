// lib/portal/laporanUmum.ts  (hanya server)
//
// (30 Okt 2026) Membaca angka Laporan Sementara umum lewat fungsi SQL sigap_laporan_umum (hanya-baca; migrasi 20261030f), seluruhnya dibatasi satu kegiatan.
// Hasil disimpan sebentar di memori (45 detik) PER KEGIATAN supaya Segarkan beruntun dan beberapa admin sekaligus tidak mengulang agregasi.

import type { Db } from "@/lib/sigap";

const TTL_MS = 45_000;
const simpan = new Map<number, { waktu: number; data: Record<string, unknown> }>();

export class GalatLaporanUmum extends Error {
  constructor(pesan: string, readonly status = 500) {
    super(pesan);
  }
}

export async function muatLaporanUmum(db: Db, kegiatanId: number, segar = false): Promise<Record<string, unknown>> {
  const ada = simpan.get(kegiatanId);
  if (!segar && ada && Date.now() - ada.waktu < TTL_MS) return ada.data;
  const { data, error } = await db.rpc("sigap_laporan_umum", { p_kegiatan: kegiatanId });
  if (error) {
    // migrasi 20261030f belum dijalankan: pesan yang bisa ditindaklanjuti, bukan galat mentah
    if (/sigap_laporan_umum/.test(error.message) && /(does not exist|could not find|schema cache)/i.test(error.message)) {
      throw new GalatLaporanUmum("Fungsi data laporan umum belum terpasang di database. Jalankan migrasi 20261030f_laporan_umum.sql.", 503);
    }
    throw new GalatLaporanUmum(error.message);
  }
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (!d.kegiatan) throw new GalatLaporanUmum("Kegiatan tidak ditemukan.", 404);
  const hasil = { ...d, ragam: "umum" };
  // peta kecil: buang entri tertua bila terlalu banyak kegiatan
  if (simpan.size >= 30) {
    const tertua = simpan.keys().next().value;
    if (tertua !== undefined) simpan.delete(tertua);
  }
  simpan.set(kegiatanId, { waktu: Date.now(), data: hasil });
  return hasil;
}
