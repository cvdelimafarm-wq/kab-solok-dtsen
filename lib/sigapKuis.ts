// lib/sigapKuis.ts
//
// (7-8 Okt 2026) SIGAP > Pelatihan > Adu Sigap (kuis live gaya Kahoot). Fungsi MURNI (tanpa database) yang dipakai bersama
// oleh server dan klien: tipe data, pengaturan per kelas, pemilihan soal merata, poin, template Excel soal kuis.
//
// Satu ruang per kelas (1-4), boleh berjalan paralel. Alur ruang (waktu SELALU dari jam server):
//   lobi    -> peserta bergabung (hitung mundur bila ada jadwal), admin menekan Start
//   soal    -> soal ke-N tampil + hitung mundur; peserta memilih satu jawaban (bisa dijeda/dilanjutkan)
//   jawaban -> waktu habis / semua sudah menjawab / admin Lanjut: kunci + penjelasan + sebaran + peringkat; bisa lanjut otomatis
//   selesai -> setelah soal terakhir (atau admin Stop): podium + rekap + review
// Poin (seperti Kahoot): salah/tidak menjawab = 0; benar = 1000 x (1 - 0,5 x waktu/batas) => 500..1000 (bonus kecepatan mati: 1000 rata).

import { bacaBarisSoal, MAKS_SOAL, type Opsi, type SoalLengkap } from "@/lib/sigapTes";

export type StatusRuang = "lobi" | "soal" | "jawaban" | "selesai";

export const DETIK_DEFAULT = 20;
export const DETIK_MIN = 5;
export const DETIK_MAX = 120;
/** Toleransi (ms) jawaban yang tiba sedikit setelah batas (jaringan lambat). */
export const TOLERANSI_JAWAB_MS = 1500;
export const POIN_MAKS = 1000;

export type SoalKuis = SoalLengkap & { detik: number; topik: string | null; penjelasan: string | null };
/** Soal yang dikirim ke peserta saat bermain: TANPA kunci. */
export type SoalKuisPeserta = { nomor: number; teks: string; opsi: Opsi[]; detik: number };

export const MAKS_KELAS = 4;
export const KELAS_SEMUA = [1, 2, 3, 4];
export const TOPIK_UMUM = "Umum";

// ======================================================================
// Pengaturan per kelas
// ======================================================================
export type Pengaturan = {
  jumlah: number; // jumlah soal yang dimainkan
  mode: "acak" | "manual"; // acak merata per Topik, atau dipilih manual
  dahulukan_belum_dipakai: boolean; // acak: utamakan soal yang belum dipilih kelas lain
  acak_soal: boolean; // urutan soal diacak saat ruang dibuka
  acak_opsi: boolean; // urutan pilihan jawaban diacak
  waktu: "bank" | "seragam"; // waktu per soal: ikut kolom Detik bank / seragam
  detik_seragam: number;
  bonus_kecepatan: boolean;
  jeda_pembahasan: number; // detik layar jawaban+penjelasan sebelum lanjut otomatis
  lanjut_otomatis: boolean;
  papan_live_hp: boolean; // peserta melihat papan skor di HP
  nama_mode: "singkat" | "penuh"; // nama di proyektor
  musik: boolean; // musik layar host
  gabung_terlambat: boolean;
  jadwal_mulai: string | null; // ISO; hitung mundur lobi
  mulai_otomatis: boolean; // kuis mulai sendiri saat jadwal tiba
};

export const PENGATURAN_DEFAULT: Pengaturan = {
  jumlah: 10,
  mode: "acak",
  dahulukan_belum_dipakai: true,
  acak_soal: false,
  acak_opsi: false,
  waktu: "bank",
  detik_seragam: 20,
  bonus_kecepatan: true,
  jeda_pembahasan: 10,
  lanjut_otomatis: false,
  papan_live_hp: true,
  nama_mode: "singkat",
  musik: true,
  gabung_terlambat: true,
  jadwal_mulai: null,
  mulai_otomatis: false,
};
export const JEDA_MAKS = 120;

const bulat = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);

/** Bersihkan pengaturan dari klien/DB: nilai tak valid -> default, angka dibatasi. */
export function normalisasiPengaturan(raw: unknown): Pengaturan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = PENGATURAN_DEFAULT;
  let jadwal: string | null = null;
  if (typeof r.jadwal_mulai === "string" && r.jadwal_mulai) {
    const t = new Date(r.jadwal_mulai).getTime();
    if (Number.isFinite(t)) jadwal = new Date(t).toISOString();
  }
  return {
    jumlah: bulat(r.jumlah, 1, MAKS_SOAL, d.jumlah),
    mode: r.mode === "manual" ? "manual" : "acak",
    dahulukan_belum_dipakai: bool(r.dahulukan_belum_dipakai, d.dahulukan_belum_dipakai),
    acak_soal: bool(r.acak_soal, d.acak_soal),
    acak_opsi: bool(r.acak_opsi, d.acak_opsi),
    waktu: r.waktu === "seragam" ? "seragam" : "bank",
    detik_seragam: bulat(r.detik_seragam, DETIK_MIN, DETIK_MAX, d.detik_seragam),
    bonus_kecepatan: bool(r.bonus_kecepatan, d.bonus_kecepatan),
    jeda_pembahasan: bulat(r.jeda_pembahasan, 3, JEDA_MAKS, d.jeda_pembahasan),
    lanjut_otomatis: bool(r.lanjut_otomatis, d.lanjut_otomatis),
    papan_live_hp: bool(r.papan_live_hp, d.papan_live_hp),
    nama_mode: r.nama_mode === "penuh" ? "penuh" : "singkat",
    musik: bool(r.musik, d.musik),
    gabung_terlambat: bool(r.gabung_terlambat, d.gabung_terlambat),
    jadwal_mulai: jadwal,
    mulai_otomatis: bool(r.mulai_otomatis, d.mulai_otomatis) && jadwal !== null,
  };
}

/** Waktu menjawab efektif satu soal. */
export const detikSoal = (s: { detik: number }, p: Pengaturan) => (p.waktu === "seragam" ? p.detik_seragam : s.detik);

/** Urutan yang benar-benar dimainkan: nomor soal + urutan kode opsi (sama untuk semua peserta di kelas itu). */
export type SoalMain = { n: number; o: string[] };

/** Pembangkit acak berbenih (mulberry32) agar hasil dapat diuji ulang. */
export function rngBenih(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function acakArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pilih `jumlah` soal secara MERATA per Topik (bergiliran antar topik). Di dalam topik, soal yang belum dipakai kelas lain
 * (`hindari`) didahulukan bila `dahulukan`. Hasil terurut menurut nomor.
 */
export function pilihSoalMerata(soal: { nomor: number; topik: string | null }[], jumlah: number, hindari: Set<number>, dahulukan: boolean, rng: () => number): number[] {
  const perTopik = new Map<string, number[]>();
  for (const s of soal) {
    const k = (s.topik ?? "").trim() || TOPIK_UMUM;
    (perTopik.get(k) ?? perTopik.set(k, []).get(k)!).push(s.nomor);
  }
  const antrean = acakArray([...perTopik.keys()], rng).map((k) => {
    const semua = perTopik.get(k)!;
    if (!dahulukan) return acakArray(semua, rng);
    const segar = acakArray(semua.filter((n) => !hindari.has(n)), rng);
    const bekas = acakArray(semua.filter((n) => hindari.has(n)), rng);
    return [...segar, ...bekas];
  });
  const hasil: number[] = [];
  const target = Math.min(jumlah, soal.length);
  while (hasil.length < target && antrean.some((q) => q.length)) {
    for (const q of antrean) {
      if (hasil.length >= target) break;
      const n = q.shift();
      if (n !== undefined) hasil.push(n);
    }
  }
  return hasil.sort((a, b) => a - b);
}

/** Rakit urutan main dari pilihan nomor: acak soal/opsi sesuai pengaturan. */
export function bangunSoalMain(bank: SoalKuis[], pilihan: number[], p: Pengaturan, rng: () => number): SoalMain[] {
  const peta = new Map(bank.map((s) => [s.nomor, s]));
  let urut = pilihan.filter((n) => peta.has(n));
  if (p.acak_soal) urut = acakArray(urut, rng);
  return urut.map((n) => {
    const kode = peta.get(n)!.opsi.map((o) => o.kode);
    return { n, o: p.acak_opsi ? acakArray(kode, rng) : kode };
  });
}

/** Ringkasan angka utk admin: total detik & poin maksimum. */
export function ringkasMain(bank: SoalKuis[], pilihan: number[], p: Pengaturan) {
  const peta = new Map(bank.map((s) => [s.nomor, s]));
  const ada = pilihan.filter((n) => peta.has(n));
  const detik = ada.reduce((t, n) => t + detikSoal(peta.get(n)!, p), 0);
  const jeda = p.lanjut_otomatis ? ada.length * p.jeda_pembahasan : 0;
  return { soal: ada.length, detik, menit: Math.ceil((detik + jeda) / 60), poin_maks: ada.length * POIN_MAKS };
}

/** Nama untuk proyektor: "Ardial Jaraf, S.Stat." -> "Ardial J."; "M. Iqbal Hadi, SST." -> "M. Iqbal H.". */
export function namaTampil(nama: string, mode: "singkat" | "penuh"): string {
  const bersih = String(nama ?? "").split(",")[0].replace(/\s+/g, " ").trim();
  if (mode === "penuh" || !bersih) return bersih || "Peserta";
  const t = bersih.split(" ");
  if (t.length === 1) return t[0];
  let depan = t[0];
  let sisa = t.slice(1);
  if (/^[A-Za-z]{1,2}\.?$/.test(depan) && sisa.length > 1) {
    depan = `${depan} ${sisa[0]}`;
    sisa = sisa.slice(1);
  }
  const akhir = sisa[sisa.length - 1];
  return `${depan} ${akhir.charAt(0).toUpperCase()}.`;
}

/** Warna & simbol tetap per huruf opsi (gaya Kahoot). */
export const WARNA_OPSI: Record<string, { bg: string; teduh: string; simbol: string }> = {
  A: { bg: "#E21B3C", teduh: "#F8D1D8", simbol: "▲" },
  B: { bg: "#1368CE", teduh: "#CFE1F8", simbol: "◆" },
  C: { bg: "#D89E00", teduh: "#F7E8B8", simbol: "●" },
  D: { bg: "#26890C", teduh: "#CDE8C6", simbol: "■" },
  E: { bg: "#864CBF", teduh: "#E3D3F2", simbol: "★" },
};

/** Warna menurut POSISI tombol (0..4) supaya tetap seragam walau urutan opsi diacak. */
export const warnaPosisi = (i: number) => WARNA_OPSI["ABCDE"[Math.min(4, Math.max(0, i))]];

/** Poin untuk satu jawaban. `waktuMs` = lama sejak soal tampil; `detik` = waktu soal. */
export function hitungPoin(benar: boolean, waktuMs: number, detik: number, bonus = true): number {
  if (!benar) return 0;
  if (!bonus) return POIN_MAKS;
  const batas = Math.max(1, detik * 1000);
  const rasio = Math.min(1, Math.max(0, waktuMs / batas));
  return Math.round(POIN_MAKS * (1 - rasio / 2));
}

export type BarisPeringkat = { akun_id: number; nama: string; poin: number; benar: number; menjawab: number; peringkat: number; kelas?: number | null; peran?: string; jenis?: string; rata_waktu_ms?: number | null };

/** Urutkan: poin terbanyak, lalu benar terbanyak, lalu rata-rata waktu tercepat, lalu nama. Peringkat kompetisi (seri = sama). */
export function susunPeringkat<T extends { akun_id: number; nama: string; poin: number; benar: number; menjawab: number; rata_waktu_ms?: number | null }>(baris: T[]): (T & { peringkat: number })[] {
  const urut = [...baris].sort((a, b) => b.poin - a.poin || b.benar - a.benar || (a.rata_waktu_ms ?? 1e9) - (b.rata_waktu_ms ?? 1e9) || a.nama.localeCompare(b.nama));
  let rank = 0;
  return urut.map((x, i) => {
    const sebelum = urut[i - 1];
    if (!sebelum || sebelum.poin !== x.poin || sebelum.benar !== x.benar) rank = i + 1;
    return { ...x, peringkat: rank };
  });
}

// ======================================================================
// Template Excel soal kuis (mirip template soal tes; kolom 9 = Detik, 10 = Topik, 11 = Penjelasan)
// ======================================================================
export const HEADER_TEMPLATE_KUIS = ["No", "Soal", "A", "B", "C", "D", "E", "Kunci", "Detik", "Topik", "Penjelasan"];
export const MAKS_TOPIK = 60;
export const MAKS_PENJELASAN = 600;

export function barisTemplateKuis(): (string | number)[][] {
  return [
    HEADER_TEMPLATE_KUIS,
    [1, "Contoh: Apa kepanjangan PSP dalam kegiatan ini?", "Pendataan Status Pemulihan", "Pendataan Sensus Penduduk", "Pemutakhiran Status Petugas", "Pencacahan Sampel Panel", "", "A", 20, "Konsep PSP", "PSP = Pendataan Status Pemulihan pascabencana."],
    [2, "Contoh: Aplikasi yang dipakai petugas untuk mengisi kuesioner adalah ...", "SIGAP", "FASIH", "Zoom", "WhatsApp", "", "B", 15, "Aplikasi", "Kuesioner diisi lewat FASIH; SIGAP dipakai untuk administrasi petugas."],
  ];
}

export const PETUNJUK_TEMPLATE_KUIS = [
  "Petunjuk pengisian template soal Adu Sigap",
  "1. Isi lembar 'Soal' mulai baris ke-2 (baris 1 = judul kolom, jangan diubah). Hapus dua baris contoh sebelum diunggah.",
  "2. Kolom No = nomor urut soal (angka, unik). Kolom Soal = teks pertanyaan (singkat lebih baik; tampil besar di layar).",
  "3. Kolom A–E = pilihan jawaban. Minimal diisi A dan B; yang kosong dianggap tidak ada. Pilihan singkat lebih mudah dibaca di HP.",
  "4. Kolom Kunci = huruf jawaban benar (A/B/C/D/E) dan harus menunjuk pilihan yang terisi.",
  `5. Kolom Detik = waktu menjawab per soal (${DETIK_MIN}–${DETIK_MAX} detik). Kosong dianggap ${DETIK_DEFAULT} detik. Bisa ditimpa waktu seragam di pengaturan kelas.`,
  `6. Kolom Topik (opsional, maks ${MAKS_TOPIK} karakter) = kelompok materi, dipakai agar pemilihan soal acak merata antar topik. Kosong = "${TOPIK_UMUM}".`,
  `7. Kolom Penjelasan (opsional, maks ${MAKS_PENJELASAN} karakter) = pembahasan yang tampil setelah jawaban dibuka dan pada review.`,
  `8. Maksimal ${MAKS_SOAL} soal per kuis. Poin: benar 500–1000 menurut kecepatan (atau 1000 rata bila bonus kecepatan dimatikan), salah 0.`,
];

export type HasilBacaKuis = { soal: SoalKuis[]; galat: string[] };

const teksSel = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/** Baca baris lembar Excel kuis (sama seperti soal tes, tetapi kolom ke-9 = Detik, ke-10 = Topik, ke-11 = Penjelasan). */
export function bacaBarisKuis(baris: unknown[][]): HasilBacaKuis {
  // kolom Detik disalin ke posisi "Bobot" supaya pembaca soal yang sama dapat dipakai; kosong -> default.
  const tambahan = new Map<number, { detik: string; topik: string; penjelasan: string }>();
  const salinan = baris.map((r, i) => {
    const sel = Array.isArray(r) ? [...r] : [];
    if (!(i === 0 && String(sel[0] ?? "").trim().toLowerCase() === "no")) {
      const nomor = Number(String(sel[0] ?? "").trim());
      if (Number.isFinite(nomor) && !tambahan.has(nomor)) tambahan.set(nomor, { detik: teksSel(sel[8]), topik: teksSel(sel[9]), penjelasan: teksSel(sel[10]) });
    }
    sel[8] = 1; // bobot semu
    return sel;
  });
  const h = bacaBarisSoal(salinan);
  const g = [...h.galat];
  const hasil: SoalKuis[] = [];
  for (const s of h.soal) {
    const x = tambahan.get(s.nomor) ?? { detik: "", topik: "", penjelasan: "" };
    let detik = DETIK_DEFAULT;
    if (x.detik !== "") {
      const n = Number(x.detik.replace(",", "."));
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < DETIK_MIN || n > DETIK_MAX) {
        g.push(`Soal ${s.nomor}: Detik harus bilangan bulat ${DETIK_MIN}–${DETIK_MAX} (terisi "${x.detik}").`);
        continue;
      }
      detik = n;
    }
    if (x.topik.length > MAKS_TOPIK) {
      g.push(`Soal ${s.nomor}: Topik terlalu panjang (maks ${MAKS_TOPIK} karakter).`);
      continue;
    }
    if (x.penjelasan.length > MAKS_PENJELASAN) {
      g.push(`Soal ${s.nomor}: Penjelasan terlalu panjang (maks ${MAKS_PENJELASAN} karakter).`);
      continue;
    }
    hasil.push({ nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, bobot: 1, detik, topik: x.topik || null, penjelasan: x.penjelasan || null });
  }
  return { soal: hasil, galat: g };
}

/** Validasi ulang di server atas JSON dari klien: [{nomor,teks,opsi:[{kode,teks}],kunci,detik,topik,penjelasan}]. */
export function validasiKuisJson(input: unknown): HasilBacaKuis {
  if (!Array.isArray(input)) return { soal: [], galat: ["Format soal tidak valid."] };
  const baris: unknown[][] = [HEADER_TEMPLATE_KUIS];
  for (const x of input) {
    const o = (x ?? {}) as Record<string, unknown>;
    const opsiArr = Array.isArray(o.opsi) ? (o.opsi as Record<string, unknown>[]) : [];
    const kolom = ["A", "B", "C", "D", "E"].map((k) => String(opsiArr.find((p) => String(p?.kode ?? "").toUpperCase() === k)?.teks ?? ""));
    baris.push([o.nomor as unknown, o.teks as unknown, ...kolom, o.kunci as unknown, o.detik as unknown, o.topik as unknown, o.penjelasan as unknown]);
  }
  return bacaBarisKuis(baris);
}

/** Ringkasan teks status untuk admin. */
export const LABEL_STATUS_RUANG: Record<StatusRuang, string> = {
  lobi: "Lobi (menunggu peserta)",
  soal: "Soal sedang berjalan",
  jawaban: "Menampilkan jawaban",
  selesai: "Selesai",
};
