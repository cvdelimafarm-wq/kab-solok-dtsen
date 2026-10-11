// lib/perencanaanIdentifikasi.ts
//
// (11 Okt 2026) Form identifikasi per tahap GSBPM + aturan turunan paket administrasi -- UJI COBA, permintaan user:
// "identifikasi ini seharusnya dilakukan oleh admin/pengelola kegiatan/ketua tim" (bukan sekadar teks info).
// Rancangan & koreksi user (lokasi dalam kota -> kantor/hotel; luar kota = pasti hotel; konsumsi: kantor = ya, hotel = tidak):
// claude/rancangan-identifikasi-gsbpm-ro.md.
//
// Prinsip:
//  - Pertanyaan & aturan adalah DATA (bukan if-else di UI) supaya mudah diubah saat uji coba dan kelak dipindah ke tabel.
//  - Pertanyaan yang tidak relevan disembunyikan (bukan dijawab "Lewati"); nilai yang bisa diturunkan diisi otomatis.
//  - Hasil = daftar paket administrasi per mata anggaran (akun-skema dari Daftar Kelengkapan Dokumen Pertanggungjawaban Belanja).
//  - Pendataan memakai bentuk sub-kegiatan x peran (keputusan 11 Okt).
// Logika murni; uji: lib/__tests__/perencanaanIdentifikasi.test.ts.

import { TAHAP_GSBPM, type IsianTahap, type KodeTahap } from "./perencanaanGsbpm";

// ---------------------------------------------------------------- katalog paket (dari Daftar Kelengkapan, 22 skema)

export type InfoPaket = { kode: string; akun: string; nama: string; dokumen: number; alur: string };

export const KATALOG_PAKET: Record<string, InfoPaket> = {
  "521211-A": { kode: "521211-A", akun: "521211", nama: "Konsumsi rapat", dokumen: 12, alur: "Tim Kerja › PBJ › Bendahara" },
  "521211-B": { kode: "521211-B", akun: "521211", nama: "Perlengkapan / penggandaan dokumen", dokumen: 9, alur: "Tim Kerja › PBJ › Bendahara" },
  "521211-C": { kode: "521211-C", akun: "521211", nama: "Pengadaan spanduk", dokumen: 9, alur: "Tim Kerja › PBJ › Bendahara" },
  "521211-D": { kode: "521211-D", akun: "521211", nama: "Pengadaan pulsa / paket data", dokumen: 9, alur: "Tim Kerja › PBJ › Bendahara" },
  "521213-A": { kode: "521213-A", akun: "521213", nama: "Honor tim pelaksana kegiatan", dokumen: 9, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "521213-B": { kode: "521213-B", akun: "521213", nama: "Honor camat, kepala desa, penunjuk jalan", dokumen: 6, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "521213-C": { kode: "521213-C", akun: "521213", nama: "Honor pengajar (Innas/Inda)", dokumen: 10, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "521213-D": { kode: "521213-D", akun: "521213", nama: "Honor petugas mitra (kontrak + BAST)", dokumen: 8, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "521213-P": { kode: "521213-P", akun: "521213", nama: "Honor petugas PNS BPS", dokumen: 7, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "522151": { kode: "522151", akun: "522151", nama: "Honor narasumber / moderator", dokumen: 13, alur: "Tim Kerja › Perencanaan › Bendahara" },
  "522191": { kode: "522191", akun: "522191", nama: "Belanja jasa lainnya (sosialisasi)", dokumen: 10, alur: "Tim Kerja › PBJ › Bendahara" },
  "524111-A": { kode: "524111-A", akun: "524111", nama: "Perjalanan dinas biasa", dokumen: 14, alur: "Tim Kerja › PPK › Bendahara" },
  "524113-A": { kode: "524113-A", akun: "524113", nama: "Transport lokal (< 8 jam)", dokumen: 10, alur: "Tim Kerja › PPK › Bendahara" },
  "524113-B": { kode: "524113-B", akun: "524113", nama: "Perjalanan dinas dalam kota (> 8 jam)", dokumen: 13, alur: "Tim Kerja › PPK › Bendahara" },
  "524114-A": { kode: "524114-A", akun: "524114", nama: "Perjadin paket meeting dalam kota (peserta)", dokumen: 13, alur: "Tim Kerja › Bendahara" },
  "524114-B": { kode: "524114-B", akun: "524114", nama: "Penyelenggaraan paket meeting dalam kota", dokumen: 33, alur: "Tim Kerja › PBJ › PPK › Bendahara" },
  "524119-A": { kode: "524119-A", akun: "524119", nama: "Perjadin paket meeting luar kota (peserta)", dokumen: 13, alur: "Tim Kerja › Bendahara" },
  "524119-B": { kode: "524119-B", akun: "524119", nama: "Penyelenggaraan paket meeting luar kota", dokumen: 33, alur: "Tim Kerja › PBJ › PPK › Bendahara" },
};

// ---------------------------------------------------------------- pertanyaan & kondisi deklaratif

export type Nilai = string | number | boolean | null;
export type Jawaban = Record<string, Nilai>;

/** Semua syarat harus terpenuhi (AND). `di` = nilai termasuk salah satu; `ya` = jawaban ya/tidak. */
export type Syarat = { k: string; di?: string[]; ya?: boolean };
export type Kondisi = Syarat[];

/** `jika`: pilihan hanya ditawarkan bila kondisi terpenuhi (mis. pulsa "untuk organik dan mitra" hanya bila pesertanya keduanya). */
export type Pilihan = { nilai: string; label: string; jika?: Kondisi };
export type Pertanyaan = {
  kode: string;
  label: string;
  jenis: "pilih" | "yatidak" | "angka";
  pilihan?: Pilihan[];
  satuan?: string;
  bantuan?: string;
  /** Tampil bila kondisi terpenuhi (tidak ada = selalu). */
  tampil?: Kondisi;
  /** Nilai otomatis bila kondisi terpenuhi: pertanyaan dikunci & tidak perlu dijawab. */
  otomatis?: { jika: Kondisi; nilai: Nilai; alasan: string }[];
  /** Angka boleh kosong. */
  opsional?: boolean;
  /** Pertanyaan angka berurutan dengan grup sama ditampilkan dalam satu baris (mis. "Jumlah petugas": PPL, PML). */
  grup?: string;
  /** Label singkat di dalam grup (mis. "PPL"). */
  pendek?: string;
};

export type Aturan = {
  /** Kode paket di KATALOG_PAKET. */
  paket: string;
  jika: Kondisi;
  ket: string;
};

export type FormTahap = { judul: string; pengantar: string; pertanyaan: Pertanyaan[]; aturan: Aturan[]; modul: { nama: string; jika?: Kondisi }[] };

const YA = (k: string): Syarat => ({ k, ya: true });
const DI = (k: string, ...di: string[]): Syarat => ({ k, di });

export function cocok(kondisi: Kondisi | undefined, j: Jawaban): boolean {
  if (!kondisi) return true;
  return kondisi.every((s) => {
    const v = j[s.k];
    if (s.ya !== undefined) return v === s.ya;
    if (s.di) return typeof v === "string" && s.di.includes(v);
    return v !== null && v !== undefined && v !== "";
  });
}

/**
 * Jawaban efektif: isi nilai otomatis, buang jawaban pertanyaan yang tersembunyi. Dievaluasi berurutan
 * (pertanyaan hanya boleh bergantung pada pertanyaan di atasnya).
 */
export function jawabanEfektif(form: FormTahap, mentah: Jawaban): Jawaban {
  const out: Jawaban = {};
  for (const p of form.pertanyaan) {
    if (!cocok(p.tampil, out)) continue;
    const oto = p.otomatis?.find((o) => cocok(o.jika, out));
    if (oto) out[p.kode] = oto.nilai;
    else if (mentah[p.kode] !== undefined) {
      const v = mentah[p.kode];
      // Pilihan yang tidak (lagi) ditawarkan dianggap belum dijawab.
      if (p.jenis === "pilih" && v !== null && !pilihanTampil(p, out).some((x) => x.nilai === v)) continue;
      out[p.kode] = v;
    }
  }
  return out;
}

/** Pilihan yang ditawarkan untuk jawaban di atasnya. */
export function pilihanTampil(p: Pertanyaan, j: Jawaban): Pilihan[] {
  return (p.pilihan ?? []).filter((x) => cocok(x.jika, j));
}

/** Pertanyaan yang tampil (beserta status otomatis) untuk jawaban saat ini. */
export function pertanyaanTampil(form: FormTahap, mentah: Jawaban): { p: Pertanyaan; otomatis: { nilai: Nilai; alasan: string } | null }[] {
  const ef = jawabanEfektif(form, mentah);
  const hasil: { p: Pertanyaan; otomatis: { nilai: Nilai; alasan: string } | null }[] = [];
  const sejauh: Jawaban = {};
  for (const p of form.pertanyaan) {
    if (!cocok(p.tampil, sejauh)) continue;
    const oto = p.otomatis?.find((o) => cocok(o.jika, sejauh)) ?? null;
    hasil.push({ p, otomatis: oto ? { nilai: oto.nilai, alasan: oto.alasan } : null });
    if (ef[p.kode] !== undefined) sejauh[p.kode] = ef[p.kode];
  }
  return hasil;
}

/** Pertanyaan tampil yang belum dijawab (angka opsional boleh kosong). */
export function belumDijawab(form: FormTahap, mentah: Jawaban): Pertanyaan[] {
  const ef = jawabanEfektif(form, mentah);
  return pertanyaanTampil(form, mentah)
    .filter(({ p, otomatis }) => !otomatis && !(p.jenis === "angka" && p.opsional))
    .map(({ p }) => p)
    .filter((p) => ef[p.kode] === undefined || ef[p.kode] === null || ef[p.kode] === "");
}

export type PaketTurunan = InfoPaket & { ket: string; sumber: string };

function tambahPaket(daftar: PaketTurunan[], kode: string, ket: string, sumber: string) {
  const info = KATALOG_PAKET[kode];
  if (!info) return;
  const ada = daftar.find((x) => x.kode === kode);
  if (ada) {
    if (!ada.ket.includes(ket)) ada.ket = `${ada.ket}; ${ket}`;
    if (!ada.sumber.split(", ").includes(sumber)) ada.sumber = `${ada.sumber}, ${sumber}`;
    return;
  }
  daftar.push({ ...info, ket, sumber });
}

export function paketDariForm(form: FormTahap, mentah: Jawaban, sumber = form.judul): PaketTurunan[] {
  const ef = jawabanEfektif(form, mentah);
  const out: PaketTurunan[] = [];
  for (const a of form.aturan) if (cocok(a.jika, ef)) tambahPaket(out, a.paket, a.ket, sumber);
  return out;
}

export function modulDariForm(form: FormTahap, mentah: Jawaban): string[] {
  const ef = jawabanEfektif(form, mentah);
  return form.modul.filter((m) => cocok(m.jika, ef)).map((m) => m.nama);
}

// ---------------------------------------------------------------- definisi form per tahap (bukan pendataan)

const YATIDAK_PELATIHAN_LURING: Syarat = DI("jenis", "luring", "hybrid");

export const FORM_TAHAP: Partial<Record<KodeTahap, FormTahap>> = {
  perencanaan: {
    judul: "Perencanaan & anggaran",
    pengantar: "Hal yang disiapkan sebelum pelaksanaan. KAK dan Form Permintaan selalu dibuat dan otomatis dilampirkan ke setiap paket.",
    pertanyaan: [
      { kode: "sk_tim", label: "Ada SK tim pelaksana dengan honor?", jenis: "yatidak", bantuan: "SK KPA dimintakan ke Perencanaan." },
      { kode: "rekrutmen", label: "Ada rekrutmen/seleksi mitra?", jenis: "yatidak" },
      { kode: "kontrak", label: "Mitra dikontrak (SPK) untuk kegiatan ini?", jenis: "yatidak", tampil: [YA("rekrutmen")] },
      { kode: "perlengkapan", label: "Ada pengadaan perlengkapan lapangan/ATK?", jenis: "yatidak" },
      { kode: "sosialisasi", label: "Ada sosialisasi kegiatan (jasa/acara)?", jenis: "yatidak" },
      { kode: "spanduk", label: "Ada spanduk?", jenis: "yatidak" },
    ],
    aturan: [
      { paket: "521213-A", jika: [YA("sk_tim")], ket: "Honor tim pelaksana sesuai SK" },
      { paket: "521211-B", jika: [YA("perlengkapan")], ket: "Perlengkapan lapangan / ATK" },
      { paket: "522191", jika: [YA("sosialisasi")], ket: "Penyelenggaraan sosialisasi" },
      { paket: "521211-C", jika: [YA("spanduk")], ket: "Spanduk kegiatan" },
    ],
    modul: [{ nama: "KAK & Form Permintaan" }, { nama: "RAB dari baris POK" }, { nama: "SK tim", jika: [YA("sk_tim")] }, { nama: "Rekrutmen & seleksi mitra", jika: [YA("rekrutmen")] }, { nama: "Kontrak / SPK mitra", jika: [YA("kontrak")] }],
  },

  pelatihan: {
    judul: "Pelatihan petugas",
    pengantar: "Jawaban menentukan mata anggaran pelatihan. Uang harian dan jenis transport diturunkan dari lokasi & tempat, tidak ditanyakan.",
    pertanyaan: [
      {
        kode: "jenis",
        label: "Jenis pelatihan",
        jenis: "pilih",
        pilihan: [
          { nilai: "daring", label: "Daring (Zoom)" },
          { nilai: "luring", label: "Luring (tatap muka)" },
          { nilai: "hybrid", label: "Hybrid" },
        ],
      },
      {
        kode: "peserta",
        label: "Peserta",
        jenis: "pilih",
        pilihan: [
          { nilai: "mitra", label: "Mitra saja" },
          { nilai: "organik", label: "Organik saja" },
          { nilai: "keduanya", label: "Organik dan mitra" },
        ],
      },
      { kode: "lokasi", label: "Lokasi", jenis: "pilih", tampil: [YATIDAK_PELATIHAN_LURING], pilihan: [{ nilai: "dalam", label: "Dalam kota" }, { nilai: "luar", label: "Luar kota" }] },
      {
        kode: "tempat",
        label: "Tempat",
        jenis: "pilih",
        tampil: [YATIDAK_PELATIHAN_LURING, DI("lokasi", "dalam", "luar")],
        pilihan: [{ nilai: "kantor", label: "Kantor" }, { nilai: "hotel", label: "Hotel" }],
        otomatis: [{ jika: [DI("lokasi", "luar")], nilai: "hotel", alasan: "Luar kota selalu di hotel." }],
      },
      {
        kode: "paket_meeting",
        label: "Jenis paket meeting",
        jenis: "pilih",
        tampil: [YATIDAK_PELATIHAN_LURING, DI("tempat", "hotel")],
        pilihan: [{ nilai: "halfday", label: "Halfday" }, { nilai: "fullday", label: "Fullday" }, { nilai: "fullboard", label: "Fullboard" }],
      },
      {
        kode: "konsumsi",
        label: "Konsumsi disediakan sendiri",
        jenis: "yatidak",
        tampil: [YATIDAK_PELATIHAN_LURING, DI("tempat", "kantor", "hotel")],
        otomatis: [
          { jika: [DI("tempat", "kantor")], nilai: true, alasan: "Di kantor: konsumsi disediakan sendiri." },
          { jika: [DI("tempat", "hotel")], nilai: false, alasan: "Di hotel: konsumsi termasuk paket meeting." },
        ],
      },
      { kode: "bahan", label: "Bahan, ATK & perlengkapan pelatihan", jenis: "yatidak", tampil: [YATIDAK_PELATIHAN_LURING] },
      {
        kode: "pulsa",
        label: "Pulsa untuk peserta daring",
        jenis: "pilih",
        tampil: [DI("jenis", "daring", "hybrid")],
        pilihan: [
          { nilai: "mitra", label: "Ya, untuk mitra", jika: [DI("peserta", "mitra", "keduanya")] },
          { nilai: "keduanya", label: "Ya, untuk organik dan mitra", jika: [DI("peserta", "keduanya")] },
          { nilai: "tidak", label: "Tidak" },
        ],
        otomatis: [{ jika: [DI("peserta", "organik")], nilai: "tidak", alasan: "Peserta organik saja: tidak ada pulsa." }],
      },
      { kode: "honor_instruktur", label: "Honor instruktur (Inda)", jenis: "yatidak" },
      { kode: "narasumber", label: "Narasumber eksternal", jenis: "yatidak" },
      // (11 Okt 2026, 17.28) Jumlah kelas/petugas/instruktur tidak ditanyakan lagi: dihitung dari "Susunan kelas & panitia" (lihat SusunanPelatihan).
      { kode: "jml_hari", label: "Lama pelatihan", jenis: "angka", satuan: "hari" },
      { kode: "jml_jp", label: "Jam pelajaran", jenis: "angka", satuan: "JP", opsional: true },
    ],
    aturan: [
      { paket: "524113-A", jika: [YATIDAK_PELATIHAN_LURING, DI("tempat", "kantor"), DI("peserta", "mitra", "keduanya")], ket: "Transport lokal peserta mitra (organik di kantor sendiri tidak)" },
      { paket: "521211-A", jika: [YATIDAK_PELATIHAN_LURING, YA("konsumsi")], ket: "Konsumsi pelatihan di kantor" },
      { paket: "524114-B", jika: [YATIDAK_PELATIHAN_LURING, DI("lokasi", "dalam"), DI("tempat", "hotel")], ket: "Kontrak hotel paket meeting dalam kota" },
      { paket: "524114-A", jika: [YATIDAK_PELATIHAN_LURING, DI("lokasi", "dalam"), DI("tempat", "hotel")], ket: "Perjadin peserta paket meeting dalam kota" },
      { paket: "524119-B", jika: [YATIDAK_PELATIHAN_LURING, DI("lokasi", "luar")], ket: "Kontrak hotel paket meeting luar kota" },
      { paket: "524119-A", jika: [YATIDAK_PELATIHAN_LURING, DI("lokasi", "luar")], ket: "Perjadin peserta luar kota (uang harian & transport at cost)" },
      { paket: "521211-B", jika: [YATIDAK_PELATIHAN_LURING, YA("bahan")], ket: "Bahan, ATK & perlengkapan pelatihan" },
      { paket: "521211-D", jika: [DI("jenis", "daring", "hybrid"), DI("pulsa", "mitra")], ket: "Pulsa peserta daring (mitra)" },
      { paket: "521211-D", jika: [DI("jenis", "daring", "hybrid"), DI("pulsa", "keduanya")], ket: "Pulsa peserta daring (organik dan mitra)" },
      { paket: "521213-C", jika: [YA("honor_instruktur")], ket: "Honor instruktur" },
      { paket: "522151", jika: [YA("narasumber")], ket: "Honor narasumber eksternal" },
    ],
    modul: [
      { nama: "Undangan peserta" },
      { nama: "Jadwal & kelas" },
      { nama: "Bank soal pretest/posttest & Adu Sigap" },
      { nama: "Presensi bertitik lokasi", jika: [YATIDAK_PELATIHAN_LURING] },
      { nama: "Rapat Zoom", jika: [DI("jenis", "daring", "hybrid")] },
      { nama: "Laporan instruktur & laporan pelatihan" },
      { nama: "Nilai akhir peserta" },
    ],
  },

  analisis: {
    judul: "Analisis & diseminasi",
    pengantar: "Kegiatan sesudah pengumpulan data sampai output RO (publikasi/laporan) terbit.",
    pertanyaan: [
      { kode: "konsultasi_prov", label: "Konsultasi/validasi angka ke BPS Provinsi (perjalanan dinas)?", jenis: "yatidak" },
      { kode: "rapat_internal", label: "Rapat konsultasi internal dengan konsumsi?", jenis: "yatidak" },
      { kode: "fgd", label: "FGD / konsultasi dengan OPD?", jenis: "yatidak" },
      { kode: "fgd_tempat", label: "Tempat FGD", jenis: "pilih", tampil: [YA("fgd")], pilihan: [{ nilai: "kantor", label: "Kantor" }, { nilai: "hotel", label: "Hotel dalam kota" }] },
      { kode: "fgd_narsum", label: "FGD dengan narasumber eksternal?", jenis: "yatidak", tampil: [YA("fgd")] },
      { kode: "tim_publikasi", label: "Tim penyusun publikasi ber-SK dengan honor?", jenis: "yatidak" },
      { kode: "cetak", label: "Publikasi dicetak/digandakan?", jenis: "yatidak" },
      { kode: "rilis", label: "Diseminasi/rilis dengan acara sosialisasi?", jenis: "yatidak" },
      { kode: "spanduk", label: "Spanduk diseminasi?", jenis: "yatidak", tampil: [YA("rilis")] },
    ],
    aturan: [
      { paket: "524111-A", jika: [YA("konsultasi_prov")], ket: "Konsultasi ke BPS Provinsi" },
      { paket: "521211-A", jika: [YA("rapat_internal")], ket: "Rapat konsultasi internal" },
      { paket: "521211-A", jika: [YA("fgd"), DI("fgd_tempat", "kantor")], ket: "Konsumsi FGD di kantor" },
      { paket: "524114-B", jika: [YA("fgd"), DI("fgd_tempat", "hotel")], ket: "Paket meeting FGD" },
      { paket: "524114-A", jika: [YA("fgd"), DI("fgd_tempat", "hotel")], ket: "Perjadin peserta FGD" },
      { paket: "522151", jika: [YA("fgd"), YA("fgd_narsum")], ket: "Narasumber FGD" },
      { paket: "521213-A", jika: [YA("tim_publikasi")], ket: "Honor tim penyusun publikasi" },
      { paket: "521211-B", jika: [YA("cetak")], ket: "Cetak/penggandaan publikasi" },
      { paket: "522191", jika: [YA("rilis")], ket: "Acara diseminasi/rilis" },
      { paket: "521211-C", jika: [YA("rilis"), YA("spanduk")], ket: "Spanduk diseminasi" },
    ],
    modul: [{ nama: "Penyusunan publikasi/laporan" }, { nama: "Validasi angka", jika: [YA("konsultasi_prov")] }, { nama: "Rilis & diseminasi", jika: [YA("rilis")] }, { nama: "Layanan konsultasi data" }],
  },

  evaluasi: {
    judul: "Evaluasi",
    pengantar: "Penutup kegiatan: rapat evaluasi, umpan balik petugas, penilaian mitra.",
    pertanyaan: [
      { kode: "rapat", label: "Ada rapat evaluasi?", jenis: "yatidak" },
      { kode: "rapat_tempat", label: "Tempat rapat evaluasi", jenis: "pilih", tampil: [YA("rapat")], pilihan: [{ nilai: "kantor", label: "Kantor" }, { nilai: "hotel", label: "Hotel dalam kota" }] },
      { kode: "umpan_balik", label: "Umpan balik petugas lewat SIGAP?", jenis: "yatidak" },
      { kode: "nilai_mitra", label: "Penilaian kinerja mitra?", jenis: "yatidak" },
    ],
    aturan: [
      { paket: "521211-A", jika: [YA("rapat"), DI("rapat_tempat", "kantor")], ket: "Konsumsi rapat evaluasi" },
      { paket: "524114-B", jika: [YA("rapat"), DI("rapat_tempat", "hotel")], ket: "Paket meeting rapat evaluasi" },
      { paket: "524114-A", jika: [YA("rapat"), DI("rapat_tempat", "hotel")], ket: "Perjadin peserta rapat evaluasi" },
    ],
    modul: [{ nama: "Rapat evaluasi", jika: [YA("rapat")] }, { nama: "Umpan balik petugas", jika: [YA("umpan_balik")] }, { nama: "Penilaian mitra", jika: [YA("nilai_mitra")] }, { nama: "Rencana perbaikan" }],
  },
};

// ---------------------------------------------------------------- pelatihan: susunan kelas & panitia
// (11 Okt 2026, 17.28) Permintaan user: "di pelatihan ada pilihan identifikasi kelas, petugas + jabatannya + panitia + instruktur".
// Disimpan di jawaban tahap pelatihan pada kunci `susunan` (di luar pertanyaan form). Nama instruktur/panitia boleh menyusul
// (saat perencanaan sering belum ditetapkan); jumlah petugas per jabatan per kelas wajib.

export const JABATAN_BAWAAN = ["PPL", "PML"];
export type KelasPelatihan = { id: string; nama: string; instruktur: string; peserta: Record<string, number | null> };
export type TugasPanitia = "ketua" | "sekretaris" | "anggota";
export const TUGAS_PANITIA: { nilai: TugasPanitia; label: string }[] = [
  { nilai: "ketua", label: "Ketua" },
  { nilai: "sekretaris", label: "Sekretaris" },
  { nilai: "anggota", label: "Anggota" },
];
export type PanitiaPelatihan = { id: string; nama: string; tugas: TugasPanitia };
export type SusunanPelatihan = {
  /** Jabatan petugas peserta (bawaan PPL, PML; boleh ditambah mis. Koseka, Operator). */
  jabatan: string[];
  kelas: KelasPelatihan[];
  panitia: PanitiaPelatihan[];
  /** Panitia diberi honor lewat SK (paket 521213-A); null = belum dijawab (hanya ditanya bila ada panitia). */
  honorPanitia: boolean | null;
};

export function susunanKosong(): SusunanPelatihan {
  return { jabatan: [...JABATAN_BAWAAN], kelas: [], panitia: [], honorPanitia: null };
}

export function kelasBaru(id: string, no: number, jabatan: string[]): KelasPelatihan {
  return { id, nama: `Kelas ${no}`, instruktur: "", peserta: Object.fromEntries(jabatan.map((j) => [j, null])) };
}

export function bacaSusunan(x: unknown): SusunanPelatihan {
  const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const jabatan = Array.isArray(o.jabatan) ? (o.jabatan as unknown[]).filter((j): j is string => typeof j === "string" && j.trim() !== "") : [];
  const kelas = Array.isArray(o.kelas)
    ? (o.kelas as KelasPelatihan[])
        .filter((k) => k && typeof k.id === "string")
        .map((k) => ({ id: k.id, nama: String(k.nama ?? ""), instruktur: String(k.instruktur ?? ""), peserta: k.peserta && typeof k.peserta === "object" ? { ...k.peserta } : {} }))
    : [];
  const panitia = Array.isArray(o.panitia)
    ? (o.panitia as PanitiaPelatihan[]).filter((p) => p && typeof p.id === "string").map((p) => ({ id: p.id, nama: String(p.nama ?? ""), tugas: TUGAS_PANITIA.some((t) => t.nilai === p.tugas) ? p.tugas : "anggota" }))
    : [];
  return { jabatan: jabatan.length ? jabatan : [...JABATAN_BAWAAN], kelas, panitia, honorPanitia: typeof o.honorPanitia === "boolean" ? o.honorPanitia : null };
}

export type RingkasSusunan = { kelas: number; perJabatan: Record<string, number>; peserta: number; instruktur: number; instrukturBelum: number; panitia: number };

export function ringkasSusunan(s: SusunanPelatihan): RingkasSusunan {
  const perJabatan: Record<string, number> = {};
  for (const j of s.jabatan) perJabatan[j] = s.kelas.reduce((n, k) => n + (k.peserta[j] ?? 0), 0);
  const nama = new Set(s.kelas.map((k) => k.instruktur.trim().toLowerCase()).filter(Boolean));
  return {
    kelas: s.kelas.length,
    perJabatan,
    peserta: Object.values(perJabatan).reduce((a, b) => a + b, 0),
    instruktur: nama.size,
    instrukturBelum: s.kelas.filter((k) => !k.instruktur.trim()).length,
    panitia: s.panitia.length,
  };
}

/** Isian susunan yang belum lengkap (nama instruktur/panitia boleh menyusul). */
export function periksaSusunan(s: SusunanPelatihan): string[] {
  const out: string[] = [];
  if (s.kelas.length === 0) out.push("Susunan kelas: tambahkan minimal satu kelas.");
  s.kelas.forEach((k, i) => {
    const nama = k.nama.trim() || `Kelas ${i + 1}`;
    if (!k.nama.trim()) out.push(`Kelas ${i + 1}: nama kelas belum diisi.`);
    const kosong = s.jabatan.filter((j) => k.peserta[j] === null || k.peserta[j] === undefined);
    if (kosong.length) out.push(`${nama}: jumlah ${kosong.join(", ")} belum diisi (isi 0 bila tidak ada).`);
    else if (s.jabatan.every((j) => !k.peserta[j])) out.push(`${nama}: belum ada petugas.`);
  });
  s.panitia.forEach((p, i) => {
    if (!p.nama.trim()) out.push(`Panitia ${i + 1}: nama belum diisi (hapus baris bila belum ditentukan).`);
  });
  if (s.panitia.length > 0 && s.honorPanitia === null) out.push("Panitia: honor (SK) belum dijawab.");
  return out;
}

export function paketSusunan(s: SusunanPelatihan, sumber = "Pelatihan petugas"): PaketTurunan[] {
  const out: PaketTurunan[] = [];
  if (s.panitia.length > 0 && s.honorPanitia) tambahPaket(out, "521213-A", "Honor panitia pelatihan (SK)", sumber);
  return out;
}

// ---------------------------------------------------------------- pendataan: sub-kegiatan x peran

export type KodePeran = "pencacah" | "pengawas" | "pengolah";
export const PERAN_PENDATAAN: { kode: KodePeran; label: string }[] = [
  { kode: "pencacah", label: "Pencacah (PPL)" },
  { kode: "pengawas", label: "Pengawas (PML)" },
  { kode: "pengolah", label: "Pengolah / operator" },
];

export type IsianPeran = {
  dipakai: boolean;
  status: "mitra" | "organik" | "keduanya" | null;
  honor: boolean | null;
  /** Bila status "keduanya" dan ada honor: honor hanya untuk mitra, atau untuk organik dan mitra. */
  honorUntuk?: "mitra" | "keduanya" | null;
  satuan: string;
  target: number | null;
  translok: "tidak" | "kurang8" | "lebih8" | null;
  pulsa: boolean | null;
  supervisi: boolean | null;
};

export type JenisSub = "listing" | "pencacahan" | "lainnya";
export const URUT_JENIS: Record<JenisSub, number> = { listing: 0, pencacahan: 1, lainnya: 2 };

export type SubKegiatan = {
  id: string;
  nama: string;
  /** Ditentukan dari tombol tambah (bukan ditanyakan): listing/updating dan pencacahan sampel adalah sub-kegiatan terpisah & berurutan. */
  jenis: JenisSub | null;
  mode: "capi" | "papi" | null;
  penunjukJalan: boolean | null;
  peran: Record<KodePeran, IsianPeran>;
};

export type JawabanPendataan = { sub: SubKegiatan[] };

export function peranKosong(dipakai: boolean): IsianPeran {
  return { dipakai, status: null, honor: null, honorUntuk: null, satuan: "", target: null, translok: null, pulsa: null, supervisi: null };
}

export function subKegiatanBaru(id: string, nama = "", jenis: JenisSub | null = null): SubKegiatan {
  return { id, nama, jenis, mode: null, penunjukJalan: null, peran: { pencacah: peranKosong(true), pengawas: peranKosong(true), pengolah: peranKosong(false) } };
}

export function bacaJawabanPendataan(x: unknown): JawabanPendataan {
  const o = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const sub = Array.isArray(o.sub) ? (o.sub as SubKegiatan[]).filter((s) => s && typeof s.id === "string" && s.peran) : [];
  return { sub };
}

/** Tambah sub-kegiatan dengan urutan tahapan lapangan: listing/updating -> pencacahan sampel -> lainnya. */
export function sisipkanSub(daftar: SubKegiatan[], baru: SubKegiatan): SubKegiatan[] {
  const u = URUT_JENIS[baru.jenis ?? "lainnya"];
  const i = daftar.findIndex((s) => URUT_JENIS[s.jenis ?? "lainnya"] > u);
  return i < 0 ? [...daftar, baru] : [...daftar.slice(0, i), baru, ...daftar.slice(i)];
}

/** Isian yang belum lengkap, sebagai pesan singkat. */
export function periksaPendataan(j: JawabanPendataan): string[] {
  const out: string[] = [];
  if (j.sub.length === 0) out.push("Tambahkan minimal satu sub-kegiatan pendataan.");
  j.sub.forEach((s, i) => {
    const nama = s.nama.trim() || `Sub-kegiatan ${i + 1}`;
    if (!s.nama.trim()) out.push(`${nama}: nama belum diisi.`);
    if (!s.mode) out.push(`${nama}: mode CAPI/PAPI belum dipilih.`);
    if (s.penunjukJalan === null) out.push(`${nama}: honor penunjuk jalan/aparat belum dijawab.`);
    const dipakai = PERAN_PENDATAAN.filter((p) => s.peran[p.kode]?.dipakai);
    if (dipakai.length === 0) out.push(`${nama}: pilih minimal satu peran.`);
    for (const p of dipakai) {
      const r = s.peran[p.kode];
      const kurang: string[] = [];
      if (!r.status) kurang.push("status");
      if (r.honor === null) kurang.push("honor");
      if (r.status === "keduanya" && r.honor && !r.honorUntuk) kurang.push("honor untuk siapa");
      if (r.honor && !r.satuan.trim()) kurang.push("satuan honor");
      if (p.kode !== "pengolah" && !r.translok) kurang.push("transport");
      if (r.pulsa === null) kurang.push("pulsa");
      if (p.kode === "pengawas" && r.supervisi === null) kurang.push("supervisi luar kota");
      if (kurang.length) out.push(`${nama} · ${p.label}: ${kurang.join(", ")} belum diisi.`);
    }
  });
  return out;
}

export function paketPendataan(j: JawabanPendataan, sumber = "Pendataan"): PaketTurunan[] {
  const out: PaketTurunan[] = [];
  for (const s of j.sub) {
    const nama = s.nama.trim() || "sub-kegiatan";
    for (const p of PERAN_PENDATAAN) {
      const r = s.peran[p.kode];
      if (!r?.dipakai) continue;
      const lbl = p.label.split(" (")[0].toLowerCase();
      if (r.honor && (r.status === "mitra" || r.status === "keduanya")) tambahPaket(out, "521213-D", `Honor ${lbl} mitra (${nama})`, sumber);
      if (r.honor && (r.status === "organik" || (r.status === "keduanya" && r.honorUntuk === "keduanya"))) tambahPaket(out, "521213-P", `Honor ${lbl} PNS (${nama})`, sumber);
      if (r.translok === "kurang8") tambahPaket(out, "524113-A", `Transport lokal ${lbl} (${nama})`, sumber);
      if (r.translok === "lebih8") tambahPaket(out, "524113-B", `Perjadin dalam kota > 8 jam ${lbl} (${nama})`, sumber);
      if (r.pulsa) tambahPaket(out, "521211-D", `Pulsa ${lbl} (${nama})`, sumber);
      if (p.kode === "pengawas" && r.supervisi) tambahPaket(out, "524111-A", `Supervisi luar kota (${nama})`, sumber);
    }
    if (s.penunjukJalan) tambahPaket(out, "521213-B", `Honor aparat/penunjuk jalan (${nama})`, sumber);
    if (s.mode === "papi") tambahPaket(out, "521211-B", `Penggandaan dokumen PAPI (${nama})`, sumber);
  }
  return out;
}

// ---------------------------------------------------------------- satu pintu untuk semua tahap

/** Paket hasil identifikasi satu tahap dari jawaban tersimpan (null = belum diidentifikasi). */
export function paketTahap(kode: KodeTahap, jawaban: Record<string, unknown> | null): PaketTurunan[] {
  if (!jawaban) return [];
  if (kode === "pendataan") return paketPendataan(bacaJawabanPendataan(jawaban));
  const f = FORM_TAHAP[kode];
  if (!f) return [];
  const out = paketDariForm(f, jawaban as Jawaban);
  if (kode === "pelatihan" && jawaban.susunan) for (const p of paketSusunan(bacaSusunan(jawaban.susunan))) tambahPaket(out, p.kode, p.ket, p.sumber);
  return out;
}

/** Gabungan paket semua tahap yang dipakai & sudah diidentifikasi (satu baris per paket, keterangan & sumber digabung), urut kode. */
export function paketKegiatan(tahap: Record<KodeTahap, IsianTahap>): PaketTurunan[] {
  const out: PaketTurunan[] = [];
  for (const t of TAHAP_GSBPM) {
    const isi = tahap[t.kode];
    if (!isi?.dipakai) continue;
    for (const p of paketTahap(t.kode, isi.jawaban)) for (const ket of p.ket.split("; ")) tambahPaket(out, p.kode, ket, p.sumber);
  }
  return out.sort((a, b) => a.kode.localeCompare(b.kode));
}

/** Status paket terhadap baris POK: sudah dialokasikan ke kegiatan / ada di POK RO / tidak ada di POK RO. */
export type CekPok = "teralokasi" | "ada_di_ro" | "tidak_ada";
export function cekPaketKePok(akun: string, akunTeralokasiKegiatan: Set<string>, akunPokRo: Set<string>): CekPok {
  if (akunTeralokasiKegiatan.has(akun)) return "teralokasi";
  if (akunPokRo.has(akun)) return "ada_di_ro";
  return "tidak_ada";
}
