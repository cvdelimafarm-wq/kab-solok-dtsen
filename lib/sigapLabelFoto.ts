// lib/sigapLabelFoto.ts
//
// (8 Okt 2026) Keterangan 5 foto Transport Lokal (urut slot 1..5) per jenis kegiatan. Aman dipakai di klien & server.
// Dipakai: halaman unggah /sigap/translok/[token], PDF Dokumentasi (lib/pdf/sigap/dokumentasi.ts).
// Pelatihan memakai keterangan sendiri (permintaan user 8 Okt 2026); jenis lain tetap keterangan pendataan lapangan.

export const LABEL_FOTO_PENDATAAN = ["Saat akan berangkat", "Tiba di lokasi sampel pertama", "Saat mendata", "Saat mau pulang", "Tiba di rumah"];
export const LABEL_FOTO_PELATIHAN = ["Saat akan berangkat", "Tiba di lokasi pelatihan", "Saat pelatihan", "Saat akan pulang", "Tiba di kediaman"];

/** Keterangan foto per slot untuk jenis kegiatan tertentu (jenis tidak dikenal/kosong = pendataan). */
export function labelFoto(jenis?: string | null): string[] {
  return jenis === "pelatihan" ? LABEL_FOTO_PELATIHAN : LABEL_FOTO_PENDATAAN;
}
