// lib/keu/identifikasi.ts
//
// (25 Okt 2026; disesuaikan tahap 27a sesuai "Skema Lengkap V1") Identifikasi survei (tahap awal GSBPM) -- logika murni tanpa React/DB supaya mudah diuji.
// Dipindahkan dari mockup "Identifikasi" (Version 7). Isian formulir disimpan sebagai jsonb pada tabel keu_ident (SQL 20261025za);
// kembaran penghitung jendela pendataan ada di basis data (`keu_ident_jendela`) dan paritasnya diuji (lihat tes).
//
// Isi: tipe formulir, bentuk awal, normalisasi masukan jsonb, jadwal (jendela pola, pengecualian, tahap turunan relatif),
// kebutuhan belanja, pemeriksaan (masalah/peringatan), kematangan (Fix/Perkiraan), beda dua salinan, dampak revisi.
// Bagian hilir (pembaruan H-15, agenda, rekrutmen, evaluasi, pencocokan POK) ada di identifikasiHilir.ts.

import { namaBulan, rapikanRec, recPerk, type WaktuRec } from "./waktu";

export const JENIS_PERIODE = ["Bulanan", "Triwulanan", "Kuartalan (4 bulanan)", "Semesteran", "Tahunan", "Ad-hoc", "Tanpa periode"] as const;
export type JenisPeriode = (typeof JENIS_PERIODE)[number];
export const INSTRUMEN = ["Tanpa pendataan", "FASIH", "PAPI"] as const;
export type Instrumen = (typeof INSTRUMEN)[number];
export const TAHAP = [
  ["updating", "Updating"],
  ["pendataan", "Pendataan"],
  ["pengolahan", "Pengolahan"],
  ["pasca", "Pasca pengolahan"],
  ["diseminasi", "Diseminasi"],
] as const;
export type Tahap = (typeof TAHAP)[number][0];
export const NAMA_TAHAP: Record<Tahap, string> = { updating: "Updating", pendataan: "Pendataan", pengolahan: "Pengolahan", pasca: "Pasca pengolahan", diseminasi: "Diseminasi" };

export type Jadwal = { mulai: string; selesai: string; perk: boolean };
export type Rel = { aM: "mulai" | "selesai"; dM: number; aS: "mulai" | "selesai"; dS: number; perk: boolean };
export type Jend = { mb: number; mj: "tgl" | "akhir"; mn: number; sb: number; sj: "tgl" | "akhir"; sn: number; perk: boolean };
export type Kecuali = { on: boolean; mulai: string; selesai: string; alasan: string; perk: boolean };
export type BentukSesi = "" | "Daring" | "Luring" | "Hybrid";
/** Tempat sesi luring/hybrid. Hotel = paket meeting fullday atau fullboard (524114 dalam kota, 524119 luar kota); selain itu konsumsi tanpa paket (521211). */
export type TempatSesi = "" | "Kantor" | "Hotel dalam kota" | "Hotel luar kota" | "Lokasi lain";
export const TEMPAT_SESI: readonly TempatSesi[] = ["", "Kantor", "Hotel dalam kota", "Hotel luar kota", "Lokasi lain"];
export const tempatHotel = (t: TempatSesi): boolean => t === "Hotel dalam kota" || t === "Hotel luar kota";
export type SesiForm = { on: boolean; bentuk: BentukSesi; tempat: TempatSesi; tgl: Record<string, WaktuRec>; pulsa: boolean; perl: boolean; pengajar: boolean };
export type StatusPetugas = "Organik" | "Mitra" | "Organik dan mitra";
export type PeranId = "supervisor" | "kortim" | "pml" | "ppl" | "entri";
export type PeranForm = { on: boolean; translok: boolean; honor: boolean; status: StatusPetugas; nOrg: number; nMit: number; perk: boolean; dasar: string };
export type TimHonor = { honor: boolean; ketua: boolean; wakil: boolean; anggota: boolean };
export const JABATAN_TIM: readonly { id: "ketua" | "wakil" | "anggota"; nama: string }[] = [{ id: "ketua", nama: "Ketua tim" }, { id: "wakil", nama: "Wakil" }, { id: "anggota", nama: "Anggota" }];
export type Media = "Apel pagi" | "Tatap muka" | "Zoom";
/**
 * `mitra`: penanda lama (tidak lagi dipakai; konsumsi rapat kini luring + ada mitra). `tgl` (28 Okt 2026): jadwal rapat per periode, Perkiraan (bulan + minggu) atau Fix.
 */
export type RapatForm = { on: boolean; media: Media[]; mitra: boolean; tgl?: Record<string, WaktuRec> };
export type CaraKonsultasi = "Tatap muka (perjalanan dinas)" | "Daring";

export type Form = {
  nama: string;
  periode: JenisPeriode;
  keList: string[];
  adaUpdating: boolean;
  adaDiseminasi: boolean;
  jend: Jend;
  rel: Record<"updating" | "pengolahan" | "pasca" | "diseminasi", Rel>;
  kecuali: Record<string, Kecuali>;
  tunggal: Jadwal;
  berbagi: boolean;
  rujukan: string;
  sesi: { briefing: SesiForm; pelatihan: SesiForm };
  rapat: { persiapan: RapatForm; pelaksanaan: RapatForm; evaluasi: RapatForm };
  instrumen: Instrumen;
  cetakPapi: boolean;
  pulsaLap: boolean;
  peran: Record<PeranId, PeranForm>;
  /** Hanya bila periode = Ad-hoc: honor tim pelaksana (jabatan yang menerima honor). */
  tim: TimHonor;
  konsultasi: boolean;
  cara: CaraKonsultasi;
  rekon: boolean;
  /** Cetak buku publikasi: belanja persediaan (521811) bila dicetak di kabupaten. Rilis dan spanduk tidak ada di kabupaten/kota. */
  cetakBuku: boolean;
  cetakKab: boolean;
};

export const PERAN_DEF: readonly { id: PeranId; nama: string; translok: "kunci" | "pilih" | "skip"; honor: "pilih" | "skip" }[] = [
  // Semua peran ditanya translok (Ya atau Tidak). Rencana boleh tidak direalisasi; selisihnya dicatat sebagai Gap saat evaluasi.
  { id: "supervisor", nama: "Supervisor", translok: "pilih", honor: "skip" },
  { id: "kortim", nama: "Kortim", translok: "pilih", honor: "pilih" },
  { id: "pml", nama: "PML", translok: "pilih", honor: "pilih" },
  { id: "ppl", nama: "PPL", translok: "pilih", honor: "pilih" },
  { id: "entri", nama: "Petugas entri", translok: "pilih", honor: "pilih" },
];

/** Nama periode menurut jenis. Urutannya menentukan nomor bulan awal (indeks x LEN). */
export const NAMA_PERIODE: Record<JenisPeriode, string[]> = {
  Bulanan: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  Triwulanan: ["Triwulan I", "Triwulan II", "Triwulan III", "Triwulan IV"],
  "Kuartalan (4 bulanan)": ["Kuartal I (Jan–Apr)", "Kuartal II (Mei–Agu)", "Kuartal III (Sep–Des)"],
  Semesteran: ["Semester I", "Semester II"],
  Tahunan: ["Tahun 2026"],
  "Ad-hoc": ["Ad-hoc"],
  "Tanpa periode": [],
};
/** Panjang satu periode dalam bulan. */
export const PANJANG_PERIODE: Record<JenisPeriode, number> = { Bulanan: 1, Triwulanan: 3, "Kuartalan (4 bulanan)": 4, Semesteran: 6, Tahunan: 12, "Ad-hoc": 12, "Tanpa periode": 0 };
export const NAMA_BULAN = NAMA_PERIODE.Bulanan;

/** Hari sebelum mulai pendataan paling awal: identifikasi wajib sudah sah; sesudahnya revisi cukup disetujui KPA (SQL 20261025zc). */
export const HARI_H15 = 15;

// ---------------------------------------------------------------------------------------------------------------------
// Bentuk awal dan normalisasi
// ---------------------------------------------------------------------------------------------------------------------

const sesiKosong = (): SesiForm => ({ on: false, bentuk: "", tempat: "", tgl: {}, pulsa: false, perl: false, pengajar: false });
const peranAwal = (on: boolean, o: Partial<PeranForm> = {}): PeranForm => ({ on, translok: false, honor: false, status: "Mitra", nOrg: 0, nMit: 0, perk: false, dasar: "", ...o });

/** Formulir kosong untuk survei baru (isian bawaan yang paling lazim; semuanya dapat diubah). */
export function awalForm(): Form {
  return {
    nama: "",
    periode: "Triwulanan",
    keList: ["Triwulan I"],
    adaUpdating: false,
    adaDiseminasi: true,
    jend: { mb: 2, mj: "tgl", mn: 1, sb: 2, sj: "akhir", sn: 0, perk: true }, // (28 Okt 2026) semua tanggal bawaannya Perkiraan
    rel: {
      updating: { aM: "mulai", dM: -10, aS: "mulai", dS: -1, perk: true },
      pengolahan: { aM: "mulai", dM: 0, aS: "selesai", dS: 0, perk: true }, // bawaan sama dengan jadwal pendataan (hanya membantu; dapat diubah)
      pasca: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
      diseminasi: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
    },
    kecuali: {},
    tunggal: { mulai: "", selesai: "", perk: true },
    berbagi: false,
    rujukan: "",
    sesi: { briefing: sesiKosong(), pelatihan: sesiKosong() },
    rapat: { persiapan: { on: false, media: [], mitra: false, tgl: {} }, pelaksanaan: { on: false, media: [], mitra: false, tgl: {} }, evaluasi: { on: true, media: ["Tatap muka"], mitra: false, tgl: {} } },
    instrumen: "FASIH",
    cetakPapi: false,
    pulsaLap: false,
    peran: {
      supervisor: peranAwal(true, { translok: true, status: "Organik", nOrg: 1 }),
      kortim: peranAwal(false, { translok: true, status: "Organik", nOrg: 1 }),
      pml: peranAwal(true, { translok: true, honor: true, status: "Organik dan mitra", nOrg: 1, nMit: 1, perk: true }),
      ppl: peranAwal(true, { honor: true, status: "Mitra", nMit: 1, perk: true }),
      entri: peranAwal(false, { status: "Mitra", nMit: 1, perk: true }),
    },
    tim: { honor: false, ketua: false, wakil: false, anggota: false },
    konsultasi: false,
    cara: "Daring",
    rekon: false,
    cetakBuku: false,
    cetakKab: false,
  };
}

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Menimpa `dasar` dengan `masuk` secara rekursif untuk objek; larik dan nilai dasar diganti utuh bila tipenya sama. */
function gabung<T>(dasar: T, masuk: unknown): T {
  if (adalahObjek(dasar) && adalahObjek(masuk)) {
    const out: Record<string, unknown> = { ...dasar };
    for (const k of Object.keys(masuk)) out[k] = k in dasar ? gabung((dasar as Record<string, unknown>)[k], masuk[k]) : masuk[k];
    return out as T;
  }
  if (Array.isArray(dasar)) return (Array.isArray(masuk) ? masuk : dasar) as T;
  if (typeof dasar !== "object" && typeof dasar === typeof masuk) return masuk as T;
  return dasar;
}

const bil = (v: unknown, a = 0, b = 100000): number => {
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isNaN(n) ? a : Math.min(b, Math.max(a, n));
};
const bilS = (v: unknown): number => {
  const n = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : Math.max(-60, Math.min(365, n));
};

/**
 * Memulihkan formulir dari jsonb (boleh sebagian atau sedikit rusak) menjadi Form yang lengkap dan berbatas wajar.
 * Dipakai setiap kali formulir dibaca dari basis data, agar tampilan tidak pecah bila ada isian lama/kurang.
 */
export function normalisasi(masuk: unknown): Form {
  const f = gabung(awalForm(), masuk);
  // isian lama yang sudah tidak ada (rilis/spanduk dihapus di V1) dibuang agar tidak muncul sebagai perubahan
  delete (f as unknown as Record<string, unknown>).rilis; delete (f as unknown as Record<string, unknown>).spanduk;
  if (!JENIS_PERIODE.includes(f.periode)) f.periode = "Triwulanan";
  if (!INSTRUMEN.includes(f.instrumen)) f.instrumen = "FASIH";
  const daftar = NAMA_PERIODE[f.periode];
  f.keList = daftar.filter((x) => f.keList.includes(x)); // urut menurut kalender, buang yang tak dikenal
  const j = f.jend;
  j.mb = bil(j.mb, 0, 24); j.sb = bil(j.sb, 0, 24); j.mn = bil(j.mn, 1, 31); j.sn = bil(j.sn, 0, 31);
  j.mj = j.mj === "akhir" ? "akhir" : "tgl"; j.sj = j.sj === "akhir" ? "akhir" : "tgl";
  for (const k of ["updating", "pengolahan", "pasca", "diseminasi"] as const) {
    const r = f.rel[k];
    r.aM = r.aM === "selesai" ? "selesai" : "mulai"; r.aS = r.aS === "mulai" ? "mulai" : "selesai";
    r.dM = bilS(r.dM); r.dS = bilS(r.dS);
  }
  for (const id of PERAN_DEF.map((d) => d.id)) {
    const p = f.peran[id];
    p.nOrg = bil(p.nOrg, 0, 5000); p.nMit = bil(p.nMit, 0, 5000);
    if (!["Organik", "Mitra", "Organik dan mitra"].includes(p.status)) p.status = "Mitra";
  }
  for (const d of ["persiapan", "pelaksanaan", "evaluasi"] as const) f.rapat[d].media = f.rapat[d].media.filter((m) => ["Apel pagi", "Tatap muka", "Zoom"].includes(m));
  for (const id of ["briefing", "pelatihan"] as const) {
    if (!["", "Daring", "Luring", "Hybrid"].includes(f.sesi[id].bentuk)) f.sesi[id].bentuk = "";
    if (!TEMPAT_SESI.includes(f.sesi[id].tempat)) f.sesi[id].tempat = "";
  }
  f.sesi.briefing.perl = false; // perlengkapan hanya untuk pelatihan, bukan briefing
  // rekaman jadwal sesi dan rapat (Perkiraan/Fix) dipulihkan agar berbatas wajar
  for (const id of ["briefing", "pelatihan"] as const) {
    const tg = adalahObjek(f.sesi[id].tgl) ? f.sesi[id].tgl : {};
    f.sesi[id].tgl = Object.fromEntries(Object.entries(tg).map(([P, r]) => [P, rapikanRec(r)]));
  }
  for (const d of ["persiapan", "pelaksanaan", "evaluasi"] as const) {
    const tg = adalahObjek(f.rapat[d].tgl) ? f.rapat[d].tgl : {};
    f.rapat[d].tgl = Object.fromEntries(Object.entries(tg).map(([P, r]) => [P, rapikanRec(r)]));
  }
  if (!["Tatap muka (perjalanan dinas)", "Daring"].includes(f.cara)) f.cara = "Daring";
  return f;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tanggal
// ---------------------------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
/** Jumlah hari pada bulan ke-m0 (0 = Januari tahun `tahun`; boleh lewat 11 = tahun berikutnya). */
export const hariBulan = (tahun: number, m0: number): number => new Date(Date.UTC(tahun + Math.floor(m0 / 12), (((m0 % 12) + 12) % 12) + 1, 0)).getUTCDate();
/** Tanggal "YYYY-MM-DD" pada bulan ke-m0 hari ke-`hari` (dijepit ke 1..akhir bulan). Kembaran `keu_ident_tgl`. */
export function tglBulan(tahun: number, m0: number, hari: number): string {
  const y = tahun + Math.floor(m0 / 12); const m = ((m0 % 12) + 12) % 12;
  const d = Math.min(Math.max(hari, 1), hariBulan(tahun, m0));
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
/** Menambah n hari pada "YYYY-MM-DD"; kosong tetap kosong. */
export function tambahHari(d: string, n: number): string {
  if (!d) return "";
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** a - b dalam hari (kedua "YYYY-MM-DD"). */
export const selisihHari = (a: string, b: string): number => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
/** "2026-03-31" -> "31/03/2026". */
export const tglIndo = (d: string | null | undefined): string => (d ? d.split("-").reverse().join("/") : "(tanggal kosong)");

// ---------------------------------------------------------------------------------------------------------------------
// Jadwal
// ---------------------------------------------------------------------------------------------------------------------

const KOSONG: Jadwal = { mulai: "", selesai: "", perk: false };
const ANC: Record<"updating" | "pengolahan" | "pasca" | "diseminasi", Tahap> = { updating: "pendataan", pengolahan: "pendataan", pasca: "pengolahan", diseminasi: "pasca" };

export const adaPeriode = (f: Form): boolean => f.periode !== "Tanpa periode";
export const adalahAdhoc = (f: Form): boolean => f.periode === "Ad-hoc";
/** Jabatan tim yang menerima honor (hanya periode Ad-hoc dan bila honor tim = Ya). */
export const jabatanHonorTim = (f: Form): string[] => (adalahAdhoc(f) && f.tim.honor ? JABATAN_TIM.filter((j) => f.tim[j.id]).map((j) => j.nama) : []);
export const adaPendataan = (f: Form): boolean => f.instrumen !== "Tanpa pendataan";
/** Daftar periode yang dipakai; "Tanpa periode" menjadi satu entri "Kegiatan". */
export const daftarPeriode = (f: Form): string[] => (adaPeriode(f) ? f.keList.slice() : ["Kegiatan"]);

/** Tahap yang aktif menurut jawaban. */
export function tahapAktif(f: Form): Record<Tahap, boolean> {
  const pend = adaPendataan(f);
  return { updating: f.adaUpdating && pend, pendataan: pend, pengolahan: true, pasca: true, diseminasi: f.adaDiseminasi };
}

/** Bulan ke-0 periode P (indeks x panjang); -1 bila tidak dikenal. */
const awalBulan = (f: Form, P: string): number => {
  const i = NAMA_PERIODE[f.periode].indexOf(P);
  return i < 0 ? -1 : i * PANJANG_PERIODE[f.periode];
};

/** Jendela pendataan menurut pola (tanpa pengecualian). Kembaran `keu_ident_jendela` (cabang pola). */
export function jendelaPola(f: Form, P: string, tahun: number): Jadwal {
  const b = awalBulan(f, P);
  if (b < 0) return { ...KOSONG };
  const J = f.jend;
  const mulai = tglBulan(tahun, b + J.mb, J.mj === "akhir" ? hariBulan(tahun, b + J.mb) - J.mn + 1 : J.mn);
  const selesai = tglBulan(tahun, b + J.sb, J.sj === "akhir" ? hariBulan(tahun, b + J.sb) : J.sn);
  return { mulai, selesai, perk: !!J.perk };
}

export function kecualiAktif(f: Form, P: string): Kecuali | null {
  const e = f.kecuali?.[P];
  return adaPeriode(f) && e && e.on ? e : null;
}

/** Jendela pendataan (atau jadwal tunggal bila tanpa periode) untuk periode P: pengecualian dulu, lalu pola. */
export function jendelaPeriode(f: Form, P: string, tahun: number): Jadwal {
  if (!adaPeriode(f)) return { mulai: f.tunggal.mulai, selesai: f.tunggal.selesai, perk: !!f.tunggal.perk };
  const e = kecualiAktif(f, P);
  if (e) return { mulai: e.mulai, selesai: e.selesai, perk: !!e.perk };
  return jendelaPola(f, P, tahun);
}

/** Pembaruan H-15 satu periode (dari kolom keu_ident.upd). */
export type PembaruanH15 = { mulai: string; selesai: string };

/**
 * Jadwal semua tahap aktif untuk satu periode. Tahap turunan dihitung relatif dari tahap acuannya (ANC).
 * `upd` (opsional): pendataan diganti jendela hasil pembaruan H-15 dan ditegaskan Fix; tahap turunan ikut bergeser.
 */
export function hitungJadwal(f: Form, P: string, tahun: number, upd?: PembaruanH15 | null): Partial<Record<Tahap, Jadwal>> {
  const out: Partial<Record<Tahap, Jadwal>> = {};
  const aktif = tahapAktif(f);
  const pend = adaPendataan(f);
  let w = jendelaPeriode(f, P, tahun);
  if (upd && pend && adaPeriode(f)) w = { mulai: upd.mulai, selesai: upd.selesai, perk: false };
  if (pend) out.pendataan = w;
  for (const k of ["updating", "pengolahan", "pasca", "diseminasi"] as const) {
    if (!aktif[k]) continue;
    if (k === "pengolahan" && !pend) { out.pengolahan = w; continue; }
    const an = out[ANC[k]];
    if (!an || !an.mulai || !an.selesai) { out[k] = { ...KOSONG }; continue; }
    const r = f.rel[k];
    out[k] = {
      mulai: tambahHari(r.aM === "mulai" ? an.mulai : an.selesai, r.dM),
      selesai: tambahHari(r.aS === "mulai" ? an.mulai : an.selesai, r.dS),
      perk: !!r.perk || !!an.perk,
    };
  }
  return out;
}

/** Periode acuan (pertama) dan apakah periode P diturunkan dari acuan (tanggal sesi ikut bergeser). */
export function periodeTurunan(f: Form, P: string, tahun: number): boolean {
  const lst = daftarPeriode(f);
  const first = lst[0];
  if (!adaPeriode(f) || !adaPendataan(f) || P === first) return false;
  return !!hitungJadwal(f, P, tahun).pendataan?.mulai && !!hitungJadwal(f, first, tahun).pendataan?.mulai;
}

/** Tanggal sesi (briefing/pelatihan) periode P; periode turunan = tanggal periode acuan digeser sebesar selisih mulai pendataan. */
/** Tanggal satu rekaman jadwal untuk periode P; periode turunan = tanggal periode acuan digeser sebesar selisih mulai pendataan. */
function tanggalRekaman(f: Form, tgl: Record<string, WaktuRec> | undefined, P: string, tahun: number): { mulai: string; selesai: string } {
  const mentah = (Q: string) => tgl?.[Q] ?? { mulai: "", selesai: "" };
  const first = daftarPeriode(f)[0];
  if (periodeTurunan(f, P, tahun)) {
    const r = mentah(first);
    const d = selisihHari(hitungJadwal(f, P, tahun).pendataan!.mulai, hitungJadwal(f, first, tahun).pendataan!.mulai);
    return { mulai: tambahHari(r.mulai, d), selesai: tambahHari(r.selesai, d) };
  }
  const r = mentah(P);
  return { mulai: r.mulai, selesai: r.selesai };
}

export function tanggalSesi(f: Form, id: "briefing" | "pelatihan", P: string, tahun: number): { mulai: string; selesai: string } {
  return tanggalRekaman(f, f.sesi[id].tgl, P, tahun);
}

/** (28 Okt 2026) Tanggal rapat persiapan, pelaksanaan, atau evaluasi untuk periode P (kosong bila belum dijadwalkan). */
export function tanggalRapat(f: Form, id: "persiapan" | "pelaksanaan" | "evaluasi", P: string, tahun: number): { mulai: string; selesai: string } {
  return tanggalRekaman(f, f.rapat[id].tgl, P, tahun);
}

// ---------------------------------------------------------------------------------------------------------------------
// Kebutuhan belanja
// ---------------------------------------------------------------------------------------------------------------------

export type Kebutuhan = { akun: string; teks: string; sumber: string; paket: string[]; jalur: "Pengadaan" | "Non-pengadaan"; atau: boolean };

export const NAMA_AKUN: Record<string, string> = {
  "521211": "Belanja bahan", "521213": "Belanja honor output kegiatan", "522151": "Belanja jasa profesi",
  "521811": "Belanja barang persediaan", "524111": "Perjalanan dinas biasa", "524113": "Perjalanan dinas dalam kota",
  "524114": "Perjalanan dinas paket meeting dalam kota", "524119": "Perjalanan dinas paket meeting luar kota",
};
export const NAMA_PAKET: Record<string, string> = {
  "521211-A": "konsumsi tanpa paket", "521211-B": "perlengkapan atau penggandaan", "521211-D": "pulsa",
  "521213-C": "honor pengajar", "521213-D": "honor mitra", "521213-P": "honor petugas PNS BPS",
  "522151": "honor narasumber", "521811": "persediaan: cetak buku", "524111-A": "perjalanan dinas biasa",
  "524114": "paket meeting dalam kota (fullday atau fullboard)", "524119": "paket meeting luar kota (fullday atau fullboard)",
  "524113-A": "translok kurang dari 8 jam", "524113-B": "translok lebih dari 8 jam",
};
export const KODE_PAKET: readonly string[] = Object.keys(NAMA_PAKET);

/** Peran lapangan yang benar-benar dipakai: pendataan ada, peran dipilih, dan (untuk petugas entri) instrumen PAPI. */
export function peranTerpakai(f: Form): { id: PeranId; nama: string; p: PeranForm; translok: boolean; honor: boolean }[] {
  if (!adaPendataan(f)) return [];
  const papi = f.instrumen === "PAPI";
  return PERAN_DEF.filter((d) => f.peran[d.id].on && !(d.id === "entri" && !papi)).map((d) => {
    const p = f.peran[d.id];
    return { id: d.id, nama: d.nama, p, translok: d.translok === "kunci" ? true : d.translok === "pilih" ? p.translok : false, honor: d.honor === "pilih" ? p.honor : false };
  });
}

/** Daftar kebutuhan belanja yang diturunkan dari jawaban. Satu-satunya sumber untuk kartu anggaran dan akun yang dipicu. */
export function kebutuhan(f: Form): Kebutuhan[] {
  const need: Kebutuhan[] = [];
  const add = (akun: string, teks: string, sumber: string, paket: string[], jalur: Kebutuhan["jalur"], atau = false) => need.push({ akun, teks, sumber, paket, jalur, atau });
  const papi = f.instrumen === "PAPI";
  const fasih = f.instrumen === "FASIH";
  let anyPulsa = false;
  const adaMitra = hitungMitra(f) > 0;
  if (!f.berbagi) {
    for (const [id, nama] of [["briefing", "Briefing"], ["pelatihan", "Pelatihan"]] as const) {
      const s = f.sesi[id];
      if (!s.on) continue;
      const luring = s.bentuk === "Luring"; const daring = s.bentuk === "Daring"; const hybrid = s.bentuk === "Hybrid";
      // konsumsi atau paket hanya bila ada petugas mitra; hotel = paket fullday atau fullboard, selain hotel = konsumsi tanpa paket
      if ((luring || hybrid) && adaMitra) {
        if (s.tempat === "Hotel dalam kota") add("524114", `${nama} ${s.bentuk.toLowerCase()}: paket meeting fullday atau fullboard di hotel dalam kota`, "B", ["524114"], "Pengadaan");
        else if (s.tempat === "Hotel luar kota") add("524119", `${nama} ${s.bentuk.toLowerCase()}: paket meeting fullday atau fullboard di hotel luar kota`, "B", ["524119"], "Pengadaan");
        else add("521211", `${nama} ${s.bentuk.toLowerCase()}: konsumsi tanpa paket${s.tempat ? ` (${s.tempat.toLowerCase()})` : ""}`, "B", ["521211-A"], "Pengadaan");
      }
      if (id === "pelatihan" && (luring || hybrid) && s.perl) add("521211", `${nama}: perlengkapan pelatihan`, "B", ["521211-B"], "Pengadaan");
      if ((daring || hybrid) && s.pulsa && adaMitra) { add("521211", `${nama}: pulsa peserta (mitra)`, "B", ["521211-D"], "Pengadaan"); anyPulsa = true; }
      if (s.pengajar) add("522151", `${nama}: honor pengajar atau narasumber eksternal`, "B", ["522151"], "Non-pengadaan");
    }
  }
  for (const [id, nama] of [["persiapan", "persiapan"], ["pelaksanaan", "pelaksanaan"], ["evaluasi", "evaluasi"]] as const) {
    const r = f.rapat[id];
    const on = id === "evaluasi" ? true : r.on;
    // (28 Okt 2026) konsumsi rapat persiapan, pelaksanaan, dan evaluasi: syaratnya luring (tatap muka) + ada petugas mitra; keduanya harus terpenuhi
    if (on && adaMitra && r.media.includes("Tatap muka")) add("521211", `Konsumsi rapat ${nama} tatap muka (luring + ada mitra)`, "C", ["521211-A"], "Pengadaan");
  }
  if (papi && f.cetakPapi) add("521211", "Penggandaan dokumen PAPI di kabupaten", "D", ["521211-B"], "Pengadaan");
  if (fasih && !anyPulsa && f.pulsaLap) add("521211", "Pulsa petugas lapangan (FASIH)", "D", ["521211-D"], "Pengadaan");
  for (const t of peranTerpakai(f)) {
    if (t.translok) add("524113", `Translok ${t.nama}`, "E", ["524113-A", "524113-B"], "Non-pengadaan", true);
    if (t.honor) {
      const paket = t.p.status === "Organik" ? ["521213-P"] : t.p.status === "Mitra" ? ["521213-D"] : ["521213-D", "521213-P"];
      add("521213", `Honor ${t.nama} (${t.p.status.toLowerCase()})`, "E", paket, "Non-pengadaan");
    }
  }
  const jt = jabatanHonorTim(f);
  if (jt.length > 0) add("521213", `Honor tim pelaksana (${jt.join(", ").toLowerCase()})`, "E2", ["521213-P"], "Non-pengadaan");
  if (f.konsultasi && f.cara === "Tatap muka (perjalanan dinas)") add("524111", "Konsultasi teknis tatap muka (perjalanan dinas)", "F2", ["524111-A"], "Non-pengadaan");
  if (f.adaDiseminasi && f.cetakBuku && f.cetakKab) add("521811", "Cetak buku publikasi di kabupaten (belanja persediaan)", "H2", ["521811"], "Pengadaan");
  return need;
}

/** Akun yang dipicu (unik, urut). */
export function akunDipicu(f: Form): string[] {
  return Array.from(new Set(kebutuhan(f).map((n) => n.akun))).sort();
}

/** Jumlah mitra yang dibutuhkan seluruh peran (0 bila tanpa pendataan). */
export function hitungMitra(f: Form): number {
  let n = 0;
  for (const t of peranTerpakai(f)) if (t.p.status === "Mitra" || t.p.status === "Organik dan mitra") n += bil(t.p.nMit);
  return n;
}

/** Ringkasan petugas lapangan. */
export function ringkasPetugas(f: Form) {
  let totOrg = 0; let totMit = 0;
  const mitraPeran: string[] = []; const perkPeran: string[] = [];
  const terpakai = peranTerpakai(f);
  for (const t of terpakai) {
    const adaOrg = t.p.status === "Organik" || t.p.status === "Organik dan mitra";
    const adaMit = t.p.status === "Mitra" || t.p.status === "Organik dan mitra";
    if (adaOrg) totOrg += bil(t.p.nOrg);
    if (adaMit) { totMit += bil(t.p.nMit); mitraPeran.push(t.nama); }
    if (t.p.perk) perkPeran.push(t.nama);
  }
  return { jumlahPeran: terpakai.length, totOrg, totMit, total: totOrg + totMit, mitraPeran, perkPeran };
}

/** Mulai pendataan paling awal (null bila tanpa pendataan atau tanggal belum lengkap). Kembaran SQL `keu_ident_mulai_awal`. */
export function mulaiPendataanAwal(f: Form, tahun: number): string | null {
  if (!adaPendataan(f)) return null;
  let awal: string | null = null;
  for (const P of daftarPeriode(f)) {
    const m = jendelaPeriode(f, P, tahun).mulai;
    if (/^\d{4}-\d\d-\d\d$/.test(m) && (awal === null || m < awal)) awal = m;
  }
  return awal;
}

/** H-15 (tanggal) bagi formulir; null bila tidak dapat dihitung. */
export function tanggalH15(f: Form, tahun: number): string | null {
  const m = mulaiPendataanAwal(f, tahun);
  return m ? tambahHari(m, -HARI_H15) : null;
}

/** Benar bila hari ini sudah H-15 atau lebih lambat: revisi yang dikirim sekarang hanya perlu KPA. */
export function sesudahH15(f: Form, tahun: number, hariIni: string): boolean {
  const h = tanggalH15(f, tahun);
  return h !== null && hariIni >= h;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pemeriksaan
// ---------------------------------------------------------------------------------------------------------------------

export type KonteksPeriksa = { rujukan?: { sah: boolean } | null };
export type HasilPeriksa = { masalah: string[]; peringatan: string[] };

/** Tahap yang tanggalnya lengkap dan wajar untuk satu periode, plus pesan masalah (tanpa awalan periode). */
export function jadwalValid(f: Form, P: string, tahun: number, upd?: PembaruanH15 | null) {
  const aktif = tahapAktif(f);
  const jp = hitungJadwal(f, P, tahun, upd);
  const valid: Partial<Record<Tahap, Jadwal>> = {};
  const masalah: string[] = [];
  const perk: Tahap[] = [];
  for (const [k, nama] of TAHAP) {
    if (!aktif[k]) continue;
    const x = jp[k] ?? KOSONG;
    if (!x.mulai || !x.selesai) { masalah.push(`${nama}: isi tanggal mulai dan selesai.`); continue; }
    if (x.selesai < x.mulai) { masalah.push(`${nama}: tanggal selesai sebelum tanggal mulai.`); continue; }
    valid[k] = x;
  }
  if (valid.updating && valid.pendataan && valid.pendataan.mulai < valid.updating.selesai) masalah.push("Pendataan dimulai sebelum updating selesai (tidak boleh beririsan).");
  if (valid.pengolahan && valid.pendataan && valid.pengolahan.mulai < valid.pendataan.mulai) masalah.push("Pengolahan dimulai sebelum pendataan dimulai.");
  if (valid.pasca && valid.pengolahan && valid.pasca.mulai < valid.pengolahan.selesai) masalah.push("Pasca pengolahan dimulai sebelum pengolahan selesai.");
  if (valid.diseminasi && valid.pasca && valid.diseminasi.mulai < valid.pasca.selesai) masalah.push("Diseminasi dimulai sebelum pasca pengolahan selesai.");
  for (const [k] of TAHAP) if (valid[k]?.perk) perk.push(k);
  return { valid, masalah, perk };
}

/** Memeriksa seluruh formulir. `masalah` = wajib dibereskan sebelum Kirim; `peringatan` = boleh dikirim. */
export function periksa(f: Form, tahun: number, ktx: KonteksPeriksa = {}): HasilPeriksa {
  const masalah: string[] = [];
  const peringatan: string[] = [];
  const pend = adaPendataan(f);
  const lst = daftarPeriode(f);
  const first = lst[0];
  const banyak = lst.length > 1;
  const pre = (P: string) => (banyak ? `${P}: ` : "");
  const cek = (P: string) => !adaPeriode(f) || P === first || !!kecualiAktif(f, P);

  if (!f.nama.trim()) masalah.push("Nama survei wajib diisi.");
  if (adaPeriode(f) && f.keList.length === 0) masalah.push("Pilih minimal satu periode.");

  // jadwal per periode (pola cukup diperiksa lewat periode acuan; pengecualian diperiksa sendiri)
  for (const P of lst) {
    if (!cek(P)) continue;
    const r = jadwalValid(f, P, tahun);
    for (const m of r.masalah) masalah.push(pre(P) + m);
    const lab = banyak ? (kecualiAktif(f, P) ? ` (${P})` : " (pola)") : "";
    for (const k of r.perk) peringatan.push(`Jadwal ${NAMA_TAHAP[k]}${lab} masih perkiraan.`);
  }
  for (const P of lst) {
    const e = kecualiAktif(f, P);
    if (e && !String(e.alasan || "").trim()) masalah.push(`${pre(P)}pengecualian jadwal wajib disertai alasan.`);
  }

  // sesi
  const sesiOn = (id: "briefing" | "pelatihan") => f.sesi[id].on && !f.berbagi;
  for (const [id, nama] of [["briefing", "Briefing"], ["pelatihan", "Pelatihan"]] as const) {
    if (!sesiOn(id)) continue;
    if (!f.sesi[id].bentuk) masalah.push(`${nama}: pilih bentuk pelaksanaan.`);
    const bs = f.sesi[id].bentuk;
    if ((bs === "Luring" || bs === "Hybrid") && !f.sesi[id].tempat) masalah.push(`${nama}: pilih tempat pelaksanaan (kantor, hotel, atau lokasi lain).`);
    if ((bs === "Luring" || bs === "Hybrid") && hitungMitra(f) === 0) peringatan.push(`${nama} ${bs.toLowerCase()}: tidak ada petugas mitra, konsumsi atau paket tidak dihitung.`);
    lst.forEach((P, i) => {
      if (periodeTurunan(f, P, tahun)) return;
      const t = tanggalSesi(f, id, P, tahun);
      if (!t.mulai || !t.selesai) { if (i === 0) masalah.push(`${pre(P)}${nama}: tanggal mulai dan selesai wajib diisi.`); return; }
      if (t.selesai < t.mulai) masalah.push(`${pre(P)}${nama}: tanggal selesai sebelum tanggal mulai.`);
    });
  }
  if (sesiOn("pelatihan")) {
    for (const P of lst) {
      if (periodeTurunan(f, P, tahun)) continue;
      const t = tanggalSesi(f, "pelatihan", P, tahun);
      const v = jadwalValid(f, P, tahun).valid;
      if (!t.mulai || !t.selesai || t.selesai < t.mulai) continue;
      const nx = v.updating ?? v.pendataan;
      if (nx && nx.mulai < t.selesai) {
        const psn = `${pre(P)}${v.updating ? "Updating" : "Pendataan"} dimulai sebelum pelatihan selesai (tidak boleh beririsan).`;
        if (recPerk(f.sesi.pelatihan.tgl?.[P])) peringatan.push(psn.replace("(tidak boleh beririsan)", "(jadwal pelatihan masih perkiraan)")); else masalah.push(psn);
      }
    }
  }
  if (f.berbagi) {
    if (!f.rujukan) masalah.push("Pilih survei yang dirujuk untuk pelatihan dan briefing.");
    else if (f.rujukan.trim().toLowerCase() === f.nama.trim().toLowerCase()) masalah.push("Survei tidak dapat merujuk dirinya sendiri.");
    else if (ktx.rujukan && !ktx.rujukan.sah) peringatan.push("Survei yang dirujuk belum disahkan; pelatihannya belum dapat dipastikan.");
  }

  // jadwal sesi yang masih perkiraan
  for (const [id, nama] of [["briefing", "briefing"], ["pelatihan", "pelatihan"]] as const) {
    const rec = f.sesi[id].tgl?.[lst[0]];
    if (sesiOn(id) && rec?.mulai && recPerk(rec)) peringatan.push(`Jadwal ${nama} masih perkiraan.`);
  }

  // rapat
  for (const [id, nama] of [["persiapan", "persiapan"], ["pelaksanaan", "pelaksanaan"], ["evaluasi", "evaluasi"]] as const) {
    const r = f.rapat[id];
    const on = id === "evaluasi" ? true : r.on;
    if (on && r.media.length === 0) masalah.push(`Rapat ${nama}: pilih minimal satu media.`);
    if (on) {
      for (const P of lst) {
        if (periodeTurunan(f, P, tahun)) continue;
        const w = tanggalRapat(f, id, P, tahun);
        if (w.mulai && w.selesai && w.selesai < w.mulai) masalah.push(`${pre(P)}Rapat ${nama}: tanggal selesai sebelum tanggal mulai.`);
      }
      const rec = r.tgl?.[lst[0]];
      if (rec?.mulai && recPerk(rec)) peringatan.push(`Jadwal rapat ${nama} masih perkiraan.`);
    }
    if (on && r.media.includes("Tatap muka") && hitungMitra(f) === 0) peringatan.push(`Rapat ${nama} tatap muka: tidak ada petugas mitra, konsumsi tidak dihitung.`);
  }

  // honor tim (Ad-hoc)
  if (adalahAdhoc(f) && f.tim.honor && jabatanHonorTim(f).length === 0) masalah.push("Honor tim: centang minimal satu jabatan (ketua tim, wakil, atau anggota).");

  // petugas
  if (pend) {
    const terpakai = peranTerpakai(f);
    for (const t of terpakai) {
      const adaOrg = t.p.status === "Organik" || t.p.status === "Organik dan mitra";
      const adaMit = t.p.status === "Mitra" || t.p.status === "Organik dan mitra";
      if (adaOrg && bil(t.p.nOrg) < 1) masalah.push(`${t.nama}: isi jumlah petugas organik (minimal 1).`);
      if (adaMit && bil(t.p.nMit) < 1) masalah.push(`${t.nama}: isi jumlah petugas mitra (minimal 1).`);
      if (t.honor && t.p.status === "Organik" && !t.p.dasar.trim()) masalah.push(`${t.nama}: honorarium untuk status Organik perlu lampiran dasar atau juknis.`);
    }
    if (terpakai.length === 0) masalah.push("Pilih minimal satu peran lapangan.");
    else if (!terpakai.some((t) => t.id === "ppl")) masalah.push("PPL wajib dipakai bila ada pendataan (usulan).");
    const rp = ringkasPetugas(f);
    if (rp.perkPeran.length > 0) peringatan.push(`Jumlah petugas masih perkiraan: ${rp.perkPeran.join(", ")}.`);
  }
  return { masalah, peringatan };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tujuan navigasi: kalimat peringatan/catatan menuju kartu formulir yang bersangkutan
// ---------------------------------------------------------------------------------------------------------------------

/** Kata kunci -> id elemen pada halaman identifikasi. Kata yang paling awal muncul dalam kalimat menentukan tujuan. */
const PETA_TUJUAN: [RegExp, string][] = [
  [/fasih|papi|instrumen|pulsa/i, "bagian-instrumen"],
  [/pasca pengolahan|pasca/i, "tahap-pasca"],
  [/updating/i, "tahap-updating"],
  [/pengolahan/i, "tahap-pengolahan"],
  [/diseminasi/i, "tahap-diseminasi"],
  [/pendataan|pola jendela|pengecualian jadwal/i, "tahap-pendataan"],
  [/nama survei|periode/i, "bagian-a"],
  [/briefing|pelatihan|dirujuk|rujukan/i, "bagian-b"],
  [/rapat/i, "bagian-c"],
  [/petugas|supervisor|kortim|\bpml\b|\bppl\b|peran lapangan|honor|translok|organik|mitra/i, "bagian-d"],
  [/konsultasi|rekonsiliasi|cetak|buku/i, "bagian-e"],
];

/**
 * (28 Okt 2026) Kode sumber kebutuhan (`Kebutuhan.sumber`: B, C, D, E, E2, F2, H2) tetap seperti semula karena tersimpan dan diuji.
 * Huruf yang DITAMPILKAN kepada pengguna mengikuti susunan formulir baru: Instrumen (dulu D) kini di A; Organisasi (dulu E) menjadi D;
 * Konsultasi/rekonsiliasi/diseminasi (dulu F dan H) menjadi E.
 */
export const hurufBagianDariSumber = (sumber: string): string => ({ D: "A", E: "D", E2: "D", F2: "E", H2: "E" } as Record<string, string>)[sumber] ?? sumber;

/** Penegasan H-15 dan kartu lain di sisi kanan (id kartu). */
const KARTU_TUJUAN: [RegExp, string][] = [
  [/penegasan tanggal/i, "h-h15"],
  [/\((fasih|papi)\)/i, "bagian-instrumen"],
];

/**
 * Id elemen tujuan untuk sebuah kalimat hasil/peringatan/kematangan/agenda, atau null bila tidak ada tujuan yang pasti.
 * Kalimat berakhiran "(X)" dengan X = huruf bagian formulir (A-E; Instrumen kini bagian dari A) langsung menuju bagian itu.
 */
export function tujuanPesan(teks: string): string | null {
  const t = String(teks || "");
  const h = /\(([A-E])\)\s*$/.exec(t);
  if (h) return `bagian-${h[1].toLowerCase()}`;
  for (const [re, id] of KARTU_TUJUAN) if (re.test(t)) return id;
  let terbaik: { i: number; id: string } | null = null;
  for (const [re, id] of PETA_TUJUAN) {
    const m = re.exec(t);
    if (m && (terbaik === null || m.index < terbaik.i)) terbaik = { i: m.index, id };
  }
  if (terbaik) return terbaik.id;
  return /jadwal/i.test(t) ? "bagian-a" : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Kematangan (Fix atau Perkiraan)
// ---------------------------------------------------------------------------------------------------------------------

export type Butir = { t: string; perk: boolean };

/** Butir-butir yang bisa Fix atau Perkiraan: pola/pengecualian jendela, jadwal relatif, jumlah petugas per peran. */
export function kematangan(f: Form): { butir: Butir[]; nFix: number; nPerk: number } {
  const butir: Butir[] = [];
  const aktif = tahapAktif(f);
  const pend = adaPendataan(f);
  if (adaPeriode(f)) {
    butir.push({ t: "Pola jendela pendataan", perk: !!f.jend.perk });
    for (const P of f.keList) { const e = kecualiAktif(f, P); if (e) butir.push({ t: `Pengecualian jadwal ${P}`, perk: !!e.perk }); }
  } else {
    butir.push({ t: `Jadwal ${NAMA_TAHAP[pend ? "pendataan" : "pengolahan"].toLowerCase()}`, perk: !!f.tunggal.perk });
  }
  for (const k of ["updating", "pengolahan", "pasca", "diseminasi"] as const) {
    if (!aktif[k] || (k === "pengolahan" && !pend)) continue;
    butir.push({ t: `Jadwal ${NAMA_TAHAP[k]} (relatif)`, perk: !!f.rel[k].perk });
  }
  // jadwal briefing, pelatihan, dan rapat (hanya yang sudah terisi tanggalnya; periode acuan)
  const P0 = daftarPeriode(f)[0];
  if (!f.berbagi) {
    for (const [id, nama] of [["briefing", "briefing"], ["pelatihan", "pelatihan"]] as const) {
      const rec = f.sesi[id].tgl?.[P0];
      if (f.sesi[id].on && rec?.mulai) butir.push({ t: `Jadwal ${nama}`, perk: recPerk(rec) });
    }
  }
  for (const id of ["persiapan", "pelaksanaan", "evaluasi"] as const) {
    const rec = f.rapat[id].tgl?.[P0];
    if ((id === "evaluasi" || f.rapat[id].on) && rec?.mulai) butir.push({ t: `Jadwal rapat ${id}`, perk: recPerk(rec) });
  }
  for (const t of peranTerpakai(f)) butir.push({ t: `Jumlah petugas ${t.nama}`, perk: !!t.p.perk });
  const nPerk = butir.filter((b) => b.perk).length;
  return { butir, nPerk, nFix: butir.length - nPerk };
}

// ---------------------------------------------------------------------------------------------------------------------
// Beda dua salinan dan dampak revisi
// ---------------------------------------------------------------------------------------------------------------------

const HURUF = { th: NAMA_TAHAP, pr: { supervisor: "Supervisor", kortim: "Kortim", pml: "PML", ppl: "PPL", entri: "Petugas entri" } as Record<string, string>, ss: { briefing: "Briefing", pelatihan: "Pelatihan" } as Record<string, string> };
const TOP: Record<string, string> = {
  nama: "Nama survei", periode: "Jenis periode", keList: "Periode terpilih", adaUpdating: "Ada updating", adaDiseminasi: "Ada diseminasi",
  berbagi: "Berbagi pelatihan dengan survei lain", rujukan: "Survei yang dirujuk", instrumen: "Instrumen", cetakPapi: "Dokumen PAPI dicetak di kabupaten",
  pulsaLap: "Pulsa petugas lapangan", konsultasi: "Ada konsultasi teknis", cara: "Cara konsultasi", rekon: "Ada rekonsiliasi data",
  cetakBuku: "Cetak buku publikasi", cetakKab: "Buku dicetak di kabupaten",
};

function ratakan(o: unknown, pre: string, out: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(o)) { out[pre] = o.join(", "); return out; }
  if (o && typeof o === "object") { for (const k of Object.keys(o as object)) ratakan((o as Record<string, unknown>)[k], pre ? `${pre}.${k}` : k, out); return out; }
  out[pre] = o;
  return out;
}

const LAB_WAKTU: Record<string, string> = { mulai: "tanggal mulai", selesai: "tanggal selesai", perk: "penanda Fix atau Perkiraan", mode: "bentuk tanggal Fix", bulan: "bulan", minggu: "minggu ke-" };

/** Nama isian yang mudah dibaca dari jalur "peran.ppl.nMit" dst. */
export function labelJalur(p: string): string {
  const s = p.split(".");
  const dari = (peta: Record<string, string>, k: string) => peta[k] ?? k;
  if (s[0] === "jend") return `Pola jendela pendataan: ${dari({ mb: "bulan mulai", mj: "cara hari mulai", mn: "hari mulai", sb: "bulan selesai", sj: "cara hari selesai", sn: "hari selesai", perk: "penanda Fix atau Perkiraan" }, s[1])}`;
  if (s[0] === "rel") return `Jadwal ${dari(HURUF.th, s[1])} (relatif): ${dari({ aM: "acuan mulai", dM: "selisih hari mulai", aS: "acuan selesai", dS: "selisih hari selesai", perk: "penanda Fix atau Perkiraan" }, s[2])}`;
  if (s[0] === "kecuali") return `Pengecualian jadwal ${s[1]}: ${dari({ on: "aktif", mulai: "tanggal mulai", selesai: "tanggal selesai", alasan: "alasan", perk: "penanda Fix atau Perkiraan" }, s[2])}`;
  if (s[0] === "tunggal") return `Jadwal kegiatan: ${dari({ mulai: "tanggal mulai", selesai: "tanggal selesai", perk: "penanda Fix atau Perkiraan" }, s[1])}`;
  if (s[0] === "sesi") {
    if (s[2] === "tgl") return `Sesi ${dari(HURUF.ss, s[1])} (${s[3]}): ${dari(LAB_WAKTU, s[4])}`;
    return `Sesi ${dari(HURUF.ss, s[1])}: ${dari({ on: "dilaksanakan", bentuk: "bentuk", tempat: "tempat", pulsa: "biaya pulsa", perl: "perlengkapan pelatihan", pengajar: "pengajar eksternal" }, s[2])}`;
  }
  if (s[0] === "tim") return `Honor tim pelaksana: ${dari({ honor: "ada honor", ketua: "ketua tim", wakil: "wakil", anggota: "anggota" }, s[1])}`;
  if (s[0] === "rapat") return s[2] === "tgl" ? `Rapat ${s[1]} (${s[3]}): ${dari(LAB_WAKTU, s[4])}` : `Rapat ${s[1]}: ${s[2] === "on" ? "ada" : s[2] === "mitra" ? "mitra dihadirkan" : "media"}`;
  if (s[0] === "peran") return `${dari(HURUF.pr, s[1])}: ${dari({ on: "dipakai", translok: "translok", honor: "honorarium", status: "status", nOrg: "jumlah organik", nMit: "jumlah mitra", perk: "penanda jumlah Fix atau Perkiraan", dasar: "berkas dasar atau juknis" }, s[2])}`;
  return TOP[p] ?? p;
}

function nilaiTeks(path: string, v: unknown): string {
  if (path.split(".").pop() === "perk") return v ? "Perkiraan" : "Fix";
  if (path.split(".").pop() === "bulan" && typeof v === "number") return namaBulan(v);
  if (v === true) return "Ya";
  if (v === false) return "Tidak";
  if (v === undefined || v === "") return "(kosong)";
  if (typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)) return v.split("-").reverse().join("/");
  return String(v);
}

export type Beda = { path: string; t: string };
/** Daftar perubahan isi identifikasi antara dua salinan formulir. */
export function bedaForm(a: Form, b: Form): Beda[] {
  const fa = ratakan(a, "", {}); const fb = ratakan(b, "", {});
  const paths = Object.keys(fa).concat(Object.keys(fb).filter((k) => !(k in fa)));
  const norm = (p: string, v: unknown) => (v === undefined ? (p.split(".").pop() === "perk" ? false : "") : v);
  const out: Beda[] = [];
  for (const p of paths) {
    const x = norm(p, fa[p]); const y = norm(p, fb[p]);
    if (x === y) continue;
    out.push({ path: p, t: `${labelJalur(p)}: ${nilaiTeks(p, x)} → ${nilaiTeks(p, y)}` });
  }
  return out;
}

/** Kalimat dampak bila revisi `baru` disahkan menggantikan `sah`; kosong bila tidak ada perubahan. */
export function dampakRevisi(sah: Form, baru: Form): string {
  const beda = bedaForm(sah, baru);
  if (beda.length === 0) return "";
  const A = akunDipicu(baru); const B = akunDipicu(sah);
  const tmb = A.filter((x) => !B.includes(x)); const hlg = B.filter((x) => !A.includes(x));
  const m1 = hitungMitra(sah); const m2 = hitungMitra(baru);
  const awalan = ["jend.", "rel.", "kecuali.", "tunggal.", "sesi.", "rapat.", "adaUpdating", "adaDiseminasi", "keList", "periode"];
  const jBeda = beda.some((d) => awalan.some((x) => d.path.startsWith(x)));
  const bagian = [
    `Anggaran: ${tmb.length || hlg.length ? [tmb.length ? `akun bertambah ${tmb.join(", ")}` : "", hlg.length ? `akun berkurang ${hlg.join(", ")}` : ""].filter(Boolean).join("; ") : "daftar akun tidak berubah"}`,
    `Rekrutmen: ${m1 !== m2 ? `kebutuhan mitra ${m1} menjadi ${m2} orang` : `kebutuhan mitra tetap ${m2} orang`}`,
    `Delego: ${jBeda ? "jadwal atau agenda berubah" : "jadwal dan agenda tetap"}`,
  ];
  return `Dampak bila revisi disahkan: ${bagian.join(". ")}. PPK dan Tata Usaha (paralel), lalu KPA, perlu menyetujui ulang; bila dikirim sesudah H-15 cukup KPA.`;
}
