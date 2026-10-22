// lib/sigapPendataanTab.ts
//
// (23 Okt 2026) Susunan tab halaman Kelola Pendataan (/sigap/kelola/pendataan) -- permintaan user: halaman dibingkai sidebar SIGAP seperti
// Kelola Pelatihan dan tab-nya disusun RUNUT mengikuti alur kerja pendataan (persiapan -> tim -> lapangan -> pemeriksaan -> administrasi).
// Logika murni (tanpa React/DB) supaya urutan, alamat, dan pintu masuk bisa diuji; app/sigap/kelola/pendataan/* hanya menggambar.
// Rujukan rancangan yang sudah disetujui (21 Okt): claude/rancangan-kelola-pendataan-gsbpm.md.
//
// Yang SENGAJA tidak dilakukan di tahap ini:
//  - halaman lama yang berat (/bencana, translok admin, identifikasi, lapangan, foto) belum disematkan ke dalam tab; tab memberi PINTU MASUK
//    (kartu tautan) ke halaman itu. Item yang belum ada halamannya tampil "segera" tanpa tautan.
//  - tidak ada alamat baru selain parameter ?tab= pada /sigap/kelola/pendataan.

export type KodeTabPendataan = "ringkasan" | "persiapan" | "tim" | "siaran" | "monitoring" | "pemeriksaan" | "administrasi";

export type ItemTabPendataan = { kode: KodeTabPendataan; label: string; ket: string };

/** Urutan = urutan tampil = urutan alur kerja. */
export const TAB_PENDATAAN: ItemTabPendataan[] = [
  { kode: "ringkasan", label: "Ringkasan", ket: "Angka utama dan langkah-langkah pendataan dalam satu layar." },
  { kode: "persiapan", label: "1 · Persiapan", ket: "Unggah daftar KK sasaran, permintaan daftar KK ke FASIH, dan Sub SLS yang belum diajukan." },
  { kode: "tim", label: "2 · Tim & Surat Tugas", ket: "Alokasi PML/PPL per Sub SLS, penugasan, Surat Tugas, dan pelatihan petugas." },
  { kode: "siaran", label: "3 · Siaran & Notifikasi", ket: "Siaran ke seluruh petugas dan notifikasi ke satu petugas." },
  { kode: "monitoring", label: "4 · Monitoring", ket: "Progres petugas, transport lokal, poin kinerja harian, dan perkiraan kebutuhan anggaran." },
  { kode: "pemeriksaan", label: "5 · Pemeriksaan", ket: "Hasil identifikasi, pemantauan lapangan per petugas, dan foto dokumentasi." },
  { kode: "administrasi", label: "6 · Administrasi & SPJ", ket: "Transport lokal (verifikasi, kunci, tarif), pengadaan, dan pertanggungjawaban." },
];

export const TAB_AWAL: KodeTabPendataan = "ringkasan";

export const labelTabPendataan = (k: KodeTabPendataan): string => TAB_PENDATAAN.find((t) => t.kode === k)?.label ?? "";

/**
 * Nilai ?tab= di alamat -> tab. Alamat lama tetap hidup: ?tab=monitoring (Monitoring) dan ?tab=unggah / tanpa ?tab (dulu "Unggah & Siaran").
 * Nilai tak dikenal -> Ringkasan.
 */
export function bacaTabPendataan(param: string | null | undefined): KodeTabPendataan {
  const p = (param ?? "").trim().toLowerCase();
  if (p === "unggah") return "persiapan";
  return TAB_PENDATAAN.find((t) => t.kode === p)?.kode ?? TAB_AWAL;
}

/**
 * Alamat setelah memilih tab: ?tab= diganti (Ringkasan = tanpa ?tab), ?v= (pilihan variabel Monitoring) dibuang bila bukan tab Monitoring,
 * parameter lain dibiarkan.
 */
export function urlTabPendataan(pathname: string, search: string, tab: KodeTabPendataan): string {
  const q = new URLSearchParams(search);
  if (tab === TAB_AWAL) q.delete("tab");
  else q.set("tab", tab);
  if (tab !== "monitoring") q.delete("v");
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export type PintuMasuk = {
  id: string;
  judul: string;
  ket: string;
  /** Alamat halaman yang sudah hidup. Tanpa href = belum ada halamannya. */
  href?: string;
  status?: "segera";
};
export type KelompokPintu = { judul: string; ket?: string; item: PintuMasuk[] };

/** Pintu masuk per tab (hanya tab yang isinya halaman lain). */
export const PINTU_TAB: Partial<Record<KodeTabPendataan, KelompokPintu[]>> = {
  tim: [
    {
      judul: "Tim lapangan",
      ket: "PML, PPL, dan wilayah kerjanya",
      item: [{ id: "alokasi", judul: "Alokasi & papan tim", ket: "Atur PML/PPL per Sub SLS, master petugas, peta, dan beban kerja.", href: "/bencana" }],
    },
    {
      judul: "Penugasan & Surat Tugas",
      item: [{ id: "penugasan", judul: "Penugasan & ST", ket: "Tautkan petugas ke kegiatan, unggah Surat Tugas asli, dan lihat daftar ST.", href: "/sigap/kelola/translok?tab=penugasan" }],
    },
    {
      judul: "Pelatihan petugas",
      item: [{ id: "pelatihan", judul: "Kelola pelatihan", ket: "Soal pretest/posttest, jadwal, Adu Sigap, presensi, dan monitoring tes.", href: "/sigap/kelola/pelatihan" }],
    },
  ],
  pemeriksaan: [
    {
      judul: "Hasil lapangan",
      item: [
        { id: "identifikasi", judul: "Monitoring Identifikasi SLS", ket: "Progres Lembar Identifikasi SLS seluruh PML; baris PML bisa dibuka sampai Sub SLS.", href: "/sigap/kelola/identifikasi" },
        { id: "lapangan", judul: "Monitoring lapangan per petugas", ket: "Hasil identifikasi, pendataan, dan status transport lokal per petugas per tanggal.", href: "/sigap/kelola/lapangan" },
      ],
    },
    {
      judul: "Bukti dan dokumentasi",
      item: [{ id: "foto", judul: "Foto & dokumentasi", ket: "Saklar Kamera SIGAP, foto yang perlu diperiksa, masa simpan dan usulan hapus.", href: "/sigap/kelola/foto" }],
    },
    {
      judul: "Segera hadir",
      item: [
        { id: "sanggahan", judul: "Sanggahan dan pengawasan PML", ket: "Rekap pengawasan PML dan sanggahan hasil.", status: "segera" },
        { id: "penutupan", judul: "Penutupan wilayah", ket: "Menutup Sub SLS yang pendataannya selesai.", status: "segera" },
      ],
    },
  ],
  administrasi: [
    {
      judul: "Transport lokal",
      item: [
        { id: "tl-monitoring", judul: "Monitoring transport lokal", ket: "Kelengkapan SPJ transport lokal per petugas.", href: "/sigap/kelola/translok?tab=monitoring" },
        { id: "tl-verifikasi", judul: "Verifikasi & Kunci", ket: "Periksa kelengkapan lalu kunci transport lokal.", href: "/sigap/kelola/translok?tab=verifikasi" },
        { id: "tl-tarif", judul: "Kegiatan & Tarif", ket: "Tarif dan pengaturan kegiatan transport lokal.", href: "/sigap/kelola/translok?tab=kegiatan" },
      ],
    },
    {
      judul: "Anggaran dan pengadaan",
      item: [
        { id: "anggaran", judul: "Anggaran kegiatan (POK/RAB)", ket: "Perencanaan kegiatan per RO dan RAB berversi (uji coba).", href: "/sigap/kelola/perencanaan" },
        { id: "pengadaan", judul: "Pengadaan & kontrak", ket: "Paket, master, dan penyedia.", href: "/sigap/kelola/pengadaan" },
      ],
    },
    {
      judul: "Segera hadir",
      item: [
        { id: "paket-spj", judul: "Kelengkapan SPJ dan paket SPJ per petugas", ket: "Satu paket berkas SPJ per petugas.", status: "segera" },
        { id: "honor", judul: "Honor", ket: "Honor petugas dari kegiatan ini.", status: "segera" },
        { id: "dinas", judul: "Perjalanan dinas", ket: "Perjalanan dinas terkait kegiatan ini.", status: "segera" },
      ],
    },
  ],
};
