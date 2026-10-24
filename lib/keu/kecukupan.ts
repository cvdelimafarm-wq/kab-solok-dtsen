// lib/keu/kecukupan.ts
//
// (24 Okt 2026, tahap 4n) Panel "Kecukupan KRO terhadap RAB" papan 1 mockup: per KRO dan per kelompok belanja (51, 524, 52L, 53) membandingkan
// POK sekarang (Semula) dan POK usulan (Menjadi) dengan RAB dan kebutuhan riil (RAB belum selesai dibagi faktor, RAB selesai apa adanya).
// Aturan status mengikuti view keu_v_kk_kecukupan: Kurang bila POK < RAB; Tipis bila POK < K; Cukup bila POK <= K x (1 + toleransi); selain itu Lebih.
// Hitungan di sini memakai RAB aktif (draf maupun disahkan) sebagai acuan tampilan; keputusan PPK tetap mengikuti view basis data (RAB disahkan).
// Tanpa React/DB.

import { kelompokAkun } from "./kk";
import type { BarisBuku, PrioritasMaster } from "./matriks";
import type { BarisRabKro } from "./rabKro";

export type StatusKecukupan = "kurang" | "tipis" | "cukup" | "lebih" | "kosong";
export const LABEL_KECUKUPAN: Record<StatusKecukupan, string> = { kurang: "Kurang", tipis: "Tipis", cukup: "Cukup", lebih: "Lebih", kosong: "Belum ada RAB" };
export const WARNA_STATUS_KECUKUPAN: Record<StatusKecukupan, "merah" | "kuning" | "hijau" | "biru" | "abu"> = { kurang: "merah", tipis: "kuning", cukup: "hijau", lebih: "biru", kosong: "abu" };

export const FAKTOR_BAWAAN = 0.9;
export const TOLERANSI_BAWAAN = 0.05;
export const URUT_KELOMPOK = ["51", "524", "52L", "53"] as const;
export const NAMA_KELOMPOK: Record<string, string> = { "51": "51 Belanja pegawai", "524": "524 Perjalanan dinas", "52L": "52 Barang dan jasa (selain 524)", "53": "53 Belanja modal" };

/** Status satu kelompok: k = kebutuhan riil, t = toleransi (pecahan, mis. 0,05). */
export function statusKecukupan(pok: number, rab: number, k: number, t: number): StatusKecukupan {
  if (rab <= 0) return "kosong";
  if (pok < rab) return "kurang";
  if (pok < k) return "tipis";
  if (pok <= Math.round(k * (1 + t))) return "cukup";
  return "lebih";
}

export type BarisKecukupan = {
  kode: string; nama: string; nItem: number; nAda: number; p0: number; r: number; k: number; st0: StatusKecukupan; p1: number; st1: StatusKecukupan; ket: string;
};

const rp = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;

function keterangan(a: { nAda: number; p0: number; r: number; k: number; p1: number; st1: StatusKecukupan }): string {
  if (a.st1 === "kosong") return "Belum ada RAB pada kelompok ini.";
  const u = a.st1 === "kurang" ? `POK kurang ${rp(a.r - a.p1)} dari RAB; kekurangan masuk buku selisih.`
    : a.st1 === "tipis" ? `Menutup RAB, tetapi kurang ${rp(a.k - a.p1)} dari kebutuhan riil.`
    : a.st1 === "cukup" ? "Sesuai kebutuhan riil." : `Ada sisa ${rp(a.p1 - a.k)} di atas kebutuhan riil.`;
  const d = a.p1 - a.p0;
  return d === 0 ? u : `POK ${d > 0 ? "naik" : "turun"} ${rp(Math.abs(d))} dari semula. ${u}`;
}

/** Baris pertama = seluruh KRO, lalu tiap kelompok belanja yang punya item (urut 51, 524, 52L, 53). Hanya item POK sebenarnya (bukan Dana penggenap). */
export function hitungKecukupan(baris: BarisRabKro[], faktor: number, toleransi: number): BarisKecukupan[] {
  const f = faktor >= 0.5 && faktor <= 1 ? faktor : FAKTOR_BAWAAN;
  const t = toleransi >= 0 ? toleransi : TOLERANSI_BAWAAN;
  type Acc = { nItem: number; nAda: number; p0: number; r: number; kRaw: number; p1: number };
  const baru = (): Acc => ({ nItem: 0, nAda: 0, p0: 0, r: 0, kRaw: 0, p1: 0 });
  const semua = baru();
  const per = new Map<string, Acc>();
  for (const b of baris) {
    const kel = kelompokAkun(b.akun) ?? "lain";
    const a = per.get(kel) ?? baru(); per.set(kel, a);
    for (const x of [a, semua]) {
      x.nItem += 1;
      if (b.rab !== null) {
        x.nAda += 1; x.p0 += b.semula; x.p1 += b.pok; x.r += b.rab;
        x.kRaw += b.status === "selesai" ? b.rab : b.rab / f;
      }
    }
  }
  const baris2 = (kode: string, nama: string, a: Acc): BarisKecukupan => {
    const k = Math.round(a.kRaw);
    const st0 = statusKecukupan(a.p0, a.r, k, t), st1 = statusKecukupan(a.p1, a.r, k, t);
    return { kode, nama, nItem: a.nItem, nAda: a.nAda, p0: a.p0, r: a.r, k, st0, p1: a.p1, st1, ket: keterangan({ nAda: a.nAda, p0: a.p0, r: a.r, k, p1: a.p1, st1 }) };
  };
  const kode = [...URUT_KELOMPOK, "lain"].filter((x) => per.has(x));
  return [baris2("kro", "Seluruh KRO", semua), ...kode.map((x) => baris2(x, x === "lain" ? "Kelompok lain" : `Kelompok ${NAMA_KELOMPOK[x]}`, per.get(x)!))];
}

export const teksCakupan = (kro: BarisKecukupan, pokTanpaRab: number): string =>
  `RAB baru mencakup ${kro.nAda} dari ${kro.nItem} item. POK pada ${kro.nItem - kro.nAda} item tanpa RAB (${rp(pokTanpaRab)}) tidak dibandingkan; lengkapi RAB-nya dulu agar status lebih tegas. Selisih RAB terhadap POK yang tidak perlu dipindah hanya informasi, bukan pemicu P-01.`;

export const teksFaktor = (faktor: number): string => {
  const kebutuhan = Math.round(900000 / faktor / 1000) * 1000;
  return `Arti faktor: RAB disusun sebagai angka rencana yang cenderung pas-pasan, jadi kebutuhan riil diperkirakan RAB ÷ faktor. Contoh dengan faktor ${String(faktor).replace(".", ",")}: RAB Rp 900.000 berarti kebutuhan riil sekitar ${rp(kebutuhan)}. Isi 1,0 bila RAB sudah dianggap sama dengan kebutuhan riil. Nilai ini hanya untuk status Tipis, Cukup, dan Lebih; status Kurang tetap memakai RAB apa adanya.`;
};

/** Kalimat dasar tertulis untuk nota atau surat; memuat angka KRO dan status tiap kelompok. */
export function dasarKebutuhan(kro: string, baris: BarisKecukupan[], faktor: number, toleransi: number): string {
  const t = baris[0];
  if (!t || t.nAda === 0) return `Untuk KRO ${kro} belum ada RAB, jadi kebutuhan belum dapat dinyatakan.`;
  const kel = baris.slice(1).filter((x) => x.nAda > 0).map((x) => `${x.nama.replace(/^Kelompok /, "")} berstatus ${LABEL_KECUKUPAN[x.st1]}`).join("; ");
  const kurang = baris.slice(1).reduce((s, x) => s + Math.max(0, x.r - x.p1), 0);
  return `Pada KRO ${kro}, RAB ${t.nAda} dari ${t.nItem} item berjumlah ${rp(t.r)}; dengan faktor ${String(faktor).replace(".", ",")} kebutuhan riil diperkirakan ${rp(t.k)}. POK usulan pada item tersebut ${rp(t.p1)} (semula ${rp(t.p0)}), toleransi Cukup ${Math.round(toleransi * 100)}%. ${kel}. ${kurang > 0 ? `Kebutuhan yang belum terdanai terhadap RAB ${rp(kurang)} dicatat pada buku selisih.` : "Tidak ada kebutuhan RAB yang belum terdanai."} RAB hanya acuan kebutuhan dan tidak mengubah POK.`;
}

/** Buku selisih dari RAB aktif: item ber-RAB (belum selesai) yang RAB-nya melebihi POK Menjadi. Urut prioritas (kecil = didahulukan), lalu kekurangan terbesar. */
export function bukuDariSandingan(baris: BarisRabKro[], prioritas: PrioritasMaster[]): BarisBuku[] {
  const urut = new Map(prioritas.map((p) => [p.kode, { urut: Number(p.urut), nama: p.nama }]));
  const u = (p: string | null) => (p === null ? Number.MAX_SAFE_INTEGER : (urut.get(p)?.urut ?? Number.MAX_SAFE_INTEGER - 1));
  return baris
    .filter((b) => b.rab !== null && b.itemId !== null && b.rab > b.pok)
    .map((b) => ({
      itemId: b.itemId as number, ro: b.ro, uraian: b.uraian, akun: b.akun, kelompok: kelompokAkun(b.akun) ?? "lain", rab: b.rab as number, pok: b.pok, kurang: (b.rab as number) - b.pok,
      prioritas: b.prioritas, prioritasNama: b.prioritas ? (urut.get(b.prioritas)?.nama ?? null) : null, selesai: b.status === "selesai",
    }))
    .sort((a, b) => u(a.prioritas) - u(b.prioritas) || b.kurang - a.kurang || a.itemId - b.itemId);
}

// ---------------------------------------------------------------- jalur penutup (papan 1 mockup, tahap 24)
export type JalurPenutup = { no: number; judul: string; jalur: string; teks: string };

/**
 * Jalur untuk menutup kekurangan yang tercatat di Buku selisih, menurut mode jenis revisi (diporting dari kk-kec.js mockup).
 * Revisi POK: hanya turunkan volume item yang boleh ditunda (kode prioritas "tunda"); selebihnya perlu Revisi DIPA.
 * Revisi DIPA: lima jalur dimulai dari keputusan PPK. Hanya saran urutan; tidak mengubah data.
 */
export function jalurPenutup(baris: BarisRabKro[], dipa: boolean, namaKategoriTunda: string | null): JalurPenutup[] {
  const ditunda = baris.filter((b) => b.prioritas === "tunda" && b.rab !== null && b.rab > 0 && b.status !== "selesai");
  const potensi = ditunda.reduce((s, b) => s + (b.rab ?? 0), 0);
  const j1 = {
    judul: "Turunkan volume item yang boleh ditunda", jalur: "Revisi POK, wewenang KPA",
    teks: `${ditunda.length} item berkategori ${namaKategoriTunda ?? "boleh ditunda"} memiliki RAB ${rp(potensi)}. Penurunan hanya dalam kelompok belanja yang sama (524xxx dengan 524xxx, 52xxxx lain dengan 52xxxx lain) dan tidak di bawah Booked + Realisasi. Selisih tetap tercatat di Buku selisih; RAB tidak perlu dibuat ulang.`,
  };
  const daftar = dipa
    ? [
      { judul: "Teruskan ke PPK untuk diputuskan", jalur: "Keputusan PPK", teks: "Kekurangan per KRO masuk daftar PPK. PPK memutuskan menerima semua usulan, menerima sebagian, atau menunda (tetap tercatat di Buku selisih). Keputusan dilihat pada papan Peta KRO Satker, bagian Tampilan PPK." },
      j1,
      { judul: "Cari sumber di KRO lain pada Kegiatan yang sama", jalur: "Revisi DIPA jalur DJPb (tingkat 3)", teks: "Lihat Peta KRO Satker untuk KRO lain pada Kegiatan yang sama yang berstatus Cukup atau Lebih; sisanya dapat menjadi sumber." },
      { judul: "Tambah pagu atau pindahkan antar-Program", jalur: "Revisi DIPA jalur DJA (tingkat 5), tidak dijamin", teks: "Dipakai bila seluruh KRO pada Satker masih kurang setelah dijumlahkan. Perlu Kanwil atau Eselon I; lihat jumlah seluruh KRO pada Peta KRO Satker." },
      { judul: "Tunda kegiatan", jalur: "Keputusan tim", teks: "Kebutuhan yang belum terdanai dicatat sebagai angka, bukan baris POK. RAB tetap utuh sebagai dasar tertulis." },
    ]
    : [
      j1,
      { judul: "Jalur lain bukan wewenang Revisi POK", jalur: "Perlu Revisi DIPA", teks: "Sumber dari KRO lain, antar-Kegiatan, atau tambahan pagu tidak dapat dilakukan lewat Revisi POK. Bila kekurangan ingin ditutup, ubah jenis revisi menjadi Revisi DIPA (DJPb atau DJA); daftar kekurangan lalu diputuskan PPK pada tampilan PPK (papan Peta KRO Satker)." },
    ];
  return daftar.map((x, i) => ({ no: i + 1, ...x }));
}
