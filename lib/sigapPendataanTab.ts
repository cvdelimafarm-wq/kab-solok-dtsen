// lib/sigapPendataanTab.ts
//
// (23 Okt 2026) Susunan tab halaman Kelola Pendataan (/sigap/kelola/pendataan) -- permintaan user: halaman dibingkai sidebar SIGAP seperti
// Kelola Pelatihan dan tab-nya disusun RUNUT mengikuti alur kerja pendataan (persiapan -> tim -> lapangan -> pemeriksaan -> administrasi).
// Logika murni (tanpa React/DB) supaya urutan, alamat, dan pintu masuk bisa diuji; app/sigap/kelola/pendataan/* hanya menggambar.
// Rujukan rancangan yang sudah disetujui (21 Okt): claude/rancangan-kelola-pendataan-gsbpm.md.
//
// Yang SENGAJA tidak dilakukan di tahap ini:
//  - halaman lama yang berat (/bencana 555 KB, Kelola Pelatihan, Perencanaan, Pengadaan) belum disematkan; tab memberi PINTU MASUK (kartu tautan)
//    ke halaman itu. Item yang belum ada halamannya tampil "segera" tanpa tautan.
//  - (23 Okt 2026, tahap 2) Tab "6 · Pemeriksaan" kini MENYEMATKAN Monitoring Identifikasi SLS, Monitoring Lapangan, dan Foto & dokumentasi
//    sebagai tiga sub-pilihan (?tab=pemeriksaan&sub=identifikasi|lapangan|foto); alamat lama /sigap/kelola/identifikasi|lapangan|foto tetap hidup.
//  - (23 Okt 2026, tahap 3) Tab "2 · Tim & Surat Tugas" (sub: alokasi | penugasan) dan "7 · Administrasi & SPJ" (sub: monitoring | verifikasi | tarif | anggaran)
//    menyematkan komponen tab Admin Transport Lokal (TabPenugasan, TabMonitoring, TabVerifikasi, TabKegiatan) untuk kegiatan Pendataan (id 1).
//  - tidak ada alamat baru selain parameter ?tab= pada /sigap/kelola/pendataan.

export type KodeTabPendataan = "ringkasan" | "persiapan" | "tim" | "siaran" | "qc" | "monitoring" | "pemeriksaan" | "administrasi";

export type ItemTabPendataan = { kode: KodeTabPendataan; label: string; ket: string };

/** Urutan = urutan tampil = urutan alur kerja. */
export const TAB_PENDATAAN: ItemTabPendataan[] = [
  { kode: "ringkasan", label: "Ringkasan", ket: "Angka utama dan langkah-langkah pendataan dalam satu layar." },
  { kode: "persiapan", label: "1 · Persiapan", ket: "Unggah daftar KK sasaran, permintaan daftar KK ke FASIH, dan Sub SLS yang belum diajukan." },
  { kode: "tim", label: "2 · Tim & Surat Tugas", ket: "Alokasi PML/PPL per Sub SLS, penugasan, Surat Tugas, dan pelatihan petugas." },
  { kode: "siaran", label: "3 · Siaran & Notifikasi", ket: "Siaran ke seluruh petugas dan notifikasi ke satu petugas." },
  { kode: "qc", label: "4 · QC", ket: "Quality check: kuis pemahaman harian PML/PPL (hari ini, pengaturan, bank soal) dan kuesioner supervisi untuk Lembar Supervisi korwil." },
  { kode: "monitoring", label: "5 · Monitoring", ket: "Progres petugas, transport lokal, poin kinerja harian, dan perkiraan kebutuhan anggaran." },
  { kode: "pemeriksaan", label: "6 · Pemeriksaan", ket: "Hasil identifikasi, pemantauan lapangan per petugas, dan foto dokumentasi." },
  { kode: "administrasi", label: "7 · Administrasi & SPJ", ket: "Transport lokal (verifikasi, kunci, tarif), pengadaan, dan pertanggungjawaban." },
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
  const tabSama = (q.get("tab") ?? TAB_AWAL) === tab;
  if (tab === TAB_AWAL) q.delete("tab");
  else q.set("tab", tab);
  if (tab !== "monitoring") q.delete("v");
  // ?sub hanya hidup di tab yang punya sub-pilihan dan hanya bila tab tidak berpindah (pindah tab = mulai dari sub pertama)
  if ((tab !== "pemeriksaan" && tab !== "tim" && tab !== "administrasi" && tab !== "qc") || !tabSama) q.delete("sub");
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export type KodeSubPemeriksaan = "identifikasi" | "lapangan" | "foto";
export const SUB_PEMERIKSAAN: { kode: KodeSubPemeriksaan; label: string; ket: string }[] = [
  { kode: "identifikasi", label: "Identifikasi SLS", ket: "Progres Lembar Identifikasi SLS seluruh PML; baris PML bisa dibuka sampai Sub SLS." },
  { kode: "lapangan", label: "Lapangan per petugas", ket: "Hasil identifikasi, pendataan, dan status transport lokal per petugas per tanggal." },
  { kode: "foto", label: "Foto & dokumentasi", ket: "Saklar Kamera SIGAP, foto yang perlu diperiksa, masa simpan dan usulan hapus." },
];
export const SUB_PEMERIKSAAN_AWAL: KodeSubPemeriksaan = "identifikasi";

/** Nilai ?sub= di alamat -> sub-pilihan tab Pemeriksaan; tak dikenal / kosong -> Identifikasi SLS. */
export function bacaSubPemeriksaan(param: string | null | undefined): KodeSubPemeriksaan {
  const p = (param ?? "").trim().toLowerCase();
  return SUB_PEMERIKSAAN.find((x) => x.kode === p)?.kode ?? SUB_PEMERIKSAAN_AWAL;
}

/** Alamat setelah memilih sub-pilihan: ?tab=pemeriksaan dipastikan ada, ?sub= diisi (Identifikasi = tanpa ?sub), parameter lain dibiarkan. */
export function urlSubPemeriksaan(pathname: string, search: string, sub: KodeSubPemeriksaan): string {
  const q = new URLSearchParams(search);
  q.set("tab", "pemeriksaan");
  if (sub === SUB_PEMERIKSAAN_AWAL) q.delete("sub");
  else q.set("sub", sub);
  q.delete("v");
  return `${pathname}?${q.toString()}`;
}

/** (tahap 3) Sub-pilihan umum: tab Tim & Surat Tugas dan Administrasi & SPJ. Sub pertama = bawaan. */
export type SubItem = { kode: string; label: string; ket: string };
export const SUB_TIM: SubItem[] = [
  { kode: "alokasi", label: "Alokasi & pelatihan", ket: "Alokasi PML/PPL per Sub SLS dan pelatihan petugas." },
  { kode: "penugasan", label: "Penugasan & ST", ket: "Tautkan petugas ke kegiatan Pendataan, unggah Surat Tugas asli, dan lihat daftar ST." },
];
export const SUB_ADMINISTRASI: SubItem[] = [
  { kode: "monitoring", label: "Kelengkapan SPJ", ket: "Kelengkapan SPJ transport lokal per petugas." },
  { kode: "verifikasi", label: "Verifikasi & Kunci", ket: "Periksa kelengkapan, pratinjau SPJ per petugas, unduh paket SPJ semua petugas (ZIP), lalu kunci." },
  { kode: "unduh", label: "Unduh SPJ", ket: "Cetak SPJ semua petugas: pilih rentang tanggal (pembayaran bertahap), peran, urutan tim atau abjad, dan dokumen yang dicetak." },
  { kode: "tarif", label: "Kegiatan & Tarif", ket: "Tarif dan pengaturan kegiatan transport lokal." },
  { kode: "pengadaan", label: "Pengadaan & kontrak", ket: "Paket pengadaan, master tahun anggaran, dan penyedia; dokumen kontrak terisi otomatis." },
  { kode: "anggaran", label: "Anggaran & lainnya", ket: "Perencanaan anggaran (POK/RAB) dan item yang segera hadir (honor, perjalanan dinas)." },
];
/** (26 Okt 2026) Tab "4 · QC": pantauan hari ini, pengaturan jadwal, bank soal (QC Pemahaman); (27 Okt 2026) cabang Kuesioner supervisi untuk Lembar Supervisi;
 * (30 Okt 2026) cabang Dokumen pemeriksaan PML: daftar unduh PDF yang diunggah PML (ada untuk semua kegiatan; isinya tampil bila ada dokumen masuk). */
export const SUB_QC: SubItem[] = [
  { kode: "hari", label: "Hasil QC", ket: "Hasil QC Pemahaman per tanggal, rentang tanggal, atau semua periode: siapa sudah mengisi, nilai per tim dan petugas (dengan grafik), soal yang paling banyak salah, dan siapa yang belum mengaktifkan notifikasi." },
  { kode: "pengaturan", label: "Pemahaman · Pengaturan", ket: "Nyalakan QC, jam rilis dan batas, ulangan, pengingat, dan periode berlaku." },
  { kode: "soal", label: "Pemahaman · Bank soal", ket: "Tambah, ubah, matikan soal, atur kata kunci yang disorot, atau impor banyak soal." },
  { kode: "dokumen", label: "Dokumen pemeriksaan PML", ket: "Unduh PDF hasil pemeriksaan yang diunggah PML, dikelompokkan per PML. Daftar terisi setelah ada dokumen yang masuk." },
  { kode: "kuesioner", label: "Kuesioner supervisi", ket: "Kuesioner quality check untuk Lembar Supervisi (korwil): unggah dari Excel untuk petugas dan keluarga (KK), kelola versinya." },
];
export const SUB_PER_TAB: Partial<Record<KodeTabPendataan, SubItem[]>> = { tim: SUB_TIM, administrasi: SUB_ADMINISTRASI, qc: SUB_QC };

/** Nilai ?sub= -> kode sub dalam daftar; kosong/tak dikenal -> sub pertama. */
export function bacaSubDari(daftar: SubItem[], param: string | null | undefined): string {
  const p = (param ?? "").trim().toLowerCase();
  return daftar.find((x) => x.kode === p)?.kode ?? daftar[0].kode;
}

/** Alamat setelah memilih sub: ?tab= dipastikan, ?sub= diisi (sub pertama = tanpa ?sub), ?v dibuang. */
export function urlSubDari(daftar: SubItem[], tab: KodeTabPendataan, pathname: string, search: string, sub: string): string {
  const q = new URLSearchParams(search);
  q.set("tab", tab);
  if (sub === daftar[0].kode) q.delete("sub");
  else q.set("sub", sub);
  q.delete("v");
  return `${pathname}?${q.toString()}`;
}

/** Kegiatan induk Pendataan di sigap_kegiatan (sama dengan KEGIATAN_PENDATAAN_ID di lib/pendataan.ts). */
export const KEGIATAN_PENDATAAN = 1;

/** (29 Okt 2026) Sub-pilihan QC untuk kegiatan selain Pascabencana: Kuesioner supervisi (Lembar Supervisi korwil) khusus Pascabencana. */
export const SUB_QC_PEMAHAMAN: SubItem[] = SUB_QC.filter((x) => x.kode !== "kuesioner");

/**
 * (29 Okt 2026) Survei yang dipilih di Kelola Pendataan: ?k=<id sigap_kegiatan>. Kosong / tidak sah = Pendataan Pascabencana (alamat lama tetap berlaku).
 * Semua tab menyesuaikan survei terpilih; tab yang belum siap per survei memberi keterangan (lihat page.tsx).
 */
export function bacaKegiatanPendataan(param: string | null | undefined): number {
  const t = (param ?? "").trim();
  if (!/^\d{1,7}$/.test(t)) return KEGIATAN_PENDATAAN;
  const n = Number(t);
  return n >= 1 ? n : KEGIATAN_PENDATAAN;
}

/** Alamat setelah memilih survei: ?k= diisi (Pascabencana = tanpa ?k), ?v= dibuang, parameter lain (?tab, ?sub) dibiarkan. */
export function urlKegiatanPendataan(pathname: string, search: string, id: number): string {
  const q = new URLSearchParams(search);
  if (id === KEGIATAN_PENDATAAN) q.delete("k");
  else q.set("k", String(id));
  q.delete("v");
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
  // (23 Okt 2026, tahap 3) Penugasan & ST kini tersemat (SUB_TIM); tersisa tautan ke Alokasi dan Pelatihan.
  tim: [
    {
      judul: "Tim lapangan",
      ket: "PML, PPL, dan wilayah kerjanya",
      item: [{ id: "alokasi", judul: "Alokasi & papan tim", ket: "Atur PML/PPL per Sub SLS, master petugas, peta, dan beban kerja.", href: "/bencana" }],
    },
    {
      judul: "Pelatihan petugas",
      item: [{ id: "pelatihan", judul: "Kelola pelatihan", ket: "Soal pretest/posttest, jadwal, Adu Sigap, presensi, dan monitoring tes.", href: "/sigap/kelola/pelatihan" }],
    },
  ],
  // (23 Okt 2026) Hasil lapangan + Bukti & dokumentasi kini tersemat (SUB_PEMERIKSAAN); yang tersisa di sini hanya item "segera".
  pemeriksaan: [
    {
      judul: "Segera hadir",
      item: [
        { id: "sanggahan", judul: "Sanggahan dan pengawasan PML", ket: "Rekap pengawasan PML dan sanggahan hasil.", status: "segera" },
        { id: "penutupan", judul: "Penutupan wilayah", ket: "Menutup Sub SLS yang pendataannya selesai.", status: "segera" },
      ],
    },
  ],
  // (23 Okt 2026, tahap 3) Transport lokal (monitoring, verifikasi, tarif) kini tersemat (SUB_ADMINISTRASI); tersisa anggaran dan item "segera"; Pengadaan & kontrak juga tersemat (tahap 4).
  administrasi: [
    {
      judul: "Anggaran",
      item: [
        { id: "anggaran", judul: "Anggaran kegiatan (POK/RAB)", ket: "Perencanaan kegiatan per RO dan RAB berversi (uji coba).", href: "/sigap/kelola/perencanaan" },
      ],
    },
    {
      judul: "Segera hadir",
      item: [
        { id: "honor", judul: "Honor", ket: "Honor petugas dari kegiatan ini.", status: "segera" },
        { id: "dinas", judul: "Perjalanan dinas", ket: "Perjalanan dinas terkait kegiatan ini.", status: "segera" },
      ],
    },
  ],
};
