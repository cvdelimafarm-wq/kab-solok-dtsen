// lib/delego/skor.ts
//
// (1 Nov 2026) Skor beban kerja: konversi poin dan menit, pembanding kesetaraan (satuan sama) saat skor diketik, dan kertas kerja perhitungan beban.
// Berkas MURNI (tanpa jaringan). Yang memutuskan tetap basis data (20261101zb: keu_dlg_skor_ajukan, keu_dlg_usul); berkas ini membuat layar menampilkan
// hal yang sama sebelum dikirim. 1 poin = MENIT_KERJA_HARIAN / KAPASITAS_HARIAN menit kerja (kini 450 / 75 = 6 menit).

import { KAPASITAS_HARIAN, angka, bulat } from "./hitung";
import { MENIT_KERJA_HARIAN, menitDariPoin } from "./teknis";
import type { JenisSkor, Laporan } from "./tipe";

/** Ambang peringatan: skor lebih dari 2 kali atau kurang dari separuh median pekerjaan bersatuan sama. Sama dengan fungsi basis data. */
export const AMBANG_SKOR = { atas: 2, bawah: 0.5 } as const;
export const MINIMAL_ALASAN_SKOR = 10;
/** Waktu nyata menyimpang lebih dari 25% dari perkiraan kertas kerja = skor ditandai untuk ditinjau (tidak berubah otomatis). */
export const AMBANG_KALIBRASI = 0.25;

export const poinDariMenit = (menit: number): number => (menit / MENIT_KERJA_HARIAN) * KAPASITAS_HARIAN;

const fmtId = (n: number, desimal = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: desimal }).format(n);

export function median(x: number[]): number | null {
  const v = x.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const t = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[t] : (v[t - 1] + v[t]) / 2;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pembanding kesetaraan
// ---------------------------------------------------------------------------------------------------------------------
type Pembanding = Pick<JenisSkor, "id" | "nama" | "satuan" | "poin_per_satuan" | "aktif" | "skor_status">;
export type Setara = { id: number; nama: string; satuan: string; poin: number; menit: number };
export type HasilBanding = {
  /** Banyak pekerjaan bersatuan sama yang sudah disetujui dan aktif. */
  n: number;
  median: number | null;
  rasio: number | null;
  setara: Setara[];
  peringatan: "tinggi" | "rendah" | null;
  perluAlasan: boolean;
  menit: number;
  pesan: string;
};

const samaSatuan = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Membandingkan skor yang sedang diketik dengan pekerjaan lain bersatuan sama (hanya yang disetujui dan aktif). */
export function bandingSkor(katalog: Pembanding[], satuan: string, poin: number, kecualiId: number | null = null): HasilBanding {
  const menit = menitDariPoin(Number.isFinite(poin) ? poin : 0);
  const sejenis = katalog.filter((j) => j.aktif && j.skor_status === "disetujui" && j.id !== kecualiId && samaSatuan(j.satuan, satuan) && angka(j.poin_per_satuan) > 0);
  const med = median(sejenis.map((j) => angka(j.poin_per_satuan)));
  const setara: Setara[] = [...sejenis]
    .sort((a, b) => Math.abs(angka(a.poin_per_satuan) - poin) - Math.abs(angka(b.poin_per_satuan) - poin) || a.id - b.id)
    .slice(0, 3)
    .map((j) => ({ id: j.id, nama: j.nama, satuan: j.satuan, poin: angka(j.poin_per_satuan), menit: menitDariPoin(angka(j.poin_per_satuan)) }));
  if (med === null || med <= 0 || !(poin > 0)) {
    return {
      n: sejenis.length, median: med, rasio: null, setara, peringatan: null, perluAlasan: false, menit,
      pesan: poin > 0 ? `Belum ada pekerjaan bersatuan ${satuan || "yang sama"} sebagai pembanding. Skor ini setara ${fmtId(menit, 0)} menit kerja per ${satuan || "satuan"}.` : "",
    };
  }
  const rasio = bulat(poin / med, 2);
  const peringatan = rasio > AMBANG_SKOR.atas ? "tinggi" : rasio < AMBANG_SKOR.bawah ? "rendah" : null;
  let pesan = `Skor ini setara ${fmtId(menit, 0)} menit per ${satuan}, sekitar ${fmtId(rasio, 1)} kali median pekerjaan sejenis (${fmtId(med, 1)} poin).`;
  if (peringatan === "tinggi") pesan = `Skor ${fmtId(poin, 1)} poin per ${satuan} sekitar ${fmtId(rasio, 1)} kali median pekerjaan sejenis (${fmtId(med, 1)} poin), setara ${fmtId(menit, 0)} menit per ${satuan}. Jelaskan alasannya.`;
  if (peringatan === "rendah") pesan = `Skor ${fmtId(poin, 1)} poin per ${satuan} kurang dari separuh median pekerjaan sejenis (${fmtId(med, 1)} poin), setara ${fmtId(menit, 0)} menit per ${satuan}. Jelaskan alasannya.`;
  return { n: sejenis.length, median: med, rasio, setara, peringatan, perluAlasan: peringatan !== null, menit, pesan };
}

/** Alasan skor yang kurang bila peringatan menuntutnya; null = cukup. */
export const galatAlasanSkor = (b: HasilBanding, alasan: string): string | null =>
  b.perluAlasan && alasan.trim().length < MINIMAL_ALASAN_SKOR ? `Isi alasan skor (minimal ${MINIMAL_ALASAN_SKOR} huruf): skor berbeda jauh dari pekerjaan sejenis.` : null;

// ---------------------------------------------------------------------------------------------------------------------
// Kertas kerja perhitungan beban
// ---------------------------------------------------------------------------------------------------------------------
export type JenisKertas = "dokumen" | "keuangan" | "register" | "peta" | "susun" | "tetap";
export type KertasDokumen = { jenis: "dokumen"; halaman: number; persenIsi: number; pertanyaan: number; detik: number; tambahan: number };
export type KertasKeuangan = { jenis: "keuangan"; baris: number; menitBaris: number; persenTelusur: number; menitTelusur: number; tambahan: number };
export type KertasRegister = { jenis: "register"; record: number; persenSampel: number; menitRecord: number; persenTemuan: number; menitTindak: number; tambahan: number };
export type KertasPeta = { jenis: "peta"; sls: number; menitSls: number; persenVerifikasi: number; menitVerifikasi: number; tambahan: number };
export type KertasSusun = { jenis: "susun"; halaman: number; menitHalaman: number; revisi: number; tambahan: number };
export type KertasTetap = { jenis: "tetap"; durasi: number; persiapan: number; perjalanan: number };
export type KertasKerja = KertasDokumen | KertasKeuangan | KertasRegister | KertasPeta | KertasSusun | KertasTetap;

export const JENIS_KERTAS: readonly JenisKertas[] = ["dokumen", "keuangan", "register", "peta", "susun", "tetap"];
export const NAMA_KERTAS: Record<JenisKertas, string> = {
  dokumen: "Memeriksa dokumen kuesioner",
  keuangan: "Memeriksa laporan keuangan",
  register: "Memeriksa data register",
  peta: "Memeriksa peta atau SLS",
  susun: "Menyusun dokumen (KAK, laporan)",
  tetap: "Rapat, pelatihan, perjalanan",
};
/** Satuan hasil yang disarankan per jenis (satu kertas kerja menghitung SATU satuan). */
export const SATUAN_KERTAS: Record<JenisKertas, string> = { dokumen: "dokumen", keuangan: "laporan", register: "register", peta: "peta", susun: "dokumen", tetap: "kali" };

/**
 * Nilai bawaan parameter. Ini ANGKA ILUSTRASI yang belum dikalibrasi dari pengamatan nyata; di aplikasi nilai bawaan boleh diubah pengusul dan
 * (usulan) disimpan sebagai data kebijakan. Hasilnya hanya usulan skor, bukan keputusan.
 */
export const BAWAAN_KERTAS: Record<JenisKertas, KertasKerja> = {
  dokumen: { jenis: "dokumen", halaman: 24, persenIsi: 50, pertanyaan: 20, detik: 5, tambahan: 25 },
  keuangan: { jenis: "keuangan", baris: 60, menitBaris: 0.5, persenTelusur: 20, menitTelusur: 3, tambahan: 20 },
  register: { jenis: "register", record: 200, persenSampel: 20, menitRecord: 2, persenTemuan: 10, menitTindak: 5, tambahan: 20 },
  peta: { jenis: "peta", sls: 10, menitSls: 6, persenVerifikasi: 20, menitVerifikasi: 20, tambahan: 20 },
  susun: { jenis: "susun", halaman: 10, menitHalaman: 30, revisi: 1, tambahan: 15 },
  tetap: { jenis: "tetap", durasi: 120, persiapan: 30, perjalanan: 0 },
};

export type HasilKertas = { menit: number; skor: number; skorUsul: number; rincian: { label: string; nilai: string }[]; galat: string | null };

const bukanAngka = (...x: number[]) => x.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0);
const lebih100 = (...x: number[]) => x.some((n) => n > 100);

/** Pembulatan usulan: kurang dari 1 poin satu desimal; 1 sampai 10 kelipatan 0,5; di atas 10 bilangan bulat. */
export function bulatkanSkor(skor: number): number {
  if (!(skor > 0)) return 0;
  if (skor < 1) return Math.max(0.1, bulat(skor, 1));
  if (skor < 10) return Math.round(skor * 2) / 2;
  return Math.round(skor);
}

const dengan = (menitDasar: number, tambahan: number) => menitDasar * (1 + tambahan / 100);

export function hitungKertas(k: KertasKerja): HasilKertas {
  const hasil = (menit: number, rincian: { label: string; nilai: string }[]): HasilKertas => {
    const skor = poinDariMenit(menit);
    return { menit: bulat(menit, 1), skor: bulat(skor, 2), skorUsul: bulatkanSkor(skor), rincian, galat: null };
  };
  const galat = (pesan: string): HasilKertas => ({ menit: 0, skor: 0, skorUsul: 0, rincian: [], galat: pesan });
  const f = (n: number, d = 1) => fmtId(n, d);

  switch (k.jenis) {
    case "dokumen": {
      if (bukanAngka(k.halaman, k.persenIsi, k.pertanyaan, k.detik, k.tambahan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (lebih100(k.persenIsi)) return galat("Persen halaman berisi isian paling banyak 100.");
      if (k.halaman <= 0) return galat("Halaman per dokumen harus lebih dari 0.");
      const terisi = (k.halaman * k.persenIsi) / 100;
      const pertanyaan = terisi * k.pertanyaan;
      const menitIsi = (pertanyaan * k.detik) / 60;
      return hasil(dengan(menitIsi, k.tambahan), [
        { label: "Halaman berisi isian", nilai: `${f(terisi)} halaman` },
        { label: "Pertanyaan diperiksa", nilai: `${f(pertanyaan, 0)} pertanyaan` },
        { label: "Waktu pemeriksaan", nilai: `${f(menitIsi)} menit` },
        { label: "Dengan beban tambahan", nilai: `${f(dengan(menitIsi, k.tambahan))} menit` },
      ]);
    }
    case "keuangan": {
      if (bukanAngka(k.baris, k.menitBaris, k.persenTelusur, k.menitTelusur, k.tambahan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (lebih100(k.persenTelusur)) return galat("Persen baris ditelusuri paling banyak 100.");
      if (k.baris <= 0) return galat("Jumlah baris transaksi harus lebih dari 0.");
      const telusur = (k.baris * k.persenTelusur) / 100;
      const dasar = k.baris * k.menitBaris + telusur * k.menitTelusur;
      return hasil(dengan(dasar, k.tambahan), [
        { label: "Baris diperiksa", nilai: `${f(k.baris, 0)} baris` },
        { label: "Baris ditelusuri ke bukti", nilai: `${f(telusur)} baris` },
        { label: "Waktu dasar", nilai: `${f(dasar)} menit` },
        { label: "Dengan beban tambahan", nilai: `${f(dengan(dasar, k.tambahan))} menit` },
      ]);
    }
    case "register": {
      if (bukanAngka(k.record, k.persenSampel, k.menitRecord, k.persenTemuan, k.menitTindak, k.tambahan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (lebih100(k.persenSampel, k.persenTemuan)) return galat("Persen sampel dan persen temuan paling banyak 100.");
      if (k.record <= 0) return galat("Jumlah record harus lebih dari 0.");
      const sampel = (k.record * k.persenSampel) / 100;
      const temuan = (sampel * k.persenTemuan) / 100;
      const dasar = sampel * k.menitRecord + temuan * k.menitTindak;
      return hasil(dengan(dasar, k.tambahan), [
        { label: "Record disampel", nilai: `${f(sampel)} record` },
        { label: "Temuan ditindaklanjuti", nilai: `${f(temuan)} record` },
        { label: "Waktu dasar", nilai: `${f(dasar)} menit` },
        { label: "Dengan beban tambahan", nilai: `${f(dengan(dasar, k.tambahan))} menit` },
      ]);
    }
    case "peta": {
      if (bukanAngka(k.sls, k.menitSls, k.persenVerifikasi, k.menitVerifikasi, k.tambahan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (lebih100(k.persenVerifikasi)) return galat("Persen verifikasi lapangan paling banyak 100.");
      if (k.sls <= 0) return galat("Jumlah SLS harus lebih dari 0.");
      const verif = (k.sls * k.persenVerifikasi) / 100;
      const dasar = k.sls * k.menitSls + verif * k.menitVerifikasi;
      return hasil(dengan(dasar, k.tambahan), [
        { label: "SLS diperiksa", nilai: `${f(k.sls, 0)} SLS` },
        { label: "SLS diverifikasi lapangan", nilai: `${f(verif)} SLS` },
        { label: "Waktu dasar", nilai: `${f(dasar)} menit` },
        { label: "Dengan beban tambahan", nilai: `${f(dengan(dasar, k.tambahan))} menit` },
      ]);
    }
    case "susun": {
      if (bukanAngka(k.halaman, k.menitHalaman, k.revisi, k.tambahan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (k.halaman <= 0) return galat("Jumlah halaman harus lebih dari 0.");
      const dasar = k.halaman * k.menitHalaman * (1 + k.revisi);
      return hasil(dengan(dasar, k.tambahan), [
        { label: "Waktu menulis", nilai: `${f(k.halaman * k.menitHalaman)} menit` },
        { label: "Dengan putaran revisi", nilai: `${f(dasar)} menit` },
        { label: "Dengan beban tambahan", nilai: `${f(dengan(dasar, k.tambahan))} menit` },
      ]);
    }
    case "tetap": {
      if (bukanAngka(k.durasi, k.persiapan, k.perjalanan)) return galat("Semua isian harus angka 0 atau lebih.");
      if (k.durasi + k.persiapan + k.perjalanan <= 0) return galat("Isi minimal satu durasi.");
      const total = k.durasi + k.persiapan + k.perjalanan;
      return hasil(total, [
        { label: "Durasi", nilai: `${f(k.durasi, 0)} menit` },
        { label: "Persiapan dan perjalanan", nilai: `${f(k.persiapan + k.perjalanan, 0)} menit` },
      ]);
    }
  }
}

/** Membaca kertas kerja dari JSON basis data; bentuk yang tidak dikenal menghasilkan null. */
export function bacaKertas(x: unknown): KertasKerja | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  const jenis = o.jenis;
  if (typeof jenis !== "string" || !(JENIS_KERTAS as readonly string[]).includes(jenis)) return null;
  const dasar = BAWAAN_KERTAS[jenis as JenisKertas] as unknown as Record<string, unknown>;
  const hasil: Record<string, unknown> = { jenis };
  for (const [kunci, nilaiBawaan] of Object.entries(dasar)) {
    if (kunci === "jenis") continue;
    const n = typeof o[kunci] === "number" ? (o[kunci] as number) : Number.NaN;
    hasil[kunci] = Number.isFinite(n) && n >= 0 ? n : nilaiBawaan;
  }
  return hasil as unknown as KertasKerja;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kalibrasi dari waktu nyata
// ---------------------------------------------------------------------------------------------------------------------
export type HasilKalibrasi = { n: number; rata: number | null; selisih: number | null; menyimpang: boolean };

/** Menit nyata per satuan dari laporan yang memuat jam kerja nyata dan jumlah satuan. */
export function menitPerSatuan(laporan: Pick<Laporan, "jumlah" | "menit_nyata">[]): number[] {
  const hasil: number[] = [];
  for (const l of laporan) {
    const jumlah = angka(l.jumlah);
    const menit = typeof l.menit_nyata === "number" ? l.menit_nyata : 0;
    if (jumlah > 0 && menit > 0) hasil.push(menit / jumlah);
  }
  return hasil;
}

/** Membandingkan rata-rata menit nyata per satuan dengan perkiraan kertas kerja. Hanya menandai; skor tidak berubah otomatis. */
export function kalibrasi(menitPerkiraan: number, menitNyata: number[], ambang: number = AMBANG_KALIBRASI): HasilKalibrasi {
  const v = menitNyata.filter((n) => Number.isFinite(n) && n > 0);
  if (v.length === 0 || !(menitPerkiraan > 0)) return { n: v.length, rata: null, selisih: null, menyimpang: false };
  const rata = v.reduce((a, b) => a + b, 0) / v.length;
  const selisih = (rata - menitPerkiraan) / menitPerkiraan;
  return { n: v.length, rata: bulat(rata, 1), selisih: bulat(selisih, 3), menyimpang: Math.abs(selisih) > ambang };
}
