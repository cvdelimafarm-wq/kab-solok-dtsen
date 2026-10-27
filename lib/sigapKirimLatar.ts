// lib/sigapKirimLatar.ts  (murni)
//
// (27 Okt 2026) Kirim foto di LATAR BELAKANG (permintaan user: "membuka kamera sampai kirim terasa lama"). Begitu Kirim diketuk, kamera langsung siap untuk
// foto berikutnya; foto diunggah satu per satu di belakang dan tiap foto tampil sebagai kartu kecil (mengunggah / terkirim / tersimpan di HP / galat).
// Berkas foto sendiri tetap di antrean HP (IndexedDB) sampai server menjawab sukses; modul ini hanya mengelola DAFTAR KARTU di layar.

import { teksProgresKirim } from "./sigapFotoCache";

export type StatusLatar = "antri" | "mengirim" | "selesai" | "tunda" | "galat";

export type EntriLatar<H = unknown> = {
  kid: number;
  nomor: number | null; // nomor foto yang dituju (null = cadangan)
  status: StatusLatar;
  progres: number | null; // 0..1 saat mengunggah
  hasil: H | null; // jawaban server saat selesai
  galat: string | null;
  dibuatMs: number;
};

/** Kartu "selesai" yang dibiarkan tampil (yang tertua dilepas dari layar; fotonya tetap ada di server dan di Foto saya). */
export const MAKS_SELESAI_TAMPIL = 4;

export function rapikanEntri<H>(daftar: EntriLatar<H>[], maksSelesai = MAKS_SELESAI_TAMPIL): EntriLatar<H>[] {
  const selesai = daftar.filter((e) => e.status === "selesai");
  if (selesai.length <= maksSelesai) return daftar;
  const buang = new Set(selesai.slice(0, selesai.length - maksSelesai).map((e) => e.kid));
  return daftar.filter((e) => !buang.has(e.kid));
}

export function tambahEntri<H>(daftar: EntriLatar<H>[], e: EntriLatar<H>): EntriLatar<H>[] {
  if (daftar.some((x) => x.kid === e.kid)) return daftar;
  return rapikanEntri([...daftar, e]);
}

export function ubahEntri<H>(daftar: EntriLatar<H>[], kid: number, patch: Partial<EntriLatar<H>>): EntriLatar<H>[] {
  if (!daftar.some((x) => x.kid === kid)) return daftar;
  return rapikanEntri(daftar.map((x) => (x.kid === kid ? { ...x, ...patch } : x)));
}

export function hapusEntri<H>(daftar: EntriLatar<H>[], kid: number): EntriLatar<H>[] {
  return daftar.some((x) => x.kid === kid) ? daftar.filter((x) => x.kid !== kid) : daftar;
}

/** Jumlah foto yang masih berjalan (antri atau mengunggah). */
export function jumlahAktif<H>(daftar: EntriLatar<H>[]): number {
  return daftar.filter((e) => e.status === "antri" || e.status === "mengirim").length;
}

/** Nomor yang sedang "dipesan" foto yang masih berjalan, supaya saran nomor berikutnya langsung maju. Setelah selesai, nomor dipegang data server; tunda -> antrean HP; galat -> bebas lagi. */
export function nomorDipesanLatar<H>(daftar: EntriLatar<H>[]): number[] {
  const n = daftar.filter((e) => (e.status === "antri" || e.status === "mengirim") && e.nomor !== null).map((e) => e.nomor as number);
  return Array.from(new Set(n));
}

/** Judul kartu: "Foto 2" atau "Foto cadangan". */
export function judulEntri(nomor: number | null): string {
  return nomor !== null ? `Foto ${nomor}` : "Foto cadangan";
}

/** Teks status singkat kartu yang BELUM selesai atau gagal. Kartu selesai memakai teks dari hasil server (di komponen). */
export function teksStatusEntri<H>(e: EntriLatar<H>): string {
  switch (e.status) {
    case "antri":
      return "Menunggu giliran kirim";
    case "mengirim":
      return teksProgresKirim(e.progres);
    case "selesai":
      return "Terkirim";
    case "tunda":
      return "Tersimpan di HP, terkirim otomatis saat ada sinyal";
    case "galat":
      return e.galat ? e.galat : "Gagal dikirim";
  }
}

/** Foto yang masih berjalan: jangan hilang saat aplikasi ditutup -> dilepas dari status "draf" agar pengirim antrean mengambilnya. */
export function perluDilepasSaatTutup<H>(daftar: EntriLatar<H>[]): number[] {
  return daftar.filter((e) => e.status === "antri" || e.status === "mengirim").map((e) => e.kid);
}
