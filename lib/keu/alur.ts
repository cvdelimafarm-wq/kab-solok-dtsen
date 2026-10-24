// lib/keu/alur.ts
//
// (25 Okt 2026, tahap 22) Papan 2 mockup "Alur kertas kerja: sebelum, saat, dan sesudah revisi" (butir GSBPM F1-06). Isi teks halaman Alur: langkah A1-A6,
// percabangan kekurangan K1-K5 dan P1-P4, siklus status B1-B4, dan penutupan C1-C4. Tanpa React/DB. Teks mengikuti mockup yang disetujui dan ketentuan
// kantor 24 Okt 2026 (PPK menyatakan sah, KPA menerima laporan).

export type Langkah = { no: string; judul: string; isi: string };

export const SEBELUM: Langkah[] = [
  { no: "A1", judul: "Baca POK semula", isi: "Kolom Semula diambil dari POK tersimpan (RKKS) dan tidak bisa diubah. Kunci baris dibuat stabil agar bisa dicocokkan lagi sesudah revisi." },
  { no: "A2", judul: "Isi kolom Menjadi", isi: "Tiga jalan: Terapkan RAB dalam batas pagu (geseran minimal: dana dipindah seperlunya di dalam KRO dan kelompok belanja yang sama: 51, 524xxx, 52xxxx selain 524, atau 53, dengan pratinjau yang donornya dapat diganti), Terapkan RAB penuh untuk Revisi DIPA, atau ketik langsung seperti di Excel (rumus sederhana diterima). RAB hanya dibaca dan tidak pernah ditimpa; sisa di atas RAB ditampung baris Dana penggenap per akun, hanya untuk menutup kekurangan di kelompok yang sama (akun 524: Perjalanan dinas Kabupaten; akun 52 lain: nama akun + Kabupaten), dapat dimatikan saat menerapkan. Kategori prioritas penerima dapat ditambah dan diatur kantor. Item dapat ditambah, dikurangi, atau diganti akunnya. Redaksi item POK resmi tidak diedit langsung: item lama dikosongkan dan item baru dengan redaksi baru dibuat; item draf yang belum menjadi POK tetap dapat diedit." },
  { no: "A3", judul: "Pemicu dan tingkat", isi: "Setiap baris yang berubah ditandai P-01 sampai P-08. Sistem menghitung tingkat pergeseran 1 sampai 5, dari dalam satu RO sampai antar-Program." },
  { no: "A4", judul: "Jenis disarankan", isi: "Sistem menyarankan Revisi POK, Administrasi, DIPA jalur DJPb, atau DIPA jalur DJA. Operator boleh memilih lain; sistem hanya menandai." },
  { no: "A5", judul: "Pemeriksaan R-01 sampai R-17", isi: "Pagu Satker, jenis belanja, kelompok belanja (R-16: 524xxx hanya dengan 524xxx, 52xxxx lain hanya dengan 52xxxx lain; R-17: dana penggenap tidak minus dan RO tetap sampai pagu yang ditetapkan), Booked ditambah Realisasi, reviu APIP, kelengkapan lampiran. Hasil berwarna merah, kuning, hijau, atau info." },
  { no: "A6", judul: "Matriks semula menjadi", isi: "Hasil akhir tahap ini: matriks perubahan yang tersusun otomatis, siap diekspor ke Excel atau PDF sebagai lampiran usulan." },
];

export const KURANG_UMUM = "Satu aturan dasar berlaku di kedua cabang: RAB tidak pernah ditulis ke POK dan tidak dibuat ulang. Kekurangan adalah angka turunan (RAB dikurangi POK per item) yang dicatat di Buku selisih, jadi tidak ada dua sumber kebenaran yang bisa bertabrakan.";
export const KURANG_AWAL: Langkah[] = [
  { no: "K1", judul: "Hitung kekurangan", isi: "Per item ber-RAB: kekurangan = RAB dikurangi POK, dikelompokkan per KRO dan per kelompok belanja (51, 524xxx, 52xxxx lain, 53). Item selesai dibaca dari Booked ditambah Realisasi." },
  { no: "K2", judul: "Pilih jenis revisi", isi: "Revisi POK atau Administrasi mengikuti cabang K3 sampai K5. Revisi DIPA (DJPb atau DJA) mengikuti cabang P1 sampai P4." },
];
export const CABANG_POK: { judul: string; sub: string; langkah: Langkah[] } = {
  judul: "Cabang Revisi POK (PPK menyatakan sah, KPA menerima laporan)", sub: "Pagu tetap",
  langkah: [
    { no: "K3", judul: "Geser di dalam kelompok", isi: "Dana penggenap dan item selesai dipakai lebih dulu, lalu kelebihan di atas RAB. Donor dan penerima harus satu kelompok: penggenap akun 52 hanya menutup kekurangan akun 52, tidak untuk 51 atau 53; 524xxx hanya untuk 524xxx, dan 52xxxx selain 524 hanya untuk 52xxxx selain 524." },
    { no: "K4", judul: "Turunkan item yang boleh ditunda", isi: "Bila masih kurang, satu-satunya pilihan: turunkan volume item berkategori boleh ditunda (tidak di bawah Booked ditambah Realisasi, hanya ke item berprioritas lebih tinggi, dalam kelompok yang sama). Operator memilih dengan kotak centang di jendela geseran." },
    { no: "K5", judul: "Catat selisih, jangan buat RAB baru", isi: "Penurunan di bawah RAB tetap muncul sebagai kekurangan di Buku selisih (RAB dikurangi POK). Bila nanti ada Revisi DIPA, angka itu sudah siap masuk daftar PPK." },
  ],
};
export const CABANG_DIPA: { judul: string; sub: string; langkah: Langkah[] } = {
  judul: "Cabang Revisi DIPA (DJPb atau DJA)", sub: "Pagu dapat berubah",
  langkah: [
    { no: "P1", judul: "Daftar kekurangan per KRO", isi: "Kekurangan secara pagu KRO (RAB dikurangi POK) masuk Tampilan PPK pada papan Peta KRO Satker. Operator tidak menutupnya sendiri." },
    { no: "P2", judul: "PPK memutuskan per KRO", isi: "Tiga pilihan: terima semua usulan, terima sebagian (dengan jumlah), atau tunda. Selama belum diputuskan statusnya Menunggu." },
    { no: "P3", judul: "Yang diterima menjadi usulan DIPA", isi: "Bagian yang diterima ditelusuri sumbernya menurut tangga wewenang: KRO lain pada Kegiatan yang sama (DJPb, tingkat 3), Kegiatan lain pada Program yang sama (Eselon I, tingkat 4), sisanya pagu tambahan atau antar-Program (DJA, tingkat 5, tidak dijamin). Pemicu R-01 muncul." },
    { no: "P4", judul: "Ditunda atau menunggu tetap tercatat", isi: "Bagian yang ditunda tetap di Buku selisih. Setelah DIPA disahkan dan POK baru diimpor (C1), kekurangan dihitung ulang terhadap POK baru; RAB tetap utuh." },
  ],
};

export const SAAT_CATATAN = "Perpindahan status dicatat operator berdasarkan surat atau dokumen resmi. Sistem tidak memutuskan.";
export const SAAT: Langkah[] = [
  { no: "B1", judul: "Diterapkan", isi: "Kertas kerja dikunci sebagai usulan. Menjadi versi bernomor." },
  { no: "B2", judul: "Disetujui PPK", isi: "Dicatat bila PPK menyatakan sah usulan di lingkup satker; KPA menerima laporan (ketentuan kantor, 24 Okt 2026)." },
  { no: "B3", judul: "Diajukan", isi: "Untuk jalur DJPb atau DJA: tanggal, nomor surat, dan tujuan dicatat. Revisi POK tidak memakai surat usulan: yang dicatat nomor keputusan PPK atau nota (laporan ke KPA)." },
  { no: "B4", judul: "Hasil", isi: "Salah satu dicatat dari surat balasan. Dikembalikan dapat kembali ke B1 sebagai versi berikutnya." },
];
export const HASIL_B4 = ["Dikembalikan", "Ditolak", "Disahkan"] as const;
export const TENGGAT_CATATAN = "Tenggat Pasal 175 (30 Okt untuk DJA, 30 Nov untuk DJPb, 27 Des untuk administrasi dan POK) hanya muncul sebagai pengingat. Bila jatuh pada hari libur, tanggal dimajukan ke hari kerja terakhir sebelumnya. Tidak ada tombol yang dikunci karena tenggat.";

export const SESUDAH: Langkah[] = [
  { no: "C1", judul: "Impor POK hasil penetapan", isi: "Berkas dari Kanwil atau DJA dicocokkan dengan kertas kerja lewat kunci baris. Hasil: sama, berubah, baru, hilang, atau di luar usulan." },
  { no: "C2", judul: "Versi berurutan", isi: "POK semula, versi 1, versi 2, dan seterusnya tersimpan berurutan. Selisih antar-versi dapat dibuka per RO dan per akun." },
  { no: "C3", judul: "RPD dan dampak", isi: "Rencana penarikan dana per bulan dibandingkan sebelum dan sesudah. Dampak ke Booked, Realisasi, dan RAB ditandai." },
  { no: "C4", judul: "Arsip", isi: "Surat, lampiran, matriks, dan riwayat status disimpan pada satu paket per revisi." },
];
export const PENUTUP = "Alur ini menjadi satu butir pada tahap GSBPM F1 (F1-06). Tahap yang lebih awal dan lebih akhir dari butir ini tidak diubah.";

/** Tautan ke halaman SIGAP yang mengerjakan tiap langkah (hanya yang sudah ada). */
export const TAUTAN_LANGKAH: Record<string, { href: string; teks: string }> = {
  A1: { href: "/sigap/revisi/kertas", teks: "Kertas kerja revisi" },
  A2: { href: "/sigap/revisi/kertas", teks: "Kertas kerja revisi" },
  A3: { href: "/sigap/revisi/pemicu", teks: "Pemicu dan tingkat" },
  A4: { href: "/sigap/revisi/pemicu", teks: "Pemicu dan tingkat" },
  A5: { href: "/sigap/revisi/kertas", teks: "Kertas kerja revisi" },
  A6: { href: "/sigap/revisi/kertas", teks: "Kertas kerja revisi" },
  K1: { href: "/sigap/revisi/peta", teks: "Peta KRO Satker" },
  P1: { href: "/sigap/revisi/peta", teks: "Peta KRO Satker" },
  B1: { href: "/sigap/revisi/status", teks: "Status dan riwayat" },
  B2: { href: "/sigap/revisi/status", teks: "Status dan riwayat" },
  B3: { href: "/sigap/revisi/lampiran", teks: "Lampiran dan draf surat" },
  B4: { href: "/sigap/revisi/status", teks: "Status dan riwayat" },
  C1: { href: "/sigap/revisi/pok", teks: "PDF POK resmi dan pencocokan" },
  C2: { href: "/sigap/revisi/versi", teks: "Versi, RPD, dan dampak" },
  C3: { href: "/sigap/revisi/versi", teks: "Versi, RPD, dan dampak" },
  C4: { href: "/sigap/revisi/lampiran", teks: "Lampiran dan draf surat" },
};
export const semuaLangkah = (): Langkah[] => [...SEBELUM, ...KURANG_AWAL, ...CABANG_POK.langkah, ...CABANG_DIPA.langkah, ...SAAT, ...SESUDAH];
