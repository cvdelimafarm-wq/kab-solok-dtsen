// lib/sigapKuis.ts
//
// (7 Okt 2026) SIGAP > Pelatihan > Kuis Live (gaya Kahoot). Fungsi MURNI (tanpa database) yang dipakai bersama
// oleh server dan klien: tipe data, poin, template Excel soal kuis.
//
// Alur ruang (dikendalikan admin lewat tombol "Lanjut"; waktu SELALU dari jam server):
//   lobi    -> peserta bergabung, admin menekan Mulai
//   soal    -> soal ke-N tampil + hitung mundur `detik`; peserta memilih satu jawaban
//   jawaban -> waktu habis / semua sudah menjawab / admin menekan Lanjut: kunci + sebaran jawaban + peringkat sementara
//   selesai -> setelah soal terakhir (atau admin mengakhiri): podium + rekap
// Poin (seperti Kahoot): salah/tidak menjawab = 0; benar = 1000 x (1 - 0,5 x waktu/batas) => 500..1000.

import { bacaBarisSoal, MAKS_SOAL, type Opsi, type SoalLengkap } from "@/lib/sigapTes";

export type StatusRuang = "lobi" | "soal" | "jawaban" | "selesai";

export const DETIK_DEFAULT = 20;
export const DETIK_MIN = 5;
export const DETIK_MAX = 120;
/** Toleransi (ms) jawaban yang tiba sedikit setelah batas (jaringan lambat). */
export const TOLERANSI_JAWAB_MS = 1500;
export const POIN_MAKS = 1000;

export type SoalKuis = SoalLengkap & { detik: number };
/** Soal yang dikirim ke peserta saat bermain: TANPA kunci. */
export type SoalKuisPeserta = { nomor: number; teks: string; opsi: Opsi[]; detik: number };

/** Warna & simbol tetap per huruf opsi (gaya Kahoot). */
export const WARNA_OPSI: Record<string, { bg: string; teduh: string; simbol: string }> = {
  A: { bg: "#E21B3C", teduh: "#F8D1D8", simbol: "▲" },
  B: { bg: "#1368CE", teduh: "#CFE1F8", simbol: "◆" },
  C: { bg: "#D89E00", teduh: "#F7E8B8", simbol: "●" },
  D: { bg: "#26890C", teduh: "#CDE8C6", simbol: "■" },
  E: { bg: "#864CBF", teduh: "#E3D3F2", simbol: "★" },
};

/** Poin untuk satu jawaban. `waktuMs` = lama sejak soal tampil; `detik` = waktu soal. */
export function hitungPoin(benar: boolean, waktuMs: number, detik: number): number {
  if (!benar) return 0;
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
// Template Excel soal kuis (mirip template soal tes; kolom terakhir = Detik, bukan Bobot)
// ======================================================================
export const HEADER_TEMPLATE_KUIS = ["No", "Soal", "A", "B", "C", "D", "E", "Kunci", "Detik"];

export function barisTemplateKuis(): (string | number)[][] {
  return [
    HEADER_TEMPLATE_KUIS,
    [1, "Contoh: Apa kepanjangan PSP dalam kegiatan ini?", "Pendataan Status Pemulihan", "Pendataan Sensus Penduduk", "Pemutakhiran Status Petugas", "Pencacahan Sampel Panel", "", "A", 20],
    [2, "Contoh: Aplikasi yang dipakai petugas untuk mengisi kuesioner adalah ...", "SIGAP", "FASIH", "Zoom", "WhatsApp", "", "B", 15],
  ];
}

export const PETUNJUK_TEMPLATE_KUIS = [
  "Petunjuk pengisian template soal Kuis Live",
  "1. Isi lembar 'Soal' mulai baris ke-2 (baris 1 = judul kolom, jangan diubah). Hapus dua baris contoh sebelum diunggah.",
  "2. Kolom No = nomor urut soal (angka, unik). Kolom Soal = teks pertanyaan (singkat lebih baik; tampil besar di layar).",
  "3. Kolom A–E = pilihan jawaban. Minimal diisi A dan B; yang kosong dianggap tidak ada. Pilihan singkat lebih mudah dibaca di HP.",
  "4. Kolom Kunci = huruf jawaban benar (A/B/C/D/E) dan harus menunjuk pilihan yang terisi.",
  `5. Kolom Detik = waktu menjawab per soal (${DETIK_MIN}–${DETIK_MAX} detik). Kosong dianggap ${DETIK_DEFAULT} detik.`,
  `6. Maksimal ${MAKS_SOAL} soal per kuis. Poin: benar 500–1000 menurut kecepatan, salah 0.`,
];

export type HasilBacaKuis = { soal: SoalKuis[]; galat: string[] };

/** Baca baris lembar Excel kuis (sama seperti soal tes, tetapi kolom ke-9 = Detik). */
export function bacaBarisKuis(baris: unknown[][]): HasilBacaKuis {
  // kolom Detik disalin ke posisi "Bobot" supaya pembaca soal yang sama dapat dipakai; kosong -> default.
  const detikAsli = new Map<number, string>();
  const salinan = baris.map((r, i) => {
    const sel = Array.isArray(r) ? [...r] : [];
    const d = sel[8] === undefined || sel[8] === null ? "" : String(sel[8]).trim();
    if (!(i === 0 && String(sel[0] ?? "").trim().toLowerCase() === "no")) detikAsli.set(i + 1, d);
    sel[8] = 1; // bobot semu
    return sel;
  });
  const h = bacaBarisSoal(salinan);
  return rakitKuis(h.soal, h.galat, (nomor) => {
    // cari baris asal berdasar nomor soal
    for (let i = 0; i < baris.length; i++) {
      const sel = Array.isArray(baris[i]) ? baris[i] : [];
      if (Number(String(sel[0] ?? "").trim()) === nomor) return detikAsli.get(i + 1) ?? "";
    }
    return "";
  });
}

function rakitKuis(soal: SoalLengkap[], galat: string[], ambilDetik: (nomor: number) => string): HasilBacaKuis {
  const hasil: SoalKuis[] = [];
  const g = [...galat];
  for (const s of soal) {
    const t = ambilDetik(s.nomor);
    let detik = DETIK_DEFAULT;
    if (t !== "") {
      const n = Number(t.replace(",", "."));
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < DETIK_MIN || n > DETIK_MAX) {
        g.push(`Soal ${s.nomor}: Detik harus bilangan bulat ${DETIK_MIN}–${DETIK_MAX} (terisi "${t}").`);
        continue;
      }
      detik = n;
    }
    hasil.push({ nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, bobot: 1, detik });
  }
  return { soal: hasil, galat: g };
}

/** Validasi ulang di server atas JSON dari klien: [{nomor,teks,opsi:[{kode,teks}],kunci,detik}]. */
export function validasiKuisJson(input: unknown): HasilBacaKuis {
  if (!Array.isArray(input)) return { soal: [], galat: ["Format soal tidak valid."] };
  const baris: unknown[][] = [["No", "Soal", "A", "B", "C", "D", "E", "Kunci", "Detik"]];
  for (const x of input) {
    const o = (x ?? {}) as Record<string, unknown>;
    const opsiArr = Array.isArray(o.opsi) ? (o.opsi as Record<string, unknown>[]) : [];
    const kolom = ["A", "B", "C", "D", "E"].map((k) => String(opsiArr.find((p) => String(p?.kode ?? "").toUpperCase() === k)?.teks ?? ""));
    baris.push([o.nomor as unknown, o.teks as unknown, ...kolom, o.kunci as unknown, o.detik as unknown]);
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
