// lib/umpanBalik.ts
//
// (10 Nov 2026) REGISTRI UMPAN BALIK PENGGUNA -- permintaan user: "jika ada polling atau sesuatu yang ada feedback dari user, maka harus ada
// monitoring di backoffice SIGAP (sigap/kelola)".
//
// ATURAN: setiap fitur yang MENGUMPULKAN umpan balik dari pengguna (masukan, polling, penilaian, usulan, survei kepuasan, rating, dst.) wajib
//   1. terdaftar di UMPAN_BALIK di bawah (tabel, rute penerima, rute baca admin, halaman pemantau), dan
//   2. otomatis muncul di halaman "Umpan balik pengguna" (/sigap/kelola/umpan-balik) yang dibangun dari daftar ini: jumlah, yang menunggu, terakhir masuk.
// Tabel yang BUKAN umpan balik (permohonan izin, nilai dari admin, soal, dll.) didaftarkan di BUKAN_UMPAN_BALIK beserta alasannya.
//
// PENJAGA: lib/__tests__/umpanBalikMonitoring.test.ts gagal bila
//   - ada tabel bernama mirip umpan balik (lihat POLA_NAMA_UMPAN_BALIK) di kode atau SQL yang tidak terdaftar di salah satu daftar,
//   - ada berkas rute API bertanda `UMPAN-BALIK: <kode>` yang kodenya tidak terdaftar,
//   - entri terdaftar tidak punya rute baca admin / halaman pemantau yang nyata (berkas ada, membaca tabel itu, dipanggil halaman).
// Cara menambah fitur baru: (a) beri nama tabel yang memuat salah satu kata pola ATAU tulis komentar `// UMPAN-BALIK: <kode>` di rute penerimanya,
// (b) daftarkan di sini, (c) sediakan rute baca + halaman pemantau. Bila ternyata bukan umpan balik, daftarkan di BUKAN_UMPAN_BALIK dengan alasan.

export type IzinSumber = { menu: string; level: "lihat" | "kelola"; kegiatan?: number };

export type SumberUmpanBalik = {
  /** Kode unik huruf kecil; juga dipakai penanda `UMPAN-BALIK: <kode>` di rute penerima. */
  kode: string;
  nama: string;
  /** Satu kalimat: apa yang dikumpulkan dari pengguna. */
  ket: string;
  tabel: string;
  /** Kolom waktu masuk (untuk "terakhir masuk"). */
  kolomWaktu: string;
  /** Baris yang masih menunggu tindak lanjut admin (mis. status = baru). Kosong = tidak ada konsep menunggu. */
  menunggu?: { kolom: string; nilai: string };
  /** Cuplikan isi terbaru di halaman pemantau induk. Kosong = tidak ditampilkan (mis. penilaian rahasia). */
  cuplikan?: { kolomTeks: string; kolomAkun: string };
  /** Izin yang diperlukan untuk melihat sumber ini di halaman pemantau induk (sama dengan rute baca). */
  izin: IzinSumber;
  /** Berkas rute API yang MENERIMA umpan balik dari pengguna. */
  tulis: string[];
  /** Berkas rute API yang dibaca pengelola. */
  baca: string;
  /** Berkas halaman pemantau rinci (tempat pengelola membaca dan menindaklanjuti). */
  halaman: string;
  /** Alamat halaman pemantau rinci. */
  alamat: string;
};

export const UMPAN_BALIK: readonly SumberUmpanBalik[] = [
  {
    kode: "masukan",
    nama: "Masukan pengguna",
    ket: "Saran, laporan galat, dan pertanyaan dari tombol Masukan.",
    tabel: "sigap_masukan",
    kolomWaktu: "dibuat_at",
    menunggu: { kolom: "status", nilai: "baru" },
    cuplikan: { kolomTeks: "isi", kolomAkun: "akun_id" },
    izin: { menu: "portal.kelola", level: "kelola" },
    tulis: ["app/api/sigap/masukan/route.ts"],
    baca: "app/api/sigap/masukan/route.ts",
    halaman: "app/sigap/kelola/masukan/page.tsx",
    alamat: "/sigap/kelola/masukan",
  },
  {
    kode: "penilaian360",
    nama: "Penilaian 360 antaranggota tim",
    ket: "Penilaian rahasia antarrekan satu tim Pendataan Bencana (kinerja, kedisiplinan, membangun tim, kerja sama, komunikasi).",
    tabel: "sigap_penilaian360",
    kolomWaktu: "diubah_at",
    izin: { menu: "bencana.admin", level: "lihat", kegiatan: 1 },
    tulis: ["app/api/sigap/penilaian360/route.ts"],
    baca: "app/api/sigap/penilaian360/route.ts",
    halaman: "app/sigap/kelola/umpan-balik/penilaian360/page.tsx",
    alamat: "/sigap/kelola/umpan-balik/penilaian360",
  },
  {
    kode: "usulan_kasus",
    nama: "Usulan kasus Vanguard",
    ket: "Kasus janggal dari lapangan yang diusulkan petugas untuk dijadikan soal Vanguard.",
    tabel: "sigap_vanguard_usulan",
    kolomWaktu: "dibuat_at",
    menunggu: { kolom: "status", nilai: "baru" },
    cuplikan: { kolomTeks: "judul", kolomAkun: "akun_id" },
    izin: { menu: "pelatihan.kelola", level: "lihat" },
    tulis: ["app/api/sigap/vanguard/usulan/route.ts"],
    baca: "app/api/sigap/vanguard/usulan/route.ts",
    halaman: "app/sigap/vanguard/sertifikasi/admin/DasborSertifikasi.tsx",
    alamat: "/sigap/vanguard/sertifikasi/admin",
  },
];

/** Tabel yang namanya mirip umpan balik tetapi BUKAN umpan balik pengguna. Alasan wajib diisi. */
export const BUKAN_UMPAN_BALIK: readonly { tabel: string; alasan: string }[] = [
  { tabel: "sigap_izin_susulan", alasan: "Izin susulan diberikan admin kepada petugas (alur perizinan), bukan masukan dari petugas." },
  { tabel: "sigap_translok_susulan", alasan: "Permohonan susulan laporan Transport Lokal: alur persetujuan dengan halaman tinjauan sendiri, bukan umpan balik." },
  { tabel: "sigap_penilaian_kolom", alasan: "Definisi kolom penilaian seleksi (konfigurasi admin)." },
  { tabel: "sigap_penilaian_flag", alasan: "Tanda merah dan rekomendasi dari PML/admin untuk seleksi mitra: penilaian oleh pengelola, bukan umpan balik pengguna." },
  { tabel: "sigap_penilaian_mitra", alasan: "Nilai seleksi mitra yang diisi pengelola, bukan umpan balik pengguna." },
  { tabel: "sigap_qc_kuesioner", alasan: "Definisi kuesioner QC (butir soal yang disusun admin), bukan jawaban pengguna." },
];

/**
 * Kata penanda nama tabel/berkas SQL yang dianggap berpotensi menampung umpan balik. Pemindai memeriksa nama tabel `sigap_*` / `bencana_*`
 * yang muncul sebagai `.from("...")` di app/ dan lib/, serta `create table` di skema-sql/. Pola sengaja luas (lebih baik bertanya daripada terlewat).
 */
export const POLA_NAMA_UMPAN_BALIK = /(masukan|polling|jajak|suara|ulasan|rating|feedback|kuesioner|survei_isi|tanggapan|usulan|penilaian)/;

export const kodeUmpanBalik = (): string[] => UMPAN_BALIK.map((s) => s.kode);
export const sumberDariKode = (kode: string): SumberUmpanBalik | undefined => UMPAN_BALIK.find((s) => s.kode === kode);
