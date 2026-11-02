// lib/tautanPelatihan.ts  (murni)
//
// (3 Nov 2026) Tautan masuk ke halaman PESERTA pelatihan yang membawa ?kegiatan=ID. Peserta bisa terdaftar di dua pelatihan yang berdekatan
// (mis. Seruti TW IV 9 Nov dan SPDT NTP 20-21 Nov); tanpa ID, server memilih otomatis (lib/sigapPelatihanPilih.ts) dan tautan dari Beranda,
// Tugas Utama, tahap, maupun notifikasi bisa membuka pelatihan yang salah. ID tidak valid / kosong -> tautan tidak diubah.

export function tautanPelatihan(path: string, kegiatanId: number | null | undefined): string {
  if (typeof kegiatanId !== "number" || !Number.isInteger(kegiatanId) || kegiatanId <= 0) return path;
  if (/[?&]kegiatan=/.test(path)) return path;
  const [tanpaHash, ...sisaHash] = path.split("#");
  const hash = sisaHash.length ? `#${sisaHash.join("#")}` : "";
  return `${tanpaHash}${tanpaHash.includes("?") ? "&" : "?"}kegiatan=${kegiatanId}${hash}`;
}
