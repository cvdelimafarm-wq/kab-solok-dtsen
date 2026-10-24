// lib/sigapMenuV2.ts
//
// (22 Okt 2026) Susunan sidebar SIGAP v2 -- keputusan user: SIGAP = "Sistem Integrasi Kegiatan BPS" (payung), bukan lagi nama modul anggaran/SPJ.
// Sidebar mengikuti siklus kegiatan: Beranda; Perencanaan; Pelaksanaan; Pengendalian; Pertanggungjawaban; Pengelolaan.
// Logika murni (tanpa React/DB) supaya urutan & syarat tampil bisa diuji; app/sigap/admin/Shell.tsx hanya menggambar hasilnya.
//
// (23 Okt 2026, Dokumen Induk SIGAP v2 -- usulan Claude disetujui user "setuju semua"):
//  - alamat baru /sigap/kelola/monitoring (isi = halaman lapangan) dan /sigap/kelola/spj (isi = halaman admin); alamat lama dialihkan 307 (next.config.js);
//  - kelompok "Referensi" dihapus: "Register & arsip bukti" menjadi isi "Audit dan bukti" (Pertanggungjawaban); SIGAP PEDIA (rujukan regulasi) tinggal di
//    Pengelolaan dekat Tata kelola, supaya tetap terjangkau semua akun;
//  - tidak ada fitur baru: item yang belum ada halamannya tampil "segera" (tanpa tautan), seperti sebelumnya.

/** Nama payung SIGAP (disamakan dengan NAMA_PORTAL di lib/halaman.ts). */
export const NAMA_PAYUNG = "Sistem Integrasi Kegiatan BPS";

export type NamaIkon =
  | "beranda"
  | "buku"
  | "revisi"
  | "motor"
  | "pesawat"
  | "uang"
  | "paket"
  | "grafik"
  | "tautan"
  | "perisai"
  | "gembok"
  | "cari"
  | "lonceng"
  | "panah"
  | "panel"
  | "pedia"
  | "arsip"
  | "alur"
  | "kompas"
  | "orang"
  | "kantor"
  | "siaran";

export type KodeKelompok = "beranda" | "perencanaan" | "pelaksanaan" | "pengendalian" | "pertanggungjawaban" | "pengelolaan";

/** Urutan kelompok di sidebar (= siklus kegiatan). */
export const URUTAN_KELOMPOK: KodeKelompok[] = ["beranda", "perencanaan", "pelaksanaan", "pengendalian", "pertanggungjawaban", "pengelolaan"];

export type ItemMenu = {
  id: string;
  ikon: NamaIkon;
  label: string;
  /** Alamat halaman (alamat yang sudah hidup). Item "segera"/"nonaktif" tidak punya. */
  href?: string;
  /** Dicocokkan dengan prop `aktif` Shell untuk menandai halaman yang sedang dibuka. */
  aktifKode?: string;
  /** "segera" = belum ada halamannya; "nonaktif" = ada tetapi akun belum diberi akses. */
  status?: "segera" | "nonaktif";
  title?: string;
  /** Keterangan kecil di kanan label (mis. "—"). */
  ket?: string;
  /** Keterangan di palet perintah (Ctrl K). */
  ketPalet?: string;
  /** "beranda" = pindah ke tab Beranda admin; "admin_transport" = induk sub-menu admin transport lokal (digambar khusus oleh Shell). */
  aksi?: "beranda" | "admin_transport";
};

export type KelompokMenu = { kode: KodeKelompok; label: string | null; item: ItemMenu[] };

/** Izin & keadaan akun yang menentukan item mana yang tampil (dihitung Shell dari `ringkas.izin`). */
export type IzinMenuSidebar = {
  /** Token halaman petugas transport lokal akun ini (null = tidak punya penugasan). */
  tokenPetugas: string | null;
  /** Punya minimal satu sub-menu Admin transport lokal. */
  adaSubAdmin: boolean;
  perencanaan: boolean;
  pelatihanKelola: boolean;
  kontrak: boolean;
  pediaKelola: boolean;
  lapangan: boolean;
  pendataanKelola: boolean;
  akses: boolean;
  aplikasi: boolean;
  delego: boolean;
};

function jika(syarat: boolean, ...item: ItemMenu[]): ItemMenu[] {
  return syarat ? item : [];
}

export function susunMenu(i: IzinMenuSidebar): KelompokMenu[] {
  const k: Record<KodeKelompok, KelompokMenu> = {
    beranda: { kode: "beranda", label: null, item: [{ id: "beranda", ikon: "beranda", label: "Beranda", aksi: "beranda", aktifKode: "beranda" }] },

    perencanaan: {
      kode: "perencanaan",
      label: "Perencanaan",
      item: [
        ...jika(i.perencanaan, {
          id: "alur-gsbpm",
          ikon: "alur",
          label: "Alur GSBPM",
          href: "/sigap/kelola/perencanaan",
          aktifKode: "perencanaan",
          title: "Uji coba: RO anggaran → kegiatan utama → tahap GSBPM",
          ketPalet: "RO → kegiatan utama → tahap GSBPM (uji coba)",
        }),
        { id: "anggaran", ikon: "buku", label: "Anggaran", href: "/sigap/ro", aktifKode: "anggaran", title: "Rincian Output (RO): POK, RAB, kekurangan, administrasi, realisasi, dan jadwal revisi", ketPalet: "RO, RAB, revisi anggaran, realisasi" },
      ],
    },

    pelaksanaan: {
      kode: "pelaksanaan",
      label: "Pelaksanaan",
      item: [
        ...jika(!!i.tokenPetugas || i.pelatihanKelola, {
          id: "pelatihan",
          ikon: "buku",
          label: "Pelatihan",
          href: "/sigap/pelatihan",
          aktifKode: "pelatihan",
          title: "Langkah pelatihan: pretest, presensi, posttest",
          ketPalet: "langkah, pretest, presensi & posttest",
        }),
        ...jika(i.pelatihanKelola, {
          id: "pelatihan-kelola",
          ikon: "grafik",
          label: "Kelola pelatihan",
          href: "/sigap/kelola/pelatihan",
          aktifKode: "pelatihan_kelola",
          title: "Soal, jadwal & monitoring tes",
        }),
        ...jika(i.pendataanKelola, {
          id: "pendataan",
          ikon: "arsip",
          label: "Pendataan",
          href: "/sigap/kelola/pendataan",
          aktifKode: "pendataan_kelola",
          title: "Kelola Pendataan: daftar KK, tim, siaran, monitoring, pemeriksaan, administrasi",
          ketPalet: "daftar KK, tim, siaran, monitoring, SPJ",
        }),
        i.tokenPetugas
          ? { id: "transport-lokal", ikon: "motor", label: "Transport lokal", href: `/sigap/translok/${i.tokenPetugas}`, title: "Halaman petugas transport lokal Anda", ketPalet: "halaman petugas saya" }
          : { id: "transport-lokal", ikon: "motor", label: "Transport lokal", status: "nonaktif", ket: "—", title: "Anda tidak punya penugasan transport lokal" },
        { id: "perjalanan-dinas", ikon: "pesawat", label: "Perjalanan dinas", status: "segera" },
        { id: "honor", ikon: "uang", label: "Honor", status: "segera" },
        i.kontrak
          ? { id: "pengadaan", ikon: "paket", label: "Pengadaan", href: "/sigap/kelola/pengadaan", aktifKode: "kontrak", title: "Pengadaan & kontrak", ketPalet: "paket, master, penyedia" }
          : { id: "pengadaan", ikon: "paket", label: "Pengadaan", status: "nonaktif", ket: "—", title: "Akun Anda belum diberi akses Pengadaan & Kontrak" },
      ],
    },

    pengendalian: {
      kode: "pengendalian",
      label: "Pengendalian",
      item: [
        ...jika(i.lapangan, {
          id: "monitoring",
          ikon: "grafik",
          label: "Monitoring",
          href: "/sigap/kelola/monitoring",
          title: "Monitoring lapangan: translok + hasil identifikasi/pendataan per petugas per tanggal",
          ketPalet: "lapangan: translok, identifikasi, pendataan",
        }),
        { id: "ruang-keputusan", ikon: "kompas", label: "Ruang keputusan", status: "segera" },
      ],
    },

    pertanggungjawaban: {
      kode: "pertanggungjawaban",
      label: "Pertanggungjawaban",
      item: [
        i.adaSubAdmin
          ? { id: "administrasi-spj", ikon: "perisai", label: "Administrasi & SPJ", aksi: "admin_transport", title: "Penugasan & ST, tarif, verifikasi & kunci SPJ" }
          : { id: "administrasi-spj", ikon: "perisai", label: "Administrasi & SPJ", status: "segera" },
        // Dokumen Induk v2: arsip dan register bukti masuk "Audit dan bukti". Selama belum ada halaman audit lain, item ini membuka register SIGAP PEDIA bagi pengelolanya.
        i.pediaKelola
          ? { id: "audit-bukti", ikon: "arsip", label: "Audit dan bukti", href: "/sigap/kelola/pedia", aktifKode: "pedia_kelola", title: "Register & arsip bukti konsultasi resmi", ketPalet: "buku register & arsip bukti" }
          : { id: "audit-bukti", ikon: "arsip", label: "Audit dan bukti", status: "segera" },
      ],
    },

    pengelolaan: {
      kode: "pengelolaan",
      label: "Pengelolaan",
      item: [
        { id: "sdm-mitra", ikon: "orang", label: "SDM & Mitra", status: "segera" },
        { id: "tata-kelola", ikon: "perisai", label: "Tata kelola", status: "segera" },
        { id: "pedia", ikon: "pedia", label: "SIGAP PEDIA", href: "/sigap/pedia", aktifKode: "pedia", title: "Ensiklopedia konsultasi resmi", ketPalet: "ensiklopedia konsultasi" },
        { id: "kantor", ikon: "kantor", label: "Kantor", status: "segera" },
        { id: "diseminasi", ikon: "siaran", label: "Diseminasi", status: "segera" },
        ...jika(i.akses, { id: "peran-akses", ikon: "gembok", label: "Peran dan akses", href: "/sigap/kelola/akses", aktifKode: "akses" }),
        ...jika(i.aplikasi, {
          id: "aplikasi-periode",
          ikon: "panel",
          label: "Aplikasi & periode",
          href: "/sigap/kelola/aplikasi",
          title: "Kelola aplikasi, admin & periode kegiatan",
          ketPalet: "kelola aplikasi, admin & periode",
        }),
        ...jika(i.delego, { id: "delego", ikon: "tautan", label: "Delego", href: "/sigap/kelola/delego", title: "Buka Delego", ketPalet: "aplikasi delegasi kerja" }),
      ],
    },
  };
  return URUTAN_KELOMPOK.map((kode) => k[kode]);
}
