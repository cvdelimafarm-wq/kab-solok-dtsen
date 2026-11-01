// lib/sigapPelatihanNama.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Nama pelatihan yang ditampilkan di layar peserta (header, kartu pulsa, judul tes) dan tujuan tombol kembali. Sebelumnya tertanam "Pelatihan PSP Pascabencana 2026"
// dan "/sigap/kegiatan/pascabencana" sehingga pelatihan lain (mis. Seruti TW IV) tampak sebagai PSP. Sumber: /api/sigap/pelatihan/info.

import { KODE_KEGIATAN_PELATIHAN } from "@/lib/sigapTes";

export type InfoPelatihan = { kegiatan_id: number | null; nama: string; kode: string; induk_kode: string | null };

/** Nama pendek untuk judul. PSP tetap memakai judul lamanya; pelatihan lain memakai nama kegiatannya. Info belum termuat -> "Pelatihan". */
export function judulPelatihan(info: Pick<InfoPelatihan, "nama" | "kode"> | null | undefined): string {
  if (!info) return "Pelatihan";
  if (info.kode === KODE_KEGIATAN_PELATIHAN) return "Pelatihan PSP Pascabencana 2026";
  return info.nama.trim() || "Pelatihan";
}

/** Tujuan tombol kembali dari halaman Langkah pelatihan: halaman kegiatan induknya; tanpa induk -> Pascabencana (perilaku lama). */
export function tujuanKembali(info: Pick<InfoPelatihan, "induk_kode"> | null | undefined): string {
  return info?.induk_kode && /^[A-Za-z0-9_-]{1,60}$/.test(info.induk_kode) ? `/sigap/kegiatan/${info.induk_kode}` : "/sigap/kegiatan/pascabencana";
}
