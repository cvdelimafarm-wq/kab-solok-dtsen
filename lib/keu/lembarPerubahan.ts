// lib/keu/lembarPerubahan.ts
//
// (24 Okt 2026, tahap 4n) Isi lembar "Matriks perubahan POK, semula menjadi" untuk ekspor Excel dan PDF: kepala (KRO, jenis revisi), tabel hanya baris yang
// berubah, jumlah total, dan blok tanda tangan (Jenis revisi, Disusun oleh operator anggaran, Penetap) seperti papan 1 mockup.
// Tanpa React/DB; penulis berkas ada di lembarPdf.ts (PDF) dan komponen (Excel).

import { n } from "./kk";
import type { BarisMx } from "./matriks";
import { barisBerubah } from "./rabKro";

export const KEPALA_LEMBAR = ["RO", "Kode", "Akun", "Uraian semula", "Vol semula", "Harga semula", "Jumlah semula", "Uraian menjadi", "Vol menjadi", "Harga menjadi", "Jumlah menjadi", "Selisih", "Booked", "Realisasi", "Pemicu"] as const;

/** Penetap menurut jenis jadwal. Revisi POK dan administrasi: PPK menyatakan sah, KPA menerima laporan (ketentuan kantor, bukan pasal PMK). */
export function penetapJenis(jenisJadwal: string): string {
  if (jenisJadwal === "dipa_djpb") return "Kantor Wilayah DJPb";
  if (jenisJadwal === "dipa_dja") return "Direktorat Jenderal Anggaran (DJA)";
  return "PPK menyatakan sah; KPA menerima laporan";
}

export type BarisLembar = { sel: (string | number)[]; ro: string };
export type IsiLembar = {
  judul: string; kro: string; jenis: string; penetap: string; disusun: string; catatanTanggal: string; catatanPenetap: string;
  kepala: string[]; baris: (string | number)[][]; total: (string | number)[]; jumlahBaris: number; semula: number; menjadi: number;
};

export function susunIsiLembar(baris: BarisMx[], kro: string, jenisJadwal: string, jenisNama: string): IsiLembar {
  const b = barisBerubah(baris).slice().sort((x, y) => x.ro_kode.localeCompare(y.ro_kode) || (x.nomor ?? "").localeCompare(y.nomor ?? "") || x.id - y.id);
  const isi = b.map((x) => [
    x.ro_kode, x.nomor ?? "", x.akun_menjadi, x.uraian_semula ?? "", n(x.vol_semula), n(x.harga_semula), n(x.jumlah_semula), x.uraian_menjadi ?? "",
    n(x.vol_menjadi), n(x.harga_menjadi), n(x.jumlah_menjadi), n(x.selisih), x.booked, x.real, x.pemicu ?? "",
  ] as (string | number)[]);
  const semula = b.reduce((s, x) => s + n(x.jumlah_semula), 0), menjadi = b.reduce((s, x) => s + n(x.jumlah_menjadi), 0);
  return {
    judul: "Matriks perubahan POK, semula menjadi", kro, jenis: jenisNama, penetap: penetapJenis(jenisJadwal), disusun: "Operator anggaran",
    catatanTanggal: "tanggal [diisi saat diterapkan]", catatanPenetap: "hasil dicatat setelah ada surat resmi",
    kepala: [...KEPALA_LEMBAR], baris: isi,
    total: [`Total KRO ${kro} (baris berubah)`, "", "", "", "", "", semula, "", "", "", menjadi, menjadi - semula, "", "", ""],
    jumlahBaris: b.length, semula, menjadi,
  };
}

/** Larik-of-larik untuk lembar Excel: judul, kepala, tabel, total, lalu blok tanda tangan. */
export function lembarExcel(l: IsiLembar): (string | number)[][] {
  return [
    [l.judul], [`KRO ${l.kro}`], ["Jenis revisi", l.jenis], [],
    l.kepala, ...l.baris, l.total, [],
    ["Jenis revisi", "Disusun", "Penetap"],
    [l.jenis, l.disusun, l.penetap],
    ["", l.catatanTanggal, l.catatanPenetap],
  ];
}
