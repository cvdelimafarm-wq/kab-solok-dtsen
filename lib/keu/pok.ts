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
export function kesiapanTerima(r: RingkasUnggah | null, jumlahBaris: number, jenisJadwal: string | null = null, keputusan: KeputusanUnggah | null = null): KesiapanTerima {
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
  if (keputusan && n(keputusan.n_ditanyakan) > 0) return { blok: `${n(keputusan.n_ditanyakan)} baris masih ditandai ditanyakan. Putuskan (pakai angka berkas) atau tolak unggahan.`, peringatan };
  if (keputusan && n(keputusan.n_menunggu) > 0) peringatan.push(`${n(keputusan.n_menunggu)} baris selisih belum diputuskan operator; bila diterima, angka pada berkas dipakai untuk semuanya.`);
  if (n(r.n_di_luar_usulan) > 0) peringatan.push(`${n(r.n_di_luar_usulan)} perubahan tidak ada dalam usulan RO yang disetujui.`);
  if (n(r.n_baru) > 0 || n(r.n_hilang) > 0) peringatan.push(`${n(r.n_baru)} baris baru dan ${n(r.n_hilang)} baris hilang belum dipadankan; riwayat RAB hanya mengikuti baris yang dipadankan.`);
  return { blok: null, peringatan };
}

// ---------- papan 6: pencocokan dengan usulan dan keputusan operator (keu_v_pok_banding_rinci, 20261024s) ----------
export type TandaBaris = "belum" | "pakai" | "ditanyakan";
export type BarisRinci = BarisBanding & {
  jadwal_id: number | string | null; kunci: string | null; kunci_padan: string | null; jumlah_usulan: number | string | null;
  sesuai_usulan: boolean | null; tanda: TandaBaris; tanda_catatan: string; otomatis: boolean;
};
export type KeputusanUnggah = {
  unggah_id: number; n_otomatis: number | string; n_menunggu: number | string; n_pakai: number | string; n_ditanyakan: number | string; n_di_luar_usulan: number | string;
};

export type Saringan = "perlu" | "semua" | "sama" | "berubah" | "baru" | "hilang" | "dipadankan" | "luar";
export const URUTAN_SARINGAN: Saringan[] = ["perlu", "semua", "sama", "berubah", "baru", "hilang", "dipadankan", "luar"];
export const LABEL_SARINGAN: Record<Saringan, string> = {
  perlu: "Perlu keputusan", semua: "Semua", sama: "Sama", berubah: "Berubah", baru: "Baru", hilang: "Hilang", dipadankan: "Dipadankan", luar: "Di luar usulan",
};

/** Baris selisih yang belum selesai diputuskan: bukan sama, tidak otomatis diterima, dan operator belum memilih 'pakai angka berkas'. */
export const perluKeputusan = (b: BarisRinci): boolean => b.status !== "sama" && !b.otomatis && b.tanda !== "pakai";

export function cocokSaringan(b: BarisRinci, s: Saringan): boolean {
  if (s === "semua") return true;
  if (s === "perlu") return perluKeputusan(b);
  if (s === "luar") return b.sesuai_usulan === false;
  return b.status === s;
}

export function hitungSaringan(baris: BarisRinci[]): Record<Saringan, number> {
  const h: Record<Saringan, number> = { perlu: 0, semua: baris.length, sama: 0, berubah: 0, baru: 0, hilang: 0, dipadankan: 0, luar: 0 };
  for (const b of baris) {
    h[b.status] += 1;
    if (perluKeputusan(b)) h.perlu += 1;
    if (b.sesuai_usulan === false) h.luar += 1;
  }
  return h;
}

/** Selisih angka berkas terhadap usulan (Menjadi); null bila tidak ada pembanding usulan. */
export function selisihUsulan(b: BarisRinci): number | null {
  if (b.jumlah_usulan === null || b.jumlah_usulan === undefined) return null;
  if (b.status === "hilang") return null;
  return n(b.jumlah_baru) - n(b.jumlah_usulan);
}

/** Kolom Catatan papan 6: menjelaskan mengapa baris itu diberi status tersebut. */
export function catatanBaris(b: BarisRinci): string {
  const adaUsulan = b.jadwal_id !== null && b.jadwal_id !== undefined;
  switch (b.status) {
    case "sama": return "";
    case "dipadankan": return `dipadankan PPK dengan baris lama${b.kunci_padan ? ` (${b.kunci_padan})` : ""}`;
    case "baru":
      if (!adaUsulan) return "baris baru pada berkas; kunci baris baru diberikan";
      return b.sesuai_usulan ? "kunci baris baru diberikan; sesuai usulan" : "baris baru pada berkas yang tidak ada dalam usulan";
    case "hilang":
      if (!adaUsulan) return "tidak ada pada berkas";
      return b.sesuai_usulan ? "dikosongkan atau dipindah sesuai usulan" : "tidak ada pada berkas dan tidak dikosongkan dalam usulan";
    default: {
      if (!adaUsulan) return "angka pada berkas berbeda dari POK sistem";
      if (b.sesuai_usulan) return "angka pada berkas sama dengan usulan";
      const d = selisihUsulan(b);
      return d === null ? "tidak ada baris usulan untuk item ini" : `angka pada berkas beda Rp ${Math.abs(d).toLocaleString("id-ID")} dari usulan (pembulatan?)`;
    }
  }
}

/** Kolom Keputusan operator papan 6 (teks tetap bila tidak ada tombol). */
export function teksKeputusan(b: BarisRinci): string {
  if (b.status === "sama") return "Tidak perlu";
  if (b.tanda === "pakai") return "Pakai angka berkas";
  if (b.tanda === "ditanyakan") return "Ditanyakan";
  if (b.status === "dipadankan") return "Dipadankan PPK";
  if (b.otomatis) return b.status === "baru" ? "Kunci baris baru diberikan" : "Diterima otomatis";
  return "Menunggu keputusan operator";
}

export const argsTandai = (unggah: number, kunci: string, tanda: TandaBaris, catatan = ""): Record<string, unknown> => ({ p_unggah: unggah, p_kunci: kunci, p_tanda: tanda, p_catatan: catatan });
export const argsTandaiSemua = (unggah: number): Record<string, unknown> => ({ p_unggah: unggah });
