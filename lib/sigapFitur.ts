// lib/sigapFitur.ts  (logika murni; aman diimpor klien dan server)
//
// (30 Okt 2026) PROFIL FITUR KEGIATAN. Tujuan (permintaan user): fitur yang ada di Pendataan Pascabencana dan SPDT NTP tersedia untuk kedua kegiatan, dan
// bila tidak cocok untuk satu kegiatan ada mekanisme centang yang mengikuti STRATEGI dan jenis kegiatan, supaya SIGAP bisa dipakai untuk banyak jenis kegiatan
// dan tetap bisa disesuaikan.
//
// Dua lapis:
//  1. STRATEGI kegiatan (sigap_kegiatan.strategi) memilih paket fitur bawaan.
//  2. Centang per fitur (sigap_kegiatan_fitur) mengganti bawaan itu untuk satu kegiatan.
//
// Setiap fitur punya "ketergantungan": `umum` = layarnya sudah mengikuti kegiatan (bisa dicentang untuk kegiatan apa pun); `status` = layarnya masih membaca
// data pendataan berstatus per sasaran (tabel bencana_*, terikat Pendataan Pascabencana), jadi baru bisa dicentang pada kegiatan itu. Fitur `status` dilepas
// satu per satu menjadi `umum` pada tahap berikutnya (lihat dokumen identifikasi 30 Okt). Fitur yang tidak tersedia untuk sebuah kegiatan SELALU mati, apa pun
// isi centang tersimpan, sehingga mengganti strategi tidak pernah membuka layar yang akan menampilkan data kegiatan lain.

export type StrategiKegiatan = "status_per_sasaran" | "lembar_bantu" | "sampel_sls" | "pelatihan" | "umum";

export const STRATEGI: { kode: StrategiKegiatan; label: string; ket: string }[] = [
  {
    kode: "status_per_sasaran",
    label: "Status per sasaran (tim bersama)",
    ket: "Tim PML dan PPL menandai hasil tiap sasaran (mis. KK) pada wilayah timnya; ada persen capaian, laju, dan perkiraan selesai. Contoh: Pendataan Pascabencana.",
  },
  {
    kode: "lembar_bantu",
    label: "Lembar bantu (tanpa status)",
    ket: "Petugas mendapat daftar sasaran, peta, dan navigasi; hasil dicatat di aplikasi survei lain. Contoh: SPDT NTP.",
  },
  {
    kode: "sampel_sls",
    label: "Sampel per SLS (beban perorangan)",
    ket: "Tiap PPL mendapat 1-2 SLS, tiap SLS 10 sampel, sampel pengganti opsional. Contoh: Sakernas dan Seruti triwulan IV. Alokasi sampel menyusul; sementara memakai fitur umum.",
  },
  { kode: "pelatihan", label: "Pelatihan", ket: "Kegiatan pelatihan atau rapat: peserta, presensi, tes, dan administrasi." },
  { kode: "umum", label: "Umum", ket: "Kegiatan lain; hanya fitur umum (penugasan, siaran, QC Pemahaman, administrasi)." },
];
export const STRATEGI_AWAL: StrategiKegiatan = "umum";
export const strategiSah = (s: unknown): s is StrategiKegiatan => typeof s === "string" && STRATEGI.some((x) => x.kode === s);
export const labelStrategi = (s: string): string => STRATEGI.find((x) => x.kode === s)?.label ?? s;

/** Strategi bawaan bila kolom belum terbaca: kegiatan 1 (Pascabencana) = status per sasaran, selain itu umum. Sama dengan perilaku sebelum profil fitur. */
export const strategiBawaanKegiatan = (id: number): StrategiKegiatan => (id === 1 ? "status_per_sasaran" : STRATEGI_AWAL);

export type KodeFitur =
  | "ringkasan"
  | "persiapan_sasaran"
  | "persiapan_lembar"
  | "persiapan_laporan_spj"
  | "tim_alokasi"
  | "tim_penugasan"
  | "siaran"
  | "qc_pemahaman"
  | "qc_dokumen"
  | "qc_kuesioner"
  | "monitoring"
  | "pemeriksaan_identifikasi"
  | "pemeriksaan_lapangan"
  | "pemeriksaan_foto"
  | "administrasi"
  | "laporan";

export type Ketergantungan = "umum" | "status";
export type DefFitur = { kode: KodeFitur; kelompok: string; label: string; ket: string; bergantung: Ketergantungan };

export const FITUR: DefFitur[] = [
  { kode: "ringkasan", kelompok: "Ringkasan", label: "Ringkasan pendataan", ket: "Angka utama dan alur kerja dalam satu layar.", bergantung: "status" },
  { kode: "persiapan_sasaran", kelompok: "1 · Persiapan", label: "Unggah daftar sasaran dan permintaan FASIH", ket: "Daftar KK sasaran, permintaan daftar ke FASIH, Sub SLS yang belum diajukan.", bergantung: "status" },
  { kode: "persiapan_lembar", kelompok: "1 · Persiapan", label: "Pengaturan lembar pendataan", ket: "Istilah, warna, bentuk, dan alasan tombol hasil; variabel radar.", bergantung: "status" },
  { kode: "persiapan_laporan_spj", kelompok: "1 · Persiapan", label: "Isi laporan SPJ", ket: "Pengaturan isi laporan harian untuk SPJ transport lokal.", bergantung: "status" },
  { kode: "tim_alokasi", kelompok: "2 · Tim & Surat Tugas", label: "Alokasi PML/PPL per Sub SLS", ket: "Alokasi wilayah tim pada peta Sub SLS dan pelatihan petugas.", bergantung: "status" },
  { kode: "tim_penugasan", kelompok: "2 · Tim & Surat Tugas", label: "Penugasan dan Surat Tugas", ket: "Tautkan petugas ke kegiatan, unggah Surat Tugas, daftar ST.", bergantung: "umum" },
  { kode: "siaran", kelompok: "3 · Siaran & Notifikasi", label: "Siaran dan notifikasi", ket: "Siaran ke seluruh petugas dan notifikasi ke satu petugas.", bergantung: "umum" },
  { kode: "qc_pemahaman", kelompok: "4 · QC", label: "QC Pemahaman harian", ket: "Hasil, pengaturan jadwal, dan bank soal kuis pemahaman PML/PPL.", bergantung: "umum" },
  { kode: "qc_dokumen", kelompok: "4 · QC", label: "Dokumen pemeriksaan PML", ket: "PDF hasil pemeriksaan yang diunggah PML.", bergantung: "umum" },
  { kode: "qc_kuesioner", kelompok: "4 · QC", label: "Kuesioner supervisi", ket: "Kuesioner quality check untuk Lembar Supervisi korwil.", bergantung: "status" },
  { kode: "monitoring", kelompok: "5 · Monitoring", label: "Monitoring progres dan kinerja", ket: "Progres petugas, poin kinerja harian, perkiraan kebutuhan anggaran.", bergantung: "status" },
  { kode: "pemeriksaan_identifikasi", kelompok: "6 · Pemeriksaan", label: "Identifikasi SLS", ket: "Progres Lembar Identifikasi SLS seluruh PML.", bergantung: "status" },
  { kode: "pemeriksaan_lapangan", kelompok: "6 · Pemeriksaan", label: "Lapangan per petugas", ket: "Hasil identifikasi, pendataan, dan status transport lokal per petugas per tanggal.", bergantung: "status" },
  { kode: "pemeriksaan_foto", kelompok: "6 · Pemeriksaan", label: "Foto dan dokumentasi", ket: "Saklar Kamera SIGAP, foto yang perlu diperiksa, masa simpan, usulan hapus.", bergantung: "status" },
  { kode: "administrasi", kelompok: "7 · Administrasi & SPJ", label: "Administrasi dan SPJ", ket: "Transport lokal (verifikasi, kunci, tarif), pengadaan, pertanggungjawaban.", bergantung: "umum" },
  { kode: "laporan", kelompok: "8 · Laporan", label: "Laporan Sementara", ket: "Laporan otomatis dari database SIGAP, unduh Word atau cetak.", bergantung: "status" },
];

export const KODE_FITUR: KodeFitur[] = FITUR.map((f) => f.kode);
export const fiturSah = (k: unknown): k is KodeFitur => typeof k === "string" && KODE_FITUR.includes(k as KodeFitur);
export const defFitur = (k: KodeFitur): DefFitur => FITUR.find((f) => f.kode === k) as DefFitur;

/** Kegiatan yang datanya dibaca layar `status` (tabel bencana_*): Pendataan Pascabencana. Berkurang seiring layar dilepas menjadi `umum`. */
export const KEGIATAN_DATA_STATUS = 1;

/** Fitur yang BISA dinyalakan untuk strategi dan kegiatan ini (tersedia), terlepas dari centang. */
export function fiturTersedia(strategi: StrategiKegiatan, kode: KodeFitur, kegiatanId: number): boolean {
  return defFitur(kode).bergantung === "umum" || (strategi === "status_per_sasaran" && kegiatanId === KEGIATAN_DATA_STATUS);
}

const BAWAAN_UMUM: KodeFitur[] = ["tim_penugasan", "siaran", "qc_pemahaman", "qc_dokumen", "administrasi"];
/** Paket bawaan tiap strategi (kode fitur yang menyala). status_per_sasaran = seluruh fitur (perilaku Pendataan Pascabencana). */
export const BAWAAN_STRATEGI: Record<StrategiKegiatan, KodeFitur[]> = {
  status_per_sasaran: KODE_FITUR,
  lembar_bantu: BAWAAN_UMUM,
  sampel_sls: BAWAAN_UMUM,
  pelatihan: ["tim_penugasan", "siaran", "administrasi"],
  umum: BAWAAN_UMUM,
};

export type PetaFitur = Record<KodeFitur, boolean>;
export type CentangFitur = Partial<Record<KodeFitur, boolean>>;

/** Keadaan akhir tiap fitur: centang tersimpan menang atas bawaan strategi; fitur yang tidak tersedia untuk strategi ini selalu mati. */
export function fiturEfektif(strategi: StrategiKegiatan, centang: CentangFitur, kegiatanId: number): PetaFitur {
  const hasil = {} as PetaFitur;
  for (const k of KODE_FITUR) {
    if (!fiturTersedia(strategi, k, kegiatanId)) {
      hasil[k] = false;
      continue;
    }
    const tersimpan = centang[k];
    hasil[k] = typeof tersimpan === "boolean" ? tersimpan : BAWAAN_STRATEGI[strategi].includes(k);
  }
  return hasil;
}

/** Profil dari JSON tak tepercaya (respons API / penyimpanan): nilai rusak diganti bawaan kegiatan; tidak melempar galat. */
export function bacaProfilFitur(mentah: unknown, kegiatanId: number): { strategi: StrategiKegiatan; centang: CentangFitur } {
  const r = (typeof mentah === "object" && mentah !== null ? mentah : {}) as Record<string, unknown>;
  const strategi = strategiSah(r.strategi) ? r.strategi : strategiBawaanKegiatan(kegiatanId);
  const centang: CentangFitur = {};
  const c = (typeof r.centang === "object" && r.centang !== null ? r.centang : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(c)) if (fiturSah(k) && typeof v === "boolean") centang[k] = v;
  return { strategi, centang };
}

/** Hanya centang yang BERBEDA dari bawaan strategi yang perlu disimpan; yang sama dengan bawaan dibuang supaya perubahan paket bawaan ikut berlaku. */
export function centangBeda(strategi: StrategiKegiatan, peta: PetaFitur, kegiatanId: number): CentangFitur {
  const out: CentangFitur = {};
  for (const k of KODE_FITUR) {
    if (!fiturTersedia(strategi, k, kegiatanId)) continue;
    const bawaan = BAWAAN_STRATEGI[strategi].includes(k);
    if (peta[k] !== bawaan) out[k] = peta[k];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Tab Kelola Pendataan
// ---------------------------------------------------------------------------------------------------------------------------------

export type KodeTabKelola = "ringkasan" | "persiapan" | "tim" | "siaran" | "qc" | "monitoring" | "pemeriksaan" | "administrasi" | "laporan";

/** Tab yang tampil menurut fitur yang menyala. "Persiapan" SELALU tampil: di sanalah layar Fitur kegiatan berada, jadi pengaturan tidak bisa terkunci sendiri. */
export function tabTampilKelola(f: PetaFitur): KodeTabKelola[] {
  const t: KodeTabKelola[] = [];
  if (f.ringkasan) t.push("ringkasan");
  t.push("persiapan");
  if (f.tim_alokasi || f.tim_penugasan) t.push("tim");
  if (f.siaran) t.push("siaran");
  if (f.qc_pemahaman || f.qc_dokumen || f.qc_kuesioner) t.push("qc");
  if (f.monitoring) t.push("monitoring");
  if (f.pemeriksaan_identifikasi || f.pemeriksaan_lapangan || f.pemeriksaan_foto) t.push("pemeriksaan");
  if (f.administrasi) t.push("administrasi");
  if (f.laporan) t.push("laporan");
  return t;
}

/** Tab yang dipakai: tab pilihan bila tampil, selain itu tab tampil pertama (alamat lama ke tab yang dimatikan tidak menampilkan layar kosong). */
export function tabAktifKelola(tab: KodeTabKelola, tampil: KodeTabKelola[]): KodeTabKelola {
  return tampil.includes(tab) ? tab : tampil[0] ?? "persiapan";
}

/** Sub-pilihan tab QC yang tampil. */
export function subQcTampil(f: PetaFitur): { hari: boolean; pengaturan: boolean; soal: boolean; dokumen: boolean; kuesioner: boolean } {
  return { hari: f.qc_pemahaman, pengaturan: f.qc_pemahaman, soal: f.qc_pemahaman, dokumen: f.qc_dokumen, kuesioner: f.qc_kuesioner };
}
