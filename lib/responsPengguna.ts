// lib/responsPengguna.ts
//
// (11 Nov 2026) REGISTRI RESPONS PENGGUNA -- perluasan penjaga umpan balik (lib/umpanBalik.ts). Permintaan user: "setiap feedback seperti
// pretest-posttest-presensi, undangan, hari tugas, translok, polling, penilaian dll wajib ada monitoringnya di backoffice".
//
// ATURAN: setiap tabel yang DITULIS oleh rute API petugas/peserta (POST/PUT/PATCH di app/api/sigap, lewat .insert/.upsert) wajib berada di
// SALAH SATU dari tiga daftar:
//   1. UMPAN_BALIK (lib/umpanBalik.ts)  : masukan, penilaian, usulan -- punya kartu di halaman "Umpan balik pengguna";
//   2. RESPONS_PENGGUNA (di bawah)      : isian/jawaban/kehadiran/laporan pengguna -- wajib punya rute baca pengelola + halaman pemantau;
//   3. BUKAN_RESPONS (di bawah)         : konfigurasi/data yang diisi pengelola/sistem/log -- wajib beralasan.
// PENJAGA: lib/__tests__/responsPenggunaMonitoring.test.ts gagal bila ada tabel tulis yang tidak terdaftar, atau entri tanpa berkas rute baca /
// halaman pemantau yang nyata. Cara menambah fitur baru: daftarkan tabelnya di sini (atau di UMPAN_BALIK) beserta tempat memantaunya.
// Celah yang sudah diketahui (respons ada, monitoring belum lengkap) dicatat di CELAH_MONITORING, bukan disembunyikan.

export type SumberRespons = {
  /** Kode unik huruf kecil. */
  kode: string;
  nama: string;
  /** Satu kalimat: apa yang diisi pengguna. */
  ket: string;
  /** Tabel penampung respons (semuanya terhitung terdaftar). */
  tabel: string[];
  /** Berkas yang MENULIS respons (rute API, atau berkas lib bila penulisnya pembantu). */
  tulis: string[];
  /** Berkas yang MEMBACA respons untuk pengelola (memuat salah satu tabel). */
  baca: string;
  /** Berkas halaman pemantau di backoffice. */
  halaman: string;
  /** Alamat halaman pemantau (untuk pengelola). */
  alamat: string;
};

export const RESPONS_PENGGUNA: readonly SumberRespons[] = [
  {
    kode: "tes_pelatihan",
    nama: "Pretest dan posttest",
    ket: "Jawaban dan skor sesi tes peserta pelatihan.",
    tabel: ["sigap_tes_sesi"],
    tulis: ["app/api/sigap/pelatihan/tes/[jenis]/route.ts"],
    baca: "app/api/sigap/pelatihan/admin/route.ts",
    halaman: "app/sigap/pelatihan/kelola/page.tsx",
    alamat: "/sigap/kelola/pelatihan (Monitoring > Pretest & Posttest)",
  },
  {
    kode: "presensi_pelatihan",
    nama: "Presensi pelatihan",
    ket: "Kehadiran peserta (GPS, kode, atau dicatat panitia).",
    tabel: ["sigap_pelatihan_presensi"],
    tulis: ["app/api/sigap/pelatihan/presensi/route.ts"],
    baca: "app/api/sigap/pelatihan/admin/kehadiran/route.ts",
    halaman: "app/sigap/pelatihan/kelola/page.tsx",
    alamat: "/sigap/kelola/pelatihan (Monitoring > Presensi)",
  },
  {
    kode: "undangan_pelatihan",
    nama: "Respons undangan pelatihan",
    ket: "Terima atau tolak undangan dan ketentuan pelatihan.",
    tabel: ["sigap_pelatihan_undangan_respons"],
    tulis: [],
    baca: "lib/sigapKesiapanDb.ts",
    halaman: "app/sigap/pelatihan/kelola/page.tsx",
    alamat: "/sigap/kelola/pelatihan (Kesiapan: respons undangan lengkap)",
  },
  {
    kode: "pulsa_pelatihan",
    nama: "Nomor pulsa pelatihan",
    ket: "Konfirmasi atau penggantian nomor HP untuk pulsa.",
    tabel: ["sigap_pelatihan_pulsa"],
    tulis: ["lib/sigapPulsa.ts"],
    baca: "lib/sigapPulsa.ts",
    halaman: "app/sigap/pelatihan/kelola/page.tsx",
    alamat: "/sigap/kelola/pelatihan (Administrasi: nomor pulsa)",
  },
  {
    kode: "hari_tugas",
    nama: "Hari tugas (hari kerja)",
    ket: "Tanggal hari kerja yang dipilih petugas untuk Transport Lokal.",
    tabel: ["sigap_hari_kerja"],
    tulis: ["app/api/sigap/translok/[token]/route.ts"],
    baca: "app/api/sigap/admin/route.ts",
    halaman: "app/sigap/admin/page.tsx",
    alamat: "/sigap/kelola/spj (Monitoring dan Verifikasi)",
  },
  {
    kode: "laporan_translok",
    nama: "Laporan harian Transport Lokal",
    ket: "Lokasi, jumlah, dan kendala yang dilaporkan petugas.",
    tabel: ["sigap_realisasi"],
    tulis: ["app/api/sigap/translok/[token]/route.ts"],
    baca: "app/api/sigap/admin/route.ts",
    halaman: "app/sigap/admin/page.tsx",
    alamat: "/sigap/kelola/spj (Monitoring dan Verifikasi)",
  },
  {
    kode: "foto_translok",
    nama: "Foto dokumentasi Transport Lokal",
    ket: "Foto bukti kegiatan harian yang diunggah petugas.",
    tabel: ["sigap_dokumentasi"],
    tulis: ["app/api/sigap/translok/[token]/foto/route.ts"],
    baca: "app/api/sigap/admin/route.ts",
    halaman: "app/sigap/admin/page.tsx",
    alamat: "/sigap/kelola/spj (Monitoring dan Verifikasi)",
  },
  {
    kode: "permohonan_susulan",
    nama: "Permohonan laporan susulan",
    ket: "Permohonan petugas untuk melengkapi laporan hari yang terlewat.",
    tabel: ["sigap_translok_susulan"],
    tulis: ["app/api/sigap/translok/[token]/susulan/route.ts"],
    baca: "lib/translokSusulanDb.ts",
    halaman: "app/sigap/admin/page.tsx",
    alamat: "/sigap/kelola/spj (antrean susulan)",
  },
  {
    kode: "blokir_translok",
    nama: "Isian pemblokir Transport Lokal",
    ket: "Tanggapan petugas atas hari yang diblokir (kendala/alasan).",
    tabel: ["sigap_translok_blokir"],
    tulis: ["app/api/sigap/translok/[token]/blokir/route.ts"],
    baca: "lib/translokBlokirDb.ts",
    halaman: "app/sigap/admin/page.tsx",
    alamat: "/sigap/kelola/spj",
  },
  {
    kode: "kuis_pra",
    nama: "Kuis pra pelatihan",
    ket: "Percobaan dan jawaban kuis pra pelatihan.",
    tabel: ["sigap_kuis_pra_percobaan"],
    tulis: ["app/api/sigap/pelatihan/kuis-pra/route.ts"],
    baca: "app/api/sigap/pelatihan/kuis-pra/route.ts",
    halaman: "app/sigap/pelatihan/kuis-pra/page.tsx",
    alamat: "/sigap/pelatihan/kuis-pra (rekap pengelola)",
  },
  {
    kode: "vanguard",
    nama: "Vanguard (simulasi, roleplay, sertifikasi)",
    ket: "Percobaan simulasi kuesioner, kesalahan, roleplay, dan ujian sertifikasi petugas.",
    tabel: [
      "sigap_vanguard_percobaan",
      "sigap_vanguard_kesalahan",
      "sigap_vanguard_roleplay",
      "sigap_vanguard_roleplay_langkah",
      "sigap_vanguard_ujian",
      "sigap_vanguard_ujian_butir",
      "sigap_vanguard_tantangan",
    ],
    tulis: ["app/api/sigap/vanguard/route.ts", "app/api/sigap/vanguard/roleplay/route.ts", "app/api/sigap/vanguard/sertifikasi/route.ts"],
    baca: "app/api/sigap/vanguard/admin/route.ts",
    halaman: "app/sigap/vanguard/dasbor/page.tsx",
    alamat: "/sigap/vanguard/dasbor",
  },
  {
    kode: "seleksi",
    nama: "Seleksi mitra (pendaftar dan sesi ujian)",
    ket: "Pendaftaran dan jawaban ujian calon mitra.",
    tabel: ["sigap_seleksi_peserta", "sigap_seleksi_sesi"],
    tulis: ["app/api/sigap/seleksi-saya/route.ts"],
    baca: "app/api/sigap/seleksi-nilai/route.ts",
    halaman: "app/sigap/seleksi/[id]/page.tsx",
    alamat: "/sigap/seleksi/[id]",
  },
  {
    kode: "rapat_hadir",
    nama: "Kehadiran rapat",
    ket: "Presensi peserta rapat.",
    tabel: ["sigap_rapat_hadir"],
    tulis: ["app/api/sigap/rapat/admin/route.ts"],
    baca: "app/api/sigap/rapat/admin/route.ts",
    halaman: "app/sigap/pelatihan/kelola/page.tsx",
    alamat: "/sigap/kelola/pelatihan (Hari H: Rapat)",
  },
  {
    kode: "foto_kegiatan",
    nama: "Foto kegiatan dan tag",
    ket: "Foto yang diunggah petugas beserta tag/penandaan sampel.",
    tabel: ["sigap_foto", "sigap_foto_tag"],
    tulis: ["app/api/sigap/foto/route.ts", "app/api/sigap/foto/tag/route.ts"],
    baca: "app/api/sigap/foto/periksa/route.ts",
    halaman: "app/sigap/kelola/foto/page.tsx",
    alamat: "/sigap/kelola/foto",
  },
];

/** Tabel yang ditulis lewat rute API tetapi BUKAN respons pengguna. Alasan wajib diisi. */
export const BUKAN_RESPONS: readonly { tabel: string; alasan: string }[] = [
  { tabel: "sigap_agenda_sesi", alasan: "Agenda sesi hari H disusun pengelola/instruktur." },
  { tabel: "sigap_akun_peran", alasan: "Penetapan peran akun oleh admin (Peran dan akses)." },
  { tabel: "sigap_anomali_alias", alasan: "Pemetaan nama hasil unggahan anomali oleh pengelola." },
  { tabel: "sigap_anomali_batch", alasan: "Catatan impor anomali oleh pengelola." },
  { tabel: "sigap_anomali_temuan", alasan: "Temuan anomali hasil impor pengelola, bukan isian petugas." },
  { tabel: "sigap_aplikasi_pakai", alasan: "Telemetri pemakaian aplikasi (ping otomatis dari peramban), bukan isian yang dikerjakan petugas." },
  { tabel: "sigap_belajar_aturan", alasan: "(13 Nov 2026, B) Aturan kegiatan belajar dan mutu per waktu yang diatur pengelola (sumber tunggal Vanguard dll.)." },
  { tabel: "sigap_belajar_aturan_jejak", alasan: "(13 Nov 2026, B) Jejak perubahan aturan belajar (log sistem)." },
  { tabel: "sigap_audit",alasan: "Jejak audit sistem; itu sendiri alat monitoring." },
  { tabel: "sigap_foto_pengaturan", alasan: "Konfigurasi foto oleh pengelola." },
  { tabel: "sigap_foto_pengaturan_kegiatan", alasan: "Konfigurasi foto per kegiatan oleh pengelola." },
  { tabel: "sigap_hari_kerja_riwayat", alasan: "Riwayat perubahan hari kerja (log sistem); sumbernya sigap_hari_kerja terpantau." },
  { tabel: "sigap_kegiatan", alasan: "Data kegiatan yang dibuat pengelola." },
  { tabel: "sigap_kegiatan_fitur", alasan: "Pengaturan fitur kegiatan oleh pengelola." },
  { tabel: "sigap_kegiatan_tarif", alasan: "Tarif kegiatan oleh pengelola." },
  { tabel: "sigap_kuis", alasan: "Ruang kuis Adu Sigap yang dibuat pengelola." },
  { tabel: "sigap_kuis_pra_pengaturan", alasan: "Pengaturan kuis pra oleh pengelola." },
  { tabel: "sigap_kuis_soal", alasan: "Soal kuis yang disusun pengelola." },
  { tabel: "sigap_mitra_pool", alasan: "Daftar mitra yang diimpor/diatur pengelola." },
  { tabel: "sigap_pelatihan_berkas", alasan: "Berkas instrumen dan materi yang diunggah pengelola." },
  { tabel: "sigap_pelatihan_laporan", alasan: "Narasi laporan yang ditulis panitia/instruktur." },
  { tabel: "sigap_pelatihan_laporan_foto", alasan: "Foto lampiran laporan yang diunggah panitia/instruktur." },
  { tabel: "sigap_pelatihan_pengaturan", alasan: "Pengaturan pelatihan oleh pengelola." },
  { tabel: "sigap_pelatihan_surat_undangan", alasan: "Surat undangan resmi yang diunggah pengelola." },
  { tabel: "sigap_pelatihan_titik", alasan: "Titik lokasi presensi yang diatur pengelola." },
  { tabel: "sigap_pengumuman", alasan: "Pengumuman yang ditulis pengelola." },
  { tabel: "sigap_penugasan", alasan: "Penugasan petugas oleh admin." },
  { tabel: "sigap_peran", alasan: "Definisi peran oleh admin." },
  { tabel: "sigap_peran_izin", alasan: "Matriks izin peran oleh admin." },
  { tabel: "sigap_push_langganan", alasan: "Pendaftaran perangkat notifikasi (teknis), bukan isian petugas." },
  { tabel: "sigap_push_log", alasan: "Log pengiriman notifikasi (sistem)." },
  { tabel: "sigap_rapat", alasan: "Rapat yang dibuat pengelola." },
  { tabel: "sigap_seleksi", alasan: "Seleksi yang dibuat pengelola." },
  { tabel: "sigap_seleksi_nilai", alasan: "Nilai seleksi yang diisi pengelola." },
  { tabel: "sigap_seleksi_soal", alasan: "Soal seleksi yang disusun pengelola." },
  { tabel: "sigap_seleksi_variabel", alasan: "Variabel penilaian seleksi (konfigurasi pengelola)." },
  { tabel: "sigap_seleksi_wilayah", alasan: "Wilayah seleksi yang diatur pengelola." },
  { tabel: "sigap_surat_tugas", alasan: "Surat tugas yang diunggah admin." },
  { tabel: "sigap_tes", alasan: "Definisi tes yang dibuat pengelola." },
  { tabel: "sigap_tes_paket_unduh", alasan: "Catatan otomatis sistem: versi paket soal luring yang dipegang HP peserta (bukan isian; dipantau di kartu Agenda sesi instruktur)." },
  { tabel: "sigap_tes_soal", alasan: "Soal tes yang diunggah pengelola." },
];

export const kodeRespons = (): string[] => RESPONS_PENGGUNA.map((s) => s.kode);
export const tabelRespons = (): string[] => RESPONS_PENGGUNA.flatMap((s) => s.tabel);
