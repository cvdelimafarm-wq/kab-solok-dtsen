// lib/sigapFotoRekan.ts
//
// (27 Okt 2026) Foto yang DIBAGIKAN rekan (tag 'tim' / 'luar_tim'), sudah pernah diterima dan dipasang ke sebuah nomor, lalu tergeser foto lain
// (tag berstatus 'dilepas'), tampil lagi di "Foto cadangan" dengan label "dari <nama>" dan bisa dipasang ulang ke nomor mana pun.
// Hanya lewat ketukan manual petugas: foto rekan TIDAK ikut "susun otomatis" (aksi 'isi'). Logika murni (tanpa DB) supaya bisa diuji.

export type FotoRekan = {
  id: number;
  kegiatan_id?: number | null;
  tanggal?: string | null;
  akun_pengambil: number | null;
  kepercayaan: string;
  status_periksa: string;
  file_dihapus_at?: string | null;
  hapus_disetujui_at?: string | null;
};

export type TagRekan = {
  id: number;
  foto_id: number;
  akun_id?: number | null;
  peran_tag: string;
  status: string;
  penugasan_id?: number | null;
};

export const PERAN_TAG_REKAN: readonly string[] = ["tim", "luar_tim"];

export type KonteksRekan = {
  /** penugasan petugas yang sedang menyusun */
  penugasanId: number;
  /** akun petugas yang sedang menyusun */
  akunId: number;
  /** id foto yang sudah menempati sebuah nomor pada hari itu */
  idDok: readonly number[];
};

/** Apakah foto rekan ini pantas muncul di "Foto cadangan" petugas? */
export function layakCadanganRekan(foto: FotoRekan, tag: TagRekan, k: KonteksRekan): boolean {
  if (!PERAN_TAG_REKAN.includes(tag.peran_tag)) return false;
  if (tag.status !== "dilepas") return false; // 'diajukan' = masih di "Menunggu diterima"; 'ditolak' = sudah ditolak petugas
  if (tag.foto_id !== foto.id) return false;
  if (tag.akun_id != null && tag.akun_id !== k.akunId) return false;
  // tag lama tanpa penugasan tetap pantas (hari/kegiatan disaring di kueri); tag milik penugasan lain tidak
  if (tag.penugasan_id != null && tag.penugasan_id !== k.penugasanId) return false;
  if (foto.akun_pengambil === null || foto.akun_pengambil === k.akunId) return false; // foto milik sendiri ditangani jalur cadangan biasa
  if (k.idDok.includes(foto.id)) return false; // sudah bernomor
  if (foto.status_periksa === "dipertanyakan") return false;
  if (foto.kepercayaan === "merah" && foto.status_periksa !== "diperiksa") return false; // rekan tidak bisa dipesan sebagai tahanan
  if (foto.file_dihapus_at || foto.hapus_disetujui_at) return false;
  return true;
}

/** Nama untuk label "dari <nama>"; cadangan bila nama tidak diketahui. */
export function labelDariRekan(nama: string | null | undefined): string {
  const n = (nama ?? "").trim();
  return n ? `dari ${n}` : "dari rekan";
}
