// lib/sigapLaporanPeran.ts  (murni)
//
// (28 Okt 2026) Template Laporan Perjalanan Dinas per peran (PPL, PML, korwil) pada kegiatan Pendataan Pascabencana. Hanya teks (judul seksi,
// kalimat uraian, label kartu angka, catatan); angka dan data tetap dari isian harian -- tidak ada angka baru.
// Kegiatan lain atau peran lain (mis. supervisor) memakai template umum yang sudah ada (peran tidak dikenal -> "umum").

export type JenisTemplateLaporan = "ppl" | "pml" | "korwil" | "umum";

export function jenisTemplate(kodeKegiatan: string, peran: string | null | undefined): JenisTemplateLaporan {
  if (!kodeKegiatan.startsWith("pascabencana")) return "umum";
  return peran === "ppl" || peran === "pml" || peran === "korwil" ? peran : "umum";
}

export type TeksLaporan = {
  /** teks footer: "<kode> • <judul>" */
  judul: string;
  seksiUraian: string;
  seksiLokasi: string;
  seksiKendala: string;
  labelAngka: string;
  /** paragraf uraian; {wilayah} sudah disisipkan */
  paragraf: string[];
  catatan: string;
};

export type MasukanTeksLaporan = {
  jenis: JenisTemplateLaporan;
  kegiatanNama: string;
  namaPetugas: string;
  labelJabatan: string;
  tanggalTeks: string;
  satuan: string;
  jumlahRealisasi: number;
  jumlahLokasi: number;
  wilayah: string;
};

export function teksLaporan(m: MasukanTeksLaporan): TeksLaporan {
  const nama = m.namaPetugas || "-";
  const keg = m.kegiatanNama || "-";
  const jab = m.labelJabatan || "-";
  const di = m.wilayah ? ` di ${m.wilayah}` : "";
  const lokasiKal = m.jumlahLokasi ? `, pada ${m.jumlahLokasi} lokasi sebagaimana tercantum di bawah` : "";
  const umumCatatan = `Laporan ini dirakit otomatis dari isian harian petugas pada aplikasi SIGAP (lokasi, jumlah ${m.satuan}, kendala, dan foto dokumentasi) untuk tanggal ${m.tanggalTeks}, tanpa tambahan data lain.`;

  if (m.jenis === "ppl") {
    return {
      judul: "Laporan Pendataan Lapangan",
      seksiUraian: "URAIAN PELAKSANAAN PENDATAAN",
      seksiLokasi: "LOKASI PENDATAAN",
      seksiKendala: "KENDALA DI LAPANGAN",
      labelAngka: `JUMLAH ${m.satuan.toUpperCase()} DIDATA`,
      paragraf: [
        `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan pendataan lapangan ${keg} sebagai ${jab}${di}, yaitu mendatangi dan mendata ${m.satuan} yang menjadi sasaran pendataan.`,
        `${m.satuan[0]?.toUpperCase() ?? ""}${m.satuan.slice(1)} yang berhasil didata pada tanggal ini sebanyak ${m.jumlahRealisasi}${lokasiKal}.`,
      ],
      catatan: umumCatatan,
    };
  }
  if (m.jenis === "pml") {
    return {
      judul: "Laporan Pengawasan Lapangan",
      seksiUraian: "URAIAN PENGAWASAN DAN IDENTIFIKASI",
      seksiLokasi: "WILAYAH YANG DIAWASI",
      seksiKendala: "KENDALA DAN CATATAN PENGAWASAN",
      labelAngka: `JUMLAH ${m.satuan.toUpperCase()} DIIDENTIFIKASI`,
      paragraf: [
        `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan ${keg} sebagai ${jab}${di}, yaitu mengawasi pendataan oleh PPL di bawahnya serta mengidentifikasi wilayah kerja.`,
        `${m.satuan[0]?.toUpperCase() ?? ""}${m.satuan.slice(1)} yang diidentifikasi pada tanggal ini sebanyak ${m.jumlahRealisasi}${lokasiKal}.`,
      ],
      catatan: umumCatatan,
    };
  }
  if (m.jenis === "korwil") {
    return {
      judul: "Laporan Koordinasi Wilayah",
      seksiUraian: "URAIAN KOORDINASI DAN PENGENDALIAN MUTU",
      seksiLokasi: "WILAYAH KOORDINASI",
      seksiKendala: "KENDALA DAN TEMUAN",
      labelAngka: `JUMLAH ${m.satuan.toUpperCase()} DIPERIKSA`,
      paragraf: [
        `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan ${keg} sebagai ${jab}${di}, yaitu mengoordinasikan petugas di wilayahnya serta melakukan pengendalian mutu (quality check) hasil pendataan.`,
        `${m.satuan[0]?.toUpperCase() ?? ""}${m.satuan.slice(1)} yang diperiksa pada tanggal ini sebanyak ${m.jumlahRealisasi}${lokasiKal}.`,
      ],
      catatan: umumCatatan,
    };
  }
  return {
    judul: "Laporan Perjalanan Dinas",
    seksiUraian: "URAIAN PELAKSANAAN TUGAS",
    seksiLokasi: "LOKASI PELAKSANAAN",
    seksiKendala: "KENDALA DI LAPANGAN",
    labelAngka: `JUMLAH ${m.satuan.toUpperCase()}`,
    paragraf: [
      `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan tugas ${keg} sebagai ${jab}${di}.`,
      `Jumlah ${m.satuan} yang dicatat petugas pada tanggal ini sebanyak ${m.jumlahRealisasi} ${m.satuan}${m.jumlahLokasi ? `, pada ${m.jumlahLokasi} lokasi sebagaimana tercantum di bawah` : ""}.`,
    ],
    catatan: umumCatatan,
  };
}
