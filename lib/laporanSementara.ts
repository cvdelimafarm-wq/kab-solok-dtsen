// lib/laporanSementara.ts
//
// (30 Okt 2026) Tab "8 · Laporan" di Kelola Pendataan: Laporan Sementara PSP Pascabencana yang disusun otomatis dari database SIGAP.
// Logika murni (tanpa React/DB): memeriksa data mentah dari fungsi SQL sigap_laporan_sementara, menghitung laju dan perkiraan selesai,
// menyusun bagian laporan (satu struktur yang dipakai pratinjau layar DAN berkas unduhan Word), dan membuat berkas .doc (HTML yang dibuka Word).
// Narasi hanya memuat angka dan temuan yang bisa dihitung; uraian penilaian/rekomendasi ditulis penyusun di Word sesudah diunduh.

export const API_LAPORAN = "/api/portal/pendataan/laporan";

export type KecLaporan = {
  kecamatan: string;
  idn_sub_sls: number;
  idn_terdampak: number;
  idn_kk: number;
  sub_sls: number;
  sasaran: number;
  didata: number;
  terdampak: number;
  tidak_terdampak: number;
  tidak_ditemukan: number;
};
export type TesLaporan = { jenis: string; peserta: number; rata: number | null; ge80: number; lt60: number };
export type KelasLaporan = { kelas: number; pml: number; ppl: number; peserta: number; hadir: number };
/** Nilai satu petugas (PML/PPL) untuk lampiran: kehadiran pelatihan, pretest, posttest, QC Pemahaman (rata-rata percobaan pertama dan jumlah percobaan). */
export type PetugasNilai = { akun_id: number; nama: string; peran: string; kelas: number | null; hadir: boolean; pretest: number | null; posttest: number | null; qc_rata: number | null; qc_percobaan: number };

export type DataLaporan = {
  dibuat_at: string;
  kegiatan: { id: number; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null } | null;
  identifikasi: {
    isian_jorong: number; mitra: number; nagari: number; kecamatan: number; sub_sls_diisi: number; sub_sls_tidak_terdampak: number; pml_pengisi: number;
    kk_terdampak: number; rusak_berat: number; rusak_sedang: number; rusak_ringan: number; lahan_tertimbun: number; kekeringan: number;
    aset_usaha: number; lahan_ternak: number; korban: number;
  };
  petugas: Record<string, number>;
  wilayah_kerja: { sub_sls: number; keluarga_daftar: number; keluarga_tambahan: number };
  pendataan: { sasaran: number; didata: number; terdampak: number; tidak_terdampak: number; tidak_ditemukan: number; hari_pertama: string | null; harian: { tgl: string; n: number }[] };
  kecamatan: KecLaporan[];
  pelatihan: { tes: TesLaporan[]; kelas: KelasLaporan[]; hadir: number };
  dokumentasi: { foto: number; petugas: number };
  qc: { percobaan: number; petugas: number; rata_pertama: number | null };
  petugas_nilai: PetugasNilai[];
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan data mentah
// ---------------------------------------------------------------------------------------------------------------------------------

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const teks = (v: unknown): string => (typeof v === "string" ? v : "");
const tglIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Data mentah (jsonb dari fungsi SQL) -> DataLaporan. Nilai hilang/rusak menjadi 0 / null / kosong; tidak pernah melempar galat. */
export function bacaDataLaporan(mentah: unknown): DataLaporan {
  const r = rec(mentah);
  const idn = rec(r.identifikasi);
  const pen = rec(r.pendataan);
  const wk = rec(r.wilayah_kerja);
  const pel = rec(r.pelatihan);
  const dok = rec(r.dokumentasi);
  const qc = rec(r.qc);
  const keg = rec(r.kegiatan);
  const petugas: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(r.petugas))) petugas[k] = num(v);
  return {
    dibuat_at: teks(r.dibuat_at),
    kegiatan: r.kegiatan ? { id: num(keg.id), nama: teks(keg.nama), tanggal_mulai: tglIso(keg.tanggal_mulai), tanggal_selesai: tglIso(keg.tanggal_selesai) } : null,
    identifikasi: {
      isian_jorong: num(idn.isian_jorong), mitra: num(idn.mitra), nagari: num(idn.nagari), kecamatan: num(idn.kecamatan),
      sub_sls_diisi: num(idn.sub_sls_diisi), sub_sls_tidak_terdampak: num(idn.sub_sls_tidak_terdampak), pml_pengisi: num(idn.pml_pengisi),
      kk_terdampak: num(idn.kk_terdampak), rusak_berat: num(idn.rusak_berat), rusak_sedang: num(idn.rusak_sedang), rusak_ringan: num(idn.rusak_ringan),
      lahan_tertimbun: num(idn.lahan_tertimbun), kekeringan: num(idn.kekeringan), aset_usaha: num(idn.aset_usaha), lahan_ternak: num(idn.lahan_ternak), korban: num(idn.korban),
    },
    petugas,
    wilayah_kerja: { sub_sls: num(wk.sub_sls), keluarga_daftar: num(wk.keluarga_daftar), keluarga_tambahan: num(wk.keluarga_tambahan) },
    pendataan: {
      sasaran: num(pen.sasaran), didata: num(pen.didata), terdampak: num(pen.terdampak), tidak_terdampak: num(pen.tidak_terdampak), tidak_ditemukan: num(pen.tidak_ditemukan),
      hari_pertama: tglIso(pen.hari_pertama),
      harian: arr(pen.harian)
        .map((h) => ({ tgl: tglIso(rec(h).tgl) ?? "", n: num(rec(h).n) }))
        .filter((h) => h.tgl !== "")
        .sort((a, b) => (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0)),
    },
    kecamatan: arr(r.kecamatan).map((k) => {
      const o = rec(k);
      return {
        kecamatan: teks(o.kecamatan), idn_sub_sls: num(o.idn_sub_sls), idn_terdampak: num(o.idn_terdampak), idn_kk: num(o.idn_kk), sub_sls: num(o.sub_sls), sasaran: num(o.sasaran),
        didata: num(o.didata), terdampak: num(o.terdampak), tidak_terdampak: num(o.tidak_terdampak), tidak_ditemukan: num(o.tidak_ditemukan),
      };
    }),
    pelatihan: {
      tes: arr(pel.tes).map((t) => {
        const o = rec(t);
        return { jenis: teks(o.jenis), peserta: num(o.peserta), rata: numOrNull(o.rata), ge80: num(o.ge80), lt60: num(o.lt60) };
      }),
      kelas: arr(pel.kelas).map((k) => {
        const o = rec(k);
        return { kelas: num(o.kelas), pml: num(o.pml), ppl: num(o.ppl), peserta: num(o.peserta), hadir: num(o.hadir) };
      }),
      hadir: num(pel.hadir),
    },
    dokumentasi: { foto: num(dok.foto), petugas: num(dok.petugas) },
    qc: { percobaan: num(qc.percobaan), petugas: num(qc.petugas), rata_pertama: numOrNull(qc.rata_pertama) },
    petugas_nilai: arr(r.petugas_nilai).map((x) => {
      const o = rec(x);
      return {
        akun_id: num(o.akun_id), nama: teks(o.nama), peran: teks(o.peran), kelas: numOrNull(o.kelas), hadir: o.hadir === true,
        pretest: numOrNull(o.pretest), posttest: numOrNull(o.posttest), qc_rata: numOrNull(o.qc_rata), qc_percobaan: num(o.qc_percobaan),
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Format angka dan tanggal (tanpa Intl supaya hasilnya sama di server, browser, dan uji)
// ---------------------------------------------------------------------------------------------------------------------------------

/** 15911 -> "15.911" */
export const fmtAngka = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** 66.62 -> "66,6" (satu desimal, koma desimal) */
export const fmtDesimal = (n: number, d = 1): string => {
  const f = Math.pow(10, d);
  const s = (Math.round(n * f) / f).toFixed(d).replace(".", ",");
  const [bulat, pecah] = s.split(",");
  return (pecah ? `${fmtAngka(Number(bulat))},${pecah}` : fmtAngka(Number(bulat))).replace(/^-0(?=,|$)/, "0");
};
/** Persen dari bagian terhadap total, satu desimal; total 0 -> 0. */
export const persen = (bagian: number, total: number): number => (total > 0 ? (bagian / total) * 100 : 0);
export const fmtPersen = (bagian: number, total: number): string => fmtDesimal(persen(bagian, total), 1);

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-10-30" -> "30 Oktober 2026"; tidak sah -> "". */
export function tanggalIndo(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const b = Number(m[2]);
  if (b < 1 || b > 12) return "";
  return `${Number(m[3])} ${BULAN[b - 1]} ${m[1]}`;
}
/** "2026-10-30" -> "30 Okt" (untuk sumbu grafik). */
export function tanggalPendek(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1].slice(0, 3)}` : iso;
}
/** Tanggal (WIB) dari stempel waktu ISO UTC, mis. "2026-10-30T09:27:06Z" -> "2026-10-30"; "2026-10-30T20:00:00Z" -> "2026-10-31". */
export function tanggalWib(isoWaktu: string): string {
  const t = Date.parse(isoWaktu);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
}
/** Jam WIB "16:27" dari stempel waktu ISO. */
export function jamWib(isoWaktu: string): string {
  const t = Date.parse(isoWaktu);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 7 * 3600_000).toISOString().slice(11, 16);
}
export function tambahHari(iso: string, hari: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + hari * 86_400_000).toISOString().slice(0, 10) : "";
}
/** "X KOTO SINGKARAK" -> "X Koto Singkarak"; angka Romawi tetap kapital. */
export function judulKecamatan(nama: string): string {
  return nama
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/^[ivx]+$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Laju dan perkiraan selesai
// ---------------------------------------------------------------------------------------------------------------------------------

export type Proyeksi = {
  /** KK per hari, rata-rata hari-hari LENGKAP terakhir (maks 7; hari berjalan tidak dihitung). */
  laju: number;
  hariDipakai: number;
  sisa: number;
  /** Hari lagi sampai semua sasaran berstatus; null bila laju 0 atau tidak ada sisa. */
  hariLagi: number | null;
  /** Tanggal perkiraan selesai (ISO); null bila tidak bisa diperkirakan. */
  tanggal: string | null;
  /** Tanggal perkiraan rentang (laju -20% .. +20%), untuk kalimat "sekitar a-b" */
  tanggalCepat: string | null;
  tanggalLambat: string | null;
};

export function hitungProyeksi(d: DataLaporan): Proyeksi {
  const hariIni = tanggalWib(d.dibuat_at);
  const lengkap = d.pendataan.harian.filter((h) => h.tgl < hariIni).slice(-7);
  const total = lengkap.reduce((s, h) => s + h.n, 0);
  const laju = lengkap.length > 0 ? total / lengkap.length : 0;
  const sisa = Math.max(0, d.pendataan.sasaran - d.pendataan.didata);
  if (sisa === 0 || laju <= 0 || !hariIni) return { laju, hariDipakai: lengkap.length, sisa, hariLagi: null, tanggal: null, tanggalCepat: null, tanggalLambat: null };
  const hariLagi = Math.ceil(sisa / laju);
  // Hari berjalan masih bekerja: hitung dari hari ini, hari ini dihitung nol (konservatif) agar perkiraan tidak terlalu optimis.
  return {
    laju,
    hariDipakai: lengkap.length,
    sisa,
    hariLagi,
    tanggal: tambahHari(hariIni, hariLagi),
    tanggalCepat: tambahHari(hariIni, Math.ceil(sisa / (laju * 1.2))),
    tanggalLambat: tambahHari(hariIni, Math.ceil(sisa / (laju * 0.8))),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Struktur laporan: bab -> elemen berid. Setiap bab dan elemen bisa dicentang tampil/tidak (OpsiLaporan).
// ---------------------------------------------------------------------------------------------------------------------------------

export type TabelLaporan = {
  judul?: string;
  kepala: string[];
  baris: string[][];
  /** Baris jumlah / rata-rata (ditebalkan), opsional. */
  jumlah?: string[];
  /** Rata kolom: "k" kiri, "n" kanan (angka). */
  rata: ("k" | "n")[];
};
export type BatangLaporan = { judul: string; satuan: string; data: { label: string; nilai: number }[] };

/** Foto pilihan penyusun untuk Lampiran B: `id` = sigap_dokumentasi.id, `ket` = keterangan di bawah foto (disusun lib/laporanFoto.ts). */
export type FotoLaporan = { id: number; ket: string };
export type OpsiFotoLaporan = { daftar: FotoLaporan[]; perBaris: 2 | 3 };

type ElemenDasar = {
  /** Kode unik "bab.elemen", dipakai kunci centang. */
  id: string;
  /** Nama yang tampil di daftar centang. */
  label: string;
  /** Bila diisi: elemen ikut tersembunyi saat bab ini disembunyikan (kecuali dicentang eksplisit). Dipakai butir ringkasan. */
  ikutBab?: string;
};
export type Elemen =
  | (ElemenDasar & { jenis: "paragraf"; teks: string })
  | (ElemenDasar & { jenis: "butir"; butir: string[] })
  | (ElemenDasar & { jenis: "tabel"; tabel: TabelLaporan })
  | (ElemenDasar & { jenis: "batang"; batang: BatangLaporan })
  | (ElemenDasar & { jenis: "foto"; foto: FotoLaporan[]; perBaris: 2 | 3 })
  | (ElemenDasar & { jenis: "catatan"; teks: string });

export type BagianLaporan = {
  kode: string;
  /** Judul tanpa nomor ("Perencanaan: ..."). */
  judul: string;
  /** Lampiran diberi huruf (Lampiran A), bab biasa diberi angka; "ringkasan" tanpa nomor. */
  jenis: "ringkasan" | "bab" | "lampiran";
  elemen: Elemen[];
  sumber?: string;
  /** Diisi saat penomoran: "1. Perencanaan: ...", "Lampiran A. Nilai ...", atau judul polos. */
  judulTampil?: string;
  /** "1", "A", atau "" (tanpa nomor). */
  nomor?: string;
};
export type Laporan = {
  judul: string;
  subjudul: string;
  nama: string;
  tanggal: string;
  /** Hanya bab dan elemen yang dicentang, sudah bernomor. */
  bagian: BagianLaporan[];
  /** Seluruh bab dan elemen (tanpa saringan), untuk daftar centang di layar. */
  semua: BagianLaporan[];
};

/** Kolom yang boleh ditampilkan pada lampiran nilai per petugas. */
export type KolomNilai = { kelas: boolean; hadir: boolean; pretest: boolean; posttest: boolean; qc: boolean; percobaan: boolean };
export type UrutNilai = "peran" | "nama" | "posttest" | "qc";
export type PeranNilai = "semua" | "pml" | "ppl";

export type OpsiLaporan = {
  /** Kosong = judul bawaan. */
  judul: string;
  /** Kosong = tidak ditulis. */
  penyusun: string;
  /** Kode bab -> tampil. Tidak ada = nilai bawaan (BAB_BAWAAN). */
  bab: Record<string, boolean>;
  /** id elemen -> tampil. Tidak ada = tampil. */
  elemen: Record<string, boolean>;
  kolomNilai: KolomNilai;
  urutNilai: UrutNilai;
  peranNilai: PeranNilai;
  /** Kode bab -> catatan penyusun (teks bebas; baris kosong memisah paragraf). */
  catatan: Record<string, string>;
  /** Berkas Word: daftar isi otomatis dan nomor halaman otomatis. */
  daftarIsi: boolean;
  nomorHalaman: boolean;
};

/** Bab yang bawaannya tidak tampil. */
export const BAB_BAWAAN_MATI: string[] = ["lampiranFoto"];

export const OPSI_AWAL: OpsiLaporan = {
  judul: "",
  penyusun: "",
  bab: {},
  elemen: {},
  kolomNilai: { kelas: true, hadir: true, pretest: true, posttest: true, qc: true, percobaan: true },
  urutNilai: "peran",
  peranNilai: "semua",
  catatan: {},
  daftarIsi: true,
  nomorHalaman: true,
};

export const babTampil = (o: OpsiLaporan, kode: string): boolean => (kode in o.bab ? o.bab[kode] === true : !BAB_BAWAAN_MATI.includes(kode));

/** Elemen tampil? Centang eksplisit menang; bila belum pernah dicentang, elemen "ikut bab" mengikuti bab induknya, selain itu tampil. */
export function elemenTampil(o: OpsiLaporan, e: { id: string; ikutBab?: string }): boolean {
  if (e.id in o.elemen) return o.elemen[e.id] === true;
  return e.ikutBab ? babTampil(o, e.ikutBab) : true;
}

const bool = (v: unknown, awal: boolean): boolean => (typeof v === "boolean" ? v : awal);
const petaBool = (v: unknown): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(rec(v))) if (typeof x === "boolean" && k.length <= 60) out[k] = x;
  return out;
};

/** Opsi dari penyimpanan peramban (JSON tak tepercaya) -> OpsiLaporan sah. Nilai rusak diganti bawaan; tidak melempar galat. */
export function bacaOpsi(mentah: unknown): OpsiLaporan {
  const r = rec(mentah);
  const kn = rec(r.kolomNilai);
  const urut = r.urutNilai === "nama" || r.urutNilai === "posttest" || r.urutNilai === "qc" ? r.urutNilai : "peran";
  const peran = r.peranNilai === "pml" || r.peranNilai === "ppl" ? r.peranNilai : "semua";
  const catatan: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r.catatan))) if (typeof v === "string" && k.length <= 60) catatan[k] = v.slice(0, 5000);
  return {
    judul: teks(r.judul).slice(0, 200),
    penyusun: teks(r.penyusun).slice(0, 200),
    bab: petaBool(r.bab),
    elemen: petaBool(r.elemen),
    kolomNilai: {
      kelas: bool(kn.kelas, true), hadir: bool(kn.hadir, true), pretest: bool(kn.pretest, true), posttest: bool(kn.posttest, true), qc: bool(kn.qc, true), percobaan: bool(kn.percobaan, true),
    },
    urutNilai: urut,
    peranNilai: peran,
    catatan,
    daftarIsi: bool(r.daftarIsi, true),
    nomorHalaman: bool(r.nomorHalaman, true),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Temuan otomatis
// ---------------------------------------------------------------------------------------------------------------------------------

/** Kecamatan yang sudah didata kurang dari ambang persen (hanya yang sasarannya cukup besar supaya tidak mengejutkan karena angka kecil). */
export function kecamatanTertinggal(d: DataLaporan, ambang = 55, minSasaran = 300): { nama: string; persen: number }[] {
  return d.kecamatan
    .filter((k) => k.sasaran >= minSasaran && persen(k.didata, k.sasaran) < ambang)
    .map((k) => ({ nama: judulKecamatan(k.kecamatan), persen: persen(k.didata, k.sasaran) }))
    .sort((a, b) => a.persen - b.persen);
}

/** Temuan "yang perlu perhatian" yang bisa dihitung dari data (daftar kosong = tidak ada temuan otomatis). */
export function temuanPerhatian(d: DataLaporan): string[] {
  const out: string[] = [];
  const pre = d.pelatihan.tes.find((t) => t.jenis === "pretest");
  const pos = d.pelatihan.tes.find((t) => t.jenis === "posttest");
  if (pos && pos.peserta > 0 && pos.lt60 > 0) out.push(`Pemahaman peserta pasca pelatihan belum merata: ${fmtAngka(pos.lt60)} dari ${fmtAngka(pos.peserta)} peserta posttest bernilai di bawah 60.`);
  if (pre && pos && pre.rata != null && pos.rata != null && pos.rata < pre.rata) {
    out.push(`Rata-rata posttest (${fmtDesimal(pos.rata)}) lebih rendah daripada pretest (${fmtDesimal(pre.rata)}); soal dan waktu pengerjaan keduanya berbeda, sehingga perlu dibaca hati-hati.`);
  }
  const tertinggal = kecamatanTertinggal(d);
  if (tertinggal.length > 0) out.push(`Kecamatan dengan capaian pendataan di bawah 55 persen: ${tertinggal.map((t) => `${t.nama} (${fmtDesimal(t.persen)} persen)`).join(", ")}.`);
  const adaSasaranTanpaData = d.kecamatan.filter((k) => k.sasaran > 0 && k.didata === 0);
  if (adaSasaranTanpaData.length > 0) out.push(`Belum ada keluarga yang didata di ${adaSasaranTanpaData.map((k) => judulKecamatan(k.kecamatan)).join(", ")} (sasaran ${fmtAngka(adaSasaranTanpaData.reduce((s, k) => s + k.sasaran, 0))} keluarga).`);
  const p = hitungProyeksi(d);
  const akhir = d.kegiatan?.tanggal_selesai ?? null;
  if (p.tanggal && akhir && p.tanggal > akhir) out.push(`Dengan laju sekarang, pendataan diperkirakan selesai ${tanggalIndo(p.tanggal)}, melewati akhir periode kegiatan (${tanggalIndo(akhir)}).`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Lampiran nilai per petugas
// ---------------------------------------------------------------------------------------------------------------------------------

const nilaiTeks = (v: number | null): string => (v == null ? "-" : fmtDesimal(v));
const rataRata = (xs: (number | null)[]): number | null => {
  const ada = xs.filter((x): x is number => x != null);
  return ada.length ? ada.reduce((a, b) => a + b, 0) / ada.length : null;
};
const banding = (a: string, b: string): number => a.localeCompare(b, "id", { sensitivity: "base" });

/** Urutan baris lampiran. "peran": PML dulu lalu PPL, abjad; "nama": abjad; "posttest"/"qc": nilai tertinggi dulu (kosong di bawah), seri menurut nama. */
export function urutkanPetugas(daftar: PetugasNilai[], urut: UrutNilai): PetugasNilai[] {
  const nilai = (p: PetugasNilai): number | null => (urut === "posttest" ? p.posttest : p.qc_rata);
  return [...daftar].sort((a, b) => {
    if (urut === "peran") return (a.peran === b.peran ? 0 : a.peran === "pml" ? -1 : b.peran === "pml" ? 1 : banding(a.peran, b.peran)) || banding(a.nama, b.nama);
    if (urut === "nama") return banding(a.nama, b.nama);
    const x = nilai(a);
    const y = nilai(b);
    if (x == null && y == null) return banding(a.nama, b.nama);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || banding(a.nama, b.nama);
  });
}

/** Tabel nilai per petugas sesuai kolom/urutan/peran yang dipilih; null bila tidak ada petugas. Baris terakhir = rata-rata (jumlah kehadiran untuk kolom hadir). */
export function tabelNilaiPetugas(d: DataLaporan, o: OpsiLaporan): TabelLaporan | null {
  const daftar = urutkanPetugas(
    d.petugas_nilai.filter((p) => o.peranNilai === "semua" || p.peran === o.peranNilai),
    o.urutNilai,
  );
  if (daftar.length === 0) return null;
  const k = o.kolomNilai;
  const kolom: { kepala: string; rata: "k" | "n"; sel: (p: PetugasNilai) => string; ringkas: (xs: PetugasNilai[]) => string }[] = [
    { kepala: "Nama", rata: "k", sel: (p) => p.nama, ringkas: (xs) => `Rata-rata (${fmtAngka(xs.length)} petugas)` },
    { kepala: "Peran", rata: "k", sel: (p) => p.peran.toUpperCase(), ringkas: () => "" },
  ];
  if (k.kelas) kolom.push({ kepala: "Kelas", rata: "n", sel: (p) => (p.kelas == null ? "-" : String(p.kelas)), ringkas: () => "" });
  if (k.hadir) kolom.push({ kepala: "Hadir", rata: "k", sel: (p) => (p.hadir ? "Ya" : "Tidak"), ringkas: (xs) => `${fmtAngka(xs.filter((p) => p.hadir).length)} dari ${fmtAngka(xs.length)}` });
  if (k.pretest) kolom.push({ kepala: "Pretest", rata: "n", sel: (p) => nilaiTeks(p.pretest), ringkas: (xs) => nilaiTeks(rataRata(xs.map((p) => p.pretest))) });
  if (k.posttest) kolom.push({ kepala: "Posttest", rata: "n", sel: (p) => nilaiTeks(p.posttest), ringkas: (xs) => nilaiTeks(rataRata(xs.map((p) => p.posttest))) });
  if (k.qc) kolom.push({ kepala: "QC (percobaan pertama)", rata: "n", sel: (p) => nilaiTeks(p.qc_rata), ringkas: (xs) => nilaiTeks(rataRata(xs.map((p) => p.qc_rata))) });
  if (k.percobaan) kolom.push({ kepala: "Percobaan QC", rata: "n", sel: (p) => fmtAngka(p.qc_percobaan), ringkas: (xs) => fmtAngka(xs.reduce((s, p) => s + p.qc_percobaan, 0)) });
  return {
    judul: "Nilai pretest, posttest, dan QC Pemahaman per petugas",
    kepala: ["No", ...kolom.map((c) => c.kepala)],
    baris: daftar.map((p, i) => [String(i + 1), ...kolom.map((c) => c.sel(p))]),
    jumlah: ["", ...kolom.map((c) => c.ringkas(daftar))],
    rata: ["n", ...kolom.map((c) => c.rata)],
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Penyusunan
// ---------------------------------------------------------------------------------------------------------------------------------

const par = (id: string, label: string, teks: string, ikutBab?: string): Elemen => ({ id, label, jenis: "paragraf", teks, ikutBab });
const but = (id: string, label: string, butir: string[], ikutBab?: string): Elemen => ({ id, label, jenis: "butir", butir, ikutBab });
const tab = (id: string, label: string, tabel: TabelLaporan): Elemen => ({ id, label, jenis: "tabel", tabel });

/** Seluruh bab dan elemen laporan (tanpa saringan opsi, kecuali kolom/urutan/peran lampiran nilai). */
export function bangunBagian(d: DataLaporan, o: OpsiLaporan = OPSI_AWAL, foto?: OpsiFotoLaporan): BagianLaporan[] {
  const tanggal = tanggalIndo(tanggalWib(d.dibuat_at));
  const nama = d.kegiatan?.nama ?? "Pendataan Pascabencana";
  const pen = d.pendataan;
  const idn = d.identifikasi;
  const pml = d.petugas.pml ?? 0;
  const ppl = d.petugas.ppl ?? 0;
  const pro = hitungProyeksi(d);
  const pre = d.pelatihan.tes.find((t) => t.jenis === "pretest");
  const pos = d.pelatihan.tes.find((t) => t.jenis === "posttest");
  const pesertaKelas = d.pelatihan.kelas.reduce((s, k) => s + k.peserta, 0);
  const hadirKelas = d.pelatihan.kelas.reduce((s, k) => s + k.hadir, 0);
  const temuan = temuanPerhatian(d);
  const kelasUrut = [...d.pelatihan.kelas].sort((a, b) => a.kelas - b.kelas);
  const adaPelatihan = d.pelatihan.kelas.length > 0 || d.pelatihan.hadir > 0;

  const out: BagianLaporan[] = [];

  // ---- Ringkasan eksekutif: satu butir per topik, tiap butir bisa dicentang sendiri
  const rg: Elemen[] = [par("ringkasan.pengantar", "Kalimat pembuka", `Laporan ini memotret pelaksanaan ${nama} di Kabupaten Solok sampai ${tanggal}. Seluruh angka diambil dari database SIGAP pada tanggal tersebut.`)];
  rg.push(
    but("ringkasan.perencanaan", "Butir perencanaan", [
      `Perencanaan. Identifikasi mandiri lewat ${fmtAngka(idn.mitra)} mitra statistik menghasilkan ${fmtAngka(idn.isian_jorong)} isian jorong di ${fmtAngka(idn.nagari)} nagari pada ${fmtAngka(idn.kecamatan)} kecamatan; PML mengidentifikasi ${fmtAngka(idn.sub_sls_diisi)} Sub SLS dengan ${fmtAngka(idn.kk_terdampak)} keluarga terdampak.`,
    ], "perencanaan"),
  );
  if (adaPelatihan) {
    const peserta = pesertaKelas || d.pelatihan.hadir;
    const hadir = pesertaKelas ? hadirKelas : d.pelatihan.hadir;
    rg.push(but("ringkasan.pelatihan", "Butir pelatihan", [`Pelatihan. ${fmtAngka(peserta)} peserta dalam ${fmtAngka(d.pelatihan.kelas.length || 1)} kelas; ${fmtAngka(hadir)} hadir (${fmtPersen(hadir, peserta)} persen).`], "pelatihan"));
  }
  rg.push(
    but("ringkasan.pendataan", "Butir pendataan", [
      `Pendataan. ${fmtAngka(pen.didata)} dari ${fmtAngka(pen.sasaran)} keluarga sasaran sudah berstatus (${fmtPersen(pen.didata, pen.sasaran)} persen): ${fmtAngka(pen.terdampak)} terdampak, ${fmtAngka(pen.tidak_terdampak)} tidak terdampak, ${fmtAngka(pen.tidak_ditemukan)} tidak ditemukan.` +
        (pro.tanggal ? ` Dengan laju ${fmtAngka(pro.laju)} keluarga per hari, sisa pendataan diperkirakan selesai sekitar ${tanggalIndo(pro.tanggalCepat)} sampai ${tanggalIndo(pro.tanggalLambat)}.` : ""),
    ], "pelaksanaan"),
  );
  rg.push(but("ringkasan.dokumentasi", "Butir dokumentasi", [`Dokumentasi. ${fmtAngka(d.dokumentasi.foto)} foto berpenanda lokasi dan waktu dari ${fmtAngka(d.dokumentasi.petugas)} petugas.`], "dokumentasi"));
  if (d.qc.percobaan > 0) {
    rg.push(
      but("ringkasan.qc", "Butir QC Pemahaman", [
        `QC Pemahaman. ${fmtAngka(d.qc.percobaan)} percobaan oleh ${fmtAngka(d.qc.petugas)} petugas${d.qc.rata_pertama != null ? `; rata-rata nilai percobaan pertama ${fmtDesimal(d.qc.rata_pertama)}` : ""}.`,
      ], "dokumentasi"),
    );
  }
  rg.push(
    but("ringkasan.perhatian", "Butir yang perlu perhatian", [
      temuan.length > 0
        ? `Yang perlu perhatian. ${temuan[0]}${temuan.length > 1 ? "{{ref:perhatian| Temuan lain ada pada bagian #.}}" : ""}`
        : "Yang perlu perhatian. Tidak ada temuan otomatis.",
    ], "perhatian"),
  );
  out.push({ kode: "ringkasan", judul: "Ringkasan eksekutif", jenis: "ringkasan", elemen: rg });

  // ---- Perencanaan
  const perKec = d.kecamatan.filter((k) => k.idn_sub_sls > 0 || k.idn_kk > 0);
  const jumKec = perKec.reduce((s, k) => ({ sub: s.sub + k.idn_sub_sls, terd: s.terd + k.idn_terdampak, kk: s.kk + k.idn_kk }), { sub: 0, terd: 0, kk: 0 });
  const urut = [...perKec].sort((a, b) => b.idn_kk - a.idn_kk);
  const tiga = urut.slice(0, 3);
  const kkTiga = tiga.reduce((s, k) => s + k.idn_kk, 0);
  const jenisDampak = [
    ["rumah rusak berat", idn.rusak_berat], ["rusak sedang", idn.rusak_sedang], ["rusak ringan", idn.rusak_ringan], ["lahan tertimbun", idn.lahan_tertimbun],
    ["kekeringan", idn.kekeringan], ["aset usaha", idn.aset_usaha], ["lahan ternak", idn.lahan_ternak], ["korban", idn.korban],
  ] as const;
  const pr: Elemen[] = [
    par(
      "perencanaan.pengantar",
      "Uraian identifikasi",
      `Sebelum petugas diterjunkan, BPS Kabupaten Solok mengidentifikasi sendiri wilayah terdampak agar pendataan tidak salah sasaran. Mitra statistik yang tinggal di dekat wilayah terdampak mengisi formulir identifikasi jorong (${fmtAngka(idn.isian_jorong)} isian dari ${fmtAngka(idn.mitra)} mitra, mencakup ${fmtAngka(idn.nagari)} nagari di ${fmtAngka(idn.kecamatan)} kecamatan). Setelah itu ${fmtAngka(idn.pml_pengisi)} PML mengisi identifikasi per Sub SLS di SIGAP: ${fmtAngka(idn.sub_sls_diisi)} Sub SLS terisi, ${fmtAngka(idn.sub_sls_tidak_terdampak)} di antaranya dinyatakan tidak terdampak.`,
    ),
  ];
  if (tiga.length === 3 && jumKec.kk > 0) {
    pr.push(par("perencanaan.konsentrasi", "Konsentrasi tiga kecamatan terbesar", `${tiga.map((k) => judulKecamatan(k.kecamatan)).join(", ")} memuat ${fmtAngka(kkTiga)} dari ${fmtAngka(jumKec.kk)} keluarga terdampak (${fmtPersen(kkTiga, jumKec.kk)} persen).`));
  }
  pr.push(par("perencanaan.dampak", "Rincian jenis dampak", `Rincian jenis dampak pada isian PML: ${jenisDampak.map(([n, v]) => `${n} ${fmtAngka(v)}`).join(", ")}. Satu keluarga dapat mengalami lebih dari satu jenis dampak.`));
  pr.push(
    tab("perencanaan.tabel", "Tabel identifikasi per kecamatan", {
      judul: "Hasil identifikasi Sub SLS oleh PML per kecamatan",
      kepala: ["Kecamatan", "Sub SLS diidentifikasi", "Sub SLS terdampak", "Keluarga terdampak (isian PML)"],
      baris: urut.map((k) => [judulKecamatan(k.kecamatan), fmtAngka(k.idn_sub_sls), fmtAngka(k.idn_terdampak), fmtAngka(k.idn_kk)]),
      jumlah: ["Jumlah", fmtAngka(jumKec.sub), fmtAngka(jumKec.terd), fmtAngka(jumKec.kk)],
      rata: ["k", "n", "n", "n"],
    }),
  );
  out.push({ kode: "perencanaan", judul: "Perencanaan: identifikasi wilayah terdampak", jenis: "bab", elemen: pr, sumber: "Tabel identifikasi jorong dan identifikasi Sub SLS pada database SIGAP BPS Kabupaten Solok." });

  // ---- Pelatihan
  const pl: Elemen[] = [];
  pl.push(
    par(
      "pelatihan.pengantar",
      "Uraian pelatihan",
      adaPelatihan ? `Pelatihan petugas diikuti ${fmtAngka(pesertaKelas || d.pelatihan.hadir)} peserta; presensi digital di SIGAP mencatat ${fmtAngka(d.pelatihan.hadir)} peserta hadir.` : "Data pelatihan belum tersedia di SIGAP.",
    ),
  );
  if (d.pelatihan.kelas.length > 0) {
    const j = d.pelatihan.kelas.reduce((s, k) => ({ pml: s.pml + k.pml, ppl: s.ppl + k.ppl, peserta: s.peserta + k.peserta, hadir: s.hadir + k.hadir }), { pml: 0, ppl: 0, peserta: 0, hadir: 0 });
    pl.push(
      tab("pelatihan.tabelKelas", "Tabel peserta per kelas", {
        judul: "Peserta pelatihan per kelas",
        kepala: ["Kelas", "PML", "PPL", "Peserta", "Hadir"],
        baris: kelasUrut.map((k) => [String(k.kelas), fmtAngka(k.pml), fmtAngka(k.ppl), fmtAngka(k.peserta), fmtAngka(k.hadir)]),
        jumlah: ["Jumlah", fmtAngka(j.pml), fmtAngka(j.ppl), fmtAngka(j.peserta), fmtAngka(j.hadir)],
        rata: ["k", "n", "n", "n", "n"],
      }),
    );
  }
  if (pre && pos && pre.rata != null && pos.rata != null) {
    pl.push(
      par(
        "pelatihan.uraianTes",
        "Uraian pretest dan posttest",
        `Pretest diselesaikan ${fmtAngka(pre.peserta)} peserta (rata-rata ${fmtDesimal(pre.rata)}) dan posttest ${fmtAngka(pos.peserta)} peserta (rata-rata ${fmtDesimal(pos.rata)}). Soal pretest dan posttest berbeda isi dan jumlahnya, sehingga selisih nilai bukan ukuran sebelum dan sesudah atas soal yang sama.`,
      ),
    );
  }
  if (d.pelatihan.tes.length > 0) {
    const nama2 = (j: string) => (j === "pretest" ? "Pretest" : j === "posttest" ? "Posttest" : j);
    pl.push(
      tab("pelatihan.tabelTes", "Tabel pretest dan posttest", {
        judul: "Hasil pretest dan posttest",
        kepala: ["Tes", "Peserta selesai", "Rata-rata nilai", "Nilai 80 ke atas", "Nilai di bawah 60"],
        baris: [...d.pelatihan.tes].sort((a, b) => (a.jenis === "pretest" ? -1 : b.jenis === "pretest" ? 1 : 0)).map((t) => [nama2(t.jenis), fmtAngka(t.peserta), t.rata == null ? "-" : fmtDesimal(t.rata), fmtAngka(t.ge80), fmtAngka(t.lt60)]),
        rata: ["k", "n", "n", "n", "n"],
      }),
    );
  }
  out.push({ kode: "pelatihan", judul: "Pelatihan petugas", jenis: "bab", elemen: pl, sumber: "Penugasan, presensi, dan sesi tes pelatihan pada database SIGAP." });

  // ---- Pelaksanaan
  const kecLap = d.kecamatan.filter((k) => k.sasaran > 0);
  const jumLap = kecLap.reduce((s, k) => ({ sub: s.sub + k.sub_sls, sas: s.sas + k.sasaran, did: s.did + k.didata, terd: s.terd + k.terdampak, tdk: s.tdk + k.tidak_terdampak, tdm: s.tdm + k.tidak_ditemukan }), { sub: 0, sas: 0, did: 0, terd: 0, tdk: 0, tdm: 0 });
  const harian14 = pen.harian.slice(-14);
  const pk: Elemen[] = [
    par(
      "pelaksanaan.pengantar",
      "Uraian pelaksanaan",
      `Pendataan lapangan berjalan sejak ${tanggalIndo(pen.hari_pertama) || "-"} dengan SIGAP sebagai sistem kerja petugas. Per ${tanggal}, ${fmtAngka(pen.didata)} dari ${fmtAngka(pen.sasaran)} keluarga sasaran (${fmtPersen(pen.didata, pen.sasaran)} persen) telah ditetapkan statusnya oleh petugas, dan ${fmtAngka(pen.terdampak)} di antaranya terdampak.`,
    ),
    par(
      "pelaksanaan.proyeksi",
      "Laju dan perkiraan selesai",
      pro.tanggal
        ? `Rata-rata ${fmtAngka(pro.laju)} keluarga per hari pada ${fmtAngka(pro.hariDipakai)} hari lengkap terakhir; sisa ${fmtAngka(pro.sisa)} keluarga diperkirakan selesai sekitar ${tanggalIndo(pro.tanggalCepat)} sampai ${tanggalIndo(pro.tanggalLambat)} (titik tengah ${tanggalIndo(pro.tanggal)}).`
        : pro.sisa === 0
          ? "Seluruh keluarga sasaran sudah berstatus."
          : "Perkiraan tanggal selesai belum dapat dihitung karena belum ada laju harian.",
    ),
    but("pelaksanaan.petugas", "Petugas, wilayah kerja, dan daftar keluarga", [
      `${fmtAngka(ppl)} PPL dan ${fmtAngka(pml)} PML${d.petugas.korwil ? `, ${fmtAngka(d.petugas.korwil)} korwil` : ""}${d.petugas.supervisor ? `, ${fmtAngka(d.petugas.supervisor)} supervisor` : ""} bertugas pada ${fmtAngka(d.wilayah_kerja.sub_sls)} Sub SLS terdampak yang dialokasikan.`,
      `Daftar keluarga di SIGAP berjumlah ${fmtAngka(d.wilayah_kerja.keluarga_daftar)} keluarga aktif, termasuk ${fmtAngka(d.wilayah_kerja.keluarga_tambahan)} keluarga tambahan yang dimasukkan petugas di lapangan (prelist bukan pembatas sasaran).`,
      `Sasaran kerja saat ini adalah ${fmtAngka(pen.sasaran)} keluarga pada Sub SLS yang dialokasikan.`,
    ]),
    tab("pelaksanaan.tabel", "Tabel capaian per kecamatan", {
      judul: "Capaian pendataan per kecamatan",
      kepala: ["Kecamatan", "Sub SLS", "Keluarga sasaran", "Sudah didata", "Persen", "Terdampak", "Tidak terdampak", "Tidak ditemukan"],
      baris: kecLap.map((k) => [judulKecamatan(k.kecamatan), fmtAngka(k.sub_sls), fmtAngka(k.sasaran), fmtAngka(k.didata), fmtPersen(k.didata, k.sasaran), fmtAngka(k.terdampak), fmtAngka(k.tidak_terdampak), fmtAngka(k.tidak_ditemukan)]),
      jumlah: ["Jumlah", fmtAngka(jumLap.sub), fmtAngka(jumLap.sas), fmtAngka(jumLap.did), fmtPersen(jumLap.did, jumLap.sas), fmtAngka(jumLap.terd), fmtAngka(jumLap.tdk), fmtAngka(jumLap.tdm)],
      rata: ["k", "n", "n", "n", "n", "n", "n", "n"],
    }),
  ];
  if (harian14.length > 0) {
    pk.push({
      id: "pelaksanaan.grafik",
      label: "Grafik pendataan per hari",
      jenis: "batang",
      batang: { judul: `Keluarga yang berstatus per hari (${fmtAngka(harian14.length)} hari terakhir)`, satuan: "keluarga", data: harian14.map((h) => ({ label: tanggalPendek(h.tgl), nilai: h.n })) },
    });
  }
  out.push({ kode: "pelaksanaan", judul: "Pelaksanaan pendataan", jenis: "bab", elemen: pk, sumber: "Lembar pendataan keroyokan (status terakhir tiap keluarga) pada database SIGAP; tanggal menurut WIB. Angka hari berjalan belum lengkap." });

  // ---- Dokumentasi dan QC
  const dk: Elemen[] = [
    par("dokumentasi.foto", "Uraian foto dokumentasi", `Petugas memotret lewat kamera SIGAP yang menempelkan lokasi dan waktu pada tiap foto. Tercatat ${fmtAngka(d.dokumentasi.foto)} foto dari ${fmtAngka(d.dokumentasi.petugas)} petugas.`),
    par(
      "dokumentasi.qc",
      "Uraian QC Pemahaman",
      d.qc.percobaan > 0
        ? `QC Pemahaman harian memberi soal singkat kepada PML dan PPL: ${fmtAngka(d.qc.percobaan)} percobaan oleh ${fmtAngka(d.qc.petugas)} petugas${d.qc.rata_pertama != null ? `, rata-rata nilai percobaan pertama ${fmtDesimal(d.qc.rata_pertama)}` : ""}.`
        : "QC Pemahaman belum memiliki percobaan yang tercatat.",
    ),
  ];
  out.push({ kode: "dokumentasi", judul: "Dokumentasi dan QC Pemahaman", jenis: "bab", elemen: dk, sumber: "Foto berpenanda lokasi dan percobaan QC Pemahaman pada database SIGAP." });

  // ---- Hal yang perlu perhatian
  out.push({
    kode: "perhatian",
    judul: "Hal yang perlu perhatian",
    jenis: "bab",
    elemen: [
      par("perhatian.pengantar", "Kalimat pengantar", temuan.length > 0 ? "Temuan berikut dihitung otomatis dari data. Uraian penilaian dan tindak lanjut ditambahkan penyusun." : "Tidak ada temuan otomatis. Uraian penilaian dan tindak lanjut ditambahkan penyusun."),
      ...(temuan.length > 0 ? [but("perhatian.temuan", "Daftar temuan otomatis", temuan)] : []),
    ],
  });

  // ---- Lampiran A: nilai per petugas (kolom, urutan, dan peran mengikuti opsi)
  const tabelNilai = tabelNilaiPetugas(d, o);
  out.push({
    kode: "lampiranNilai",
    judul: "Nilai per petugas",
    jenis: "lampiran",
    elemen: [
      par("lampiranNilai.pengantar", "Keterangan nilai", "Nilai pretest dan posttest diambil dari tes pelatihan; QC (percobaan pertama) adalah rata-rata nilai percobaan pertama tiap hari QC Pemahaman. Tanda minus berarti belum ada nilai."),
      ...(tabelNilai ? [tab("lampiranNilai.tabel", "Tabel nilai per petugas", tabelNilai)] : [par("lampiranNilai.kosong", "Keterangan data kosong", "Belum ada data petugas.")]),
    ],
    sumber: "Penugasan, presensi, sesi tes pelatihan, dan percobaan QC Pemahaman pada database SIGAP.",
  });

  // ---- Lampiran B: foto dokumentasi (bawaan mati). Ada foto pilihan -> foto ditampilkan; tidak ada -> kerangka tabel untuk ditempel di Word.
  const adaFoto = !!foto && foto.daftar.length > 0;
  out.push({
    kode: "lampiranFoto",
    judul: "Dokumentasi foto",
    jenis: "lampiran",
    elemen: adaFoto
      ? [
          par("lampiranFoto.pengantar", "Keterangan foto", `Foto dokumentasi pilihan penyusun (${fmtAngka(foto.daftar.length)} foto). Keterangan di bawah foto memuat nomor foto, petugas, dan tanggal menurut data SIGAP.`),
          { id: "lampiranFoto.foto", label: "Foto terpilih", jenis: "foto", foto: foto.daftar, perBaris: foto.perBaris },
        ]
      : [
          par("lampiranFoto.pengantar", "Keterangan kerangka foto", "Tempelkan foto dokumentasi pilihan pada kolom di bawah, lalu ubah keterangannya di Word. Atau pilih langsung dari data foto yang masuk di SIGAP lewat tombol “Pilih foto dokumentasi”, maka foto dan keterangannya terisi otomatis."),
          tab("lampiranFoto.tabel", "Kerangka tabel foto", {
            kepala: ["Foto", "Keterangan"],
            baris: [1, 2, 3, 4, 5, 6].map((i) => [`[Tempel foto ${i}]`, `Keterangan foto ${i}: kegiatan, lokasi, tanggal.`]),
            rata: ["k", "k"],
          }),
        ],
  });
  return out;
}

const HURUF = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Rujukan "{{ref:kode|teks dengan #}}" -> teks dengan # diganti nomor bab tujuan; kosong bila bab tujuan tidak tampil. */
export function selesaikanRujukan(teks: string, nomor: Record<string, string>): string {
  return teks.replace(/\{\{ref:(\w+)\|([^}]*)\}\}/g, (_m, kode: string, isi: string) => (nomor[kode] ? isi.replace("#", nomor[kode]) : ""));
}

/**
 * Laporan lengkap sesuai opsi: bab dan elemen yang dicentang, penomoran bab (angka) dan lampiran (huruf) mengikuti bab yang tampil,
 * nomor tabel dan gambar berurutan, rujukan antar-bab diselesaikan, catatan penyusun disisipkan, judul/penyusun diterapkan.
 */
export function susunLaporan(d: DataLaporan, o: OpsiLaporan = OPSI_AWAL, foto?: OpsiFotoLaporan): Laporan {
  const tgl = tanggalWib(d.dibuat_at);
  const tanggal = tanggalIndo(tgl);
  const nama = d.kegiatan?.nama ?? "Pendataan Pascabencana";
  const semua = bangunBagian(d, o, foto);
  const babAda = (kode: string) => babTampil(o, kode);

  // 1) saring bab dan elemen
  const sisa = semua
    .filter((b) => babAda(b.kode))
    .map((b) => ({
      ...b,
      elemen: b.elemen.filter((e) => elemenTampil(o, e)),
    }));

  // 2) penomoran
  const nomorBab: Record<string, string> = {};
  let n = 0;
  let h = 0;
  for (const b of sisa) {
    if (b.jenis === "bab") nomorBab[b.kode] = String(++n);
    else if (b.jenis === "lampiran") nomorBab[b.kode] = `Lampiran ${HURUF[h++] ?? String(h)}`;
  }
  let tabelKe = 0;
  let gambarKe = 0;
  const bagian: BagianLaporan[] = sisa.map((b) => {
    const nomor = b.jenis === "bab" ? nomorBab[b.kode] : b.jenis === "lampiran" ? nomorBab[b.kode].replace("Lampiran ", "") : "";
    const judulTampil = b.jenis === "bab" ? `${nomor}. ${b.judul}` : b.jenis === "lampiran" ? `Lampiran ${nomor}. ${b.judul}` : b.judul;
    const elemen: Elemen[] = b.elemen.map((e): Elemen => {
      if (e.jenis === "tabel") return { ...e, tabel: { ...e.tabel, judul: e.tabel.judul ? `Tabel ${++tabelKe}. ${e.tabel.judul}` : e.tabel.judul } };
      if (e.jenis === "batang") return { ...e, batang: { ...e.batang, judul: `Gambar ${++gambarKe}. ${e.batang.judul}` } };
      if (e.jenis === "paragraf") return { ...e, teks: selesaikanRujukan(e.teks, nomorBab) };
      if (e.jenis === "butir") return { ...e, butir: e.butir.map((x) => selesaikanRujukan(x, nomorBab)) };
      return e;
    });
    const catatan = (o.catatan[b.kode] ?? "").trim();
    if (catatan) elemen.push({ id: `${b.kode}.catatan`, label: "Catatan penyusun", jenis: "catatan", teks: catatan });
    return { ...b, elemen, nomor, judulTampil };
  });

  const judul = o.judul.trim() || `Laporan Sementara Pelaksanaan ${nama}`;
  const jam = jamWib(d.dibuat_at);
  const subjudul = `BPS Kabupaten Solok · data per ${tanggal}${jam ? `, ${jam} WIB` : ""}${o.penyusun.trim() ? ` · Disusun oleh ${o.penyusun.trim()}` : ""}`;
  return { judul, subjudul, nama, tanggal, bagian, semua };
}

/** Kelompokkan elemen berurutan: butir yang berdampingan menjadi satu daftar (dipakai layar, cetak, dan Word). */
export type Blok = { jenis: "butir"; butir: string[] } | { jenis: "lain"; elemen: Exclude<Elemen, { jenis: "butir" }> };
export function kelompokkanElemen(elemen: Elemen[]): Blok[] {
  const out: Blok[] = [];
  for (const e of elemen) {
    if (e.jenis === "butir") {
      const akhir = out[out.length - 1];
      if (akhir && akhir.jenis === "butir") akhir.butir.push(...e.butir);
      else out.push({ jenis: "butir", butir: [...e.butir] });
    } else out.push({ jenis: "lain", elemen: e });
  }
  return out;
}

/** Paragraf dari teks bebas (baris kosong memisah paragraf; baris tunggal tetap satu paragraf). */
export function paragrafDariTeks(teksBebas: string): string[] {
  return teksBebas
    .split(/\n\s*\n/)
    .map((x) => x.replace(/\s*\n\s*/g, " ").trim())
    .filter((x) => x.length > 0);
}

/** Baris batang untuk grafik dalam teks (Word/cetak): panjang sebanding nilai, maksimum `lebar` karakter. */
export function panjangBatang(nilai: number, maks: number, lebar = 28): number {
  return maks > 0 && nilai > 0 ? Math.max(1, Math.round((nilai / maks) * lebar)) : 0;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// HTML (cetak). Berkas Word memakai lib/laporanDocx.ts.
// ---------------------------------------------------------------------------------------------------------------------------------

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlTabel(t: TabelLaporan): string {
  const sel = (isi: string, i: number, tebal = false, kepala = false) =>
    `<${kepala ? "th" : "td"} style="border:1px solid #888;padding:3px 6px;text-align:${t.rata[i] === "n" ? "right" : "left"};${tebal || kepala ? "font-weight:bold;" : ""}${kepala ? "background:#E8EEF7;" : ""}">${esc(isi)}</${kepala ? "th" : "td"}>`;
  return (
    (t.judul ? `<p style="margin:10pt 0 3pt;font-weight:bold;font-size:10pt;page-break-after:avoid">${esc(t.judul)}</p>` : "") +
    `<table style="border-collapse:collapse;width:100%;font-size:10pt"><thead><tr>${t.kepala.map((h, i) => sel(h, i, true, true)).join("")}</tr></thead><tbody>` +
    t.baris.map((b) => `<tr style="page-break-inside:avoid">${b.map((c, i) => sel(c, i)).join("")}</tr>`).join("") +
    (t.jumlah ? `<tr>${t.jumlah.map((c, i) => sel(c, i, true)).join("")}</tr>` : "") +
    `</tbody></table>`
  );
}

/** Foto dalam tabel `perBaris` kolom; gambar = id -> data URI. Foto yang gambarnya tidak ada diberi tulisan, keterangan tetap tercetak. */
function htmlFoto(foto: FotoLaporan[], perBaris: number, gambar: Record<number, string>): string {
  const baris: string[] = [];
  for (let i = 0; i < foto.length; i += perBaris) {
    const sel = foto
      .slice(i, i + perBaris)
      .map((f) => {
        const src = gambar[f.id];
        const isi = src ? `<img src="${src}" alt="" style="max-width:100%;max-height:${perBaris === 2 ? 8 : 6}cm">` : `<div style="color:#888;padding:20pt 0">[Foto tidak tersedia]</div>`;
        return `<td style="width:${Math.floor(100 / perBaris)}%;padding:4pt;vertical-align:top;text-align:center;page-break-inside:avoid">${isi}<div style="font-size:9pt;margin-top:2pt">${esc(f.ket)}</div></td>`;
      });
    while (sel.length < perBaris) sel.push(`<td style="width:${Math.floor(100 / perBaris)}%"></td>`);
    baris.push(`<tr style="page-break-inside:avoid">${sel.join("")}</tr>`);
  }
  return `<table style="border-collapse:collapse;width:100%;margin:4pt 0"><tbody>${baris.join("")}</tbody></table>`;
}

function htmlBatang(b: BatangLaporan): string {
  const maks = Math.max(1, ...b.data.map((x) => x.nilai));
  return (
    `<p style="margin:10pt 0 3pt;font-weight:bold;font-size:10pt;page-break-after:avoid">${esc(b.judul)}</p>` +
    `<table style="border-collapse:collapse;width:100%;font-size:10pt"><tbody>` +
    b.data
      .map((x) => `<tr><td style="padding:1px 6px;width:60pt">${esc(x.label)}</td><td style="padding:1px 6px;text-align:right;width:50pt">${fmtAngka(x.nilai)}</td><td style="padding:1px 6px;color:#1F5FD1">${"█".repeat(panjangBatang(x.nilai, maks))}</td></tr>`)
      .join("") +
    `</tbody></table>`
  );
}

/** Isi laporan sebagai HTML mandiri untuk cetak / simpan PDF. Memuat daftar isi (tanpa nomor halaman; nomor halaman diberi peramban) bila dipilih. */
export function htmlLaporan(l: Laporan, o: OpsiLaporan = OPSI_AWAL, gambar: Record<number, string> = {}): string {
  const isi = l.bagian
    .map((b) => {
      const blok = kelompokkanElemen(b.elemen)
        .map((k) => {
          if (k.jenis === "butir") return `<ul style="margin:0 0 6pt 16pt">${k.butir.map((x) => `<li style="margin-bottom:3pt">${esc(x)}</li>`).join("")}</ul>`;
          const e = k.elemen;
          if (e.jenis === "paragraf") return `<p style="margin:0 0 6pt;text-align:justify">${esc(e.teks)}</p>`;
          if (e.jenis === "tabel") return htmlTabel(e.tabel);
          if (e.jenis === "batang") return htmlBatang(e.batang);
          if (e.jenis === "foto") return htmlFoto(e.foto, e.perBaris, gambar);
          return `<div style="margin:6pt 0;padding:4pt 8pt;background:#F6F8FB;border-left:3pt solid #1F5FD1"><p style="margin:0;font-weight:bold;font-size:10pt">Catatan penyusun</p>${paragrafDariTeks(e.teks).map((p) => `<p style="margin:2pt 0">${esc(p)}</p>`).join("")}</div>`;
        })
        .join("");
      return (
        `<h2 id="b-${esc(b.kode)}" style="font-size:13pt;margin:16pt 0 4pt;color:#0F2A52;page-break-after:avoid">${esc(b.judulTampil ?? b.judul)}</h2>` +
        blok +
        (b.sumber ? `<p style="margin:4pt 0 0;font-size:9pt;color:#555"><i>Sumber: ${esc(b.sumber)}</i></p>` : "")
      );
    })
    .join("");
  const daftar = o.daftarIsi
    ? `<h2 style="font-size:13pt;margin:14pt 0 4pt;color:#0F2A52">Daftar isi</h2><ol style="list-style:none;margin:0 0 8pt;padding:0">${l.bagian.map((b) => `<li style="margin:1pt 0"><a href="#b-${esc(b.kode)}" style="color:#111;text-decoration:none">${esc(b.judulTampil ?? b.judul)}</a></li>`).join("")}</ol>`
    : "";
  return (
    `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(l.judul)}</title>` +
    `<style>@page{size:21cm 29.7cm;margin:2cm}body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.35;color:#111}</style></head>` +
    `<body><h1 style="font-size:17pt;margin:0 0 2pt;color:#0F2A52">${esc(l.judul)}</h1>` +
    `<p style="margin:0 0 10pt;color:#555">${esc(l.subjudul)}</p>${daftar}${isi}</body></html>`
  );
}

/** Nama berkas unduhan, mis. "Laporan_Sementara_Pendataan_Pascabencana_2026_2026-10-30.docx". */
export function namaBerkasLaporan(l: Laporan, tglIso: string, ekstensi = "docx"): string {
  const dasar = l.nama.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Pendataan";
  return `Laporan_Sementara_${dasar}_${tglIso || "tanpa_tanggal"}.${ekstensi}`;
}
