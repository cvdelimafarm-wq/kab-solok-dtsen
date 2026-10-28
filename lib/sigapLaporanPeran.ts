// lib/sigapLaporanPeran.ts  (murni)
//
// (28 Okt 2026) Template Laporan Perjalanan Dinas per peran (PPL, PML, korwil) pada kegiatan Pendataan Pascabencana. Hanya teks (judul seksi,
// kalimat uraian, label kartu angka, catatan); angka dan data tetap dari isian harian -- tidak ada angka baru.
// Kegiatan lain atau peran lain (mis. supervisor) memakai template umum yang sudah ada (peran tidak dikenal -> "umum").

import { isiTemplat, teksAktivitas, type Aktivitas } from "./sigapLaporanIsi";

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
  /** (28 Okt 2026) kegiatan hari itu menurut data (lib/sigapLaporanIsi.ts); kosong = teks bawaan lama */
  aktivitas?: Aktivitas;
  /** (28 Okt 2026) judul/uraian pengganti dari pengaturan "Isi laporan SPJ" (kosong = bawaan); boleh memuat penanda {nama}, {tanggal}, dst. */
  ganti?: { judul?: string; uraian?: string };
  /** ada blok lampiran data (hasil pendataan, QC, dst.) pada laporan ini: catatan kaki menyebut catatan lapangan SIGAP */
  adaLampiran?: boolean;
};

export function teksLaporan(m: MasukanTeksLaporan): TeksLaporan {
  const t = teksDasar(m);
  const g = m.ganti;
  if (!g || (!g.judul && !g.uraian)) return t;
  const v = {
    nama: m.namaPetugas || "-",
    kegiatan: m.kegiatanNama || "-",
    jabatan: m.labelJabatan || "-",
    tanggal: m.tanggalTeks,
    wilayah: m.wilayah || "-",
    satuan: m.satuan,
    jumlah: m.jumlahRealisasi,
    lokasi: m.jumlahLokasi,
    aktivitas: m.aktivitas ? teksAktivitas(m.jenis === "umum" ? null : m.jenis, m.aktivitas) || "melaksanakan tugas" : "melaksanakan tugas",
  };
  const paragraf = g.uraian ? g.uraian.split(/\r?\n/).map((b) => isiTemplat(b.trim(), v)).filter(Boolean) : t.paragraf;
  return { ...t, judul: g.judul ? isiTemplat(g.judul, v) : t.judul, paragraf: paragraf.length ? paragraf : t.paragraf };
}

function teksDasar(m: MasukanTeksLaporan): TeksLaporan {
  const nama = m.namaPetugas || "-";
  const keg = m.kegiatanNama || "-";
  const jab = m.labelJabatan || "-";
  const di = m.wilayah ? ` di ${m.wilayah}` : "";
  const lokasiKal = m.jumlahLokasi ? `, pada ${m.jumlahLokasi} lokasi sebagaimana tercantum di bawah` : "";
  const umumCatatan = m.adaLampiran
    ? `Laporan ini dirakit otomatis dari isian harian petugas dan catatan lapangan pada aplikasi SIGAP (lokasi, jumlah ${m.satuan}, hasil pendataan, kendala, dan foto dokumentasi) untuk tanggal ${m.tanggalTeks}, tanpa tambahan data lain.`
    : `Laporan ini dirakit otomatis dari isian harian petugas pada aplikasi SIGAP (lokasi, jumlah ${m.satuan}, kendala, dan foto dokumentasi) untuk tanggal ${m.tanggalTeks}, tanpa tambahan data lain.`;

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
    const a = m.aktivitas;
    const legacy = "mengawasi pendataan oleh PPL di bawahnya serta mengidentifikasi wilayah kerja";
    const kerja = a && (a.identifikasi || a.pengawasan) ? teksAktivitas("pml", a) : legacy;
    const hanyaIdent = !a || (a.identifikasi && !a.pengawasan);
    const SAT = m.satuan.toUpperCase();
    const Sat = `${m.satuan[0]?.toUpperCase() ?? ""}${m.satuan.slice(1)}`;
    return {
      judul: "Laporan Pengawasan Lapangan",
      seksiUraian: !a ? "URAIAN PENGAWASAN DAN IDENTIFIKASI" : a.pengawasan && !a.identifikasi ? "URAIAN PENGAWASAN PENDATAAN" : a.identifikasi && !a.pengawasan ? "URAIAN IDENTIFIKASI WILAYAH" : "URAIAN PENGAWASAN DAN IDENTIFIKASI",
      seksiLokasi: "WILAYAH YANG DIAWASI",
      seksiKendala: "KENDALA DAN CATATAN PENGAWASAN",
      labelAngka: hanyaIdent ? `JUMLAH ${SAT} DIIDENTIFIKASI` : `JUMLAH ${SAT} DILAPORKAN`,
      paragraf: [
        `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan ${keg} sebagai ${jab}${di}, yaitu ${kerja}.`,
        `${Sat} yang ${hanyaIdent ? "diidentifikasi" : "dilaporkan"} pada tanggal ini sebanyak ${m.jumlahRealisasi}${lokasiKal}.`,
      ],
      catatan: umumCatatan,
    };
  }
  if (m.jenis === "korwil") {
    const a = m.aktivitas;
    const qc = !a || a.qc; // tanpa informasi = teks lama
    return {
      judul: "Laporan Koordinasi Wilayah",
      seksiUraian: qc ? "URAIAN KOORDINASI DAN PENGENDALIAN MUTU" : "URAIAN KOORDINASI WILAYAH",
      seksiLokasi: "WILAYAH KOORDINASI",
      seksiKendala: "KENDALA DAN TEMUAN",
      labelAngka: qc ? `JUMLAH ${m.satuan.toUpperCase()} DIPERIKSA` : `JUMLAH ${m.satuan.toUpperCase()} DILAPORKAN`,
      paragraf: [
        qc
          ? `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan ${keg} sebagai ${jab}${di}, yaitu mengoordinasikan petugas di wilayahnya serta melakukan pengendalian mutu (quality check) hasil pendataan.`
          : `Pada hari ${m.tanggalTeks}, ${nama} melaksanakan ${keg} sebagai ${jab}${di}, yaitu mengoordinasikan petugas di wilayahnya.`,
        `${m.satuan[0]?.toUpperCase() ?? ""}${m.satuan.slice(1)} yang ${qc ? "diperiksa" : "dilaporkan"} pada tanggal ini sebanyak ${m.jumlahRealisasi}${lokasiKal}.`,
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
