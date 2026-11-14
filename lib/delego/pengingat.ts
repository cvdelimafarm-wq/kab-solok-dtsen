// lib/delego/pengingat.ts
//
// (14 Nov 2026, Fase 4d) Halaman Pengingat dan eskalasi. Berkas MURNI: nama dan arti tiap jadwal Delego (cron), terjemahan jadwal
// UTC ke WIB, dan pemeriksaan isian setelan (sama dengan batasan tabel keu_dlg_eskalasi_setelan dan keu_dlg_mutu_setelan).

import type { SetelanEskalasi } from "./eskalasi";
import type { SetelanMutu } from "./mutu";

export type JadwalDelego = { nama: string; jadwal: string; aktif: boolean; terakhir: string | null; gagal_terakhir: boolean | null };
export type BahanPengingat = {
  boleh_ubah: boolean;
  eskalasi: (SetelanEskalasi & { hk_usulan: number; ringkasan_pagi: boolean; diubah_at: string; diubah_nama: string | null }) | null;
  mutu: (SetelanMutu & { diubah_at: string; diubah_nama: string | null }) | null;
  jadwal: JadwalDelego[];
};

export const ARTI_JADWAL: Record<string, { judul: string; arti: string }> = {
  "delego-pengingat-1800": { judul: "Pengingat lapor harian", arti: "Pegawai yang belum melapor hari ini diingatkan." },
  "delego-pengingat-tinjau-0800": { judul: "Pengingat tinjau", arti: "Ketua Tim diingatkan laporan yang menunggu tinjau." },
  "delego-tenggat-15m": { judul: "Tenggat berjam", arti: "Pengingat 2 jam sebelum tenggat berjam, dan kabar ke pemberi saat lewat." },
  "delego-rutin-0600": { judul: "Pekerjaan berulang", arti: "Butir pekerjaan berulang diterbitkan untuk hari itu." },
  "delego-eskalasi-15m": { judul: "Eskalasi lewat tenggat", arti: "Minta penjelasan, push kedua, minta jawaban pimpinan, naik ke Kepala." },
  "delego-usulan-0900": { judul: "Usulan menggantung", arti: "Usulan pegawai yang belum dijawab lewat batas diingatkan ke Ketua Tim dan Kepala." },
  "delego-ringkasan-0715": { judul: "Ringkasan pagi", arti: "Satu ringkasan per pegawai: pekerjaan hari ini, lewat tenggat, perlu revisi." },
};

const HARI_CRON: Record<string, string> = { "*": "setiap hari", "1-5": "Senin sampai Jumat", "0-6": "setiap hari" };

/** Terjemahan jadwal cron (UTC) yang dipakai Delego ke kalimat WIB. Pola lain dikembalikan apa adanya. */
export function jadwalWib(cron: string): string {
  const b = cron.trim().split(/\s+/);
  if (b.length !== 5) return cron;
  const [mnt, jam, tgl, bln, hari] = b;
  const m = mnt.match(/^\*\/(\d+)$/);
  if (m && jam === "*" && tgl === "*" && bln === "*") return `tiap ${m[1]} menit${hari === "*" ? "" : `, ${HARI_CRON[hari] ?? hari}`}`;
  if (/^\d+$/.test(mnt) && /^\d+$/.test(jam) && tgl === "*" && bln === "*") {
    const wib = (Number(jam) + 7) % 24;
    const geser = Number(jam) + 7 >= 24; // hari WIB = hari UTC + 1
    let teksHari = HARI_CRON[hari] ?? hari;
    if (geser && hari !== "*") teksHari = `${teksHari} (UTC)`;
    return `pukul ${String(wib).padStart(2, "0")}.${String(Number(mnt)).padStart(2, "0")} WIB, ${teksHari}`;
  }
  return cron;
}

export function galatSetelanMutu(s: { w_kualitas: number; w_disiplin: number; w_tepat: number; tepat_terlambat: number; ambang_jumlah_kali: number; ambang_poin_laporan: number; ambang_kecepatan_kali: number }): string | null {
  const w = [s.w_kualitas, s.w_disiplin, s.w_tepat];
  if (w.some((x) => !Number.isInteger(x) || x < 0 || x > 100)) return "Bobot harus bilangan bulat 0 sampai 100.";
  if (w[0] + w[1] + w[2] !== 100) return `Jumlah bobot harus 100 (sekarang ${w[0] + w[1] + w[2]}).`;
  if (!(s.tepat_terlambat >= 0 && s.tepat_terlambat <= 1)) return "Nilai ketepatan saat terlambat 0 sampai 1.";
  if (!(s.ambang_jumlah_kali > 0 && s.ambang_poin_laporan > 0 && s.ambang_kecepatan_kali > 0)) return "Ambang kewajaran harus lebih dari 0.";
  return null;
}

export function galatSetelanEskalasi(s: { jam_jelas: number; hk_push2: number; hk_jawab: number; hk_kepala: number; hk_usulan: number; kali_bina: number; jam_tenang_mulai: number; jam_tenang_selesai: number }): string | null {
  const bulat = (x: number) => Number.isInteger(x);
  if (![s.jam_jelas, s.hk_push2, s.hk_jawab, s.hk_kepala, s.hk_usulan, s.kali_bina, s.jam_tenang_mulai, s.jam_tenang_selesai].every(bulat)) return "Semua isian harus bilangan bulat.";
  if (s.jam_jelas < 1 || s.jam_jelas > 168) return "Batas penjelasan 1 sampai 168 jam.";
  if (s.hk_push2 < 0 || s.hk_push2 > 10) return "Push kedua 0 sampai 10 hari kerja.";
  if (s.hk_jawab < 1 || s.hk_jawab > 10) return "Batas jawab pimpinan 1 sampai 10 hari kerja.";
  if (s.hk_kepala < 1 || s.hk_kepala > 15) return "Naik ke Kepala 1 sampai 15 hari kerja.";
  if (s.hk_kepala < s.hk_jawab) return "Naik ke Kepala sebaiknya tidak lebih cepat dari batas jawab pimpinan.";
  if (s.hk_usulan < 1 || s.hk_usulan > 15) return "Batas jawab usulan 1 sampai 15 hari kerja.";
  if (s.kali_bina < 1 || s.kali_bina > 20) return "Saran pembinaan 1 sampai 20 kali.";
  if ([s.jam_tenang_mulai, s.jam_tenang_selesai].some((j) => j < 0 || j > 23)) return "Jam tenang 0 sampai 23.";
  return null;
}
