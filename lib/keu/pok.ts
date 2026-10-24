// lib/keu/pok.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK, papan 12 dan 6 mockup -- logika murni unggah PDF POK resmi (RKKS) dan pencocokannya dengan POK sistem.
// Mencerminkan aturan fungsi basis data (keu_pok_unggah_baru/isi/padankan/terima/tolak); yang memutuskan tetap basis data. Berkas ini hanya
// mencegah kiriman sia-sia, menyusun argumen, mengelompokkan hasil banding per RO, dan memberi peringkat calon pasangan baris 'baru' dengan baris 'hilang'.

import { tanggalSah } from "@/lib/keu/revisi";
import { berkasUtuh, type BarisPok, type HasilUrai } from "@/lib/keu/rkks";

export type PokBerlaku = { id: number; tahun: number; nomor_revisi: number; nomor_pok: string | null; tanggal_efektif: string | null };

export type UnggahPok = {
  id: number; tahun: number; nomor_revisi: number; jadwal_id: number | null; nama_berkas: string; hash_berkas: string; nomor_pok: string | null;
  tanggal_efektif: string; status: string; versi_id: number | null; alasan_tolak: string | null; dibuat_at: string;
};

export type RingkasUnggah = {
  unggah_id: number; tahun: number; nomor_revisi: number; status: string; n_baris: number | string; total_unggah: number | string; total_berlaku: number | string;
  n_sama: number | string; n_berubah: number | string; n_dipadankan: number | string; n_baru: number | string; n_hilang: number | string;
  n_di_luar_usulan: number | string; n_ro_tak_terdaftar: number | string;
};

export type StatusBanding = "sama" | "berubah" | "dipadankan" | "baru" | "hilang";
export type BarisBanding = {
  unggah_id: number; status: StatusBanding; baris_id: number | null; detail_id: number | null; ro_kode: string; komp_kode: string; akun_kode: string;
  uraian_lama: string | null; uraian_baru: string | null; vol_lama: number | string | null; vol_baru: number | string | null;
  harga_lama: number | string | null; harga_baru: number | string | null; jumlah_lama: number | string | null; jumlah_baru: number | string | null;
  selisih: number | string | null; di_luar_usulan: boolean | null;
};

export const LABEL_STATUS_UNGGAH: Record<string, string> = { diunggah: "Menunggu keputusan", diterima: "Diterima", ditolak: "Ditolak" };
export const LABEL_BANDING: Record<StatusBanding, string> = {
  sama: "Sama", berubah: "Berubah", dipadankan: "Dipadankan", baru: "Baru di PDF", hilang: "Tidak ada di PDF",
};
export const WARNA_BANDING: Record<StatusBanding, "hijau" | "biru" | "kuning" | "merah" | "abu"> = {
  sama: "abu", berubah: "kuning", dipadankan: "biru", baru: "hijau", hilang: "merah",
};

export const MAKS_BYTE_PDF = 40 * 1024 * 1024;

const n = (x: number | string | null | undefined): number => (x === null || x === undefined || x === "" ? 0 : Number(x));

// ---------- isian unggah ----------
export type IsianUnggah = { nomorRevisi: string; nomorPok: string; tanggal: string; jadwal: string };
export const unggahKosong = (berlaku: PokBerlaku | null): IsianUnggah => ({
  nomorRevisi: String((berlaku?.nomor_revisi ?? 0) + 1), nomorPok: "", tanggal: "", jadwal: "",
});

export function nomorRevisiBerikut(berlaku: PokBerlaku | null): number {
  return (berlaku?.nomor_revisi ?? 0) + 1;
}

export type BerkasPdf = { nama: string; ukuran: number; hash: string; hasil: HasilUrai };

/** Daftar alasan unggahan belum boleh dikirim (kosong = boleh). */
export function periksaIsianUnggah(b: BerkasPdf | null, i: IsianUnggah, berlaku: PokBerlaku | null, tahunDiharapkan: number | null): string[] {
  const g: string[] = [];
  if (!b) { g.push("Pilih berkas PDF POK (RKKS) lebih dulu."); return g; }
  if (b.ukuran > MAKS_BYTE_PDF) g.push("Berkas lebih dari 40 MB.");
  if (!berkasUtuh(b.hasil)) g.push("Isi PDF belum lolos pemeriksaan jumlah; tidak dikirim.");
  const nomor = Number(i.nomorRevisi);
  if (!Number.isInteger(nomor) || nomor < 1) g.push("Nomor revisi harus bilangan bulat positif.");
  else if (berlaku && nomor <= berlaku.nomor_revisi) g.push(`Nomor revisi harus lebih besar dari POK berlaku (revisi ${berlaku.nomor_revisi}).`);
  if (i.nomorPok.trim().length > 60) g.push("Nomor POK terlalu panjang (maksimal 60 karakter).");
  if (!tanggalSah(i.tanggal)) g.push("Tanggal efektif wajib diisi.");
  if (tahunDiharapkan !== null && i.tanggal && tanggalSah(i.tanggal) && Number(i.tanggal.slice(0, 4)) !== tahunDiharapkan) {
    g.push(`Tanggal efektif harus dalam tahun anggaran ${tahunDiharapkan}.`);
  }
  return g;
}

export function tahunUnggah(i: IsianUnggah, berlaku: PokBerlaku | null): number {
  const t = tanggalSah(i.tanggal) ? Number(i.tanggal.slice(0, 4)) : 0;
  return t || berlaku?.tahun || new Date().getFullYear();
}

export function argsUnggahBaru(tahun: number, i: IsianUnggah, b: BerkasPdf): Record<string, unknown> {
  return {
    p_tahun: tahun, p_nomor: Number(i.nomorRevisi), p_nama: b.nama.slice(0, 200), p_hash: b.hash,
    p_nomor_pok: i.nomorPok.trim() || null, p_tanggal: i.tanggal, p_jadwal: i.jadwal ? Number(i.jadwal) : null,
  };
}
export const argsUnggahIsi = (unggah: number, baris: BarisPok[]): Record<string, unknown> => ({ p_unggah: unggah, p_baris: baris });

export function periksaAlasanTolak(alasan: string): string | null {
  return alasan.trim().length >= 5 ? null : "Alasan penolakan minimal 5 huruf.";
}

// ---------- hasil banding ----------
export type RingkasRoBanding = {
  ro: string; sama: number; berubah: number; dipadankan: number; baru: number; hilang: number; selisih: number; diLuarUsulan: number; beda: boolean;
};

/** Ringkasan per RO; hanya RO yang punya selisih (berubah/baru/hilang/dipadankan) yang `beda`. Urut menurun menurut besar selisih mutlak. */
export function ringkasPerRo(banding: BarisBanding[]): RingkasRoBanding[] {
  const peta = new Map<string, RingkasRoBanding>();
  for (const b of banding) {
    let r = peta.get(b.ro_kode);
    if (!r) { r = { ro: b.ro_kode, sama: 0, berubah: 0, dipadankan: 0, baru: 0, hilang: 0, selisih: 0, diLuarUsulan: 0, beda: false }; peta.set(b.ro_kode, r); }
    r[b.status] += 1;
    r.selisih += n(b.selisih);
    if (b.di_luar_usulan) r.diLuarUsulan += 1;
  }
  const h = [...peta.values()];
  for (const r of h) r.beda = r.berubah + r.dipadankan + r.baru + r.hilang > 0;
  return h.sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih) || a.ro.localeCompare(b.ro));
}

export function bandingRo(banding: BarisBanding[], ro: string, sertakanSama = false): BarisBanding[] {
  const urutan: Record<StatusBanding, number> = { berubah: 0, baru: 1, hilang: 2, dipadankan: 3, sama: 4 };
  return banding
    .filter((b) => b.ro_kode === ro && (sertakanSama || b.status !== "sama"))
    .sort((a, b) => urutan[a.status] - urutan[b.status] || a.akun_kode.localeCompare(b.akun_kode) || Math.abs(n(b.selisih)) - Math.abs(n(a.selisih)));
}

// ---------- pemadanan ----------
const kata = (s: string | null): Set<string> => new Set((s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 2));

/** Kemiripan uraian 0..1 (Jaccard kata). */
export function kemiripan(a: string | null, b: string | null): number {
  const x = kata(a), y = kata(b);
  if (x.size === 0 || y.size === 0) return 0;
  let s = 0;
  for (const k of x) if (y.has(k)) s++;
  return s / (x.size + y.size - s);
}

export type Calon = { baris: BarisBanding; skor: number };

/** Baris 'hilang' pada RO yang sama dengan baris 'baru', terbaik dulu (kemiripan uraian, akun sama, lalu jumlah terdekat). */
export function calonPadan(baru: BarisBanding, semua: BarisBanding[]): Calon[] {
  return semua
    .filter((h) => h.status === "hilang" && h.ro_kode === baru.ro_kode && h.detail_id !== null)
    .map((h) => ({ baris: h, skor: kemiripan(baru.uraian_baru, h.uraian_lama) + (h.akun_kode === baru.akun_kode ? 0.25 : 0) }))
    .sort((a, b) => b.skor - a.skor || Math.abs(n(a.baris.jumlah_lama) - n(baru.jumlah_baru)) - Math.abs(n(b.baris.jumlah_lama) - n(baru.jumlah_baru)));
}

// ---------- keputusan ----------
export type KesiapanTerima = { blok: string | null; peringatan: string[] };

/** `jenisJadwal` = jenis jadwal dasar unggahan (null bila tanpa jadwal). Revisi pok/administrasi mempertahankan pagu satker, jadi total harus sama (mencerminkan keu_pok_unggah_terima). */
export function kesiapanTerima(r: RingkasUnggah | null, jumlahBaris: number, jenisJadwal: string | null = null): KesiapanTerima {
  const peringatan: string[] = [];
  if (!r) return { blok: "Ringkasan pencocokan belum dimuat.", peringatan };
  if (r.status !== "diunggah") return { blok: "Unggahan ini sudah diputuskan.", peringatan };
  if (jumlahBaris <= 0 || n(r.n_baris) <= 0) return { blok: "Unggahan belum berisi baris (pengiriman isi terputus). Tolak lalu unggah ulang.", peringatan };
  if (n(r.n_ro_tak_terdaftar) > 0) return { blok: `${n(r.n_ro_tak_terdaftar)} RO pada PDF belum terdaftar di sistem. Daftarkan RO itu lebih dulu (Struktur dan master).`, peringatan };
  const selisihTotal = n(r.total_unggah) - n(r.total_berlaku);
  if (selisihTotal !== 0) {
    const arah = selisihTotal > 0 ? "lebih" : "kurang";
    if (jenisJadwal === "pok" || jenisJadwal === "administrasi") return { blok: `Revisi ${jenisJadwal === "pok" ? "POK" : "administrasi"} mempertahankan pagu satker, tetapi total PDF ${arah} dari POK berlaku. Periksa berkasnya atau tolak.`, peringatan };
    peringatan.push(`Total PDF ${arah} dari POK berlaku. Tanpa jadwal revisi POK/administrasi, sistem tidak memeriksa kesamaan total; pastikan perubahan pagu ini memang sah (DIPA).`);
  }
  if (n(r.n_di_luar_usulan) > 0) peringatan.push(`${n(r.n_di_luar_usulan)} perubahan tidak ada dalam usulan RO yang disetujui.`);
  if (n(r.n_baru) > 0 || n(r.n_hilang) > 0) peringatan.push(`${n(r.n_baru)} baris baru dan ${n(r.n_hilang)} baris hilang belum dipadankan; riwayat RAB hanya mengikuti baris yang dipadankan.`);
  return { blok: null, peringatan };
}
