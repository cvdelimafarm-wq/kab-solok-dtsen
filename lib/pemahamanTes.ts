// lib/pemahamanTes.ts  (murni, tanpa basis data dan tanpa React)
//
// (14 Nov 2026) Templat monitoring pemahaman, langkah 3: SATU fungsi hitung untuk monitoring tes pelatihan (pretest / posttest).
// Dipakai mode Hari H (K2), Evaluasi (K1/K3), lembar rincian soal (K4) dan peserta (K5), dan nanti Laporan (K6).
//
// Aturan:
//  - Nilai tes = nilai percobaan PERTAMA (aturan versi 2). Statistik soal dan matriks memakai jawaban percobaan pertama
//    (dari arsip bila peserta sudah mengulang), supaya mencerminkan pemahaman sebelum melihat pembahasan.
//  - Penyebut hanya orang dalam cakupan pemantau (instruktur: kelasnya; PML: timnya; peserta: dirinya).
//  - Soal tanpa penjawab tidak masuk penyebut persen benar.
//  - Macet = sedang mengerjakan dan tidak ada jawaban baru selama MENIT_MACET menit.

import { bacaWaktu, lamaPerSoal, type WaktuJawaban } from "@/lib/waktuJawaban";

export const MENIT_MACET = 3;

export type OpsiTes = { kode: string; teks: string };
export type SoalTesMasuk = { nomor: number; teks: string; opsi: OpsiTes[]; kunci: string; topik?: string | null; bobot?: number; bahas?: { at: string; oleh: string | null } | null };
export type SesiTesMasuk = {
  akun_id: number;
  mulai_at: string | null;
  batas_at: string | null;
  selesai_at: string | null;
  jawaban: Record<string, string> | null;
  jawaban_waktu?: unknown;
  skor: number | null;
  skor_awal: number | null;
  skor_terbaik: number | null;
  percobaan: number;
};
/** Percobaan pertama yang sudah diarsipkan (peserta sudah mengulang). */
export type ArsipPertamaMasuk = { akun_id: number; jawaban: Record<string, string> | null; jawaban_waktu?: unknown; mulai_at: string | null; selesai_at: string | null; skor: number | null };
export type PesertaTesMasuk = { akun_id: number; nama: string; kelas: number | null; tim: string | null; peran: string };

export type StatusOrangTes = "belum" | "mengerjakan" | "selesai" | "terlewat";

export type OrangTes = {
  akun_id: number;
  nama: string;
  kelas: number | null;
  tim: string | null;
  status: StatusOrangTes;
  /** nilai percobaan pertama */
  nilai: number | null;
  terbaik: number | null;
  percobaan: number;
  lulus: boolean;
  dijawab: number;
  kemajuan_pct: number;
  /** nomor soal berikutnya yang belum dijawab (sedang mengerjakan) */
  soal_sekarang: number | null;
  lama_menit: number | null;
  menit_diam: number | null;
  macet: boolean;
  /** nilai tes pembanding (posttest dibanding pretest) dan selisihnya */
  pembanding: number | null;
  naik: number | null;
  /** detik per soal percobaan pertama (bila waktu terekam) */
  lama_soal: Record<string, number>;
  /** jawaban percobaan pertama: nomor -> huruf */
  jawaban: Record<string, string>;
};

export type SoalTesHasil = {
  nomor: number;
  teks: string;
  kunci: string;
  kunci_teks: string;
  topik: string | null;
  menjawab: number;
  benar: number;
  salah: number;
  pct_benar: number | null;
  pilihan: { kode: string; teks: string; jumlah: number; kunci: boolean }[];
  keliru_terbanyak: { kode: string; jumlah: number } | null;
  /** pilihan keliru dipilih lebih banyak daripada kunci: soal atau kunci perlu diperiksa */
  perlu_diperiksa: boolean;
  lama_median_detik: number | null;
  salah_akun: number[];
  /** ditandai "bahas di kelas" oleh panitia / instruktur (hanya penanda) */
  bahas: { at: string; oleh: string | null } | null;
};

export type TopikHasil = { topik: string; soal: number; menjawab: number; pct_benar: number | null };
export type IngatTes = { akun_id: number; nama: string; keadaan: string; saran: string };
export type RingkasTes = { peserta: number; selesai: number; mengerjakan: number; belum: number; terlewat: number; lulus: number; belum_lulus: number; macet: number; rata: number | null };
export type SebaranTes = { label: string; jumlah: number; akun_ids: number[]; nada: "ok" | "wait" | "bad" | "mut" };

export type HasilPemahamanTes = {
  versi: 1;
  jenis: string;
  nilai_lulus: number;
  jumlah_soal: number;
  definisi: { lulus: string; nilai: string; macet: string; perlu_diperiksa: string };
  ringkas: RingkasTes;
  orang: OrangTes[];
  soal: SoalTesHasil[];
  topik: TopikHasil[];
  sebaran: SebaranTes[];
  perlu_diingatkan: IngatTes[];
  ada_pembanding: boolean;
  ada_waktu: boolean;
};

const ms = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);
const bulat1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const t = Math.floor(a.length / 2);
  return a.length % 2 ? a[t] : (a[t - 1] + a[t]) / 2;
};
const angka = (x: unknown): number | null => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

export function hitungPemahamanTes(m: {
  jenis: string;
  soal: readonly SoalTesMasuk[];
  sesi: readonly SesiTesMasuk[];
  arsipPertama?: readonly ArsipPertamaMasuk[];
  peserta: readonly PesertaTesMasuk[];
  nilaiLulus: number;
  nowMs: number;
  /** nilai pertama tes pembanding per akun (posttest: pretest) */
  pembanding?: ReadonlyMap<number, number>;
}): HasilPemahamanTes {
  const soalUrut = [...m.soal].sort((a, b) => a.nomor - b.nomor);
  const n = soalUrut.length;
  const sesiPer = new Map(m.sesi.map((s) => [s.akun_id, s]));
  const arsipPer = new Map((m.arsipPertama ?? []).map((a) => [a.akun_id, a]));
  const lulusDari = (v: number | null) => v !== null && v >= m.nilaiLulus;
  let adaWaktu = false;

  // satu orang satu baris (peserta yang tercatat dua kali digabung)
  const pesertaUnik = new Map<number, PesertaTesMasuk>();
  for (const p of m.peserta) if (!pesertaUnik.has(p.akun_id)) pesertaUnik.set(p.akun_id, p);

  const orang: OrangTes[] = [...pesertaUnik.values()].map((p) => {
    const s = sesiPer.get(p.akun_id);
    const a = arsipPer.get(p.akun_id);
    if (!s || !s.mulai_at) {
      return { akun_id: p.akun_id, nama: p.nama, kelas: p.kelas, tim: p.tim, status: "belum", nilai: null, terbaik: null, percobaan: 0, lulus: false, dijawab: 0, kemajuan_pct: 0, soal_sekarang: null, lama_menit: null, menit_diam: null, macet: false, pembanding: m.pembanding?.get(p.akun_id) ?? null, naik: null, lama_soal: {}, jawaban: {} };
    }
    // percobaan pertama: dari arsip bila sudah mengulang, selain itu sesi berjalan
    const pertamaDariArsip = s.percobaan > 1 && !!a;
    const jawabanPertama = (pertamaDariArsip ? a!.jawaban : s.jawaban) ?? {};
    const waktuPertama: WaktuJawaban = bacaWaktu(pertamaDariArsip ? a!.jawaban_waktu : s.jawaban_waktu) ?? {};
    if (Object.keys(waktuPertama).length) adaWaktu = true;
    const mulaiPertama = pertamaDariArsip ? a!.mulai_at : s.mulai_at;
    const selesaiSekarang = !!s.selesai_at;
    const lewatBatas = !selesaiSekarang && Number.isFinite(ms(s.batas_at)) && ms(s.batas_at) < m.nowMs;
    const status: StatusOrangTes = selesaiSekarang || s.percobaan > 1 ? "selesai" : lewatBatas ? "terlewat" : "mengerjakan";
    const jawabanBerjalan = s.jawaban ?? {};
    const dijawab = Object.values(status === "mengerjakan" ? jawabanBerjalan : jawabanPertama).filter((v) => v).length;
    const waktuBerjalan = bacaWaktu(s.jawaban_waktu) ?? {};
    const terakhir = Math.max(ms(s.mulai_at), ...Object.values(waktuBerjalan).map((w) => ms(w.u)).filter(Number.isFinite));
    const menitDiam = status === "mengerjakan" && Number.isFinite(terakhir) ? Math.max(0, Math.floor((m.nowMs - terakhir) / 60_000)) : null;
    const soalSekarang = status === "mengerjakan" ? (soalUrut.find((q) => !jawabanBerjalan[String(q.nomor)])?.nomor ?? null) : null;
    const akhir = status === "mengerjakan" ? m.nowMs : ms(pertamaDariArsip ? a!.selesai_at : s.selesai_at);
    const lama = Number.isFinite(akhir) && Number.isFinite(ms(mulaiPertama)) ? Math.max(0, Math.round((akhir - ms(mulaiPertama)) / 60_000)) : null;
    const nilai = status === "selesai" ? (angka(s.skor_awal) ?? (pertamaDariArsip ? angka(a!.skor) : angka(s.skor))) : null;
    const terbaik = status === "selesai" ? Math.max(...[angka(s.skor_terbaik), angka(s.skor), nilai].filter((x): x is number => x !== null)) : null;
    const pb = m.pembanding?.get(p.akun_id) ?? null;
    return {
      akun_id: p.akun_id,
      nama: p.nama,
      kelas: p.kelas,
      tim: p.tim,
      status,
      nilai,
      terbaik: terbaik !== null && Number.isFinite(terbaik) ? terbaik : null,
      percobaan: s.percobaan,
      lulus: lulusDari(nilai),
      dijawab,
      kemajuan_pct: n ? Math.round((dijawab / n) * 100) : 0,
      soal_sekarang: soalSekarang,
      lama_menit: lama,
      menit_diam: menitDiam,
      macet: menitDiam !== null && menitDiam >= MENIT_MACET,
      pembanding: pb,
      naik: nilai !== null && pb !== null ? bulat1(nilai - pb) : null,
      lama_soal: lamaPerSoal(waktuPertama, mulaiPertama),
      jawaban: status === "selesai" ? Object.fromEntries(Object.entries(jawabanPertama).filter(([, v]) => v)) : {},
    };
  });

  // statistik soal dari jawaban percobaan pertama orang yang sudah selesai
  const selesai = orang.filter((o) => o.status === "selesai");
  const soal: SoalTesHasil[] = soalUrut.map((q) => {
    const k = String(q.nomor);
    const hitung = new Map<string, number>();
    const salahAkun: number[] = [];
    let menjawab = 0;
    const lama: number[] = [];
    for (const o of selesai) {
      const j = o.jawaban[k];
      if (!j) continue;
      menjawab++;
      hitung.set(j, (hitung.get(j) ?? 0) + 1);
      if (j !== q.kunci) salahAkun.push(o.akun_id);
      if (o.lama_soal[k] !== undefined) lama.push(o.lama_soal[k]);
    }
    const benar = hitung.get(q.kunci) ?? 0;
    const pilihan = q.opsi.map((op) => ({ kode: op.kode, teks: op.teks, jumlah: hitung.get(op.kode) ?? 0, kunci: op.kode === q.kunci }));
    const keliru = pilihan.filter((x) => !x.kunci && x.jumlah > 0).sort((a, b) => b.jumlah - a.jumlah)[0] ?? null;
    return {
      nomor: q.nomor,
      teks: q.teks,
      kunci: q.kunci,
      kunci_teks: q.opsi.find((op) => op.kode === q.kunci)?.teks ?? "",
      topik: q.topik?.trim() || null,
      menjawab,
      benar,
      salah: menjawab - benar,
      pct_benar: menjawab ? Math.round((benar / menjawab) * 100) : null,
      pilihan,
      keliru_terbanyak: keliru ? { kode: keliru.kode, jumlah: keliru.jumlah } : null,
      perlu_diperiksa: !!keliru && keliru.jumlah > benar,
      lama_median_detik: median(lama),
      salah_akun: salahAkun,
      bahas: q.bahas ?? null,
    };
  });

  // topik terlemah (hanya bila bank soal bertopik)
  const perTopik = new Map<string, { soal: number; menjawab: number; benar: number }>();
  for (const s of soal) {
    if (!s.topik) continue;
    const t = perTopik.get(s.topik) ?? { soal: 0, menjawab: 0, benar: 0 };
    t.soal++;
    t.menjawab += s.menjawab;
    t.benar += s.benar;
    perTopik.set(s.topik, t);
  }
  const topik: TopikHasil[] = [...perTopik.entries()]
    .map(([t, v]) => ({ topik: t, soal: v.soal, menjawab: v.menjawab, pct_benar: v.menjawab ? Math.round((v.benar / v.menjawab) * 100) : null }))
    .sort((a, b) => (a.pct_benar ?? 101) - (b.pct_benar ?? 101) || a.topik.localeCompare(b.topik, "id"));

  // sebaran nilai (hanya yang selesai) + belum
  const tempat: { label: string; min: number; nada: SebaranTes["nada"]; ids: number[] }[] = [
    { label: "90–100", min: 90, nada: "ok", ids: [] },
    { label: "80–89", min: 80, nada: "ok", ids: [] },
    { label: "70–79", min: 70, nada: "wait", ids: [] },
    { label: "60–69", min: 60, nada: "wait", ids: [] },
    { label: "< 60", min: -Infinity, nada: "bad", ids: [] },
  ];
  for (const o of selesai) if (o.nilai !== null) tempat.find((t) => (o.nilai as number) >= t.min)?.ids.push(o.akun_id);
  const belumSelesai = orang.filter((o) => o.status !== "selesai").map((o) => o.akun_id);
  const sebaran: SebaranTes[] = [...tempat.map((t) => ({ label: t.label, jumlah: t.ids.length, akun_ids: t.ids, nada: t.nada })), { label: "Belum selesai", jumlah: belumSelesai.length, akun_ids: belumSelesai, nada: "mut" as const }];

  // Perlu diingatkan: keadaan dan saran per orang
  const perlu: IngatTes[] = [];
  for (const o of orang) {
    if (o.status === "belum") perlu.push({ akun_id: o.akun_id, nama: o.nama, keadaan: "Belum mulai", saran: "Ingatkan untuk membuka tes di SIGAP" });
    else if (o.macet) perlu.push({ akun_id: o.akun_id, nama: o.nama, keadaan: `Macet di soal ${o.soal_sekarang ?? "-"} (${o.menit_diam} menit tanpa jawaban)`, saran: "Tanyakan kendalanya: sinyal, layar, atau soal" });
    else if (o.status === "terlewat") perlu.push({ akun_id: o.akun_id, nama: o.nama, keadaan: "Waktu habis sebelum selesai", saran: "Periksa apakah perlu dibuka ulang" });
    else if (o.status === "selesai" && !o.lulus) perlu.push({ akun_id: o.akun_id, nama: o.nama, keadaan: `Nilai ${o.nilai} di bawah batas ${m.nilaiLulus}`, saran: "Bahas soal yang salah bersama" });
  }

  const nilaiSelesai = selesai.map((o) => o.nilai).filter((x): x is number => x !== null);
  const ringkas: RingkasTes = {
    peserta: orang.length,
    selesai: selesai.length,
    mengerjakan: orang.filter((o) => o.status === "mengerjakan").length,
    belum: orang.filter((o) => o.status === "belum").length,
    terlewat: orang.filter((o) => o.status === "terlewat").length,
    lulus: selesai.filter((o) => o.lulus).length,
    belum_lulus: selesai.filter((o) => !o.lulus).length,
    macet: orang.filter((o) => o.macet).length,
    rata: nilaiSelesai.length ? bulat1(nilaiSelesai.reduce((x, y) => x + y, 0) / nilaiSelesai.length) : null,
  };

  return {
    versi: 1,
    jenis: m.jenis,
    nilai_lulus: m.nilaiLulus,
    jumlah_soal: n,
    definisi: {
      lulus: `Lulus = nilai percobaan pertama ${m.nilaiLulus} atau lebih (batas dari Kelola pelatihan).`,
      nilai: "Nilai = nilai percobaan pertama. Statistik soal memakai jawaban percobaan pertama, sebelum peserta melihat pembahasan.",
      macet: `Macet = sedang mengerjakan dan tidak ada jawaban baru selama ${MENIT_MACET} menit.`,
      perlu_diperiksa: "Perlu diperiksa = pilihan keliru dipilih lebih banyak daripada kunci; periksa teks soal atau kuncinya.",
    },
    ringkas,
    orang: orang.sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    soal,
    topik,
    sebaran,
    perlu_diingatkan: perlu,
    ada_pembanding: !!m.pembanding && m.pembanding.size > 0,
    ada_waktu: adaWaktu,
  };
}
