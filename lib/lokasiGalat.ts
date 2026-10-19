// lib/lokasiGalat.ts  (murni: tanpa React/database)
//
// (19 Okt 2026) Pembacaan lokasi (GPS) di Lembar Pendataan. Keluhan petugas: pesan "Izinkan lokasi untuk aplikasi ini" muncul walau izin sudah
// diberikan, karena SEMUA kegagalan (izin ditolak, posisi tidak tersedia, waktu habis) dipukul rata. Di sini kegagalan dibedakan menurut kode
// GeolocationPositionError (1 izin ditolak, 2 posisi tidak tersedia, 3 waktu habis), dan bila GPS akurasi tinggi gagal (2/3) dicoba sekali lagi
// dengan lokasi dari jaringan (akurasi rendah) sebelum menyerah. Lokasi pada keluarga baru TIDAK wajib: kegagalan hanya memberi saran.

export type JenisGalatLokasi = "izin" | "tidak_tersedia" | "waktu_habis" | "tak_dikenal";
export type PosisiGps = { lat: number; lng: number; akurasi: number };
export class GalatBacaLokasi extends Error {
  jenis: JenisGalatLokasi;
  constructor(jenis: JenisGalatLokasi) {
    super(jenis);
    this.jenis = jenis;
  }
}

/** Kode GeolocationPositionError -> jenis. */
export function jenisGalatLokasi(kode: unknown): JenisGalatLokasi {
  return kode === 1 ? "izin" : kode === 2 ? "tidak_tersedia" : kode === 3 ? "waktu_habis" : "tak_dikenal";
}

/** Hanya kegagalan GPS (bukan izin) yang layak dicoba lagi lewat lokasi jaringan. */
export const layakCobaJaringan = (j: JenisGalatLokasi): boolean => j === "tidak_tersedia" || j === "waktu_habis";

const PESAN: Record<JenisGalatLokasi, string> = {
  izin: "Izin lokasi untuk aplikasi ini belum aktif. Di Chrome: ketuk ikon gembok di samping alamat situs, pilih Izin, Lokasi, lalu Izinkan. Pastikan juga tombol Lokasi di HP menyala.",
  tidak_tersedia: "Posisi belum bisa ditentukan. Pastikan tombol Lokasi di HP menyala dan Penghemat daya mati, lalu berdiri di tempat terbuka dan coba lagi.",
  waktu_habis: "Pembacaan lokasi terlalu lama (sinyal GPS lemah). Pindah ke tempat terbuka, tunggu sebentar, lalu coba lagi.",
  tak_dikenal: "Lokasi belum bisa dibaca. Coba lagi di tempat terbuka.",
};
/** Pesan untuk petugas. `tidakWajib` = tambahkan kalimat bahwa lokasi boleh dilewati. */
export function pesanGalatLokasi(j: JenisGalatLokasi, tidakWajib = false): string {
  return tidakWajib ? `${PESAN[j]} Lokasi tidak wajib: keluarga tetap bisa disimpan tanpa lokasi.` : PESAN[j];
}

type Geo = { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void, err: (e: { code?: number }) => void, opsi?: PositionOptions) => void };
const sekali = (geo: Geo, opsi: PositionOptions): Promise<PosisiGps> =>
  new Promise((ok, gagal) => {
    try {
      geo.getCurrentPosition(
        (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }),
        (e) => gagal(new GalatBacaLokasi(jenisGalatLokasi(e?.code))),
        opsi
      );
    } catch {
      gagal(new GalatBacaLokasi("tak_dikenal"));
    }
  });

/** GPS akurasi tinggi (25 dtk); bila posisi tidak tersedia / waktu habis, sekali lagi lewat lokasi jaringan (15 dtk). Menolak dengan GalatBacaLokasi. */
export async function bacaPosisi(geo: Geo): Promise<PosisiGps> {
  try {
    return await sekali(geo, { enableHighAccuracy: true, timeout: 25000, maximumAge: 30000 });
  } catch (e) {
    const j = e instanceof GalatBacaLokasi ? e.jenis : "tak_dikenal";
    if (!layakCobaJaringan(j)) throw e;
    return await sekali(geo, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
  }
}
