// lib/alurKelola.ts  (murni; dipakai klien. Tanpa React/DB supaya mudah diuji)
//
// (1 Nov 2026) PENUNJUK ALUR + SEBELUMNYA/BERIKUTNYA untuk halaman SIGAP Kelola -- permintaan user: semua yang beralur harus menunjukkan sedang di tahap
// apa dan apa selanjutnya, dan di bawah halaman ada Sebelumnya / Berikutnya menurut alurnya.
// Dua bentuk alur:
//   (a) alur bertab (Kelola Pendataan): urutan = tab yang TAMPIL (tab yang dimatikan fitur/izin otomatis dilewati), pindah tanpa ganti halaman;
//   (b) alur berhalaman (Identifikasi survei): tiap tahap punya alamat sendiri (href).
// Perilaku (keputusan awal, user belum menegaskan): Berikutnya BEBAS diklik; peringatan hanya tampil bila halaman memberi `peringatan`.

export type TahapAlur = {
  kode: string;
  /** Teks tab/halaman apa adanya, mis. "3 · Siaran & Notifikasi" atau "Identifikasi lanjutan". */
  label: string;
  /** Keterangan satu kalimat: apa yang dikerjakan di tahap ini. */
  ket?: string;
  /** Alamat halaman (alur berhalaman). Alur bertab tidak memakainya. */
  href?: string;
  /** Nama ikon di lajur ikon bila berbeda dari `kode` (mis. sub-alur yang kodenya sama dengan kode tab lain). */
  ikon?: string;
};

export type PosisiAlur = {
  /** Nomor tahap bagi manusia; null = bagian pembuka alur (mis. Ringkasan) yang tidak bernomor. */
  no: number | null;
  /** Jumlah tahap bernomor dalam alur (nomor terbesar, supaya cocok dengan nomor di label tab). */
  total: number;
  tahap: TahapAlur;
  /** Nama tanpa awalan nomor ("Siaran & Notifikasi"). */
  nama: string;
  sebelumnya: TahapAlur | null;
  berikutnya: TahapAlur | null;
  urutan: TahapAlur[];
  indeks: number;
};

/** "3 · Siaran" -> 3 ; "Ringkasan" -> null. */
export function nomorDariLabel(label: string): number | null {
  const m = /^\s*(\d{1,2})\s*[·.)\-:]\s*/.exec(label);
  return m ? Number(m[1]) : null;
}

/** Label tanpa awalan nomor: "3 · Siaran & Notifikasi" -> "Siaran & Notifikasi". */
export function namaTanpaNomor(label: string): string {
  return label.replace(/^\s*\d{1,2}\s*[·.)\-:]\s*/, "").trim();
}

/**
 * Posisi tahap `aktif` dalam `urutan`. Nomor memakai awalan label bila ada ("5 · Monitoring" = tahap 5) agar sama dengan yang tertulis di tab;
 * bila tak satu pun label bernomor, nomor = urutan 1..n. Kode tak dikenal / urutan kosong -> null.
 */
export function posisiAlur(urutan: readonly TahapAlur[], aktif: string): PosisiAlur | null {
  const i = urutan.findIndex((t) => t.kode === aktif);
  if (i < 0) return null;
  const tahap = urutan[i];
  const adaNomor = urutan.some((t) => nomorDariLabel(t.label) !== null);
  const no = adaNomor ? nomorDariLabel(tahap.label) : i + 1;
  const total = adaNomor ? Math.max(0, ...urutan.map((t) => nomorDariLabel(t.label) ?? 0)) : urutan.length;
  return {
    no,
    total,
    tahap,
    nama: namaTanpaNomor(tahap.label),
    sebelumnya: i > 0 ? urutan[i - 1] : null,
    berikutnya: i < urutan.length - 1 ? urutan[i + 1] : null,
    urutan: [...urutan],
    indeks: i,
  };
}

/** Teks penunjuk: "Tahap 3 dari 8 · Siaran & Notifikasi"; bagian pembuka tak bernomor: "Awal alur · Ringkasan". */
export function teksPosisi(p: PosisiAlur): string {
  return p.no === null ? `Awal alur · ${p.nama}` : `Tahap ${p.no} dari ${p.total} · ${p.nama}`;
}

/** Teks tombol: "Berikutnya: 4 · QC" / "Sebelumnya: Ringkasan"; null bila tidak ada tahap di arah itu. */
export function teksTombol(p: PosisiAlur, arah: "sebelumnya" | "berikutnya"): string | null {
  const t = arah === "sebelumnya" ? p.sebelumnya : p.berikutnya;
  if (!t) return null;
  return `${arah === "sebelumnya" ? "Sebelumnya" : "Berikutnya"}: ${t.label}`;
}

/** Tahap terakhir? (halaman boleh menampilkan "Alur selesai" bukan tombol Berikutnya). */
export const tahapTerakhir = (p: PosisiAlur): boolean => p.berikutnya === null;

// ---------------------------------------------------------------------------------------------------------------------------------
// Alur bertab: bentuk urutan dari daftar tab yang tampil.
// ---------------------------------------------------------------------------------------------------------------------------------

export function urutanDariTab(tab: readonly { kode: string; label: string; ket?: string }[]): TahapAlur[] {
  return tab.map((t) => ({ kode: t.kode, label: t.label, ket: t.ket }));
}

/**
 * (1 Nov 2026) SUB-ALUR di dalam satu tab (mis. SPJ transport lokal: Kelengkapan -> Verifikasi & Kunci -> Unduh). `daftar` = sub yang sedang tampil
 * (sudah disaring fitur), `kodeUrut` = urutan alur; sub yang tidak ada di `daftar` dilewati, sub di luar `kodeUrut` bukan bagian alur.
 * Label diberi nomor 1..n supaya "Tahap 2 dari 3" cocok dengan yang tertulis.
 */
export function urutanSubAlur(daftar: readonly { kode: string; label: string; ket?: string }[], kodeUrut: readonly string[], ikon: Record<string, string> = {}): TahapAlur[] {
  const ada = kodeUrut.map((k) => daftar.find((d) => d.kode === k)).filter((d): d is { kode: string; label: string; ket?: string } => Boolean(d));
  return ada.map((d, i) => ({ kode: d.kode, label: `${i + 1} · ${d.label}`, ket: d.ket, ikon: ikon[d.kode] }));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Alur berhalaman: Identifikasi survei (GSBPM tahap awal). Tiap survei mengikuti urutan yang sama.
// ---------------------------------------------------------------------------------------------------------------------------------

export const KODE_IDENTIFIKASI = ["awal", "lanjutan", "tim", "kebutuhan", "pelatihan", "pendataan", "gap"] as const;
export type KodeIdentifikasi = (typeof KODE_IDENTIFIKASI)[number];

/** Alamat dasar satu survei; id harus bilangan bulat positif atau teks angka. */
export const alamatIdentifikasi = (id: string | number): string => `/sigap/kelola/perencanaan/identifikasi/${encodeURIComponent(String(id))}`;

/**
 * (6 Nov 2026) Tujuh tahap: "3 · Susunan tim kerja" disisipkan sebelum Rekrutmen dan pengadaan (jabatan dipindah dari kartu petugas lanjutan).
 * (1 Nov 2026, keputusan user) Dijejerkan agar jelas apa yang harus dikerjakan. Tahap 5 dan 6 hanya MENARIK data dari identifikasi;
 * rinciannya kelak dikerjakan di menu Pelatihan dan menu Pendataan (data kedua menu itu ditarik dari sini). Halaman "Pelaksanaan" lama (tautan kegiatan,
 * usulan penugasan, laporan harian, Bendahara) tetap ada sebagai halaman rincian, dibuka dari tahap 6 dan 7.
 */
export function alurIdentifikasi(id: string | number): TahapAlur[] {
  const dasar = alamatIdentifikasi(id);
  return [
    { kode: "awal", label: "1 · Identifikasi awal", ket: "Formulir A-F, pengesahan (PPK dan TU, KPA terakhir), kematangan Fix/Perkiraan, penegasan H-15.", href: dasar },
    { kode: "lanjutan", label: "2 · Identifikasi lanjutan", ket: "Perkiraan menjadi data Fix: kelas, jumlah dan nama petugas, sumber mitra, translok, penginapan.", href: `${dasar}/lanjutan` },
    { kode: "tim", label: "3 · Susunan tim kerja", ket: "Jabatan dalam tim (ketua, wakil, penanggung jawab) dipilih dari daftar petugas identifikasi lanjutan; rangkap dihitung otomatis.", href: `${dasar}/tim` },
    { kode: "kebutuhan", label: "4 · Rekrutmen dan pengadaan", ket: "Kebutuhan hilir: rekrutmen mitra dan draf pengadaan (hanya dibaca dari identifikasi lanjutan).", href: `${dasar}/kebutuhan` },
    { kode: "pelatihan", label: "5 · Persiapan pelatihan", ket: "Sesi, instruktur, dan peserta dari identifikasi; rinciannya dikerjakan di menu Pelatihan.", href: `${dasar}/pelatihan` },
    { kode: "pendataan", label: "6 · Persiapan pendataan", ket: "Instrumen, jadwal, dan petugas lapangan dari identifikasi; rinciannya dikerjakan di menu Pendataan.", href: `${dasar}/pendataan` },
    { kode: "gap", label: "7 · Gap pelaksanaan", ket: "Rencana identifikasi lanjutan dibanding kenyataan di SIGAP; temuan ditanggapi.", href: `${dasar}/gap` },
    // (14 Nov 2026, Fase 6) tahap 8 ruang survei: daftar bayar dari hari kerja yang sah, pembayaran tercermin, rapor, pelajaran, salin survei.
    { kode: "evaluasi", label: "8 · Bayar dan evaluasi", ket: "Daftar bayar dari hari kerja yang sah, pembayaran tercermin, rapor survei, pelajaran, dan salinan untuk survei berikutnya.", href: `${dasar}/evaluasi` },
  ];
}
