// lib/sigapBerandaDaftar.ts
//
// (31 Okt 2026) Menyusun DAFTAR KARTU Beranda dari kegiatan yang sudah dihitung (Aktivitas per jenis + kegiatan lain), satu kartu per survei.
// (11 Nov 2026: Pelatihan dan Pendataan satu survei bermenu rutin digabung jadi satu kartu.) Aturan poin/peringatan/realisasi: lib/sigapBerandaKartu.ts. Murni (tanpa React/DB).

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
  /** (1 Nov 2026) kegiatan pelatihan milik `tugasPelatihan` (hub Beranda); kartu Pelatihan dengan `pelatihanId` sama yang menerimanya. Kosong/tak cocok -> kartu Pelatihan pertama (perilaku lama). */
  tugasPelatihanKegiatanId?: number | null;
  nowMs: number;
};

export function susunDaftarKartu(b: BahanDaftar): KartuBeranda[] {
  const kegTL = b.keg ?? [];
  let pelatihanTerpakai = false;
  const sasaranTugas = b.tugasPelatihanKegiatanId == null ? null : b.kegiatan.find((x): x is Aktivitas => adalahAktivitas(x) && x.jenis === "pelatihan" && x.pelatihanId === b.tugasPelatihanKegiatanId)?.id ?? null;
  // (11 Nov 2026) Satu kartu per survei: Pelatihan + Pendataan satu induk bermenu rutin digabung ke kartu Pendataan (-> halaman tahap kegiatan: pilih Pelatihan/Pendataan).
  // Poin Pelatihan (tes, presensi, ...) dibawa ke kartu gabungan supaya tugas pelatihan tetap terlihat di Beranda.
  const gabung = new Map<string, Aktivitas>();
  for (const x of b.kegiatan) {
    if (!adalahAktivitas(x) || x.jenis !== "pelatihan") continue;
    const ind = b.induk?.find((i) => i.kode === x.indukKode);
    const adaData = b.kegiatan.some((y) => adalahAktivitas(y) && y.jenis === "pendataan" && y.indukKode === x.indukKode);
    if (ind && adaData && !gabung.has(x.indukKode)) gabung.set(x.indukKode, x);
  }
  const poinGabung = new Map<string, Poin | null>();
  for (const [kodeInduk, p] of gabung) {
    const pakaiTugas = !pelatihanTerpakai && !!b.tugasPelatihan && (sasaranTugas === null || p.id === sasaranTugas);
    if (pakaiTugas) pelatihanTerpakai = true;
    poinGabung.set(kodeInduk, pakaiTugas ? poinDariTugas(b.tugasPelatihan) : p.info ? poinInfo(p.info.teks, p.info.href) : null);
  }
  const daftar = b.kegiatan.filter((x) => !(adalahAktivitas(x) && x.jenis === "pelatihan" && gabung.get(x.indukKode) === x));
  const kartu: KartuBeranda[] = daftar.map((x) => {
    const href = x.href ?? "/";
    if (adalahAktivitas(x)) {
      const ind = b.induk?.find((i) => i.kode === x.indukKode);
      const info = poinGabung.get(x.indukKode) && x.jenis === "pendataan" ? (poinGabung.get(x.indukKode) ?? null) : x.info ? poinInfo(x.info.teks, x.info.href) : null;
      if (x.jenis === "pendataan" && ind && pakaiTemplateMenu(ind.tahap)) {
        const k = kartuTemplate({ id: x.id, judul: x.judul, href, nada: x.nada }, { induk: ind, keg: kegTL, idTranslok: idTranslokMenu(ind.tahap), nowMs: b.nowMs }, info);
        // tugas Pelatihan yang mendesak (merah/emas) mengalahkan poin Pendataan yang tidak merah, supaya tidak tersembunyi di balik kartu gabungan
        const pg = poinGabung.get(x.indukKode) ?? null;
        return pg && (pg.nada === "merah" || pg.nada === "emas") && k.poin?.nada !== "merah" && !k.redup ? { ...k, poin: pg } : k;
      }
      if (x.jenis === "pelatihan" && !pelatihanTerpakai && b.tugasPelatihan && (sasaranTugas === null || x.id === sasaranTugas)) {
        pelatihanTerpakai = true;
        return kartuBiasa({ id: x.id, judul: x.judul, href, nada: x.nada, jenis: "pelatihan" }, poinDariTugas(b.tugasPelatihan));
      }
      // survei tanpa menu rutin (mis. Seruti) yang tergabung: kartu membuka halaman tahap kegiatan (pilih Pelatihan/Pendataan), bukan langsung ke lembar Pendataan
      const hrefGabung = x.jenis === "pendataan" && gabung.has(x.indukKode) ? `/sigap/kegiatan/${x.indukKode}` : href;
      return kartuBiasa({ id: x.id, judul: x.judul, href: hrefGabung, nada: x.nada, jenis: x.jenis }, info);
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
    // keterangan generik "Buka" tidak menambah informasi (kartu sudah bisa diketuk): bukan poin
    const poin = poinDariKekurangan(x.kekurangan?.[0]) ?? (x.sub && !/^buka$/i.test(x.sub.trim()) ? poinInfo(x.sub, href, x.nada === "merah" ? "merah" : x.nada === "emas" ? "emas" : "biru", "Buka") : null);
    const k = kartuBiasa({ id: x.id, judul: x.pendek || x.judul, href, nada: x.nada, jenis: "lain" }, poin);
    return x.sso ? { ...k, sso: x.sso } : k;
  });
  return urutKartu(kartu);
}
