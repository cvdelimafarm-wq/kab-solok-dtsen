// lib/seleksiBeranda.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Kartu seleksi di Beranda Mitra: seleksi yang sedang dibuka muncul sebagai ajakan mendaftar tanpa menunggu push/tautan.
// Satu kartu per seleksi. Hanya yang relevan yang tampil: sudah terdaftar, boleh mendaftar, atau perlu melengkapi lokasi. Yang pasti tidak memenuhi
// syarat atau jendela pendaftarannya tertutup (dan belum terdaftar) disembunyikan agar Beranda tidak ramai.

import type { HasilKelayakan } from "@/lib/seleksiSyarat";
import type { JendelaDaftar, PutusanDaftar } from "@/lib/seleksiDaftar";
import { alamatSeleksi, teksWaktuWib } from "@/lib/seleksiDaftar";

export type NadaKartuSeleksi = "biru" | "emas" | "hijau";

export type KartuSeleksi = {
  id: number;
  judul: string; // nama seleksi
  kegiatan: string;
  nada: NadaKartuSeleksi;
  pesan: string;
  aksi: string; // tulisan tombol
  href: string;
  tutup: string | null; // teks "5 Nov 2026 pukul 16.00 WIB"
};

export type MasukanKartu = {
  id: number;
  nama: string;
  kegiatan: string;
  jadwal_tutup: string | null;
  jendela: JendelaDaftar;
  kelayakan: HasilKelayakan | null; // null = tidak berhak (bukan calon Mitra pool)
  boleh: { ppl: PutusanDaftar; pml: PutusanDaftar } | null;
  saya: { peran: string; status: string } | null;
};

/** Kartu untuk satu seleksi, atau null bila tidak perlu ditampilkan. */
export function kartuSeleksi(m: MasukanKartu): KartuSeleksi | null {
  const dasar = { id: m.id, judul: m.nama, kegiatan: m.kegiatan, href: alamatSeleksi(m.id), tutup: teksWaktuWib(m.jadwal_tutup) };
  if (m.saya?.status === "terdaftar") {
    return { ...dasar, nada: "hijau", pesan: `Anda terdaftar sebagai ${m.saya.peran.toUpperCase()}. Tunggu pengumuman hasil seleksi.`, aksi: "Lihat" };
  }
  if (!m.jendela.buka || !m.kelayakan) return null;
  if (m.boleh && (m.boleh.ppl.boleh || m.boleh.pml.boleh)) {
    const peran = [m.boleh.ppl.boleh ? "PPL" : null, m.boleh.pml.boleh ? "PML" : null].filter(Boolean).join(" atau ");
    return { ...dasar, nada: "biru", pesan: `Pendaftaran dibuka untuk ${peran}.${dasar.tutup ? ` Tutup ${dasar.tutup}.` : ""}`, aksi: "Daftar" };
  }
  if (m.kelayakan.status === "perlu_lokasi") {
    return { ...dasar, nada: "emas", pesan: "Lengkapi lokasi rumah Anda agar bisa ikut seleksi ini.", aksi: "Lihat" };
  }
  return null;
}

/** Kartu semua seleksi: yang terdaftar di bawah yang masih bisa didaftar; yang tutupnya paling dekat paling atas. */
export function susunKartuSeleksi(daftar: MasukanKartu[]): KartuSeleksi[] {
  const urutTutup = (m: MasukanKartu) => (m.jadwal_tutup && !Number.isNaN(Date.parse(m.jadwal_tutup)) ? Date.parse(m.jadwal_tutup) : Number.MAX_SAFE_INTEGER);
  const bobot: Record<NadaKartuSeleksi, number> = { biru: 0, emas: 1, hijau: 2 };
  return daftar
    .map((m) => ({ m, k: kartuSeleksi(m) }))
    .filter((x): x is { m: MasukanKartu; k: KartuSeleksi } => x.k !== null)
    .sort((a, b) => bobot[a.k.nada] - bobot[b.k.nada] || urutTutup(a.m) - urutTutup(b.m) || a.m.id - b.m.id)
    .map((x) => x.k);
}
