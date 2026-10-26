// lib/delego/tipe.ts
//
// (26 Okt 2026) Delego -- bentuk data yang dikembalikan fungsi basis data keu_dlg_hak / keu_dlg_saya / keu_dlg_bahan / keu_dlg_calon
// (berkas SQL 20261026c_keu_delego.sql). Angka numeric dari Postgres tiba sebagai string ("60.00"); gunakan `angka()` dari hitung.ts.

export type PeranDelegasi = "wakil" | "pegawai" | "pml" | "ppl";
export type StatusDelegasi = "baru" | "berjalan" | "selesai" | "ditunda" | "batal";
export type JenisAkun = "organik" | "mitra";

export const NAMA_PERAN: Record<PeranDelegasi, string> = { wakil: "Wakil Ketua Tim", pegawai: "Pegawai", pml: "PML", ppl: "PPL" };
export const NAMA_STATUS: Record<StatusDelegasi, string> = { baru: "Baru", berjalan: "Berjalan", selesai: "Selesai", ditunda: "Ditunda", batal: "Batal" };

export type Delegasi = {
  id: number;
  tahun: number;
  ident_id: number | null;
  ro_kode: string;
  judul: string;
  uraian: string;
  penerima_akun: number;
  peran_penerima: PeranDelegasi;
  pj_bidang: string;
  satuan: string;
  target_total: string | number | null;
  target_harian: string | number;
  bobot: number;
  hari_kerja: number[];
  mulai: string;
  tenggat: string;
  status: StatusDelegasi;
  alasan: string;
  ver: number;
  dibuat_oleh: number | null;
  dibuat_at: string;
  diubah_at: string;
  dari_nama: string | null;
  penerima_nama: string;
  penerima_jenis: JenisAkun;
  poin_total: string | number;
  lapor_hari: number;
};

export type Laporan = {
  id: number;
  delegasi_id: number;
  tanggal: string;
  poin: string | number;
  uraian: string;
  kendala: string;
  bukti: unknown[];
  dikirim_oleh: number | null;
  mewakili: boolean;
  terlambat: boolean;
  dikirim_at: string;
};

export type Tanggapan = { id: number; delegasi_id: number; laporan_id: number | null; isi: string; dibuat_at: string; dari_nama: string | null };

export type Pembinaan = {
  id: number;
  penerima_akun?: number;
  penerima_nama?: string;
  ro_kode: string;
  delegasi_id: number | null;
  langkah: number;
  alasan: string;
  tinjau: string | null;
  status: "berjalan" | "selesai" | "dibatalkan";
  catatan_tutup: string;
  dibuat_at: string;
  dicatat_nama?: string | null;
};

export type Penghargaan = { id: number; penerima_akun?: number; penerima_nama?: string; ro_kode: string; delegasi_id: number | null; alasan: string; dibuat_at: string };

export type Penilaian = { penerima_akun?: number; ro_kode: string; periode: string; kualitas: number; kepatuhan: number; catatan: string; dinilai_oleh?: number };

export type HakDelegasi = {
  akun: { id: number; nama: string; jenis: JenisAkun };
  hari_ini: string;
  semua: boolean;
  beri_ro: string[];
  lihat_ro: string[];
  pml_ro: string[];
  ada_tugas: boolean;
  ident: { id: number; nama: string; ro_kode: string; tahun: number; lanjutan_final: boolean }[];
};

export type BahanSaya = {
  hari_ini: string;
  akun: { id: number; nama: string; jenis: JenisAkun };
  delegasi: Delegasi[];
  laporan: Laporan[];
  diwakili: Delegasi[];
  laporan_diwakili: Laporan[];
  tanggapan: Tanggapan[];
  pembinaan: Pembinaan[];
  penghargaan: Penghargaan[];
  penilaian: Penilaian[];
};

export type BahanTim = {
  hari_ini: string;
  delegasi: Delegasi[];
  laporan: Laporan[];
  tanggapan: Tanggapan[];
  pembinaan: Pembinaan[];
  penghargaan: Penghargaan[];
  penilaian: Penilaian[];
};

export type CalonLanjutan = { nama: string; peran: string | null; jenis: string | null; akun_id: number | null };
export type CalonAkun = { id: number; nama: string; jenis: JenisAkun; kecamatan?: string | null };
export type Calon = { lanjutan: CalonLanjutan[]; organik: CalonAkun[]; cari: CalonAkun[] };
