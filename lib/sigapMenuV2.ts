// lib/sigapMenuV2.ts
//
// (22 Okt 2026) Susunan sidebar SIGAP v2 -- keputusan user: SIGAP = "Sistem Integrasi Kegiatan BPS" (payung), bukan lagi nama modul anggaran/SPJ.
// Sidebar mengikuti siklus kegiatan: Beranda; Perencanaan; Pelaksanaan; Pengendalian; Pertanggungjawaban; Pengelolaan.
// Logika murni (tanpa React/DB) supaya urutan & syarat tampil bisa diuji; app/sigap/admin/Shell.tsx hanya menggambar hasilnya.
//
// Yang SENGAJA tidak dilakukan (belum disetujui user, lihat catatan-susunan-menu-v2-22okt.md):
//  - tidak ada alamat baru (/sigap/kelola/monitoring, /sigap/kelola/spj) dan tidak ada pengalihan baru; semua tautan memakai alamat yang sudah hidup;
//  - tidak ada fitur baru: item yang belum ada halamannya tampil "segera" (tanpa tautan), seperti sebelumnya;
//  - "Referensi" (SIGAP PEDIA) dipertahankan sebagai kelompok terakhir karena tempat SIGAP PEDIA masih pertanyaan terbuka.

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

export type KodeKelompok = "beranda" | "perencanaan" | "pelaksanaan" | "pengendalian" | "pertanggungjawaban" | "pengelolaan" | "referensi";

/** Urutan kelompok di sidebar (= siklus kegiatan). */
export const URUTAN_KELOMPOK: KodeKelompok[] = ["beranda", "perencanaan", "pelaksanaan", "pengendalian", "pertanggungjawaban", "pengelolaan", "referensi"];

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
        { id: "anggaran", ikon: "buku", label: "Anggaran", status: "segera", title: "RAB / POK dan revisi anggaran — segera hadir" },
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
          href: "/sigap/kelola/lapangan",
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
          ? { id: "administrasi-spj", ikon: "perisai", label: "Administrasi & SPJ", aksi: "admin_transport", title: "Admin transport lokal: penugasan & ST, tarif, verifikasi & kunci" }
          : { id: "administrasi-spj", ikon: "perisai", label: "Administrasi & SPJ", status: "segera" },
        { id: "audit-bukti", ikon: "arsip", label: "Audit dan bukti", status: "segera" },
      ],
    },

    pengelolaan: {
      kode: "pengelolaan",
      label: "Pengelolaan",
      item: [
        { id: "sdm-mitra", ikon: "orang", label: "SDM & Mitra", status: "segera" },
        { id: "tata-kelola", ikon: "perisai", label: "Tata kelola", status: "segera" },
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

    referensi: {
      kode: "referensi",
      label: "Referensi",
      item: [
        { id: "pedia", ikon: "pedia", label: "SIGAP PEDIA", href: "/sigap/pedia", aktifKode: "pedia", title: "Ensiklopedia konsultasi resmi", ketPalet: "ensiklopedia konsultasi" },
        ...jika(i.pediaKelola, { id: "pedia-kelola", ikon: "arsip", label: "Register & arsip bukti", href: "/sigap/kelola/pedia", aktifKode: "pedia_kelola", ketPalet: "buku register & arsip bukti" }),
      ],
    },
  };
  return URUTAN_KELOMPOK.map((kode) => k[kode]);
}
