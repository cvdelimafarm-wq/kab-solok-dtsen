// lib/sigapUnduhMassal.ts  (murni, tanpa Supabase/React)
//
// (23 Okt 2026) Unduh massal paket SPJ di Verifikasi & Kunci: browser mengambil PDF gabungan tiap petugas satu per satu lewat route yang sudah ada
// (/api/sigap/admin/dokumen) lalu menyusunnya menjadi ZIP. Logika murni di sini: pembagian batch (supaya memori browser aman), nama berkas unik di
// dalam ZIP, nama ZIP, dan ringkasan hasil.

/** Maksimum petugas per ZIP; lebih dari itu dibagi beberapa ZIP (memori browser). */
export const MAKS_PER_ZIP = 20;

export function bagiBatch<T>(daftar: T[], ukuran: number = MAKS_PER_ZIP): T[][] {
  const n = Math.max(1, Math.floor(ukuran));
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += n) hasil.push(daftar.slice(i, i + n));
  return hasil;
}

/** Nama berkas unik dalam satu ZIP: bentrok -> sisipkan _2, _3 sebelum ekstensi (huruf besar/kecil dianggap sama). */
export function unikanNama(nama: string, dipakai: Set<string>): string {
  const titik = nama.lastIndexOf(".");
  const dasar = titik > 0 ? nama.slice(0, titik) : nama;
  const ekstensi = titik > 0 ? nama.slice(titik) : "";
  let calon = nama;
  for (let i = 2; dipakai.has(calon.toLowerCase()); i++) calon = `${dasar}_${i}${ekstensi}`;
  dipakai.add(calon.toLowerCase());
  return calon;
}

const aman = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "SIGAP";

/** Nama ZIP: Paket_SPJ_<kode>_<tanggal>[_bagian-<i>-dari-<n>].zip */
export function namaZip(kode: string, tanggal: string, bagian: number, jumlahBagian: number): string {
  return `Paket_SPJ_${aman(kode)}_${tanggal}${jumlahBagian > 1 ? `_bagian-${bagian}-dari-${jumlahBagian}` : ""}.zip`;
}

export type HasilMassal = { berhasil: string[]; dilewati: { nama: string; alasan: string }[]; dibatalkan: boolean };

/** Satu kalimat ringkasan, mis. "18 dari 20 paket SPJ masuk ZIP. Dilewati 2: Budi (Belum ada dokumen…); …". */
export function ringkasanMassal(h: HasilMassal, total: number): string {
  const awal = `${h.berhasil.length} dari ${total} paket SPJ masuk ZIP${h.dibatalkan ? " (dibatalkan)" : ""}.`;
  if (h.dilewati.length === 0) return awal;
  const daftar = h.dilewati.slice(0, 5).map((d) => `${d.nama} (${d.alasan})`).join("; ");
  return `${awal} Dilewati ${h.dilewati.length}: ${daftar}${h.dilewati.length > 5 ? "; …" : ""}`;
}
