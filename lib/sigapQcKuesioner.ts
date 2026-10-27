// lib/sigapQcKuesioner.ts
//
// (27 Okt 2026) Kuesioner Quality Check untuk Lembar Supervisi: baca lembar Excel -> struktur aspek dan pertanyaan, periksa jawaban,
// hitung skor aspek dan kategori petugas. Fungsi murni (tanpa basis data / browser) supaya mudah diuji.
//
// Format berkas = berkas "Kuesioner QC Korwil" milik BPS Kab. Solok (dua lembar):
//  * "Kuesioner QC": baris judul kolom (No | Jenis | Pertanyaan / yang dicek | Pilihan jawaban | ...). Baris aspek: No "QC-1", pertanyaan
//    "Judul aspek  (untuk: PML)". Baris pertanyaan: No "1.1", Jenis T (tanya, jawaban dinilai petugas) / O (observasi) / N (isian angka),
//    pilihan jawaban dipisah " / ".
//  * "Kriteria Penilaian": baris aspek (QC-1 | Aspek | kriteria 1 | kriteria 2 | kriteria 3 | Untuk) lalu baris "Nilai 1.1: Semua = 1; Sebagian belum = 2; Belum = 3"
//    dan "Kunci 1.2: ..." (kunci jawaban pertanyaan T, ditampilkan kepada pemeriksa).
// Skor aspek = nilai TERBURUK dari pertanyaan aspek itu (1 Sesuai, 2 Perlu perbaikan, 3 Tidak sesuai).
// Kategori petugas: Perlu pembinaan bila ada aspek skor 3; Cukup bila tanpa skor 3 tetapi skor 2 pada >= 3 aspek; selain itu Baik; Belum dinilai bila tidak ada aspek bernilai.

export type ObjekKuesioner = "petugas" | "kk";
export type JenisSoal = "T" | "O" | "N";
export type PeranUntuk = "pml" | "ppl";
export type NilaiSoal = 1 | 2 | 3;

export const OBJEK_KUESIONER: { kode: ObjekKuesioner; label: string; ket: string }[] = [
  { kode: "petugas", label: "Petugas (PML/PPL)", ket: "Dipakai saat memeriksa kerja seorang PML atau PPL." },
  { kode: "kk", label: "Keluarga (KK)", ket: "Dipakai saat memeriksa satu keluarga yang sudah didata." },
];
export const JENIS_SOAL: { kode: JenisSoal; label: string }[] = [
  { kode: "T", label: "Tanya" },
  { kode: "O", label: "Observasi" },
  { kode: "N", label: "Angka" },
];
export const LABEL_SKOR: Record<NilaiSoal, string> = { 1: "Sesuai", 2: "Perlu perbaikan", 3: "Tidak sesuai" };

export type OpsiSoal = { teks: string; nilai: NilaiSoal };
export type SoalKuesioner = { no: string; jenis: JenisSoal; teks: string; opsi: OpsiSoal[]; kunci: string };
export type AspekKuesioner = { kode: string; judul: string; untuk: string; peran: PeranUntuk[]; kriteria: [string, string, string]; soal: SoalKuesioner[] };
export type StrukturKuesioner = { aspek: AspekKuesioner[] };
export type GalatBaris = { baris: number; pesan: string; lembar?: string };

export const MAKS_ASPEK = 30;
export const MAKS_SOAL = 300;
export const NAMA_LEMBAR_KUESIONER = "Kuesioner QC";
export const NAMA_LEMBAR_KRITERIA = "Kriteria Penilaian";

type Sel = unknown;
const sel = (v: Sel): string => String(v ?? "").replace(/\s+/g, " ").trim();
const kecil = (v: Sel): string => sel(v).toLowerCase();

/** Pecah "Judul aspek  (untuk: PML & PPL)" -> judul + untuk + peran yang relevan (kosong = keduanya). */
export function pecahJudulAspek(teks: string): { judul: string; untuk: string; peran: PeranUntuk[] } {
  const t = sel(teks);
  const m = /^(.*?)\s*\(\s*untuk\s*:\s*([^)]*)\)\s*$/i.exec(t);
  const judul = m ? sel(m[1]) : t;
  const untuk = m ? sel(m[2]) : "";
  const u = untuk.toLowerCase();
  const peran: PeranUntuk[] = [];
  if (u.includes("pml")) peran.push("pml");
  if (u.includes("ppl")) peran.push("ppl");
  return { judul, untuk, peran: peran.length ? peran : ["pml", "ppl"] };
}

/** "Semua = 1; Sebagian belum = 2; Belum = 3" -> daftar [teks, nilai]. Bagian tak terbaca diabaikan. */
export function bacaNilai(teks: string): { teks: string; nilai: number }[] {
  const hasil: { teks: string; nilai: number }[] = [];
  for (const bagian of String(teks ?? "").split(";")) {
    const i = bagian.lastIndexOf("=");
    if (i < 0) continue;
    const t = sel(bagian.slice(0, i));
    const n = Number(sel(bagian.slice(i + 1)));
    if (t && Number.isFinite(n)) hasil.push({ teks: t, nilai: n });
  }
  return hasil;
}

const NO_ASPEK = /^QC[-\s]?(\d+)$/i;

type Catatan = { nilai: string | null; kunci: string | null };

function bacaKriteria(baris: Sel[][] | null | undefined): { kriteria: Map<string, [string, string, string]>; catatan: Map<string, Catatan> } {
  const kriteria = new Map<string, [string, string, string]>();
  const catatan = new Map<string, Catatan>();
  for (const r of baris ?? []) {
    const a = sel(r[0]);
    const m = NO_ASPEK.exec(a);
    if (m) {
      kriteria.set(`QC-${Number(m[1])}`, [sel(r[2]), sel(r[3]), sel(r[4])]);
      continue;
    }
    const n = /^(Nilai|Kunci)\s+([^\s:]+)\s*:\s*(.*)$/i.exec(sel(r[1]));
    if (n) {
      const no = n[2];
      const c = catatan.get(no) ?? { nilai: null, kunci: null };
      if (n[1].toLowerCase() === "nilai") c.nilai = n[3];
      else c.kunci = n[3];
      catatan.set(no, c);
    }
  }
  return { kriteria, catatan };
}

/**
 * Baca dua lembar Excel (sudah berupa baris-baris sel, mis. dari sheet_to_json header:1) menjadi struktur kuesioner.
 * Mengembalikan SEMUA galat sekaligus; bila ada galat, struktur sebaiknya tidak disimpan.
 */
export function bacaKuesioner(kuesioner: Sel[][], kriteriaLembar: Sel[][] | null): { struktur: StrukturKuesioner; galat: GalatBaris[] } {
  const galat: GalatBaris[] = [];
  const g = (baris: number, pesan: string, lembar = NAMA_LEMBAR_KUESIONER) => galat.push({ baris, pesan, lembar });
  const aspek: AspekKuesioner[] = [];

  let h = -1;
  let kNo = 0, kJenis = 1, kTeks = 2, kOpsi = 3;
  for (let i = 0; i < kuesioner.length; i++) {
    const c = (kuesioner[i] ?? []).map(kecil);
    const no = c.indexOf("no");
    const jenis = c.indexOf("jenis");
    const teks = c.findIndex((x) => x.startsWith("pertanyaan"));
    const opsi = c.findIndex((x) => x.startsWith("pilihan"));
    if (no >= 0 && jenis >= 0 && teks >= 0 && opsi >= 0) {
      h = i;
      kNo = no; kJenis = jenis; kTeks = teks; kOpsi = opsi;
      break;
    }
  }
  if (h < 0) {
    g(1, 'Baris judul kolom tidak ditemukan. Harus ada kolom "No", "Jenis", "Pertanyaan / yang dicek", dan "Pilihan jawaban".');
    return { struktur: { aspek }, galat };
  }

  const { kriteria, catatan } = bacaKriteria(kriteriaLembar);
  if (!kriteriaLembar || kriteriaLembar.length === 0) g(1, `Lembar "${NAMA_LEMBAR_KRITERIA}" tidak ditemukan atau kosong (dibutuhkan untuk nilai jawaban).`, NAMA_LEMBAR_KRITERIA);

  const dipakai = new Set<string>();
  let kini: AspekKuesioner | null = null;
  for (let i = h + 1; i < kuesioner.length; i++) {
    const r = kuesioner[i] ?? [];
    const baris = i + 1;
    const no = sel(r[kNo]);
    if (/^blok\b/i.test(no)) break;
    if (!no) continue;

    const a = NO_ASPEK.exec(no);
    if (a) {
      const kode = `QC-${Number(a[1])}`;
      const p = pecahJudulAspek(sel(r[kTeks]));
      if (!p.judul) g(baris, `Aspek ${kode} tanpa judul.`);
      if (aspek.some((x) => x.kode === kode)) g(baris, `Aspek ${kode} muncul dua kali.`);
      kini = { kode, judul: p.judul, untuk: p.untuk, peran: p.peran, kriteria: kriteria.get(kode) ?? ["", "", ""], soal: [] };
      aspek.push(kini);
      continue;
    }

    if (!kini) {
      g(baris, `Pertanyaan ${no} berada di luar aspek (baris aspek QC-n harus lebih dulu).`);
      continue;
    }
    const jenis = sel(r[kJenis]).toUpperCase();
    if (jenis !== "T" && jenis !== "O" && jenis !== "N") {
      g(baris, `Pertanyaan ${no}: jenis "${sel(r[kJenis])}" tidak dikenal. Pakai T (tanya), O (observasi), atau N (angka).`);
      continue;
    }
    const teks = sel(r[kTeks]);
    if (teks.length < 3) {
      g(baris, `Pertanyaan ${no}: teks kosong atau terlalu pendek.`);
      continue;
    }
    if (dipakai.has(no)) {
      g(baris, `Nomor ${no} dipakai dua kali.`);
      continue;
    }
    dipakai.add(no);

    const s: SoalKuesioner = { no, jenis, teks, opsi: [], kunci: sel(catatan.get(no)?.kunci) };
    if (jenis !== "N") {
      const daftar = sel(r[kOpsi]).split(/\s+\/\s+/).map(sel).filter(Boolean);
      const unik = daftar.filter((x, j) => daftar.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === j);
      if (unik.length < 2) {
        g(baris, `Pertanyaan ${no}: pilihan jawaban minimal 2 (pisahkan dengan " / ").`);
        kini.soal.push(s);
        continue;
      }
      const peta = bacaNilai(catatan.get(no)?.nilai ?? "");
      let ok = true;
      for (let j = 0; j < unik.length; j++) {
        let nilai: number | undefined = peta.find((x) => x.teks.toLowerCase() === unik[j].toLowerCase())?.nilai;
        // pertanyaan T tanpa baris "Nilai": pilihan berurutan Benar / Kurang tepat / Salah = 1 / 2 / 3
        if (nilai === undefined && jenis === "T" && peta.length === 0 && unik.length === 3) nilai = j + 1;
        if (nilai !== 1 && nilai !== 2 && nilai !== 3) {
          g(baris, nilai === undefined ? `Pertanyaan ${no}: pilihan "${unik[j]}" belum ada nilainya. Tambahkan baris "Nilai ${no}: ..." di lembar "${NAMA_LEMBAR_KRITERIA}".` : `Pertanyaan ${no}: nilai pilihan "${unik[j]}" harus 1, 2, atau 3.`);
          ok = false;
          continue;
        }
        s.opsi.push({ teks: unik[j], nilai });
      }
      if (!ok) s.opsi = [];
    }
    kini.soal.push(s);
  }

  if (aspek.length === 0 && galat.length === 0) g(h + 1, "Tidak ada aspek (baris QC-1, QC-2, ...) yang terbaca.");
  for (const a of aspek) {
    if (!a.soal.some((s) => s.jenis !== "N")) g(0, `Aspek ${a.kode} tidak punya pertanyaan bernilai (jenis T atau O).`);
  }
  if (aspek.length > MAKS_ASPEK) g(0, `Terlalu banyak aspek (maksimal ${MAKS_ASPEK}).`);
  if (aspek.reduce((n, a) => n + a.soal.length, 0) > MAKS_SOAL) g(0, `Terlalu banyak pertanyaan (maksimal ${MAKS_SOAL}).`);
  return { struktur: { aspek }, galat };
}

export function hitungStruktur(s: StrukturKuesioner): { aspek: number; soal: number } {
  return { aspek: s.aspek.length, soal: s.aspek.reduce((n, a) => n + a.soal.length, 0) };
}

/** Penjelasan jenis aspek: pilihan "diperiksa" bawaan menurut peran petugas (PML / PPL). */
export function diperiksaBawaan(s: StrukturKuesioner, peran: PeranUntuk | null): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const a of s.aspek) r[a.kode] = peran ? a.peran.includes(peran) : true;
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// Jawaban dan skor

export type Jawaban = { diperiksa: Record<string, boolean>; jawab: Record<string, string | number> };
export type SkorAspek = { kode: string; diperiksa: boolean; skor: NilaiSoal | null; terjawab: number; bernilai: number };
export type KategoriPetugas = "Belum dinilai" | "Baik" | "Cukup" | "Perlu pembinaan";
export type Kesimpulan = {
  aspek: SkorAspek[];
  sesuai: number;
  perlu_perbaikan: number;
  tidak_sesuai: number;
  diperiksa: number;
  kategori: KategoriPetugas;
  qc_ulang: boolean;
  /** semua pertanyaan bernilai (T/O) pada aspek yang diperiksa sudah dijawab */
  lengkap: boolean;
  terjawab: number;
  jumlah: number;
};

function kosong(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/** Kategori petugas dari hitungan skor aspek (aturan sama dengan berkas Excel). */
export function kategoriPetugas(diperiksa: number, perlu: number, tidak: number): KategoriPetugas {
  if (diperiksa === 0) return "Belum dinilai";
  if (tidak > 0) return "Perlu pembinaan";
  return perlu >= 3 ? "Cukup" : "Baik";
}

/**
 * Periksa dan bersihkan jawaban, lalu hitung kesimpulan. Jawaban aspek yang tidak diperiksa dibuang.
 * Pertanyaan boleh dibiarkan kosong (lembar disimpan sebagai belum lengkap); jawaban yang diisi harus salah satu pilihan / angka.
 * Kunci galat: nomor pertanyaan, atau "_" untuk galat umum.
 */
export function periksaJawaban(struktur: StrukturKuesioner, masuk: unknown): { jawaban: Jawaban; galat: Record<string, string>; kesimpulan: Kesimpulan } {
  const m = masuk && typeof masuk === "object" && !Array.isArray(masuk) ? (masuk as { diperiksa?: unknown; jawab?: unknown }) : {};
  const mDiperiksa = m.diperiksa && typeof m.diperiksa === "object" && !Array.isArray(m.diperiksa) ? (m.diperiksa as Record<string, unknown>) : {};
  const mJawab = m.jawab && typeof m.jawab === "object" && !Array.isArray(m.jawab) ? (m.jawab as Record<string, unknown>) : {};

  const jawaban: Jawaban = { diperiksa: {}, jawab: {} };
  const galat: Record<string, string> = {};
  const aspek: SkorAspek[] = [];
  let jumlah = 0, terjawab = 0, lengkap = true;

  for (const a of struktur.aspek) {
    const periksa = mDiperiksa[a.kode] === true;
    jawaban.diperiksa[a.kode] = periksa;
    const s: SkorAspek = { kode: a.kode, diperiksa: periksa, skor: null, terjawab: 0, bernilai: a.soal.filter((x) => x.jenis !== "N").length };
    if (periksa) {
      let terburuk = 0;
      for (const q of a.soal) {
        jumlah++;
        const v = mJawab[q.no];
        if (kosong(v)) {
          if (q.jenis !== "N") lengkap = false;
          continue;
        }
        if (q.jenis === "N") {
          const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
          if (!Number.isFinite(n) || n < 0) {
            galat[q.no] = "Isi dengan angka (0 atau lebih).";
            continue;
          }
          jawaban.jawab[q.no] = n;
        } else {
          const t = String(v).trim().toLowerCase();
          const o = q.opsi.find((x) => x.teks.toLowerCase() === t);
          if (!o) {
            galat[q.no] = "Pilihan tidak ada dalam daftar.";
            continue;
          }
          jawaban.jawab[q.no] = o.teks;
          s.terjawab++;
          terburuk = Math.max(terburuk, o.nilai);
        }
        terjawab++;
      }
      s.skor = terburuk === 0 ? null : (terburuk as NilaiSoal);
      if (s.skor === null) lengkap = lengkap && s.bernilai === 0;
    }
    aspek.push(s);
  }

  const hitung = (n: NilaiSoal) => aspek.filter((x) => x.skor === n).length;
  const sesuai = hitung(1), perlu = hitung(2), tidak = hitung(3);
  const diperiksa = sesuai + perlu + tidak;
  if (terjawab === 0 && Object.keys(galat).length === 0) galat["_"] = "Isi minimal satu pertanyaan pada aspek yang diperiksa.";
  const kesimpulan: Kesimpulan = {
    aspek,
    sesuai,
    perlu_perbaikan: perlu,
    tidak_sesuai: tidak,
    diperiksa,
    kategori: kategoriPetugas(diperiksa, perlu, tidak),
    qc_ulang: tidak > 0,
    lengkap: lengkap && Object.keys(galat).length === 0 && aspek.some((x) => x.diperiksa),
    terjawab,
    jumlah,
  };
  return { jawaban, galat, kesimpulan };
}

/** Tanggal lembar harus format YYYY-MM-DD dan tidak di masa depan (acuan: hari ini WIB yang diberikan pemanggil). */
export function tanggalLembarValid(tgl: unknown, hariIni: string): tgl is string {
  return typeof tgl === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tgl) && !Number.isNaN(Date.parse(tgl)) && tgl <= hariIni;
}

// ---------------------------------------------------------------------------------------------------------------------
// Templat unduhan (dan uji bolak-balik): struktur -> dua lembar dalam format yang sama dengan yang dibaca.

export const CONTOH_STRUKTUR: StrukturKuesioner = {
  aspek: [
    {
      kode: "QC-1",
      judul: "Kehadiran dan sikap",
      untuk: "PML & PPL",
      peran: ["pml", "ppl"],
      kriteria: ["Hadir dan sikap baik", "Kadang terlambat atau sikap kurang", "Tidak hadir atau bersikap buruk"],
      soal: [
        { no: "1.1", jenis: "O", teks: "Petugas hadir di lokasi pendataan?", opsi: [{ teks: "Ya", nilai: 1 }, { teks: "Terlambat", nilai: 2 }, { teks: "Tidak", nilai: 3 }], kunci: "" },
        { no: "1.2", jenis: "T", teks: 'Tanya: "Jika responden menolak, apa langkahnya?"', opsi: [{ teks: "Benar", nilai: 1 }, { teks: "Kurang tepat", nilai: 2 }, { teks: "Salah", nilai: 3 }], kunci: "Pendekatan persuasif, lapor ke PML." },
        { no: "1.3", jenis: "N", teks: "Jumlah keluarga didata hari ini", opsi: [], kunci: "" },
      ],
    },
    {
      kode: "QC-2",
      judul: "Kelengkapan isian",
      untuk: "PPL",
      peran: ["ppl"],
      kriteria: ["Isian lengkap", "Ada isian kosong", "Banyak isian kosong"],
      soal: [{ no: "2.1", jenis: "O", teks: "Ada isian tidak konsisten?", opsi: [{ teks: "Tidak ada", nilai: 1 }, { teks: "Ada", nilai: 2 }], kunci: "" }],
    },
  ],
};

export function tulisLembar(s: StrukturKuesioner): { kuesioner: string[][]; kriteria: string[][] } {
  const kuesioner: string[][] = [["KUESIONER QUALITY CHECK"], [""], ["No", "Jenis", "Pertanyaan / yang dicek", "Pilihan jawaban"]];
  const kriteria: string[][] = [["KRITERIA PENILAIAN QUALITY CHECK"], ["QC", "Aspek", "1 · Sesuai", "2 · Perlu perbaikan", "3 · Tidak sesuai", "Untuk"]];
  for (const a of s.aspek) {
    kuesioner.push([a.kode, "", `${a.judul}  (untuk: ${a.untuk || "PML & PPL"})`, "Diperiksa?"]);
    kriteria.push([a.kode, a.judul, a.kriteria[0], a.kriteria[1], a.kriteria[2], a.untuk]);
    for (const q of a.soal) {
      kuesioner.push([q.no, q.jenis, q.teks, q.jenis === "N" ? "Isi angka" : q.opsi.map((o) => o.teks).join(" / ")]);
      if (q.jenis !== "N") kriteria.push(["", `Nilai ${q.no}: ${q.opsi.map((o) => `${o.teks} = ${o.nilai}`).join("; ")}`]);
      if (q.kunci) kriteria.push(["", `Kunci ${q.no}: ${q.kunci}`]);
    }
  }
  kuesioner.push(["BLOK III. KESIMPULAN"]);
  return { kuesioner, kriteria };
}
