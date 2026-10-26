// lib/sigapQc.ts
//
// (26 Okt 2026) QC Pemahaman Petugas -- logika MURNI (tanpa tampilan, tanpa akses basis data).
// Dipakai: modal gerbang (sorotan kata kunci), rute cron `jadwal?slot=auto` (rencana aksi + isi push),
// menu pengaturan Kelola Pendataan (validasi), dan modal rekap PML.
// Semua waktu dihitung dalam WIB (UTC+7, tanpa DST), sama dengan fungsi SQL sigap_qc_status.

// ---------------------------------------------------------------------------
// Tipe (cermin keluaran fungsi SQL 20261026k)
// ---------------------------------------------------------------------------
export type QcPengaturan = {
  aktif: boolean;
  rilis_jam: string; // "HH:MM" atau "HH:MM:SS"
  batas_jam: string;
  soal_per_hari: number;
  maks_ulang: number;
  rekap_jam: string;
  ingat_menit: number[];
  /** menit antar pengingat berkala sesudah batas / pada hari susulan; 0 = mati */
  ingat_berkala_menit: number;
  mulai: string | null; // "YYYY-MM-DD"
  akhir: string | null;
};

export type QcJenisKirim = "rilis" | "ingat_petugas" | "ingat_pml" | "rekap_pml";

export type QcRekapPpl = {
  akun_id: number;
  nama: string;
  percobaan: number;
  skor_awal: number | null;
  skor_terbaik: number | null;
  lulus: boolean;
  terlambat: boolean;
  status: string;
};
export type QcRekapSalah = { soal_id: string; pertanyaan: string; kunci: string; kunci_teks: string; penjelasan: string; jumlah: number; nama: string[] };
export type QcRekapTim = {
  pml_akun_id: number;
  pml_nama: string;
  pml_sendiri?: unknown;
  jumlah_ppl: number;
  sudah: number;
  belum_mengisi: number;
  lulus: number;
  rata_awal: number | null;
  rata_terbaik: number | null;
  ppl: QcRekapPpl[];
  salah: QcRekapSalah[];
};

// ---------------------------------------------------------------------------
// Waktu WIB
// ---------------------------------------------------------------------------
const WIB_MS = 7 * 3600 * 1000;
const dua = (n: number) => String(n).padStart(2, "0");

export type BagianWib = { tanggal: string; menit: number }; // menit = menit sejak 00:00 WIB

export function bagianWib(d: Date): BagianWib {
  const g = new Date(d.getTime() + WIB_MS);
  return { tanggal: `${g.getUTCFullYear()}-${dua(g.getUTCMonth() + 1)}-${dua(g.getUTCDate())}`, menit: g.getUTCHours() * 60 + g.getUTCMinutes() };
}

/** "19:00" atau "19:00:00" -> 1140. Mengembalikan null bila bukan jam yang sah. */
export function jamKeMenit(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const j = Number(m[1]);
  const mn = Number(m[2]);
  if (j > 23 || mn > 59) return null;
  return j * 60 + mn;
}

export function menitKeJam(m: number): string {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${dua(Math.floor(x / 60))}:${dua(x % 60)}`;
}

/** Menggeser tanggal "YYYY-MM-DD" sebanyak n hari. */
export function geserHari(tanggal: string, n: number): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${dua(t.getUTCMonth() + 1)}-${dua(t.getUTCDate())}`;
}

/** Instan (UTC) dari tanggal WIB + menit sejak tengah malam WIB. */
export function instanWib(tanggal: string, menit: number): Date {
  const [y, m, d] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + menit * 60000 - WIB_MS);
}

/**
 * Tanggal "hari QC" yang berlaku sekarang: sebelum jam rilis masih hari kemarin (sama dengan sigap_qc_status).
 * Mengembalikan null bila pengaturan tidak sah atau di luar periode mulai..akhir.
 */
export function hariBerlaku(now: Date, p: Pick<QcPengaturan, "rilis_jam" | "mulai" | "akhir">): string | null {
  const rilis = jamKeMenit(p.rilis_jam);
  if (rilis === null) return null;
  const w = bagianWib(now);
  const tgl = w.menit >= rilis ? w.tanggal : geserHari(w.tanggal, -1);
  if (p.mulai && tgl < p.mulai) return null;
  if (p.akhir && tgl > p.akhir) return null;
  return tgl;
}

export type JendelaQc = { tanggal: string; rilis: Date; batas: Date; lewatBatas: boolean; sisaMenit: number };

/** `susulan` = hari ditandai susulan: batas tidak berlaku, jadi tidak pernah "lewat batas" (sama dengan sigap_qc_status). */
export function jendelaQc(now: Date, p: Pick<QcPengaturan, "rilis_jam" | "batas_jam" | "mulai" | "akhir">, susulan = false): JendelaQc | null {
  const tgl = hariBerlaku(now, p);
  const b = jamKeMenit(p.batas_jam);
  const r = jamKeMenit(p.rilis_jam);
  if (!tgl || b === null || r === null) return null;
  const batas = instanWib(tgl, b);
  return { tanggal: tgl, rilis: instanWib(tgl, r), batas, lewatBatas: !susulan && now.getTime() > batas.getTime(), sisaMenit: Math.ceil((batas.getTime() - now.getTime()) / 60000) };
}

/** Teks sisa waktu untuk spanduk modal. */
export function teksSisaWaktu(j: Pick<JendelaQc, "lewatBatas" | "sisaMenit">, susulan = false): string {
  if (susulan) return "Soal hari ini terlambat dirilis, jadi tidak dihitung terlambat. Tetap wajib diisi sekarang dan diulang sampai nilai 100.";
  if (j.lewatBatas) return "Batas pengisian sudah lewat; tetap wajib diisi (tercatat terlambat).";
  if (j.sisaMenit <= 1) return "Kurang dari 1 menit lagi batas pengisian.";
  if (j.sisaMenit < 60) return `${j.sisaMenit} menit lagi batas pengisian.`;
  const j2 = Math.floor(j.sisaMenit / 60);
  const m = j.sisaMenit % 60;
  return m === 0 ? `${j2} jam lagi batas pengisian.` : `${j2} jam ${m} menit lagi batas pengisian.`;
}

// ---------------------------------------------------------------------------
// Ringkasan status QC untuk admin (27 Okt 2026): "pengaturan yang tersimpan sekarang berlaku apa"
// ---------------------------------------------------------------------------

export type StatusQc = { status: "nonaktif" | "belum_mulai" | "berjalan" | "susulan" | "selesai" | "tidak_sah"; judul: string; baris: string[] };

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-10-27" -> "27 Okt 2026" */
export function tanggalPendekQc(t: string): string {
  const [y, m, d] = t.split("-").map(Number);
  return `${d} ${BULAN_PENDEK[(m || 1) - 1] ?? ""} ${y}`;
}

/**
 * Keadaan QC menurut pengaturan yang TERSIMPAN (bukan isi formulir yang belum disimpan), dihitung dari jam sekarang.
 * Aturan sama dengan sigap_qc_status / hariBerlaku / jendelaQc, jadi apa yang tertulis di sini = apa yang dialami petugas.
 */
export function ringkasStatusQc(now: Date, p: Pick<QcPengaturan, "aktif" | "rilis_jam" | "batas_jam" | "mulai" | "akhir">, susulan = false): StatusQc {
  const rilis = jamKeMenit(p.rilis_jam);
  const batas = jamKeMenit(p.batas_jam);
  if (rilis === null || batas === null) return { status: "tidak_sah", judul: "Pengaturan jam belum sah", baris: ["Periksa jam rilis dan jam batas, lalu simpan."] };
  if (!p.aktif) return { status: "nonaktif", judul: "Nonaktif", baris: ["Petugas tidak melihat soal QC dan tidak ada notifikasi QC.", "Centang Aktifkan lalu simpan untuk mulai berlaku."] };

  const jamRilis = menitKeJam(rilis);
  const jamBatas = menitKeJam(batas);
  const hari = hariBerlaku(now, p);
  if (!hari) {
    if (p.mulai && instanWib(p.mulai, rilis).getTime() > now.getTime()) {
      return { status: "belum_mulai", judul: "Aktif, belum mulai", baris: [`Soal pertama dirilis ${tanggalPendekQc(p.mulai)} pukul ${jamRilis} WIB.`, "Sebelum itu petugas belum melihat modal QC."] };
    }
    return { status: "selesai", judul: "Periode sudah selesai", baris: [p.akhir ? `Periode berakhir ${tanggalPendekQc(p.akhir)}. Petugas tidak lagi melihat modal QC.` : "Petugas tidak melihat modal QC."] };
  }
  const j = jendelaQc(now, p, susulan);
  const baris: string[] = [];
  let status: StatusQc["status"] = "berjalan";
  let judul = "Aktif dan berlaku";
  if (susulan) {
    status = "susulan";
    judul = "Aktif, hari susulan";
    baris.push(`Soal ${tanggalPendekQc(hari)} ditandai susulan: tanpa label terlambat, petugas yang belum 100 tetap terkunci modal.`);
  } else if (j?.lewatBatas) {
    baris.push(`Soal ${tanggalPendekQc(hari)} (dirilis ${jamRilis}) sudah lewat batas ${jamBatas}. Petugas yang belum selesai tetap terkunci modal dan tercatat terlambat.`);
  } else {
    const m = j ? Math.max(j.sisaMenit, 0) : null;
    const sisa = m === null ? "" : m < 60 ? `, sisa ${m} menit` : `, sisa ${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} menit` : ""}`;
    baris.push(`Soal ${tanggalPendekQc(hari)} sudah dirilis pukul ${jamRilis}. Batas pengisian pukul ${jamBatas}${sisa}.`);
  }
  const besok = geserHari(hari, 1);
  if (!p.akhir || besok <= p.akhir) baris.push(`Soal berikutnya dirilis ${tanggalPendekQc(besok)} pukul ${jamRilis} WIB.`);
  else baris.push(`Hari ini hari terakhir periode (${tanggalPendekQc(p.akhir)}).`);
  return { status, judul, baris };
}

// ---------------------------------------------------------------------------
// Sorotan kata kunci (soal, pilihan jawaban, pembahasan)
// ---------------------------------------------------------------------------
export type Segmen = { teks: string; sorot: boolean };

const lolosRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Memecah `teks` menjadi segmen; kata kunci (tanpa membedakan huruf besar/kecil) bertanda `sorot`.
 * Kata kunci yang lebih panjang didahulukan ("surat tugas" menang atas "surat"). Tidak ada HTML yang dibuat,
 * jadi aman dirender sebagai teks biasa. Pencocokan hanya dibatasi di KIRI (tidak boleh didahului huruf/angka),
 * sehingga "ST" tidak menyala di dalam "KEST" dan "tugas" tidak menyala di "ditugaskan". Akhiran tetap boleh
 * ("tugasnya" tetap disorot).
 */
export function sorotKata(teks: string, kata: readonly string[] | null | undefined): Segmen[] {
  const sumber = String(teks ?? "");
  const daftar = Array.from(new Set((kata ?? []).map((k) => String(k ?? "").trim()).filter((k) => k.length > 0))).sort((a, b) => b.length - a.length);
  if (!sumber || daftar.length === 0) return sumber ? [{ teks: sumber, sorot: false }] : [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${daftar.map(lolosRegex).join("|")})`, "giu");
  const hasil: Segmen[] = [];
  let akhir = 0;
  for (const m of sumber.matchAll(re)) {
    const awal = m.index ?? 0;
    if (awal > akhir) hasil.push({ teks: sumber.slice(akhir, awal), sorot: false });
    hasil.push({ teks: m[0], sorot: true });
    akhir = awal + m[0].length;
  }
  if (akhir < sumber.length) hasil.push({ teks: sumber.slice(akhir), sorot: false });
  return hasil;
}

// ---------------------------------------------------------------------------
// Skor dan label
// ---------------------------------------------------------------------------
export function hitungSkor(benar: number, jumlah: number): number {
  if (!(jumlah > 0)) return 0;
  return Math.round((100 * Math.max(0, Math.min(benar, jumlah))) / jumlah);
}

export function labelPercobaan(ke: number, maks: number): string {
  return ke <= 1 ? `Percobaan awal (1 dari ${maks})` : `Ulangan ${ke - 1} dari ${maks - 1}`;
}

export function labelStatusPpl(p: Pick<QcRekapPpl, "percobaan" | "lulus" | "skor_terbaik">, maks: number): string {
  if (p.percobaan === 0) return "Belum mengisi";
  if (p.lulus) return "Lulus 100";
  if (p.percobaan >= maks) return `Habis percobaan (${p.skor_terbaik ?? 0})`;
  return `Belum 100 (${p.skor_terbaik ?? 0}), masih mengulang`;
}

// ---------------------------------------------------------------------------
// Rencana aksi cron (`jadwal?slot=auto`, tiap 5 menit). Murni: keputusan "apa yang jatuh tempo sekarang".
// Rute memanggil sigap_qc_kirim_catat untuk idempotensi per (tanggal, jenis, akun, slot).
// ---------------------------------------------------------------------------
export type AksiQc = { jenis: QcJenisKirim; tanggal: string; slot: number };

/** Toleransi keterlambatan cron untuk pengingat: lewat dari ini dianggap basi dan dilewati. */
export const TOLERANSI_PENGINGAT_MENIT = 15;
/** Jam senyap (WIB): tidak ada push 23.00-05.59, sama dengan pengingat-push lainnya. */
export const SENYAP_MULAI_MENIT = 23 * 60;
export const SENYAP_SAMPAI_MENIT = 6 * 60;
/** Slot pengingat berkala = SLOT_BERKALA + urutan interval (slot 1..9 dipakai pengingat +N menit). */
export const SLOT_BERKALA = 100;
/** Push rilis hanya dicoba selama jendela ini sejak jam rilis (atau sejak hari ditandai susulan); sesudahnya modal tetap memblokir. */
export const JENDELA_RILIS_MENIT = 45;

export type OpsiRencana = {
  /** Saat hari berlaku ditandai SUSULAN (null/undefined = hari biasa). Pada hari susulan batas tidak berlaku. */
  susulanAt?: Date | null;
};

export const adalahJamSenyap = (menit: number): boolean => menit >= SENYAP_MULAI_MENIT || menit < SENYAP_SAMPAI_MENIT;

export function rencanaAksi(now: Date, p: QcPengaturan, opsi: OpsiRencana = {}): AksiQc[] {
  if (!p.aktif) return [];
  const rilis = jamKeMenit(p.rilis_jam);
  const batas = jamKeMenit(p.batas_jam);
  const rekap = jamKeMenit(p.rekap_jam);
  if (rilis === null || batas === null || rekap === null || rilis >= batas) return [];
  const w = bagianWib(now);
  const hasil: AksiQc[] = [];
  const dalamPeriode = (tgl: string) => !((p.mulai && tgl < p.mulai) || (p.akhir && tgl > p.akhir));
  const susulan = !!opsi.susulanAt;
  const senyap = adalahJamSenyap(w.menit);

  // hari QC yang berlaku sekarang (sebelum jam rilis = hari kemarin, yang masih memblokir)
  const hari = hariBerlaku(now, p);
  if (hari) {
    const batasAt = instanWib(hari, batas);
    const sebelumBatas = now.getTime() < batasAt.getTime();

    // rilis: dalam jendela sejak jam rilis (dan sebelum batas); pada hari susulan: dalam jendela sejak ditandai susulan. Bukan jam senyap.
    const sejakRilis = (now.getTime() - instanWib(hari, rilis).getTime()) / 60000;
    const sejakSusulan = susulan ? (now.getTime() - (opsi.susulanAt as Date).getTime()) / 60000 : Infinity;
    if (!senyap && ((sebelumBatas && sejakRilis < JENDELA_RILIS_MENIT) || (susulan && sejakSusulan >= 0 && sejakSusulan < JENDELA_RILIS_MENIT)))
      hasil.push({ jenis: "rilis", tanggal: hari, slot: 0 });

    // pengingat +N menit sesudah rilis, hanya sebelum batas
    if (sebelumBatas && hari === w.tanggal) {
      (p.ingat_menit ?? []).forEach((mnt, i) => {
        const t = rilis + mnt;
        if (mnt >= 1 && t < batas && w.menit >= t && w.menit < t + TOLERANSI_PENGINGAT_MENIT) {
          hasil.push({ jenis: "ingat_petugas", tanggal: hari, slot: i + 1 });
          hasil.push({ jenis: "ingat_pml", tanggal: hari, slot: i + 1 });
        }
      });
    }

    // pengingat BERKALA: sesudah batas (atau pada hari susulan) untuk yang belum mengisi / belum 100, tiap `ingat_berkala_menit`
    // dihitung dari batas (atau dari saat ditandai susulan). Penerima ditentukan database (sigap_qc_belum): hanya yang masih wajib.
    const selang = Number(p.ingat_berkala_menit) || 0;
    if (selang >= 15 && (!sebelumBatas || susulan) && !senyap) {
      const acuan = susulan ? (opsi.susulanAt as Date).getTime() : batasAt.getTime();
      const n = Math.floor((now.getTime() - acuan) / (selang * 60000));
      if (n >= 1) {
        hasil.push({ jenis: "ingat_petugas", tanggal: hari, slot: SLOT_BERKALA + n });
        hasil.push({ jenis: "ingat_pml", tanggal: hari, slot: SLOT_BERKALA + n });
      }
    }
  }

  // rekap hari kemarin untuk PML: mulai rekap_jam sampai sebelum soal berikutnya dirilis.
  const kemarin = geserHari(w.tanggal, -1);
  if (dalamPeriode(kemarin) && w.menit >= rekap && w.menit < rilis) hasil.push({ jenis: "rekap_pml", tanggal: kemarin, slot: 0 });
  return hasil;
}

// ---------------------------------------------------------------------------
// Isi push
// ---------------------------------------------------------------------------
export type IsiPush = { judul: string; isi: string; url: string; tag: string };

const URL_QC = "/";
const potong = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function pushRilis(tanggal: string, p: Pick<QcPengaturan, "soal_per_hari" | "batas_jam">, susulan = false): IsiPush {
  return {
    judul: "QC Pemahaman Petugas hari ini",
    isi: susulan
      ? `${p.soal_per_hari} soal QC Pemahaman terlambat dirilis (tidak dihitung terlambat). Isi sekarang, ulangi sampai nilai 100. Buka SIGAP.`
      : `${p.soal_per_hari} soal sudah dirilis. Wajib diisi sebelum pukul ${menitKeJam(jamKeMenit(p.batas_jam) ?? 0)} WIB. Buka SIGAP sekarang.`,
    url: URL_QC,
    tag: `qc-rilis-${tanggal}`,
  };
}

export type KeadaanPengingat = { belumMengisi: boolean; skorTerbaik?: number; sisaUlang?: number };

export function pushIngatPetugas(tanggal: string, sisaMenit: number, p: Pick<QcPengaturan, "batas_jam">, k: KeadaanPengingat = { belumMengisi: true }, susulan = false): IsiPush {
  const jam = menitKeJam(jamKeMenit(p.batas_jam) ?? 0);
  let isi: string;
  if (!k.belumMengisi) {
    const sisa = k.sisaUlang !== undefined ? ` (sisa ${k.sisaUlang} kali)` : "";
    isi = `Nilai terbaik Anda ${k.skorTerbaik ?? 0}. Ulangi QC Pemahaman sampai nilai 100${sisa}.`;
  } else if (susulan || sisaMenit <= 0) {
    isi = "Anda belum mengisi QC Pemahaman hari ini. Isi sekarang, lalu ulangi sampai nilai 100.";
  } else {
    isi = `Anda belum selesai mengisi. Sisa ${sisaMenit} menit sampai pukul ${jam} WIB.`;
  }
  return { judul: k.belumMengisi ? "Segera isi QC Pemahaman" : "Ulangi QC Pemahaman sampai 100", isi, url: URL_QC, tag: `qc-ingat-${tanggal}` };
}

export function pushIngatPml(tanggal: string, namaBelum: readonly string[], p: Pick<QcPengaturan, "batas_jam">): IsiPush {
  const n = namaBelum.length;
  const contoh = namaBelum.slice(0, 3).join(", ");
  const lebih = n > 3 ? ` dan ${n - 3} lainnya` : "";
  return {
    judul: `${n} petugas Anda belum mengisi QC`,
    isi: `${contoh}${lebih} belum mengisi. Ingatkan mereka segera (batas pukul ${menitKeJam(jamKeMenit(p.batas_jam) ?? 0)} WIB).`,
    url: URL_QC,
    tag: `qc-ingat-pml-${tanggal}`,
  };
}

export function pushRekapPml(tanggal: string, t: Pick<QcRekapTim, "jumlah_ppl" | "sudah" | "belum_mengisi" | "lulus" | "rata_awal" | "salah">): IsiPush {
  const teratas = [...t.salah].sort((a, b) => b.jumlah - a.jumlah)[0];
  const baris: string[] = [`${t.sudah} dari ${t.jumlah_ppl} petugas sudah mengisi`];
  if (t.belum_mengisi > 0) baris.push(`${t.belum_mengisi} belum mengisi`);
  if (t.rata_awal !== null) baris.push(`rata-rata nilai awal ${t.rata_awal}`);
  if (t.salah.length > 0) baris.push(`${t.salah.length} soal dijawab salah${teratas ? ` (terbanyak: ${potong(teratas.pertanyaan, 50)})` : ""}`);
  const butuhBriefing = t.salah.length > 0 || t.belum_mengisi > 0;
  return {
    judul: butuhBriefing ? "Rekap QC kemarin: briefing ulang tim Anda" : "Rekap QC kemarin: tim Anda aman",
    isi: potong(`${baris.join("; ")}.${butuhBriefing ? " Segera briefing kembali petugas." : ""}`, 180),
    url: URL_QC,
    tag: `qc-rekap-${tanggal}`,
  };
}

// ---------------------------------------------------------------------------
// Ringkasan rekap untuk modal PML
// ---------------------------------------------------------------------------
export type BarisBriefing = { soalId: string; pertanyaan: string; jumlah: number; nama: string[]; kunciTeks: string; penjelasan: string };

/** Soal salah diurutkan dari yang paling banyak salah; dasar daftar "briefing kembali" di modal PML. */
export function daftarBriefing(t: Pick<QcRekapTim, "salah">): BarisBriefing[] {
  return [...t.salah]
    .sort((a, b) => b.jumlah - a.jumlah || a.soal_id.localeCompare(b.soal_id))
    .map((s) => ({ soalId: s.soal_id, pertanyaan: s.pertanyaan, jumlah: s.jumlah, nama: [...s.nama].sort((a, b) => a.localeCompare(b)), kunciTeks: s.kunci_teks, penjelasan: s.penjelasan }));
}

export function kalimatBriefing(t: Pick<QcRekapTim, "belum_mengisi" | "salah" | "jumlah_ppl" | "sudah">): string {
  if (t.salah.length === 0 && t.belum_mengisi === 0) return "Tim Anda menjawab benar semua pada percobaan pertama. Tidak perlu briefing ulang.";
  const bagian: string[] = [];
  if (t.salah.length > 0) bagian.push(`Briefing kembali ${t.salah.length} soal yang masih dijawab salah`);
  if (t.belum_mengisi > 0) bagian.push(`tegur ${t.belum_mengisi} petugas yang belum mengisi`);
  return `${bagian.join(" dan ")} hari ini juga, sebelum pendataan dimulai.`;
}

// ---------------------------------------------------------------------------
// Validasi pengaturan (cermin sigap_qc_pengaturan_simpan; API memakai ini sebelum memanggil SQL)
// ---------------------------------------------------------------------------
export type HasilValidasi = { ok: true; data: Record<string, unknown> } | { ok: false; galat: string[] };

const TGL = /^\d{4}-\d{2}-\d{2}$/;

export function validasiPengaturan(masuk: unknown): HasilValidasi {
  const galat: string[] = [];
  if (!masuk || typeof masuk !== "object" || Array.isArray(masuk)) return { ok: false, galat: ["Data pengaturan tidak sah"] };
  const m = masuk as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if ("aktif" in m) {
    if (typeof m.aktif !== "boolean") galat.push("Status aktif harus ya/tidak");
    else data.aktif = m.aktif;
  }
  const jam = (kunci: "rilis_jam" | "batas_jam" | "rekap_jam", label: string) => {
    if (!(kunci in m)) return;
    const mnt = jamKeMenit(typeof m[kunci] === "string" ? (m[kunci] as string) : null);
    if (mnt === null) galat.push(`${label} bukan jam yang sah (HH:MM)`);
    else data[kunci] = menitKeJam(mnt);
  };
  jam("rilis_jam", "Jam rilis");
  jam("batas_jam", "Jam batas");
  jam("rekap_jam", "Jam rekap PML");

  const bulat = (kunci: "soal_per_hari" | "maks_ulang", label: string, min: number, maks: number) => {
    if (!(kunci in m)) return;
    const v = Number(m[kunci]);
    if (!Number.isInteger(v) || v < min || v > maks) galat.push(`${label} harus bilangan bulat ${min}-${maks}`);
    else data[kunci] = v;
  };
  if ("ingat_berkala_menit" in m) {
    const v = Number(m.ingat_berkala_menit);
    if (!Number.isInteger(v) || (v !== 0 && (v < 15 || v > 720))) galat.push("Pengingat berkala harus 0 (mati) atau 15-720 menit");
    else data.ingat_berkala_menit = v;
  }
  bulat("soal_per_hari", "Soal per hari", 1, 30);
  bulat("maks_ulang", "Maksimal ulangan", 0, 10);

  for (const k of ["mulai", "akhir"] as const) {
    if (!(k in m)) continue;
    const v = m[k];
    if (v === null || v === "") data[k] = null;
    else if (typeof v === "string" && TGL.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) data[k] = v;
    else galat.push(`Tanggal ${k} bukan YYYY-MM-DD`);
  }
  if ("mulai" in data && "akhir" in data && data.mulai && data.akhir && (data.akhir as string) < (data.mulai as string)) galat.push("Tanggal akhir tidak boleh sebelum tanggal mulai");

  let menitIngat: number[] | null = null;
  if ("ingat_menit" in m) {
    if (!Array.isArray(m.ingat_menit) || m.ingat_menit.length > 6) galat.push("Menit pengingat harus berupa daftar (maks 6)");
    else {
      const daftar = m.ingat_menit.map(Number);
      if (daftar.some((x) => !Number.isInteger(x) || x < 1)) galat.push("Menit pengingat harus bilangan bulat positif");
      else {
        menitIngat = Array.from(new Set(daftar)).sort((a, b) => a - b);
        data.ingat_menit = menitIngat;
      }
    }
  }

  // aturan antar-kolom hanya bila kedua jam dikirim (sisanya dicek ulang oleh SQL terhadap nilai tersimpan)
  const r = typeof data.rilis_jam === "string" ? jamKeMenit(data.rilis_jam) : null;
  const b = typeof data.batas_jam === "string" ? jamKeMenit(data.batas_jam) : null;
  if (r !== null && b !== null) {
    if (r >= b) galat.push("Jam batas harus sesudah jam rilis");
    else if (menitIngat && menitIngat.some((x) => x >= b - r)) galat.push("Menit pengingat harus di antara jam rilis dan jam batas");
  }
  const rk = typeof data.rekap_jam === "string" ? jamKeMenit(data.rekap_jam) : null;
  if (rk !== null && r !== null && rk >= r) galat.push("Jam rekap PML harus lebih pagi daripada jam rilis (rekap dikirim pagi hari berikutnya)");
  return galat.length ? { ok: false, galat } : { ok: true, data };
}

// ---------------------------------------------------------------------------
// Validasi soal (menu bank soal)
// ---------------------------------------------------------------------------
export type SoalMasuk = { id: string; paket: number; judul_paket?: string; nomor?: number; pertanyaan: string; opsi: Record<"A" | "B" | "C" | "D", string>; kunci: "A" | "B" | "C" | "D"; penjelasan?: string; kata_kunci?: string[]; aktif?: boolean };

export function validasiSoal(masuk: unknown): { ok: true; data: SoalMasuk } | { ok: false; galat: string[] } {
  const galat: string[] = [];
  if (!masuk || typeof masuk !== "object" || Array.isArray(masuk)) return { ok: false, galat: ["Data soal tidak sah"] };
  const m = masuk as Record<string, unknown>;
  const id = String(m.id ?? "").trim();
  if (!id || id.length > 40) galat.push("Kode soal wajib diisi (maks 40 karakter)");
  const paket = Number(m.paket);
  if (!Number.isInteger(paket) || paket < 1 || paket > 99) galat.push("Paket harus bilangan bulat 1-99");
  const pertanyaan = String(m.pertanyaan ?? "").trim();
  if (pertanyaan.length < 5) galat.push("Pertanyaan minimal 5 karakter");
  const kunci = String(m.kunci ?? "").trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(kunci)) galat.push("Kunci harus A, B, C, atau D");
  const o = (m.opsi ?? {}) as Record<string, unknown>;
  const opsi = {} as Record<"A" | "B" | "C" | "D", string>;
  for (const k of ["A", "B", "C", "D"] as const) {
    const t = String(o[k] ?? "").trim();
    if (!t) galat.push(`Pilihan ${k} wajib diisi`);
    opsi[k] = t;
  }
  const tekstual = Object.values(opsi).filter(Boolean);
  if (new Set(tekstual.map((t) => t.toLowerCase())).size !== tekstual.length) galat.push("Pilihan jawaban tidak boleh sama persis");
  const kata = Array.isArray(m.kata_kunci) ? Array.from(new Set((m.kata_kunci as unknown[]).map((x) => String(x ?? "").trim()).filter(Boolean))) : [];
  if (kata.length > 20) galat.push("Kata kunci maksimal 20");
  if (galat.length) return { ok: false, galat };
  return {
    ok: true,
    data: {
      id, paket, judul_paket: m.judul_paket ? String(m.judul_paket).trim() : undefined, nomor: m.nomor === undefined ? undefined : Number(m.nomor), pertanyaan, opsi,
      kunci: kunci as SoalMasuk["kunci"], penjelasan: m.penjelasan === undefined ? undefined : String(m.penjelasan), kata_kunci: kata, aktif: typeof m.aktif === "boolean" ? m.aktif : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Bentuk data yang diterima peramban dari /api/portal/qc
// ---------------------------------------------------------------------------
export type QcOpsiKlien = { kode: "A" | "B" | "C" | "D"; teks: string };
export type QcSoalKlien = { id: string; paket: number; judul_paket: string; pertanyaan: string; kata_kunci: string[]; opsi: QcOpsiKlien[] };
export type QcSetSoal = { tanggal: string; ke: number; maks_percobaan: number; batas_at: string; lewat_batas: boolean; susulan?: boolean; soal: QcSoalKlien[] };
export type QcButirTinjau = {
  id: string;
  paket: number;
  judul_paket: string;
  pertanyaan: string;
  kata_kunci: string[];
  opsi: QcOpsiKlien[];
  kunci: "A" | "B" | "C" | "D";
  jawaban: "A" | "B" | "C" | "D" | null;
  benar: boolean;
  penjelasan: string;
};
export type QcTinjau = {
  tanggal: string;
  ke: number;
  skor: number;
  benar: number;
  jumlah: number;
  lulus: boolean;
  terlambat: boolean;
  sisa_ulang: number;
  perlu_ulang: boolean;
  tinjau: QcButirTinjau[];
};

/** Kalimat hasil setelah menjawab (judul modal hasil). */
export function kalimatHasil(t: Pick<QcTinjau, "skor" | "lulus" | "perlu_ulang" | "sisa_ulang">): string {
  if (t.lulus) return "Nilai 100. Semua jawaban benar.";
  if (t.perlu_ulang) return `Nilai ${t.skor}. Anda wajib mengulang sampai nilai 100 (sisa ${t.sisa_ulang} kali).`;
  return `Nilai ${t.skor}. Kesempatan mengulang sudah habis; pelajari pembahasan di bawah.`;
}
