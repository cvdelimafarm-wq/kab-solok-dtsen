// lib/sigapPelatihanNama.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Nama pelatihan yang ditampilkan di layar peserta (header, kartu pulsa, judul tes) dan tujuan tombol kembali. Sebelumnya tertanam "Pelatihan PSP Pascabencana 2026"
// dan "/sigap/kegiatan/pascabencana" sehingga pelatihan lain (mis. Seruti TW IV) tampak sebagai PSP. Sumber: /api/sigap/pelatihan/info.

import { KODE_KEGIATAN_PELATIHAN } from "@/lib/sigapTes";

export type PilihanPelatihan = { id: number; nama: string; kode: string; tanggal_mulai: string | null; tanggal_selesai: string | null };
/** `pilihan`: (3 Nov 2026) semua pelatihan aktif akun ini, HANYA bila ada dua atau lebih (untuk pemilih pelatihan); selain itu tidak ada. */
export type InfoPelatihan = { kegiatan_id: number | null; nama: string; kode: string; induk_kode: string | null; pilihan?: PilihanPelatihan[] };

/** Urutan pemilih: yang belum selesai dulu (paling awal mulainya), lalu yang sudah selesai (terbaru dulu). Mengembalikan [] bila kurang dari dua. */
export function urutkanPilihan(daftar: readonly PilihanPelatihan[], hariIni: string): PilihanPelatihan[] {
  if (daftar.length < 2) return [];
  const akhir = (p: PilihanPelatihan) => p.tanggal_selesai ?? p.tanggal_mulai;
  const belum = daftar.filter((p) => { const a = akhir(p); return a === null || a >= hariIni; });
  const sudah = daftar.filter((p) => !belum.includes(p));
  belum.sort((a, b) => (a.tanggal_mulai ?? "9999-12-31").localeCompare(b.tanggal_mulai ?? "9999-12-31") || a.id - b.id);
  sudah.sort((a, b) => (akhir(b) ?? "").localeCompare(akhir(a) ?? "") || a.id - b.id);
  return [...belum, ...sudah];
}

/** Tautan ke pelatihan lain pada halaman yang sedang dibuka: ganti/tambah ?kegiatan=ID, parameter lain dipertahankan. */
export function alamatGantiPelatihan(path: string, search: string, id: number): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  p.set("kegiatan", String(id));
  return `${path}?${p.toString()}`;
}

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
