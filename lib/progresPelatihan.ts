// lib/progresPelatihan.ts  (murni; dipakai klien)
//
// (2 Nov 2026) DAFTAR PROGRES PELATIHAN untuk tab Pelatihan di HP. Menggantikan kartu "LANGKAH BERIKUTNYA" yang membingungkan (permintaan user): setiap tahap ditampilkan
// sebagai satu baris dengan status yang tegas -- centang SELESAI, BELUM DIBUKA, progres x/y, terlewat, belum saatnya, terkunci. Memakai daftar langkah yang sama dengan
// lib/alurPelatihan.ts (satu sumber kebenaran), ditambah rincian: sesi presensi x/y, foto x/y, tes sedang dikerjakan.

import { bagiFoto, keadaanHari } from "./sigapPresensi";
import type { LangkahPelatihan, MasukanLangkah } from "./alurPelatihan";

export type StatusRinci = "selesai" | "berjalan" | "belum_dibuka" | "belum_dikerjakan" | "menyusul" | "terlewat" | "terkunci";

export type Rinci = {
  kode: LangkahPelatihan["kode"];
  judul: string;
  singkat: string;
  status: StatusRinci;
  /** Keterangan pendek di baris ("Selesai", "Belum dibuka", "2/3 sesi" ...). */
  teks: string;
  /** Progres x/y bila tahap punya bagian (sesi presensi, foto). */
  progres: { x: number; y: number; satuan: string } | null;
  tambahan: boolean;
  halaman: boolean;
  href: string;
};

export function rincianProgres(daftar: readonly LangkahPelatihan[], m: MasukanLangkah): Rinci[] {
  const fotoTotal = m.langkah?.foto_total ?? 5;
  const { awal, akhir } = bagiFoto(fotoTotal);
  return daftar.map((l): Rinci => {
    const dasar = { kode: l.kode, judul: l.judul, singkat: l.singkat, tambahan: l.tambahan, halaman: l.halaman, href: l.href };
    if (l.selesai) return { ...dasar, status: "selesai", teks: "Selesai", progres: null };
    if (l.terlewat) return { ...dasar, status: "terlewat", teks: "Terlewat", progres: null };
    if (l.terkunci) return { ...dasar, status: "terkunci", teks: "Terkunci: selesaikan tahap sebelumnya", progres: null };

    if (l.kode === "hadir" && m.presensi) {
      const k = keadaanHari(m.presensi.hari, m.now);
      if (k.total > 0 && k.selesai > 0) return { ...dasar, status: "berjalan", teks: `${k.selesai}/${k.total} sesi tercatat`, progres: { x: k.selesai, y: k.total, satuan: "sesi" } };
    }
    if (l.kode === "foto_awal" || l.kode === "foto_akhir") {
      const slot = l.kode === "foto_awal" ? awal : akhir;
      const ada = slot.filter((s) => m.langkah?.slot.includes(s)).length;
      if (slot.length > 0 && ada > 0) return { ...dasar, status: "berjalan", teks: `${ada}/${slot.length} foto`, progres: { x: ada, y: slot.length, satuan: "foto" } };
    }
    if (l.kode === "pretest" || l.kode === "posttest") {
      const t = m.tes.find((x) => x.jenis === l.kode);
      if (t?.status === "mengerjakan") return { ...dasar, status: "berjalan", teks: "Sedang dikerjakan", progres: null };
    }
    if (l.kode === "undangan" || l.kode === "instrumen") return { ...dasar, status: "belum_dibuka", teks: "Belum dibuka", progres: null };
    if (l.bisaSekarang) return { ...dasar, status: "belum_dikerjakan", teks: "Belum dikerjakan", progres: null };
    return { ...dasar, status: "menyusul", teks: "Belum saatnya", progres: null };
  });
}

/** Ringkasan untuk kepala kartu: tahap wajib selesai / seluruh tahap wajib. */
export function ringkasRinci(r: readonly Rinci[]): { selesai: number; wajib: number; persen: number } {
  const wajib = r.filter((x) => !x.tambahan);
  const selesai = wajib.filter((x) => x.status === "selesai").length;
  return { selesai, wajib: wajib.length, persen: wajib.length ? Math.round((selesai / wajib.length) * 100) : 0 };
}
