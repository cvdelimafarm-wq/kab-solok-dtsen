// lib/seleksiDaftar.ts  (logika murni)
//
// (31 Okt 2026) Pendaftaran Mitra pada seleksi (paket 3): jendela waktu pendaftaran, syarat boleh mendaftar, dan teks undangan/notifikasi.
// Kelayakan syarat khusus ada di lib/seleksiSyarat.ts; berkas ini hanya menyatukan status seleksi + jadwal + kelayakan menjadi satu putusan.

import type { HasilKelayakan, StatusSeleksi } from "@/lib/seleksiSyarat";

export type PeranDaftar = "ppl" | "pml";
export const peranDaftarSah = (v: unknown): v is PeranDaftar => v === "ppl" || v === "pml";

export type JendelaDaftar = { buka: boolean; alasan: string | null };

/** Pendaftaran terbuka bila status 'dibuka' dan waktu sekarang berada di antara jadwal buka dan tutup (batas kosong = tidak membatasi). */
export function jendelaPendaftaran(o: { status: StatusSeleksi | string; jadwal_buka: string | null; jadwal_tutup: string | null; nowMs: number }): JendelaDaftar {
  if (o.status !== "dibuka") return { buka: false, alasan: o.status === "draft" ? "Pendaftaran belum dibuka." : "Pendaftaran sudah ditutup." };
  if (o.jadwal_buka && o.nowMs < Date.parse(o.jadwal_buka)) return { buka: false, alasan: "Pendaftaran belum dimulai." };
  if (o.jadwal_tutup && o.nowMs > Date.parse(o.jadwal_tutup)) return { buka: false, alasan: "Batas waktu pendaftaran sudah lewat." };
  return { buka: true, alasan: null };
}

export type PutusanDaftar = { boleh: boolean; alasan: string | null };

/** Boleh mendaftar bila jendela terbuka, kebutuhan peran > 0 (sisa setelah organik), dan kelayakan "memenuhi". */
export function putusanDaftar(o: { jendela: JendelaDaftar; kelayakan: HasilKelayakan; peran: PeranDaftar; sisaPpl: number; sisaPml: number }): PutusanDaftar {
  if (!o.jendela.buka) return { boleh: false, alasan: o.jendela.alasan };
  if ((o.peran === "ppl" ? o.sisaPpl : o.sisaPml) <= 0) return { boleh: false, alasan: `Tidak ada kebutuhan ${o.peran.toUpperCase()} pada seleksi ini.` };
  if (o.kelayakan.status === "perlu_lokasi") return { boleh: false, alasan: `Lokasi Anda belum lengkap (${o.kelayakan.alasan.join("; ") || "data lokasi"}). Lengkapi lokasi lebih dulu.` };
  if (o.kelayakan.status === "tidak") return { boleh: false, alasan: `Belum memenuhi syarat: ${o.kelayakan.alasan.join("; ") || "di luar ketentuan"}.` };
  return { boleh: true, alasan: null };
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "5 Nov 2026 pukul 16.00 WIB" dari ISO. Rusak/kosong -> null. */
export function teksWaktuWib(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} pukul ${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WIB`;
}

export const alamatSeleksi = (seleksiId: number): string => `/sigap/seleksi/${seleksiId}`;

/** Teks undangan yang bisa ditempel ke grup/chat; tautan penuh bila `asal` diberikan. */
export function pesanUndangan(o: { namaKegiatan: string; namaSeleksi: string; tutup: string | null; seleksiId: number; asal?: string }): string {
  const tutup = teksWaktuWib(o.tutup);
  const tautan = `${(o.asal ?? "").replace(/\/+$/, "")}${alamatSeleksi(o.seleksiId)}`;
  return [
    `Yth. Mitra Statistik BPS Kabupaten Solok,`,
    ``,
    `Dibuka seleksi petugas: ${o.namaSeleksi} (${o.namaKegiatan}).${tutup ? ` Pendaftaran ditutup ${tutup}.` : ""}`,
    `Daftar melalui SIGAP (masuk dengan akun Anda):`,
    tautan,
    ``,
    `Terima kasih.`,
  ].join("\n");
}

/** Isi push ajakan. Judul dan isi dipendekkan agar muat di notifikasi. */
export function pesanPushAjakan(o: { namaSeleksi: string; namaKegiatan: string; tutup: string | null; seleksiId: number }): { judul: string; isi: string; url: string } {
  const tutup = teksWaktuWib(o.tutup);
  const isi = `${o.namaSeleksi} (${o.namaKegiatan}) dibuka.${tutup ? ` Tutup ${tutup}.` : ""} Ketuk untuk mendaftar.`;
  return { judul: "Seleksi petugas dibuka", isi: isi.slice(0, 180), url: alamatSeleksi(o.seleksiId) };
}
