// lib/delego/tipe.ts
//
// (26 Okt 2026) Delego -- bentuk data yang dikembalikan fungsi basis data keu_dlg_hak / keu_dlg_saya / keu_dlg_bahan / keu_dlg_calon
// (berkas SQL 20261026c_keu_delego.sql, diperluas 20261026g). Angka numeric dari Postgres tiba sebagai string ("60.00"); gunakan `angka()` dari hitung.ts.

export type PeranDelegasi = "wakil" | "pegawai" | "pml" | "ppl";
export type StatusDelegasi = "usulan" | "baru" | "berjalan" | "selesai" | "ditunda" | "batal";
export type JenisAkun = "organik" | "mitra";

export const NAMA_PERAN: Record<PeranDelegasi, string> = { wakil: "Wakil Ketua Tim", pegawai: "Pegawai", pml: "PML", ppl: "PPL" };
export const NAMA_STATUS: Record<StatusDelegasi, string> = { usulan: "Usulan", baru: "Baru", berjalan: "Berjalan", selesai: "Selesai", ditunda: "Ditunda", batal: "Batal" };

/** Satu baris riwayat target harian (baris pertama = target awal). Perubahan berlaku mulai `berlaku_mulai`, tidak surut. */
export type RiwayatTarget = { berlaku_mulai: string; target_harian: string | number; alasan: string };

export type Delegasi = {
  id: number;
  tahun: number;
  ident_id: number | null;
  /** Versi identifikasi saat delegasi dibuat / terakhir ditinjau pemberi; null bila tanpa identifikasi. */
  ident_ver?: number | null;
  /** Versi identifikasi sekarang (keu_ident.ver). Lebih besar dari ident_ver = identifikasi berubah. */
  ident_ver_kini?: number | null;
  ro_kode: string;
  judul: string;
  uraian: string;
  penerima_akun: number;
  peran_penerima: PeranDelegasi;
  pj_bidang: string;
  satuan: string;
  target_total: string | number | null;
  /** Target harian yang berlaku HARI INI (dari riwayat bila ada). */
  target_harian: string | number;
  riwayat_target?: RiwayatTarget[];
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
  // --- Pekerjaan teknis (20261026i). Opsional supaya data lama dan contoh uji tetap sah.
  /** Jenis dari katalog (null = delegasi poin langsung). */
  jenis_id?: number | null;
  jenis_nama?: string | null;
  /** Poin satu satuan jenis saat delegasi dibuat (salinan). Bila ada, target_total dan target_harian berupa POIN dan laporan memakai jumlah satuan. */
  poin_per_satuan?: string | number | null;
  perlu_hasil?: boolean;
  perlu_tinjau?: boolean;
  /** Pekerjaan mendadak: selesai dalam satu hari (boleh dengan tenggat jam). */
  insidental?: boolean;
  /** Tenggat berikut jam (ISO UTC dari basis data; tampilkan dalam WIB). */
  tenggat_waktu?: string | null;
  rutin_id?: number | null;
  /** Nama kelompok "Pekerjaan tim" bila ro_kode berawalan TIM-. */
  kelompok_nama?: string | null;
  // --- Delego perangkum (20261101zb)
  kelas?: KelasPekerjaan;
  /** Kegiatan SIGAP yang ditautkan (kunci rekap lintas kegiatan; satu RO bisa dipakai beberapa kegiatan). */
  kegiatan_id?: number | null;
  mode_tutup?: "tinjau" | "ringan" | "sumber";
  terhalang_oleh?: string | null;
  terhalang_sejak?: string | null;
  usulan_oleh?: number | null;
  usulan_at?: string | null;
  usulan_catatan?: string;
  skor_alasan?: string;
};

export type KelasPekerjaan = "langsung" | "penunjang" | "proses" | "lapangan" | "perintah" | "rutin";
export const NAMA_KELAS: Record<KelasPekerjaan, string> = {
  langsung: "Pekerjaan langsung",
  penunjang: "Penunjang organisasi",
  proses: "Proses administrasi",
  lapangan: "Lapangan dan pelatihan",
  perintah: "Perintah langsung",
  rutin: "Urusan kantor rutin",
};

/** Status tinjau sebuah laporan (kolom keu_dlg_laporan.tinjau_status). */
export type StatusTinjau = "menunggu" | "disetujui" | "ditolak" | "disanggah" | "tidak_diakui";
export const NAMA_TINJAU: Record<StatusTinjau, string> = {
  menunggu: "Menunggu tinjau",
  disetujui: "Disetujui",
  ditolak: "Perlu revisi",
  disanggah: "Disanggah",
  tidak_diakui: "Tidak diakui",
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
  /** Jumlah satuan (hanya laporan delegasi berjenis); poin = jumlah x poin_per_satuan. */
  jumlah?: string | number | null;
  // --- Tinjau (20261101zb)
  tinjau_status?: StatusTinjau;
  tinjau_oleh?: number | null;
  tinjau_at?: string | null;
  tinjau_alasan?: string;
  /** Poin yang diakui setelah putusan Kepala (null = seluruh poin laporan). */
  poin_diakui?: string | number | null;
  menit_nyata?: number | null;
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

export type LiburDelegasi = { tanggal: string; nama: string; jenis: "nasional" | "cuti_bersama" | "lainnya"; aktif: boolean };
export type BobotSkor = { ketepatan: number; capaian: number; kualitas: number; kepatuhan: number };

export type HakDelegasi = {
  akun: { id: number; nama: string; jenis: JenisAkun };
  hari_ini: string;
  semua: boolean;
  beri_ro: string[];
  lihat_ro: string[];
  pml_ro: string[];
  ada_tugas: boolean;
  ident: { id: number; nama: string; ro_kode: string; tahun: number; lanjutan_final: boolean }[];
  /** Kalender libur (semua baris, aktif atau tidak). Tersedia setelah 20261026g. */
  libur?: LiburDelegasi[];
  /** Bobot skor. Tersedia setelah 20261026g. */
  bobot?: BobotSkor;
  /** Katalog jenis pekerjaan (semua bila akun pemberi tingkat tim, selain itu hanya yang aktif). Tersedia setelah 20261026i. */
  jenis?: JenisPekerjaan[];
  /** Kelompok "Pekerjaan tim". Tersedia setelah 20261026i. */
  kelompok?: Kelompok[];
  /** Kode kelompok aktif yang boleh didelegasikan akun ini (hanya pemberi tingkat tim). */
  beri_kelompok?: string[];
};

// ---------------------------------------------------------------------------------------------------------------------
// Pekerjaan teknis (20261026i): katalog jenis, kelompok, langkah, hasil kerja, templat berulang
// ---------------------------------------------------------------------------------------------------------------------
export type JenisPekerjaan = {
  id: number;
  kode: string;
  nama: string;
  satuan: string;
  poin_per_satuan: string | number;
  uraian: string;
  perlu_hasil: boolean;
  perlu_tinjau: boolean;
  langkah_bawaan: string[];
  urut: number;
  aktif: boolean;
};
export type Kelompok = { kode: string; nama: string; aktif: boolean };
export type Langkah = { id: number; delegasi_id: number; urut: number; judul: string; selesai: boolean; selesai_at: string | null };
export type StatusHasil = "diserahkan" | "diterima" | "revisi";
export type HasilKerja = {
  id: number;
  delegasi_id: number;
  nomor: number;
  catatan: string;
  /** 1 sampai 5 butir: teks/tautan atau { ket, path } untuk foto (sama dengan bukti laporan). */
  butir: unknown[];
  status: StatusHasil;
  catatan_tinjau: string;
  diserahkan_at: string;
  ditinjau_at: string | null;
  ditinjau_nama: string | null;
};
export type Frekuensi = "mingguan" | "bulanan";
export type Rutin = {
  id: number;
  judul: string;
  uraian: string;
  ro_kode: string;
  jenis_id: number;
  jumlah: string | number;
  bobot: number;
  frekuensi: Frekuensi;
  /** Mingguan: 1 (Senin) sampai 7 (Minggu). Bulanan: tanggal 1 sampai 28. */
  hari: number;
  durasi_hari: number;
  hari_kerja: number[];
  mulai_berlaku: string;
  berakhir: string | null;
  aktif: boolean;
  terakhir_jalan: string | null;
  penerima: { akun: number; peran: PeranDelegasi; nama: string | null }[];
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
  langkah?: Langkah[];
  hasil?: HasilKerja[];
};

export type BahanTim = {
  hari_ini: string;
  delegasi: Delegasi[];
  laporan: Laporan[];
  tanggapan: Tanggapan[];
  pembinaan: Pembinaan[];
  penghargaan: Penghargaan[];
  penilaian: Penilaian[];
  langkah?: Langkah[];
  hasil?: HasilKerja[];
  /** Templat berulang (hanya saat tidak disaring per identifikasi). */
  rutin?: Rutin[];
};

export type CalonLanjutan = { nama: string; peran: string | null; jenis: string | null; akun_id: number | null };
export type CalonAkun = { id: number; nama: string; jenis: JenisAkun; kecamatan?: string | null };
export type Calon = { lanjutan: CalonLanjutan[]; organik: CalonAkun[]; cari: CalonAkun[] };

// ---------------------------------------------------------------------------------------------------------------------
// Delego perangkum (20261101zb): tinjau, sanggah, usulan pegawai, katalog skor, rekap beban, monitoring Kepala
// ---------------------------------------------------------------------------------------------------------------------
export type LaporanTinjau = {
  id: number;
  delegasi_id: number;
  tanggal: string;
  poin: string | number;
  uraian: string;
  kendala: string;
  bukti: unknown[];
  jumlah?: string | number | null;
  menit_nyata?: number | null;
  dikirim_at: string;
  tinjau_status: StatusTinjau;
  tinjau_alasan: string;
  mewakili: boolean;
  judul: string;
  ro_kode: string;
  satuan: string;
  poin_per_satuan: string | number | null;
  target_total: string | number | null;
  target_harian: string | number;
  tenggat: string;
  penerima_akun: number;
  pemberi_akun: number | null;
  kegiatan_id: number | null;
  penerima_nama: string;
  kegiatan_nama: string | null;
  /** Hari kerja sejak laporan dikirim (dihitung basis data). */
  hk_lewat: number;
  poin_total: string | number;
};

export type UsulanMenunggu = {
  id: number;
  judul: string;
  uraian: string;
  ro_kode: string;
  satuan: string;
  poin_per_satuan: string | number | null;
  target_total: string | number | null;
  target_harian: string | number;
  mulai: string;
  tenggat: string;
  penerima_akun: number;
  usulan_oleh: number | null;
  usulan_at: string | null;
  kegiatan_id: number | null;
  kelas: KelasPekerjaan;
  skor_alasan: string;
  hari_kerja: number[];
  penerima_nama: string;
  kegiatan_nama: string | null;
  hk_lewat: number;
};

export type StatusSanggah = "menunggu_jawab" | "menunggu_putusan" | "diputus";
export type PutusanSanggah = "benar" | "sebagian" | "salah";
export type Sanggah = {
  id: number;
  laporan_id: number;
  delegasi_id: number;
  alasan: string;
  bukti: unknown[];
  diajukan_oleh: number;
  diajukan_at: string;
  batas_jawab: string;
  jawaban: string | null;
  jawaban_bukti: unknown[];
  dijawab_at: string | null;
  status: StatusSanggah;
  putusan: PutusanSanggah | null;
  poin_diakui: string | number | null;
  catatan_putusan: string;
  diputus_at: string | null;
  pengaju_nama: string;
  penerima_nama: string;
  penerima_akun: number;
  judul: string;
  ro_kode: string;
  satuan: string;
  tanggal: string;
  poin: string | number;
  uraian: string;
  kendala: string;
  bukti_laporan: unknown[];
  jumlah?: string | number | null;
};

export type UsulanSaya = {
  id: number;
  judul: string;
  status: StatusDelegasi;
  ro_kode: string;
  kegiatan_id: number | null;
  kegiatan_nama: string | null;
  satuan: string;
  poin_per_satuan: string | number | null;
  target_total: string | number | null;
  tenggat: string;
  usulan_at: string | null;
  alasan: string;
  usulan_catatan: string;
};

export type StatusSkor = "usulan" | "disetujui" | "ditolak";
export type SkorSaya = { id: number; nama: string; satuan: string; poin_per_satuan: string | number; skor_status: StatusSkor; skor_alasan: string };

export type BahanTinjau = {
  hari_ini: string;
  pemutus: boolean;
  beri: boolean;
  antrean: LaporanTinjau[];
  revisi: LaporanTinjau[];
  usulan: UsulanMenunggu[];
  sanggah: Sanggah[];
  saya: {
    usulan: UsulanSaya[];
    laporan: { id: number; delegasi_id: number; tanggal: string; poin: string | number; tinjau_status: StatusTinjau; tinjau_alasan: string; poin_diakui: string | number | null }[];
    skor: SkorSaya[];
  };
};

/** Satu jenis di Katalog skor (bentuk baca keu_dlg_katalog_skor). Kertas kerja disimpan sebagai objek bebas yang dibaca lib/delego/skor.ts. */
export type JenisSkor = {
  id: number;
  kode: string;
  nama: string;
  satuan: string;
  poin_per_satuan: string | number;
  uraian: string;
  aktif: boolean;
  skor_status: StatusSkor;
  skor_alasan: string;
  kertas_kerja: Record<string, unknown> | null;
  diusulkan_oleh: number | null;
  diusulkan_nama: string | null;
  urut: number;
};
export type KegiatanTim = { id: number; nama: string; jenis: string; ro_kode: string; tanggal_mulai: string | null; tanggal_selesai: string | null };
export type KatalogSkor = {
  hari_ini: string;
  boleh_putus: boolean;
  jenis: JenisSkor[];
  kegiatan: KegiatanTim[];
  kelompok: { kode: string; nama: string }[];
};

export type JenisKetersediaan = "cuti" | "izin" | "sakit" | "dinas_luar" | "lainnya";
export type StatusKetersediaan = "diajukan" | "disetujui" | "ditolak";
export type Ketersediaan = { id: number; akun: number; jenis: JenisKetersediaan; mulai: string; selesai: string; fraksi: string | number; status: StatusKetersediaan; catatan: string };
export type BarisLapangan = { akun: number; tanggal: string; kegiatan_id: number; kegiatan: string; jenis: string; peran: string };
export type Rekap = {
  hari_ini: string;
  dari: string;
  sampai: string;
  orang: { akun: number; nama: string; jenis: JenisAkun }[];
  lapangan: BarisLapangan[];
  ketersediaan: Ketersediaan[];
};

export type CapaianPegawai = {
  akun: number;
  nama: string;
  mandiri: string | number;
  terverifikasi: string | number;
  disanggah: string | number;
  belum: string | number;
  tidak_diakui: string | number;
  dikoreksi: string | number;
  n_laporan: number;
};
export type PeninjauMonitor = { akun: number; nama: string; menunggu: number; lewat3: number; sanggah_diajukan: number; sanggah_ditolak: number };
export type SanggahMonitor = {
  id: number;
  status: StatusSanggah;
  penerima_akun: number;
  penerima_nama: string;
  judul: string;
  ro_kode: string;
  tanggal: string;
  poin: string | number;
  uraian: string;
  alasan: string;
  pengaju_nama: string;
  diajukan_at: string;
  batas_jawab: string;
  jawaban: string | null;
  dijawab_at: string | null;
  putusan: PutusanSanggah | null;
  poin_diakui: string | number | null;
  catatan_putusan: string;
};
export type Monitor = {
  hari_ini: string;
  dari: string;
  sampai: string;
  pemutus: boolean;
  capaian: CapaianPegawai[];
  peninjau: PeninjauMonitor[];
  terhalang: { oleh: string; jumlah: number }[];
  tepat_waktu: { selesai: number; tepat: number };
  usulan: { menunggu: number; lewat3: number };
  sanggah: SanggahMonitor[];
};
