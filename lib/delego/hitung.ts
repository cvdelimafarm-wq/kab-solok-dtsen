// lib/delego/hitung.ts
//
// (26 Okt 2026) Delego -- hitungan murni (tanpa jaringan, tanpa React): hari kerja, target dan hutang poin kumulatif, status laporan harian,
// beban kerja mingguan, usulan pemerataan, tangga pembinaan, dan skor kinerja. Sistem hanya MENYARANKAN; manusia yang memutuskan.
// Semua tanggal berbentuk "YYYY-MM-DD" (zona WIB sudah diselesaikan basis data pada `hari_ini`).
// Angka asumsi di bawah dapat diubah di satu tempat (cek aturan): kapasitas 60 poin per orang per hari, hari kerja Senin-Jumat tanpa kalender libur.

import type { Delegasi, Laporan, Penilaian } from "./tipe";

export const KAPASITAS_HARIAN = 60;
export const HARI_KERJA_MINGGU = 5;
export const JAM_PENGINGAT = 18;
export const HUTANG_CATATAN_LISAN = 20;
export const HARI_TANPA_LAPOR_LISAN = 2;
export const SASARAN_BEBAN = { min: 80, max: 100 } as const;
export const BOBOT_SKOR = { ketepatan: 25, capaian: 25, kualitas: 25, kepatuhan: 25 } as const;

export const angka = (x: string | number | null | undefined): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : 0;
};
export const bulat = (x: number, desimal = 0) => {
  const f = 10 ** desimal;
  return Math.round(x * f) / f;
};

// ------------------------------------------------------------------ Tanggal
const MS = 86_400_000;
const keMs = (t: string) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
const dariMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const tambahHari = (t: string, n: number) => dariMs(keMs(t) + n * MS);
export const selisihHari = (a: string, b: string) => Math.round((keMs(b) - keMs(a)) / MS);
/** 1 = Senin ... 7 = Minggu */
export const hariKe = (t: string) => {
  const d = new Date(keMs(t)).getUTCDay();
  return d === 0 ? 7 : d;
};
export const awalMinggu = (t: string) => tambahHari(t, -(hariKe(t) - 1));
export const awalBulan = (t: string) => `${t.slice(0, 7)}-01`;
export const maks = (a: string, b: string) => (a >= b ? a : b);
export const mini = (a: string, b: string) => (a <= b ? a : b);

const NAMA_HARI = ["", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const NAMA_BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "Kam 5 Nov" */
export const tglPendek = (t: string) => `${NAMA_HARI[hariKe(t)]} ${Number(t.slice(8, 10))} ${NAMA_BULAN[Number(t.slice(5, 7))]}`;
/** "5 Nov 2026" */
export const tglLengkap = (t: string) => `${Number(t.slice(8, 10))} ${NAMA_BULAN[Number(t.slice(5, 7))]} ${t.slice(0, 4)}`;

/** Jam (pecahan) di zona WIB dari sebuah instan. */
export const jamWib = (sekarang: Date) => {
  const w = new Date(sekarang.getTime() + 7 * 3_600_000);
  return w.getUTCHours() + w.getUTCMinutes() / 60;
};
export const hariWib = (sekarang: Date) => new Date(sekarang.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Jumlah hari kerja (menurut `hk`, 1-7) pada rentang tertutup [mulai, sampai]. */
export function hariKerjaAntara(mulai: string, sampai: string, hk: number[]): number {
  if (sampai < mulai) return 0;
  const selisih = Math.min(selisihHari(mulai, sampai), 800);
  let n = 0;
  for (let i = 0; i <= selisih; i++) if (hk.includes(hariKe(tambahHari(mulai, i)))) n++;
  return n;
}

// ------------------------------------------------------------------ Target dan hutang
/** Target kumulatif sejak mulai sampai `sampai` (tertutup), dibatasi tenggat dan target total bila ada. */
export function targetKumulatif(d: Pick<Delegasi, "mulai" | "tenggat" | "hari_kerja" | "target_harian" | "target_total">, sampai: string): number {
  const akhir = mini(sampai, d.tenggat);
  const t = hariKerjaAntara(d.mulai, akhir, d.hari_kerja) * angka(d.target_harian);
  const total = d.target_total === null || d.target_total === undefined ? null : angka(d.target_total);
  return total !== null && total > 0 ? Math.min(t, total) : t;
}

export const targetPenuh = (d: Delegasi) => (d.target_total !== null && angka(d.target_total) > 0 ? angka(d.target_total) : targetKumulatif(d, d.tenggat));

export type RingkasHariIni = {
  hariKerjaIni: boolean;
  targetHariIni: number;
  poinHariIni: number;
  sisaHariIni: number;
  poinTotal: number;
  targetSampaiKemarin: number;
  hutangKemarin: number;
  kelebihan: number;
  hutangBerjalan: number;
  persenSelesai: number;
  laporanHariIni: Laporan | null;
};

export function ringkasHariIni(d: Delegasi, laporan: Laporan[], hari: string): RingkasHariIni {
  const lap = laporan.find((l) => l.delegasi_id === d.id && l.tanggal === hari) ?? null;
  const poinHariIni = lap ? angka(lap.poin) : 0;
  const hariKerjaIni = d.hari_kerja.includes(hariKe(hari)) && hari >= d.mulai && hari <= d.tenggat;
  const targetHariIni = hariKerjaIni ? angka(d.target_harian) : 0;
  const poinTotal = angka(d.poin_total);
  const poinSampaiKemarin = Math.max(0, poinTotal - poinHariIni);
  const targetSampaiKemarin = targetKumulatif(d, tambahHari(hari, -1));
  const penuh = targetPenuh(d);
  return {
    hariKerjaIni,
    targetHariIni,
    poinHariIni,
    sisaHariIni: Math.max(0, targetHariIni - poinHariIni),
    poinTotal,
    targetSampaiKemarin,
    hutangKemarin: Math.max(0, targetSampaiKemarin - poinSampaiKemarin),
    kelebihan: Math.max(0, poinSampaiKemarin - targetSampaiKemarin),
    hutangBerjalan: Math.max(0, targetKumulatif(d, hari) - poinTotal),
    persenSelesai: penuh > 0 ? Math.round((poinTotal / penuh) * 100) : 0,
    laporanHariIni: lap,
  };
}

export type StatusLaporan = "tidak_berlaku" | "libur" | "sudah" | "belum" | "perlu_pengingat";

/** Status kewajiban lapor satu delegasi pada `hari`. `jam` = jam WIB saat ini (pecahan). */
export function statusLaporanHariIni(d: Delegasi, laporan: Laporan[], hari: string, jam: number): StatusLaporan {
  if (d.status !== "baru" && d.status !== "berjalan") return "tidak_berlaku";
  if (hari < d.mulai || hari > d.tenggat) return "tidak_berlaku";
  if (laporan.some((l) => l.delegasi_id === d.id && l.tanggal === hari)) return "sudah";
  if (!d.hari_kerja.includes(hariKe(hari))) return "libur";
  return jam >= JAM_PENGINGAT ? "perlu_pengingat" : "belum";
}

/** Berapa hari kerja berturut-turut (sampai kemarin) delegasi ini tanpa laporan. */
export function hariTanpaLapor(d: Delegasi, laporan: Laporan[], hari: string): number {
  const ada = new Set(laporan.filter((l) => l.delegasi_id === d.id).map((l) => l.tanggal));
  let n = 0;
  for (let i = 1; i <= 30; i++) {
    const t = tambahHari(hari, -i);
    if (t < d.mulai) break;
    if (t > d.tenggat || !d.hari_kerja.includes(hariKe(t))) continue;
    if (ada.has(t)) break;
    n++;
  }
  return n;
}

export type Tindakan = { jenis: "pengingat" | "catatan_lisan"; alasan: string };

/** Hal yang perlu perhatian pemberi pada delegasi ini (hanya saran). */
export function tindakanDisarankan(d: Delegasi, laporan: Laporan[], hari: string, jam: number): Tindakan[] {
  if (d.status !== "baru" && d.status !== "berjalan") return [];
  const out: Tindakan[] = [];
  const r = ringkasHariIni(d, laporan, hari);
  const tanpa = hariTanpaLapor(d, laporan, hari);
  if (statusLaporanHariIni(d, laporan, hari, jam) === "perlu_pengingat") out.push({ jenis: "pengingat", alasan: `Belum lapor hari ini (lewat pukul ${JAM_PENGINGAT}:00 WIB).` });
  if (r.hutangKemarin >= HUTANG_CATATAN_LISAN) out.push({ jenis: "catatan_lisan", alasan: `Hutang ${bulat(r.hutangKemarin)} poin (ambang ${HUTANG_CATATAN_LISAN}).` });
  else if (tanpa >= HARI_TANPA_LAPOR_LISAN) out.push({ jenis: "catatan_lisan", alasan: `${tanpa} hari kerja berturut-turut tanpa laporan.` });
  return out;
}

// ------------------------------------------------------------------ Beban kerja
export type KategoriBeban = "ringan" | "sasaran" | "berlebih";
export const kategoriBeban = (persen: number): KategoriBeban => (persen < SASARAN_BEBAN.min ? "ringan" : persen <= SASARAN_BEBAN.max ? "sasaran" : "berlebih");

/** Poin per minggu yang dibebankan sebuah delegasi pada minggu (Senin-Minggu) yang memuat `hari`. */
export function bebanDelegasiMinggu(d: Delegasi, hari: string): number {
  if (d.status !== "baru" && d.status !== "berjalan") return 0;
  const awal = awalMinggu(hari);
  const akhir = tambahHari(awal, 6);
  const dari = maks(awal, d.mulai);
  const sampai = mini(akhir, d.tenggat);
  return hariKerjaAntara(dari, sampai, d.hari_kerja) * angka(d.target_harian);
}

export type OrangBeban = {
  akun: number;
  nama: string;
  jenis: "organik" | "mitra";
  beban: number;
  kapasitas: number;
  persen: number;
  kategori: KategoriBeban;
  jumlahDelegasi: number;
};

export function bebanPerOrang(delegasi: Delegasi[], hari: string, tambahan: { id: number; nama: string; jenis: "organik" | "mitra" }[] = []): OrangBeban[] {
  const kapasitas = KAPASITAS_HARIAN * HARI_KERJA_MINGGU;
  const peta = new Map<number, OrangBeban>();
  for (const t of tambahan) peta.set(t.id, { akun: t.id, nama: t.nama, jenis: t.jenis, beban: 0, kapasitas, persen: 0, kategori: "ringan", jumlahDelegasi: 0 });
  for (const d of delegasi) {
    if (d.status !== "baru" && d.status !== "berjalan") continue;
    const o = peta.get(d.penerima_akun) ?? { akun: d.penerima_akun, nama: d.penerima_nama, jenis: d.penerima_jenis, beban: 0, kapasitas, persen: 0, kategori: "ringan" as KategoriBeban, jumlahDelegasi: 0 };
    o.beban += bebanDelegasiMinggu(d, hari);
    o.jumlahDelegasi += 1;
    peta.set(d.penerima_akun, o);
  }
  const out = [...peta.values()];
  for (const o of out) {
    o.persen = Math.round((o.beban / o.kapasitas) * 100);
    o.kategori = kategoriBeban(o.persen);
  }
  return out.sort((a, b) => b.persen - a.persen || a.nama.localeCompare(b.nama));
}

export type UsulanPemerataan = {
  delegasiId: number;
  judul: string;
  dariAkun: number;
  dariNama: string;
  keAkun: number;
  keNama: string;
  poinMinggu: number;
  sesudahDari: number;
  sesudahKe: number;
};

/** Saran memindahkan delegasi dari yang berlebih (>100%) ke yang masih longgar. Hanya saran; pemberi memutuskan dan membuat delegasi baru bila setuju. */
export function usulPemerataan(orang: OrangBeban[], delegasi: Delegasi[], hari: string): UsulanPemerataan[] {
  const sisa = new Map(orang.map((o) => [o.akun, o.beban]));
  const kap = orang[0]?.kapasitas ?? KAPASITAS_HARIAN * HARI_KERJA_MINGGU;
  const hasil: UsulanPemerataan[] = [];
  const dipakai = new Set<number>();
  for (const sumber of orang.filter((o) => o.persen > SASARAN_BEBAN.max)) {
    for (let putaran = 0; putaran < 5 && (sisa.get(sumber.akun) ?? 0) > kap; putaran++) {
      const lebih = (sisa.get(sumber.akun) ?? 0) - kap;
      const milik = delegasi
        .filter((d) => d.penerima_akun === sumber.akun && !dipakai.has(d.id) && bebanDelegasiMinggu(d, hari) > 0)
        .map((d) => ({ d, w: bebanDelegasiMinggu(d, hari) }))
        .sort((a, b) => (a.d.status === b.d.status ? 0 : a.d.status === "baru" ? -1 : 1) || a.w - b.w);
      if (milik.length === 0) break;
      const cukup = milik.find((m) => m.w >= lebih) ?? milik[milik.length - 1];
      const penampung = orang
        .filter((o) => o.akun !== sumber.akun && (sisa.get(o.akun) ?? 0) + cukup.w <= kap && (o.jenis === "organik" || cukup.d.peran_penerima === "pml" || cukup.d.peran_penerima === "ppl"))
        .sort((a, b) => (sisa.get(a.akun) ?? 0) - (sisa.get(b.akun) ?? 0))[0];
      if (!penampung) break;
      sisa.set(sumber.akun, (sisa.get(sumber.akun) ?? 0) - cukup.w);
      sisa.set(penampung.akun, (sisa.get(penampung.akun) ?? 0) + cukup.w);
      dipakai.add(cukup.d.id);
      hasil.push({
        delegasiId: cukup.d.id,
        judul: cukup.d.judul,
        dariAkun: sumber.akun,
        dariNama: sumber.nama,
        keAkun: penampung.akun,
        keNama: penampung.nama,
        poinMinggu: cukup.w,
        sesudahDari: Math.round(((sisa.get(sumber.akun) ?? 0) / kap) * 100),
        sesudahKe: Math.round(((sisa.get(penampung.akun) ?? 0) / kap) * 100),
      });
    }
  }
  return hasil;
}

// ------------------------------------------------------------------ Tangga pembinaan
export const TANGGA_PEMBINAAN: { langkah: number; nama: string; ket: string }[] = [
  { langkah: 1, nama: "Pengingat", ket: "Pesan pengingat singkat dari Ketua Tim atau sistem." },
  { langkah: 2, nama: "Catatan lisan", ket: "Bicara langsung; kendala dan kesanggupan dicatat." },
  { langkah: 3, nama: "Percakapan tertulis", ket: "Kesepakatan perbaikan ditulis dan diketahui kedua pihak." },
  { langkah: 4, nama: "Rencana perbaikan", ket: "Target bertahap dengan tanggal tinjau." },
  { langkah: 5, nama: "Rujuk ke pejabat berwenang", ket: "Tindak lanjut formal oleh pejabat berwenang (cek aturan); sistem hanya mencatat." },
];

export type SaranPembinaan = { langkah: number; alasan: string };

/** Langkah berikutnya yang disarankan. Langkah 5 tidak pernah disarankan otomatis. `langkahTerakhir` = langkah tertinggi yang masih berjalan. */
export function saranPembinaan(p: { hutang: number; hariTanpaLapor: number; belumLaporLewatPengingat: boolean; langkahTerakhir: number | null }): SaranPembinaan | null {
  const berat = p.hutang >= HUTANG_CATATAN_LISAN || p.hariTanpaLapor >= HARI_TANPA_LAPOR_LISAN;
  if (berat) {
    const langkah = Math.min(4, Math.max(2, (p.langkahTerakhir ?? 1) + 1));
    return { langkah, alasan: p.hutang >= HUTANG_CATATAN_LISAN ? `Hutang ${bulat(p.hutang)} poin.` : `${p.hariTanpaLapor} hari kerja tanpa laporan.` };
  }
  if (p.belumLaporLewatPengingat && (p.langkahTerakhir ?? 0) < 1) return { langkah: 1, alasan: "Belum lapor hingga lewat jam pengingat." };
  return null;
}

// ------------------------------------------------------------------ Skor kinerja
export type KomponenSkor = { kode: "ketepatan" | "capaian" | "kualitas" | "kepatuhan"; nama: string; nilai: number | null; bobot: number };
export type Skor = { total: number | null; komponen: KomponenSkor[] };

/** Skor 0-100 satu orang dari seluruh delegasinya. Komponen tanpa data dikeluarkan dan bobot sisanya dinormalkan. */
export function skorPenerima(delegasi: Delegasi[], laporan: Laporan[], penilaian: Penilaian[], hari: string, bobot: Record<string, number> = BOBOT_SKOR): Skor {
  let harapan = 0;
  let tepat = 0;
  let tk = 0;
  let cap = 0;
  for (const d of delegasi) {
    if (d.status === "batal") continue;
    const awal = maks(d.mulai, tambahHari(hari, -34));
    const akhir = mini(tambahHari(hari, -1), d.tenggat);
    harapan += hariKerjaAntara(awal, akhir, d.hari_kerja);
    for (const l of laporan) {
      if (l.delegasi_id !== d.id || l.terlambat) continue;
      if (l.tanggal >= awal && l.tanggal <= akhir && d.hari_kerja.includes(hariKe(l.tanggal))) tepat++;
    }
    const r = ringkasHariIni(d, laporan, hari);
    tk += r.targetSampaiKemarin;
    cap += Math.min(Math.max(0, r.poinTotal - r.poinHariIni), r.targetSampaiKemarin);
  }
  const terbaru = penilaian.reduce((m, p) => (p.periode > m ? p.periode : m), "");
  const dipakai = terbaru ? penilaian.filter((p) => p.periode === terbaru) : [];
  const rata = (f: (p: Penilaian) => number) => (dipakai.length ? dipakai.reduce((s, p) => s + f(p), 0) / dipakai.length : null);
  const komponen: KomponenSkor[] = [
    { kode: "ketepatan", nama: "Ketepatan lapor", nilai: harapan > 0 ? Math.min(100, Math.round((tepat / harapan) * 100)) : null, bobot: bobot.ketepatan ?? 25 },
    { kode: "capaian", nama: "Capaian terhadap target", nilai: tk > 0 ? Math.min(100, Math.round((cap / tk) * 100)) : null, bobot: bobot.capaian ?? 25 },
    { kode: "kualitas", nama: "Kualitas data (hasil periksa)", nilai: rata((p) => p.kualitas) === null ? null : Math.round(rata((p) => p.kualitas) as number), bobot: bobot.kualitas ?? 25 },
    { kode: "kepatuhan", nama: "Kepatuhan prosedur", nilai: rata((p) => p.kepatuhan) === null ? null : Math.round(rata((p) => p.kepatuhan) as number), bobot: bobot.kepatuhan ?? 25 },
  ];
  const ada = komponen.filter((k) => k.nilai !== null);
  const sumB = ada.reduce((s, k) => s + k.bobot, 0);
  const total = ada.length === 0 || sumB === 0 ? null : Math.round(ada.reduce((s, k) => s + (k.nilai as number) * k.bobot, 0) / sumB);
  return { total, komponen };
}

// ------------------------------------------------------------------ Ringkasan tim
export type RingkasTim = {
  aktif: number;
  sudahLapor: number;
  belumLapor: number;
  perluPengingat: number;
  hutangTotal: number;
  perluCatatan: number;
  berlebih: number;
};

export function ringkasTim(delegasi: Delegasi[], laporan: Laporan[], hari: string, jam: number): RingkasTim {
  let aktif = 0, sudah = 0, belum = 0, ingat = 0, hutang = 0, catatan = 0;
  for (const d of delegasi) {
    if (d.status !== "baru" && d.status !== "berjalan") continue;
    aktif++;
    const s = statusLaporanHariIni(d, laporan, hari, jam);
    if (s === "sudah") sudah++;
    else if (s === "belum" || s === "perlu_pengingat") belum++;
    if (s === "perlu_pengingat") ingat++;
    hutang += ringkasHariIni(d, laporan, hari).hutangKemarin;
    if (tindakanDisarankan(d, laporan, hari, jam).some((t) => t.jenis === "catatan_lisan")) catatan++;
  }
  const berlebih = bebanPerOrang(delegasi, hari).filter((o) => o.kategori === "berlebih").length;
  return { aktif, sudahLapor: sudah, belumLapor: belum, perluPengingat: ingat, hutangTotal: bulat(hutang), perluCatatan: catatan, berlebih };
}
