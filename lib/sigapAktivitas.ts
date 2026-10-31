// lib/sigapAktivitas.ts
//
// (30 Okt 2026) Beranda bagian bawah = KEGIATAN AKTIF PER JENIS (permintaan user): tiap survei punya dua kegiatan, Pelatihan dan Pendataan, dan masing-masing
// menjadi satu ikon ("Pelatihan Pascabencana", "Pendataan Pascabencana", "Pendataan SPDT NTP", ...). Dulu satu ikon per kegiatan induk (semua tahap digabung).
// Logika murni (tanpa React/DB) supaya teruji:
//  - tahap berisi modul pelatihan -> kegiatan "Pelatihan"; tahap berisi modul lain -> kegiatan "Pendataan" (perencanaan/konfirmasi ikut di sini);
//    tahap tanpa isi (mis. Evaluasi kosong) tidak membentuk kegiatan.
//  - ketukan ikon = halaman kerja tahap utama kegiatan itu (tahap dengan modul terbanyak; Layer "Tahapan" dilewati); kegiatan bermenu rutin -> Hari Ini.
//  - keterangan di bawah ikon = informasi paling mendesak, DAN bisa diketuk: membuka halaman/bagian yang sesuai dengan informasi itu (bukan sekadar status).
//  - kegiatan yang sudah selesai dipisah (Beranda meringkasnya) supaya yang aktif tampil lebih dulu.

import { URUT_NADA, type NadaKegiatan, type RingkasKegiatan } from "@/lib/sigapKegiatan";
import { susunTahap, tahapSekarang, type KonteksTahap, type TahapHasil } from "@/lib/sigapTahap";
import { pakaiTemplateMenu } from "@/lib/sigapMenuKegiatan";

export type JenisAktivitas = "pelatihan" | "pendataan";
export type InfoAktivitas = { teks: string; href: string };
export type Aktivitas = RingkasKegiatan & { jenis: JenisAktivitas; indukKode: string; info: InfoAktivitas | null };

/** "Pendataan Pascabencana" -> "Pascabencana"; "SPDT NTP" -> "SPDT NTP". */
export const namaDasar = (pendek: string): string => pendek.replace(/^(Pendataan|Pelatihan)\s+/i, "").trim() || pendek;

function nadaKelompok(grup: TahapHasil[]): { nada: NadaKegiatan; pesan: string } {
  const buka = grup.filter((x) => !x.terkunci);
  const sekarang = tahapSekarang(grup);
  if (grup.every((x) => x.status === "selesai")) return { nada: "hijau", pesan: "Selesai" };
  if (buka.some((x) => x.status === "mendesak")) return { nada: "merah", pesan: sekarang?.modul.ket ?? "Mendesak" };
  if (buka.some((x) => x.status === "perlu")) return { nada: "emas", pesan: sekarang?.modul.ket ?? "Perlu dilengkapi" };
  if (buka.every((x) => x.status === "menunggu") && buka.every((x) => x.pecahan === 0)) return { nada: "abu", pesan: "Belum mulai" };
  return { nada: "biru", pesan: "Berjalan" };
}

/** Tahap utama kegiatan: yang modulnya terbanyak dan tak terkunci (seri: yang paling awal); semua terkunci -> yang pertama. */
export function tahapUtama(grup: TahapHasil[]): TahapHasil {
  const buka = grup.filter((x) => !x.terkunci);
  const pool = buka.length > 0 ? buka : grup;
  return pool.reduce((a, b) => (b.modul.length > a.modul.length ? b : a), pool[0]);
}

function bangun(jenis: JenisAktivitas, k: KonteksTahap, grup: TahapHasil[]): Aktivitas {
  const { nada, pesan } = nadaKelompok(grup);
  const utama = tahapUtama(grup);
  const sekarang = nada === "hijau" ? null : tahapSekarang(grup);
  const dasar = namaDasar(k.induk.pendek);
  const judul = `${jenis === "pelatihan" ? "Pelatihan" : "Pendataan"} ${dasar}`;
  const selesai = grup.filter((x) => x.status === "selesai").length;
  return {
    id: `akt-${k.induk.kode}-${jenis}`,
    judul,
    pendek: judul,
    ikon: jenis === "pelatihan" ? "langkah" : k.induk.ikon,
    nada,
    pecahan: grup.reduce((a, x) => a + x.pecahan, 0) / grup.length,
    selesai,
    total: grup.length,
    sub: pesan,
    peringatan: nada === "merah" || nada === "emas",
    // (31 Okt 2026) kegiatan bermenu rutin (bar bawah): ikon membuka "Hari Ini" kegiatan (/sigap/kegiatan/<kode>), bukan halaman tahap
    href: jenis === "pendataan" && pakaiTemplateMenu(k.induk.tahap) ? `/sigap/kegiatan/${k.induk.kode}` : utama.rute,
    jenis,
    indukKode: k.induk.kode,
    info: sekarang ? { teks: sekarang.modul.ket, href: sekarang.modul.href ?? sekarang.tahap.rute } : null,
  };
}

/** Kegiatan aktif (Pelatihan, Pendataan) dari satu kegiatan induk bagi petugas ini. */
export function aktivitasDariInduk(k: KonteksTahap): Aktivitas[] {
  const tahap = susunTahap(k).filter((x) => x.isi.length > 0);
  const pel = tahap.filter((x) => x.isi.includes("pelatihan"));
  const lain = tahap.filter((x) => !x.isi.includes("pelatihan"));
  const hasil: Aktivitas[] = [];
  if (pel.length > 0) hasil.push(bangun("pelatihan", k, pel));
  if (lain.length > 0) hasil.push(bangun("pendataan", k, lain));
  return hasil;
}

/** Pisahkan yang masih berjalan (mendesak di depan) dari yang sudah selesai. */
export function pisahAktif<T extends { nada: NadaKegiatan }>(daftar: T[]): { aktif: T[]; selesai: T[] } {
  const urut = [...daftar].sort((a, b) => URUT_NADA[a.nada] - URUT_NADA[b.nada]);
  return { aktif: urut.filter((x) => x.nada !== "hijau"), selesai: urut.filter((x) => x.nada === "hijau") };
}
