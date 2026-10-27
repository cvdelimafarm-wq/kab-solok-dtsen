// lib/sigapVerifikasi.ts  (murni, tanpa server/DB)
//
// (27 Okt 2026) Halaman publik /verifikasi menampilkan FOTO ASLI (versi kecil) berdampingan dengan kode, agar pemeriksa bisa membandingkan
// langsung dan foto tempelan ketahuan. Keputusan user: tautan tanpa batas umur; bila foto dihapus / dinonaktifkan, halaman tetap
// menampilkan verifikasi kode saja (tanpa foto).
//
// Aturan "foto boleh tampil": berkas fisik belum dihapus (file_dihapus_at kosong) DAN belum disetujui untuk dihapus (hapus_disetujui_at kosong)
// DAN ada jalur berkas. Persetujuan hapus = foto sudah "dinonaktifkan" sebelum akun super menghapus berkas fisiknya.

export type PenandaFoto = {
  file_path?: string | null;
  file_dihapus_at?: string | null;
  hapus_disetujui_at?: string | null;
};

export type StatusTampilFoto = "tampil" | "dihapus" | "dinonaktifkan";

/** Lebar sisi panjang foto kecil (piksel). Cukup untuk membandingkan cap dan wajah/lokasi; berat ±80–120 KB. */
export const LEBAR_FOTO_KECIL = 800;
export const KUALITAS_FOTO_KECIL = 72;

/** 'dihapus' bila berkas fisik sudah dihapus atau jalurnya kosong; 'dinonaktifkan' bila penghapusan sudah disetujui; selain itu 'tampil'. */
export function statusTampilFoto(f: PenandaFoto): StatusTampilFoto {
  if (f.file_dihapus_at) return "dihapus";
  if (!f.file_path) return "dihapus";
  if (f.hapus_disetujui_at) return "dinonaktifkan";
  return "tampil";
}

export const fotoBolehTampil = (f: PenandaFoto): boolean => statusTampilFoto(f) === "tampil";

export type UkuranGambar = "kecil" | "penuh";

/** Nilai ?u= dari klien. Selain 'penuh' -> 'kecil' (aman: yang kecil adalah yang paling murah). */
export function ukuranDariParam(v: string | null | undefined): UkuranGambar {
  return v === "penuh" ? "penuh" : "kecil";
}

/** Alamat gambar untuk <img> / tautan (kode harus sudah dinormalisasi). */
export function urlGambarVerifikasi(kode: string, ukuran: UkuranGambar): string {
  return `/api/verifikasi-foto/gambar?k=${encodeURIComponent(kode)}&u=${ukuran}`;
}

/** Teks pengganti saat foto tidak ditampilkan. */
export function teksTanpaFoto(s: StatusTampilFoto): string | null {
  if (s === "tampil") return null;
  if (s === "dinonaktifkan") return "Foto arsip sudah dinonaktifkan dan tidak ditampilkan. Verifikasi cukup dengan kode di atas; catatan tetap tersimpan.";
  return "Berkas foto arsip sudah dihapus. Verifikasi cukup dengan kode di atas; catatan tetap tersimpan.";
}

/**
 * Simpanan kecil di memori server untuk foto kecil yang baru dibuat (satu tautan WhatsApp bisa dibuka banyak orang berurutan).
 * Dibatasi jumlah entri DAN umur. Kunci memuat jalur berkas, jadi bila berkas diganti/dihapus kunci lama tak terpakai.
 * Pemeriksaan status foto di database tetap dilakukan SETIAP permintaan (dihapus/nonaktif -> langsung tidak ditampilkan).
 */
export class SimpananKecil<V> {
  private peta = new Map<string, { v: V; sampai: number }>();
  constructor(private maks: number, private umurMs: number) {}

  ambil(kunci: string, sekarang: number): V | undefined {
    const e = this.peta.get(kunci);
    if (!e) return undefined;
    if (e.sampai <= sekarang) {
      this.peta.delete(kunci);
      return undefined;
    }
    // segarkan urutan (terbaru dipakai di belakang)
    this.peta.delete(kunci);
    this.peta.set(kunci, e);
    return e.v;
  }

  simpan(kunci: string, v: V, sekarang: number): void {
    this.peta.delete(kunci);
    this.peta.set(kunci, { v, sampai: sekarang + this.umurMs });
    for (const [k, e] of this.peta) {
      if (this.peta.size <= this.maks && e.sampai > sekarang) break;
      this.peta.delete(k);
    }
    while (this.peta.size > this.maks) {
      const pertama = this.peta.keys().next().value;
      if (pertama === undefined) break;
      this.peta.delete(pertama);
    }
  }

  buang(kunci: string): void {
    this.peta.delete(kunci);
  }

  get ukuran(): number {
    return this.peta.size;
  }
}
