// lib/sigapBerandaDaftar.ts
//
// (31 Okt 2026) Menyusun DAFTAR KARTU Beranda dari kegiatan yang sudah dihitung (Aktivitas per jenis + kegiatan lain), satu kartu per survei.
// Pelatihan dan Pendataan satu survei tetap dua kartu. Aturan poin/peringatan/realisasi: lib/sigapBerandaKartu.ts. Murni (tanpa React/DB).

import type { Aktivitas } from "@/lib/sigapAktivitas";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { idTranslokMenu, pakaiTemplateMenu } from "@/lib/sigapMenuKegiatan";
import type { Induk } from "@/lib/sigapTahap";
import type { NadaLencana, TugasUtama } from "@/lib/sigapTugasUtama";
import { kartuBiasa, kartuTemplate, poinDariKekurangan, poinInfo, urutKartu, type KartuBeranda, type NadaPoin, type Poin } from "@/lib/sigapBerandaKartu";

const adalahAktivitas = (x: RingkasKegiatan | Aktivitas): x is Aktivitas => "indukKode" in x && "jenis" in x;

const NADA_LENCANA: Record<NadaLencana, NadaPoin> = { merah: "merah", emas: "emas", biru: "biru", hijau: "hijau", abu: "abu" };

/** Poin dari tugas utama pelatihan (kuis, tes, presensi, foto, undangan, ...). */
export function poinDariTugas(t: TugasUtama | null | undefined): Poin | null {
  if (!t) return null;
  return poinInfo(t.judul, t.href, t.lencana ? NADA_LENCANA[t.lencana.nada] : "biru", t.aksi, t.uraian);
}

export type BahanDaftar = {
  /** kegiatan hasil Beranda: Aktivitas per jenis (Pelatihan/Pendataan) dan kegiatan lain */
  kegiatan: (RingkasKegiatan | Aktivitas)[];
  induk: Induk[] | null;
  /** ringkasan Transport Lokal akun (dengan hariIni) */
  keg: RingkasKegiatan[] | null;
  /** tugas utama pelatihan (peserta); dipasang pada kartu Pelatihan pertama */
  tugasPelatihan: TugasUtama | null;
  nowMs: number;
};

export function susunDaftarKartu(b: BahanDaftar): KartuBeranda[] {
  const kegTL = b.keg ?? [];
  let pelatihanTerpakai = false;
  const kartu: KartuBeranda[] = b.kegiatan.map((x) => {
    const href = x.href ?? "/";
    if (adalahAktivitas(x)) {
      const ind = b.induk?.find((i) => i.kode === x.indukKode);
      const info = x.info ? poinInfo(x.info.teks, x.info.href) : null;
      if (x.jenis === "pendataan" && ind && pakaiTemplateMenu(ind.tahap)) {
        return kartuTemplate({ id: x.id, judul: x.judul, href, nada: x.nada }, { induk: ind, keg: kegTL, idTranslok: idTranslokMenu(ind.tahap), nowMs: b.nowMs }, info);
      }
      if (x.jenis === "pelatihan" && !pelatihanTerpakai && b.tugasPelatihan) {
        pelatihanTerpakai = true;
        return kartuBiasa({ id: x.id, judul: x.judul, href, nada: x.nada, jenis: "pelatihan" }, poinDariTugas(b.tugasPelatihan));
      }
      return kartuBiasa({ id: x.id, judul: x.judul, href, nada: x.nada, jenis: x.jenis }, info);
    }
    // kegiatan lain (Transport Lokal tersendiri, penyisiran, DTSEN, ...)
    if (x.id === "pelatihan" && b.tugasPelatihan && !pelatihanTerpakai) {
      pelatihanTerpakai = true; // pelatihan yang tidak tergabung kegiatan induk
      return kartuBiasa({ id: x.id, judul: x.pendek || x.judul, href, nada: x.nada, jenis: "pelatihan" }, poinDariTugas(b.tugasPelatihan));
    }
    if (x.hariIni) {
      const k = kartuTemplate({ id: x.id, judul: x.pendek || x.judul, href, nada: x.nada }, { induk: undefined, keg: [x], idTranslok: x.kegiatan_id !== undefined ? [x.kegiatan_id] : [], nowMs: b.nowMs }, poinDariKekurangan(x.kekurangan?.[0]));
      return { ...k, jenis: "lain" };
    }
    const poin = poinDariKekurangan(x.kekurangan?.[0]) ?? (x.sub ? poinInfo(x.sub, href, x.nada === "merah" ? "merah" : x.nada === "emas" ? "emas" : "biru", "Buka") : null);
    const k = kartuBiasa({ id: x.id, judul: x.pendek || x.judul, href, nada: x.nada, jenis: "lain" }, poin);
    return x.sso ? { ...k, sso: x.sso } : k;
  });
  return urutKartu(kartu);
}
