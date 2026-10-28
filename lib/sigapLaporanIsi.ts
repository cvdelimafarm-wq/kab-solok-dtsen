// lib/sigapLaporanIsi.ts  (murni; dipakai server DAN klien)
//
// (28 Okt 2026) "Isi laporan SPJ": data apa yang dilampirkan pada Laporan Perjalanan Dinas, per kegiatan dan per level (PPL, PML, korwil).
// Diatur admin di Kelola Pendataan > Persiapan; tidak ditanam di kode supaya SIGAP bisa dipakai banyak survei.
//  - Daftar centang lampiran per level: data identifikasi, data pendataan, data QC, jarak rumah petugas ke Sub SLS, lokasi, kendala.
//  - Judul laporan dan teks uraian per level boleh diganti (kosong = teks bawaan di lib/sigapLaporanPeran.ts), dengan penanda {nama}, {tanggal}, dst.
//  - Label kategori hasil mengikuti Pengaturan Lembar (lib/lembarKonfig.ts) kegiatan yang sama; label variabel identifikasi diatur di sini.
// KONTEKS HARIAN: blok hanya muncul bila ADA datanya pada tanggal laporan itu (mis. PML: identifikasi hanya pada hari ada identifikasi; pengawasan PPL hanya pada
// hari PPL-nya mendata) -- tidak memakai tanggal yang ditanam. Tidak ada angka baru: semua angka dihitung dari catatan lapangan yang sudah ada.

import { HASIL_KK, type HasilKk } from "./pendataan";
import type { KonfigLembar } from "./lembarKonfig";

export type PeranLaporan = "ppl" | "pml" | "korwil";
export const PERAN_LAPORAN: readonly PeranLaporan[] = ["ppl", "pml", "korwil"];
export const LABEL_PERAN_LAPORAN: Record<PeranLaporan, string> = { ppl: "PPL", pml: "PML", korwil: "Korwil" };

export const KODE_LAMPIRAN = ["identifikasi", "pendataan", "pendataan_alasan", "pendataan_petugas", "qc", "jarak", "lokasi", "kendala"] as const;
export type KodeLampiran = (typeof KODE_LAMPIRAN)[number];

export type KelompokLampiran = "Data identifikasi" | "Data pendataan" | "Data QC" | "Jarak rumah" | "Lainnya";

export const KATALOG: Record<KodeLampiran, { label: string; ket: string; kelompok: KelompokLampiran; peran: readonly PeranLaporan[]; bawaan: Record<PeranLaporan, boolean> }> = {
  identifikasi: {
    label: "Hasil identifikasi wilayah",
    ket: "Jumlah Sub SLS dan total variabel identifikasi (KK terdampak, rusak berat, dst.) yang diisi PML pada tanggal itu.",
    kelompok: "Data identifikasi",
    peran: ["pml"],
    bawaan: { ppl: false, pml: true, korwil: false },
  },
  pendataan: {
    label: "Hasil pendataan per kategori",
    ket: "Jumlah KK menurut kategori hasil (nama kategori mengikuti Pengaturan Lembar). PPL: miliknya; PML: seluruh tim; korwil: seluruh kelompok.",
    kelompok: "Data pendataan",
    peran: ["ppl", "pml", "korwil"],
    bawaan: { ppl: true, pml: true, korwil: false },
  },
  pendataan_alasan: {
    label: "Alasan pada hasil “tidak ditemukan”",
    ket: "Jumlah KK per alasan yang dipilih petugas (rumah kosong, pindah, dst.).",
    kelompok: "Data pendataan",
    peran: ["ppl", "pml", "korwil"],
    bawaan: { ppl: true, pml: true, korwil: false },
  },
  pendataan_petugas: {
    label: "Rincian per petugas",
    ket: "Tabel hasil per petugas: PML melihat tiap PPL-nya; korwil melihat tiap tim (per PML).",
    kelompok: "Data pendataan",
    peran: ["pml", "korwil"],
    bawaan: { ppl: false, pml: true, korwil: false },
  },
  qc: {
    label: "Hasil quality check (lembar QC)",
    ket: "Jumlah lembar QC yang diperiksa, kategorinya, dan jumlah aspek yang perlu perbaikan atau tidak sesuai.",
    kelompok: "Data QC",
    peran: ["pml", "korwil"],
    bawaan: { ppl: false, pml: true, korwil: true },
  },
  jarak: {
    label: "Jarak rumah petugas ke Sub SLS",
    ket: "Jarak rumah PPL ke Sub SLS yang didata hari itu, menurut data alokasi Sub SLS (rata-rata dan terjauh). Hanya tampil bila datanya ada.",
    kelompok: "Jarak rumah",
    peran: ["ppl", "pml", "korwil"],
    bawaan: { ppl: false, pml: false, korwil: false },
  },
  lokasi: {
    label: "Tabel lokasi pelaksanaan",
    ket: "Kecamatan, nagari, dan jorong yang dicatat petugas pada isian harian.",
    kelompok: "Lainnya",
    peran: ["ppl", "pml", "korwil"],
    bawaan: { ppl: true, pml: true, korwil: true },
  },
  kendala: {
    label: "Kendala di lapangan",
    ket: "Teks kendala dari isian harian petugas.",
    kelompok: "Lainnya",
    peran: ["ppl", "pml", "korwil"],
    bawaan: { ppl: true, pml: true, korwil: true },
  },
};

export const KELOMPOK_URUT: readonly KelompokLampiran[] = ["Data identifikasi", "Data pendataan", "Data QC", "Jarak rumah", "Lainnya"];

/** Variabel isian identifikasi PML (kolom tabel bencana_identifikasi_subsls). Label boleh diganti per kegiatan. */
export const VARIABEL_IDENTIFIKASI = [
  ["kk_terdampak", "KK terdampak"],
  ["tidak_terdampak", "KK tidak terdampak"],
  ["rusak_berat", "Rumah rusak berat"],
  ["rusak_sedang", "Rumah rusak sedang"],
  ["rusak_ringan", "Rumah rusak ringan"],
  ["lahan_tertimbun", "Lahan tertimbun"],
  ["kekeringan", "Kekeringan"],
  ["aset_usaha", "Aset usaha terdampak"],
  ["lahan_ternak", "Lahan ternak terdampak"],
  ["korban", "Korban"],
  ["lainnya", "Lainnya"],
] as const;
export type KolomIdentifikasi = (typeof VARIABEL_IDENTIFIKASI)[number][0];
export const KOLOM_IDENTIFIKASI: readonly string[] = VARIABEL_IDENTIFIKASI.map((v) => v[0]);

export type VariabelIdentifikasi = { kolom: KolomIdentifikasi; label: string; aktif: boolean };
export type KonfigPeranLaporan = { judul: string; uraian: string; lampiran: Record<KodeLampiran, boolean> };
export type KonfigLaporan = { versi: 1; peran: Record<PeranLaporan, KonfigPeranLaporan>; identifikasi: VariabelIdentifikasi[] };

export const BATAS_LAPORAN = { judul: 60, uraian: 700, labelVariabel: 40 } as const;

/** Penanda yang boleh dipakai pada judul dan uraian. */
export const PENANDA = ["nama", "kegiatan", "jabatan", "tanggal", "wilayah", "satuan", "jumlah", "lokasi", "aktivitas"] as const;
export const KET_PENANDA: Record<(typeof PENANDA)[number], string> = {
  nama: "nama petugas",
  kegiatan: "nama kegiatan",
  jabatan: "jabatan pada surat tugas",
  tanggal: "tanggal dengan nama hari",
  wilayah: "wilayah (nagari/kecamatan) dari lokasi",
  satuan: "satuan hitung kegiatan (mis. ruta)",
  jumlah: "jumlah isian harian",
  lokasi: "jumlah lokasi dicatat",
  aktivitas: "kegiatan hari itu menurut data (identifikasi / pengawasan / QC)",
};

function bawaanPeran(p: PeranLaporan): KonfigPeranLaporan {
  const lampiran = {} as Record<KodeLampiran, boolean>;
  for (const k of KODE_LAMPIRAN) lampiran[k] = KATALOG[k].peran.includes(p) ? KATALOG[k].bawaan[p] : false;
  return { judul: "", uraian: "", lampiran };
}

export const KONFIG_LAPORAN_BAWAAN: KonfigLaporan = {
  versi: 1,
  peran: { ppl: bawaanPeran("ppl"), pml: bawaanPeran("pml"), korwil: bawaanPeran("korwil") },
  identifikasi: VARIABEL_IDENTIFIKASI.map(([kolom, label]) => ({ kolom, label, aktif: true })),
};

export const salinLaporanBawaan = (): KonfigLaporan => JSON.parse(JSON.stringify(KONFIG_LAPORAN_BAWAAN)) as KonfigLaporan;

const objek = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const rapi = (x: unknown): string => (typeof x === "string" ? x.trim().replace(/[ \t]+/g, " ") : "");
const rapiBaris = (x: unknown): string =>
  typeof x === "string"
    ? x
        .split(/\r?\n/)
        .map((b) => b.trim().replace(/[ \t]+/g, " "))
        .filter(Boolean)
        .join("\n")
    : "";

/** Penanda tak dikenal di teks (mis. "{namaa}"). */
export function penandaTakDikenal(teks: string): string[] {
  const ada = Array.from(teks.matchAll(/\{([^{}]*)\}/g), (m) => m[1]);
  return Array.from(new Set(ada.filter((p) => !(PENANDA as readonly string[]).includes(p))));
}

/** Bacaan LONGGAR: nilai tak sah diganti bawaan; lampiran yang tidak berlaku untuk suatu level selalu mati. Tidak pernah gagal. */
export function normalisasiLaporan(mentah: unknown): KonfigLaporan {
  const m = objek(mentah) ? mentah : {};
  const pm = objek(m.peran) ? m.peran : {};
  const hasil = {} as Record<PeranLaporan, KonfigPeranLaporan>;
  for (const p of PERAN_LAPORAN) {
    const dasar = KONFIG_LAPORAN_BAWAAN.peran[p];
    const x = objek(pm[p]) ? pm[p] : {};
    const lm = objek(x.lampiran) ? x.lampiran : {};
    const lampiran = {} as Record<KodeLampiran, boolean>;
    for (const k of KODE_LAMPIRAN) lampiran[k] = KATALOG[k].peran.includes(p) ? (typeof lm[k] === "boolean" ? (lm[k] as boolean) : dasar.lampiran[k]) : false;
    const judul = rapi(x.judul).slice(0, BATAS_LAPORAN.judul);
    const uraian = rapiBaris(x.uraian).slice(0, BATAS_LAPORAN.uraian);
    hasil[p] = { judul: penandaTakDikenal(judul).length ? "" : judul, uraian: penandaTakDikenal(uraian).length ? "" : uraian, lampiran };
  }
  const im = Array.isArray(m.identifikasi) ? m.identifikasi : [];
  const identifikasi = KONFIG_LAPORAN_BAWAAN.identifikasi.map((d) => {
    const s = im.find((v) => objek(v) && v.kolom === d.kolom) as Record<string, unknown> | undefined;
    const label = s ? rapi(s.label).slice(0, BATAS_LAPORAN.labelVariabel) : "";
    return { kolom: d.kolom, label: label || d.label, aktif: s && typeof s.aktif === "boolean" ? s.aktif : d.aktif };
  });
  return { versi: 1, peran: hasil, identifikasi };
}

/** Bacaan KETAT untuk simpanan admin: daftar pesan galat ([] = sah). */
export function galatLaporan(mentah: unknown): string[] {
  const g: string[] = [];
  if (!objek(mentah)) return ["Isian pengaturan tidak terbaca."];
  const pm = objek(mentah.peran) ? mentah.peran : null;
  if (!pm) return ["Pengaturan per level tidak ada."];
  for (const p of PERAN_LAPORAN) {
    const x = pm[p];
    const nama = LABEL_PERAN_LAPORAN[p];
    if (!objek(x)) {
      g.push(`Pengaturan ${nama} tidak ada.`);
      continue;
    }
    for (const [kunci, nm, maks] of [["judul", "Judul", BATAS_LAPORAN.judul], ["uraian", "Uraian", BATAS_LAPORAN.uraian]] as const) {
      const v = x[kunci];
      if (v !== undefined && typeof v !== "string") g.push(`${nm} ${nama} harus berupa teks.`);
      else if (typeof v === "string") {
        if (v.length > maks) g.push(`${nm} ${nama} maksimal ${maks} karakter.`);
        const asing = penandaTakDikenal(v);
        if (asing.length) g.push(`${nm} ${nama} memuat penanda tak dikenal: ${asing.map((a) => `{${a}}`).join(", ")}.`);
      }
    }
    const lm = objek(x.lampiran) ? x.lampiran : null;
    if (!lm) g.push(`Daftar lampiran ${nama} tidak ada.`);
    else
      for (const k of KODE_LAMPIRAN) {
        if (lm[k] !== undefined && typeof lm[k] !== "boolean") g.push(`Lampiran “${KATALOG[k].label}” (${nama}) harus ya atau tidak.`);
        if (lm[k] === true && !KATALOG[k].peran.includes(p)) g.push(`Lampiran “${KATALOG[k].label}” tidak berlaku untuk ${nama}.`);
      }
  }
  if (mentah.identifikasi !== undefined) {
    if (!Array.isArray(mentah.identifikasi)) g.push("Variabel identifikasi harus berupa daftar.");
    else
      for (const v of mentah.identifikasi) {
        if (!objek(v) || typeof v.kolom !== "string" || !KOLOM_IDENTIFIKASI.includes(v.kolom)) {
          g.push("Ada variabel identifikasi yang tidak dikenal.");
          break;
        }
        if (v.label !== undefined && (typeof v.label !== "string" || v.label.trim().length > BATAS_LAPORAN.labelVariabel)) g.push(`Label variabel “${v.kolom}” maksimal ${BATAS_LAPORAN.labelVariabel} karakter.`);
        if (v.aktif !== undefined && typeof v.aktif !== "boolean") g.push(`Variabel “${v.kolom}” harus ya atau tidak.`);
      }
  }
  return g;
}

export const rapikanLaporan = (mentah: unknown): KonfigLaporan => normalisasiLaporan(mentah);
export const samaDenganBawaanLaporan = (k: KonfigLaporan): boolean => JSON.stringify(normalisasiLaporan(k)) === JSON.stringify(KONFIG_LAPORAN_BAWAAN);

/** Lampiran yang berlaku untuk suatu level, urut seperti katalog. */
export const lampiranUntuk = (p: PeranLaporan): KodeLampiran[] => KODE_LAMPIRAN.filter((k) => KATALOG[k].peran.includes(p));

/** Jenis level dari peran penugasan; selain ppl/pml/korwil (mis. supervisor) = null (memakai laporan umum tanpa lampiran tambahan). */
export const peranLaporan = (peran: string | null | undefined): PeranLaporan | null => (peran === "ppl" || peran === "pml" || peran === "korwil" ? peran : null);

// ---------------------------------------------------------------- penanda teks

export type VariabelTeks = Partial<Record<(typeof PENANDA)[number], string | number>>;

/** Ganti penanda {nama} dst.; penanda tak dikenal dibiarkan apa adanya. */
export function isiTemplat(teks: string, v: VariabelTeks): string {
  return teks.replace(/\{([^{}]*)\}/g, (utuh, k: string) => (k in v && v[k as keyof VariabelTeks] != null ? String(v[k as keyof VariabelTeks]) : utuh));
}

// ---------------------------------------------------------------- data harian & penyusun blok

export type HasilJumlah = Record<HasilKk, number>;
export const hasilKosong = (): HasilJumlah => ({ terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 });
export const jumlahHasil = (h: HasilJumlah): number => HASIL_KK.reduce((s, k) => s + (h[k] ?? 0), 0);

export type DataIsiHarian = {
  identifikasi?: { subsls: number; nilai: Record<string, number> } | null;
  pendataan?: { hasil: HasilJumlah; alasan: { alasan: string; n: number }[]; petugas: { nama: string; hasil: HasilJumlah }[] } | null;
  qc?: { lembar: number; kategori: Record<string, number>; sesuai: number; perluPerbaikan: number; tidakSesuai: number } | null;
  /** pasangan = petugas-Sub SLS yang punya data jarak; tanpa = yang belum punya */
  jarak?: { pasangan: number; rataKm: number; maksKm: number; perkiraan: number; tanpa?: number } | null;
};

export type BlokIsi = { judul: string; baris?: [string, string][]; tabel?: { kepala: string[]; baris: string[][] }; catatan?: string };

export type Aktivitas = { identifikasi: boolean; pengawasan: boolean; qc: boolean };

export type HasilIsi = { blok: BlokIsi[]; aktivitas: Aktivitas; tampilLokasi: boolean; tampilKendala: boolean };

export const bilangan = (n: number, desimal = 0): string => {
  const t = (Number.isFinite(n) ? n : 0).toFixed(desimal);
  const [b, d] = t.split(".");
  const ribu = b.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d ? `${ribu},${d}` : ribu;
};
const persen = (n: number, total: number) => (total > 0 ? ` (${bilangan((n / total) * 100, 1)}%)` : "");

const JUDUL_PENDATAAN: Record<PeranLaporan, string> = {
  ppl: "HASIL PENDATAAN KK",
  pml: "HASIL PENDATAAN TIM (PENGAWASAN PPL)",
  korwil: "HASIL PENDATAAN KELOMPOK KOORDINASI",
};

/** Kegiatan hari itu menurut data (dipakai teks uraian dan blok). */
export function aktivitasHari(peran: PeranLaporan | null, data: DataIsiHarian): Aktivitas {
  const ident = (data.identifikasi?.subsls ?? 0) > 0;
  const dataKk = data.pendataan ? jumlahHasil(data.pendataan.hasil) > 0 : false;
  return { identifikasi: peran === "pml" && ident, pengawasan: peran === "pml" && dataKk, qc: (peran === "korwil" || peran === "pml") && (data.qc?.lembar ?? 0) > 0 };
}

/**
 * Blok lampiran satu laporan harian. Blok yang dicentang tetapi tidak ada datanya pada hari itu TIDAK ditampilkan (konteks harian).
 * `lembar` memberi nama kategori hasil (label_pendek) dan kategori aktif.
 */
export function susunIsiLaporan(peran: string | null | undefined, konfig: KonfigLaporan, lembar: KonfigLembar, data: DataIsiHarian): HasilIsi {
  const p = peranLaporan(peran);
  const aktivitas = aktivitasHari(p, data);
  if (!p) return { blok: [], aktivitas, tampilLokasi: true, tampilKendala: true };
  const on = konfig.peran[p].lampiran;
  const blok: BlokIsi[] = [];
  const kategori = HASIL_KK.filter((h) => lembar.hasil[h].aktif);
  const nama = (h: HasilKk) => lembar.hasil[h].label_pendek || lembar.hasil[h].label;

  if (on.identifikasi && p === "pml" && data.identifikasi && data.identifikasi.subsls > 0) {
    const baris: [string, string][] = [["Sub SLS diidentifikasi", bilangan(data.identifikasi.subsls)]];
    for (const v of konfig.identifikasi) if (v.aktif) baris.push([v.label, bilangan(data.identifikasi.nilai[v.kolom] ?? 0)]);
    blok.push({ judul: "HASIL IDENTIFIKASI WILAYAH", baris });
  }

  const pd = data.pendataan;
  const total = pd ? jumlahHasil(pd.hasil) : 0;
  if (pd && total > 0) {
    if (on.pendataan) {
      const baris: [string, string][] = [["Jumlah KK dikunjungi", bilangan(total)]];
      for (const h of kategori) baris.push([nama(h), `${bilangan(pd.hasil[h])}${persen(pd.hasil[h], total)}`]);
      blok.push({ judul: JUDUL_PENDATAAN[p], baris });
    }
    if (on.pendataan_alasan && pd.alasan.length > 0) {
      const urut = [...pd.alasan].sort((a, b) => b.n - a.n || a.alasan.localeCompare(b.alasan, "id"));
      const jml = urut.reduce((s, a) => s + a.n, 0);
      blok.push({ judul: `ALASAN HASIL “${nama("tidak_ditemukan").toUpperCase()}”`, tabel: { kepala: ["ALASAN", "KK"], baris: urut.map((a) => [a.alasan, `${bilangan(a.n)}${persen(a.n, jml)}`]) } });
    }
    if (on.pendataan_petugas && (p === "pml" || p === "korwil") && pd.petugas.length > 0) {
      const kepala = [p === "pml" ? "PPL" : "TIM (PML)", ...kategori.map(nama), "JUMLAH"];
      const baris = pd.petugas.filter((x) => jumlahHasil(x.hasil) > 0).map((x) => [x.nama, ...kategori.map((h) => bilangan(x.hasil[h])), bilangan(jumlahHasil(x.hasil))]);
      if (baris.length) blok.push({ judul: p === "pml" ? "RINCIAN PER PPL" : "RINCIAN PER TIM", tabel: { kepala, baris } });
    }
  }

  if (on.qc && (p === "pml" || p === "korwil") && data.qc && data.qc.lembar > 0) {
    const baris: [string, string][] = [["Lembar QC diperiksa", bilangan(data.qc.lembar)]];
    for (const [k, n] of Object.entries(data.qc.kategori).sort((a, b) => b[1] - a[1])) baris.push([`Kategori ${k}`, bilangan(n)]);
    baris.push(["Aspek sesuai", bilangan(data.qc.sesuai)], ["Aspek perlu perbaikan", bilangan(data.qc.perluPerbaikan)], ["Aspek tidak sesuai", bilangan(data.qc.tidakSesuai)]);
    blok.push({ judul: "HASIL QUALITY CHECK", baris });
  }

  if (on.jarak && data.jarak && data.jarak.pasangan > 0) {
    const baris: [string, string][] = [
      ["Pasangan petugas dan Sub SLS", bilangan(data.jarak.pasangan)],
      ["Jarak rata-rata", `${bilangan(data.jarak.rataKm, 2)} km`],
      ["Jarak terjauh", `${bilangan(data.jarak.maksKm, 2)} km`],
    ];
    if (data.jarak.perkiraan > 0) baris.push(["Berstatus perkiraan (nagari)", bilangan(data.jarak.perkiraan)]);
    if ((data.jarak.tanpa ?? 0) > 0) baris.push(["Belum ada data jarak", bilangan(data.jarak.tanpa ?? 0)]);
    blok.push({ judul: "JARAK RUMAH PETUGAS KE SUB SLS", baris, catatan: "Jarak menurut data alokasi Sub SLS, bukan jarak tempuh sebenarnya." });
  }

  return { blok, aktivitas, tampilLokasi: on.lokasi, tampilKendala: on.kendala };
}

/** Ringkasan kegiatan hari itu untuk kalimat uraian: "mengidentifikasi wilayah kerja dan mengawasi pendataan oleh PPL". */
export function teksAktivitas(peran: PeranLaporan | null, a: Aktivitas): string {
  const bagian: string[] = [];
  if (peran === "pml") {
    if (a.identifikasi) bagian.push("mengidentifikasi wilayah kerja (Sub SLS) yang menjadi tanggung jawab tim");
    if (a.pengawasan) bagian.push("mengawasi pendataan oleh PPL di bawahnya");
  }
  if (a.qc) bagian.push("melakukan pengendalian mutu (quality check) hasil pendataan");
  if (peran === "korwil" && bagian.length === 0) return "mengoordinasikan petugas di wilayahnya";
  return bagian.join(" dan ");
}
