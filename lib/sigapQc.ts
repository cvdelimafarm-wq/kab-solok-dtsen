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
  // (29 Okt 2026) Opsi per kegiatan (migrasi 20261029c). Semua opsional: bila tidak ada dipakai bawaan = perilaku QC Pascabencana.
  /** true (bawaan): petugas wajib mengulang sampai lulus; false: satu percobaan saja */
  wajib_ulang?: boolean;
  /** nilai minimal agar lulus, 1-100 (bawaan 100 = semua benar) */
  nilai_lulus?: number;
  /** true (bawaan): soal hari itu diundi acak; false: berurutan menurut (paket, nomor) */
  undi_acak?: boolean;
  /** true (bawaan): urutan soal dan pilihan diacak per petugas; false: urutan tetap */
  acak_tampil?: boolean;
  /** hari rilis, ISO 1=Senin .. 7=Minggu (bawaan: setiap hari) */
  hari_rilis?: number[];
  /** peran peserta: "pml", "ppl" (bawaan keduanya) */
  peran_peserta?: ("pml" | "ppl")[];
  /** true (bawaan): PML menerima rekap tim keesokan harinya */
  rekap_pml?: boolean;
  // (30 Okt 2026) Sumber soal harian (migrasi 20261030b). Bawaan 'semua' = undi dari seluruh bank soal aktif (perilaku lama).
  /** "semua": seluruh soal aktif; "paket": hanya paket di `paket_pilihan`; "pilihan": hanya soal di `soal_pilihan` (dicentang) */
  sumber_soal?: SumberSoal;
  paket_pilihan?: number[];
  soal_pilihan?: string[];
};

export type SumberSoal = "semua" | "paket" | "pilihan";
export const DAFTAR_SUMBER_SOAL: readonly SumberSoal[] = ["semua", "paket", "pilihan"];
export const sumberSoalDari = (p: Pick<QcPengaturan, "sumber_soal"> | null | undefined): SumberSoal =>
  p?.sumber_soal === "paket" || p?.sumber_soal === "pilihan" ? p.sumber_soal : "semua";

/**
 * Kolam soal yang boleh diundi hari ini (cermin klausa WHERE di sigap_qc_undi): hanya soal AKTIF, lalu disaring menurut sumber_soal.
 * Dipakai tampilan untuk menghitung "kolam berisi N soal" sebelum disimpan.
 */
export function kolamSoal<T extends { id: string; paket: number; aktif?: boolean }>(
  bank: readonly T[],
  p: Pick<QcPengaturan, "sumber_soal" | "paket_pilihan" | "soal_pilihan"> | null | undefined,
): T[] {
  const aktif = bank.filter((s) => s.aktif !== false);
  const sumber = sumberSoalDari(p);
  if (sumber === "paket") {
    const paket = new Set((p?.paket_pilihan ?? []).map(Number));
    return aktif.filter((s) => paket.has(s.paket));
  }
  if (sumber === "pilihan") {
    const id = new Set(p?.soal_pilihan ?? []);
    return aktif.filter((s) => id.has(s.id));
  }
  return aktif;
}

export const SEMUA_HARI: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
const NAMA_HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** Hari rilis yang berlaku (urut, tanpa duplikat); kosong/tidak sah = setiap hari. */
export function hariRilisDari(p: Pick<QcPengaturan, "hari_rilis"> | null | undefined): number[] {
  const x = Array.from(new Set((p?.hari_rilis ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))).sort((a, b) => a - b);
  return x.length > 0 ? x : [...SEMUA_HARI];
}
export const nilaiLulusDari = (p: Pick<QcPengaturan, "nilai_lulus"> | null | undefined): number => {
  const n = Number(p?.nilai_lulus);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 100;
};
export const wajibUlangDari = (p: Pick<QcPengaturan, "wajib_ulang"> | null | undefined): boolean => p?.wajib_ulang !== false;
/** Jumlah percobaan maksimal: 1 bila tidak wajib ulang, selain itu 1 + maks_ulang (sama dengan sigap_qc_status_k). */
export const maksPercobaanDari = (p: Pick<QcPengaturan, "wajib_ulang" | "maks_ulang">): number => (wajibUlangDari(p) ? 1 + (p.maks_ulang ?? 3) : 1);
/** "benar x 100 >= nilai_lulus x jumlah" (sama dengan sigap_qc_lulus). */
export const lulusMenurut = (benar: number, jumlah: number, nilaiLulus = 100): boolean => jumlah > 0 && benar * 100 >= nilaiLulus * jumlah;

/** Hari dalam seminggu ISO (1 = Senin .. 7 = Minggu) dari "YYYY-MM-DD". */
export function hariIso(tanggal: string): number {
  const [y, m, d] = tanggal.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
/** "Setiap hari", "Senin, Kamis", "Senin sampai Jumat". */
export function teksHariRilis(hari: readonly number[] | null | undefined): string {
  const h = hariRilisDari({ hari_rilis: hari ? [...hari] : [] });
  if (h.length === 7) return "Setiap hari";
  if (h.length >= 3 && h.every((x, i) => i === 0 || x === h[i - 1] + 1)) return `${NAMA_HARI[h[0]]} sampai ${NAMA_HARI[h[h.length - 1]]}`;
  return h.map((x) => NAMA_HARI[x]).join(", ");
}
/** Tanggal rilis berikutnya sesudah `tanggal` (hari rilis berikut), atau null bila melewati `akhir`. */
export function rilisBerikut(tanggal: string, p: Pick<QcPengaturan, "hari_rilis" | "akhir">): string | null {
  const h = hariRilisDari(p);
  for (let i = 1; i <= 7; i++) {
    const t = geserHari(tanggal, i);
    if (h.includes(hariIso(t))) return p.akhir && t > p.akhir ? null : t;
  }
  return null;
}

/** Nama hari ("Senin".."Minggu") dari "YYYY-MM-DD". */
export const namaHariDari = (tanggal: string): string => NAMA_HARI[hariIso(tanggal)] ?? "";
/** "Sabtu, 31 Okt 2026" */
const hariTanggal = (t: string): string => `${namaHariDari(t)}, ${tanggalPendekQc(t)}`;

export type CekHariTanggal = {
  /** Pelanggaran: pengaturan tidak boleh disimpan. */
  galat: string[];
  /** Catatan: boleh disimpan, tetapi perlu diketahui admin. */
  peringatan: string[];
  /** Banyak hari rilis di dalam periode (null bila periode tidak punya batas akhir). */
  jumlahRilis: number | null;
  /** Tanggal rilis pertama dan terakhir yang sebenarnya di dalam periode. */
  pertama: string | null;
  terakhir: string | null;
};

/**
 * (30 Okt 2026) Kecocokan HARI rilis dengan TANGGAL periode. Contoh: hari rilis Senin-Jumat tetapi periode 31 Okt (Sabtu) - 1 Nov (Minggu) =
 * tidak ada soal yang pernah dirilis (galat); periode mulai pada Sabtu = soal pertama baru Senin (peringatan). `hariIni` (YYYY-MM-DD, WIB)
 * opsional: dipakai untuk memberi tahu bila periode sudah lewat. Cermin pemeriksaan di sigap_qc_pengaturan_simpan (hanya galat "tanpa hari rilis").
 */
export function cekHariTanggal(p: { mulai?: string | null; akhir?: string | null; hari_rilis?: readonly number[] | null }, hariIni?: string | null): CekHariTanggal {
  const galat: string[] = [];
  const peringatan: string[] = [];
  const hr = hariRilisDari({ hari_rilis: p.hari_rilis ? [...p.hari_rilis] : [] });
  const mulai = p.mulai && TGL.test(p.mulai) ? p.mulai : null;
  const akhir = p.akhir && TGL.test(p.akhir) ? p.akhir : null;
  const cocok = (t: string) => hr.includes(hariIso(t));
  const teksHr = teksHariRilis(hr).toLowerCase();

  // rilis pertama/terakhir sungguhan di dalam periode (periode terbuka: hanya pertama; lompatan maksimal 7 hari karena hari rilis minimal satu per pekan)
  let pertama: string | null = null;
  let terakhir: string | null = null;
  let jumlah: number | null = null;
  if (mulai) {
    pertama = cocok(mulai) ? mulai : rilisBerikut(mulai, { hari_rilis: hr, akhir: null });
    if (pertama && akhir && pertama > akhir) pertama = null;
  }
  if (akhir) {
    let t = akhir;
    for (let i = 0; i < 7 && !cocok(t); i++) t = geserHari(t, -1);
    terakhir = cocok(t) && (!mulai || t >= mulai) ? t : null;
  }
  if (mulai && akhir && akhir >= mulai) {
    if (!pertama || !terakhir) {
      jumlah = 0;
    } else {
      // banyak hari rilis: hitung per pekan penuh + sisa, tanpa menelusuri tiap tanggal pada periode panjang
      jumlah = 0;
      const hari = Math.round((Date.parse(`${akhir}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) / 86_400_000) + 1;
      const pekan = Math.floor(hari / 7);
      jumlah = pekan * hr.length;
      for (let i = 0; i < hari - pekan * 7; i++) if (cocok(geserHari(mulai, pekan * 7 + i))) jumlah++;
    }
    if (jumlah === 0) {
      galat.push(`Periode ${hariTanggal(mulai)} sampai ${hariTanggal(akhir)} tidak memuat satu pun hari rilis (${teksHr}), jadi soal tidak akan pernah dirilis. Ubah tanggal periode atau hari rilis.`);
    }
  }
  if (mulai && jumlah !== 0 && !cocok(mulai) && pertama) peringatan.push(`Tanggal mulai ${hariTanggal(mulai)} bukan hari rilis (${teksHr}). Soal pertama baru dirilis ${hariTanggal(pertama)}.`);
  if (akhir && jumlah !== 0 && !cocok(akhir) && terakhir) peringatan.push(`Tanggal akhir ${hariTanggal(akhir)} bukan hari rilis (${teksHr}). Soal terakhir dirilis ${hariTanggal(terakhir)}.`);
  if (mulai && akhir && akhir < mulai) peringatan.push("Tanggal akhir sebelum tanggal mulai.");
  if (akhir && hariIni && TGL.test(hariIni) && akhir < hariIni) peringatan.push(`Periode berakhir ${hariTanggal(akhir)}, sudah lewat: petugas tidak lagi melihat modal QC. Ubah tanggal akhir bila QC masih ingin dijalankan.`);
  return { galat, peringatan, jumlahRilis: jumlah, pertama, terakhir };
}

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
export function hariBerlaku(now: Date, p: Pick<QcPengaturan, "rilis_jam" | "mulai" | "akhir" | "hari_rilis">): string | null {
  const rilis = jamKeMenit(p.rilis_jam);
  if (rilis === null) return null;
  const w = bagianWib(now);
  let tgl = w.menit >= rilis ? w.tanggal : geserHari(w.tanggal, -1);
  // (29 Okt 2026) bukan hari rilis -> hari rilis terakhir sebelumnya (sama dengan sigap_qc_hari_berlaku)
  const hr = hariRilisDari(p);
  for (let i = 0; i < 7 && !hr.includes(hariIso(tgl)); i++) tgl = geserHari(tgl, -1);
  if (p.mulai && tgl < p.mulai) return null;
  if (p.akhir && tgl > p.akhir) return null;
  return tgl;
}

export type JendelaQc = { tanggal: string; rilis: Date; batas: Date; lewatBatas: boolean; sisaMenit: number };

/** `susulan` = hari ditandai susulan: batas tidak berlaku, jadi tidak pernah "lewat batas" (sama dengan sigap_qc_status). */
export function jendelaQc(now: Date, p: Pick<QcPengaturan, "rilis_jam" | "batas_jam" | "mulai" | "akhir" | "hari_rilis">, susulan = false): JendelaQc | null {
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
export function ringkasStatusQc(now: Date, p: Pick<QcPengaturan, "aktif" | "rilis_jam" | "batas_jam" | "mulai" | "akhir" | "hari_rilis" | "nilai_lulus" | "wajib_ulang">, susulan = false): StatusQc {
  const rilis = jamKeMenit(p.rilis_jam);
  const batas = jamKeMenit(p.batas_jam);
  if (rilis === null || batas === null) return { status: "tidak_sah", judul: "Pengaturan jam belum sah", baris: ["Periksa jam rilis dan jam batas, lalu simpan."] };
  if (!p.aktif) return { status: "nonaktif", judul: "Nonaktif", baris: ["Petugas tidak melihat soal QC dan tidak ada notifikasi QC.", "Centang Aktifkan lalu simpan untuk mulai berlaku."] };

  const jamRilis = menitKeJam(rilis);
  const jamBatas = menitKeJam(batas);
  const hari = hariBerlaku(now, p);
  if (!hari) {
    if (p.mulai && instanWib(p.mulai, rilis).getTime() > now.getTime()) {
      const awal = hariRilisDari(p).includes(hariIso(p.mulai)) ? p.mulai : (rilisBerikut(p.mulai, p) ?? p.mulai);
      return { status: "belum_mulai", judul: "Aktif, belum mulai", baris: [`Soal pertama dirilis ${tanggalPendekQc(awal)} pukul ${jamRilis} WIB.`, "Sebelum itu petugas belum melihat modal QC."] };
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
  const besok = rilisBerikut(hari, p);
  if (besok) baris.push(`Soal berikutnya dirilis ${tanggalPendekQc(besok)} pukul ${jamRilis} WIB.`);
  else if (p.akhir) baris.push(`Hari ini hari terakhir periode (${tanggalPendekQc(p.akhir)}).`);
  const lulus = nilaiLulusDari(p);
  baris.push(`Lulus bila nilai ${lulus >= 100 ? "100 (semua benar)" : `${lulus} ke atas`}; ${wajibUlangDari(p) ? "petugas yang belum lulus wajib mengulang." : "satu percobaan saja, tanpa ulangan wajib."}`);
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

export function labelStatusPpl(p: Pick<QcRekapPpl, "percobaan" | "lulus" | "skor_terbaik">, maks: number, nilaiLulus = 100): string {
  if (p.percobaan === 0) return "Belum mengisi";
  if (p.lulus) return nilaiLulus >= 100 ? "Lulus 100" : `Lulus (${p.skor_terbaik ?? 0})`;
  if (p.percobaan >= maks) return `${maks <= 1 ? "Tidak lulus" : "Habis percobaan"} (${p.skor_terbaik ?? 0})`;
  return `${nilaiLulus >= 100 ? "Belum 100" : "Belum lulus"} (${p.skor_terbaik ?? 0}), masih mengulang`;
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
/** (28 Okt 2026) Pengingat TENGGAT: tepat saat jam batas; selalu dikirim ke yang masih wajib, walau sedang menunda (lib/sigapQcTunda.ts). */
export const SLOT_TENGGAT = 99;
/** (28 Okt 2026) Pengingat "tunda selesai" = SLOT_TUNDA + urutan tunda (ke) petugas itu pada hari tersebut (slot >= 200, per petugas). */
export const SLOT_TUNDA = 200;
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
  const hariRilis = hariRilisDari(p);
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

    // (28 Okt 2026) pengingat TENGGAT: tepat saat batas (dalam toleransi cron), hari biasa saja (hari susulan tidak punya batas).
    const sejakBatas = (now.getTime() - batasAt.getTime()) / 60000;
    if (!susulan && !senyap && sejakBatas >= 0 && sejakBatas < TOLERANSI_PENGINGAT_MENIT) {
      hasil.push({ jenis: "ingat_petugas", tanggal: hari, slot: SLOT_TENGGAT });
      hasil.push({ jenis: "ingat_pml", tanggal: hari, slot: SLOT_TENGGAT });
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
  // (29 Okt 2026) hanya bila rekap PML menyala untuk kegiatan ini dan kemarin memang hari rilis (ada soal yang direkap).
  if (p.rekap_pml !== false && hariRilis.includes(hariIso(kemarin)) && dalamPeriode(kemarin) && w.menit >= rekap && w.menit < rilis) hasil.push({ jenis: "rekap_pml", tanggal: kemarin, slot: 0 });
  return hasil;
}

// ---------------------------------------------------------------------------
// Isi push
// ---------------------------------------------------------------------------
/** `tunda` = notifikasi diberi tombol "Tunda 2 jam" (hanya untuk pesan yang dikirim ke petugas yang masih wajib mengerjakan). */
export type IsiPush = { judul: string; isi: string; url: string; tag: string; tunda?: boolean };

const URL_QC = "/";
/** (29 Okt 2026) `nama` dipakai bila lebih dari satu kegiatan memiliki QC aktif, agar petugas tahu QC yang mana; `kegiatanId` membuat tag berbeda per kegiatan. */
export type OpsiPush = { nama?: string; kegiatanId?: number };
const akhiranTag = (o?: OpsiPush) => (o?.kegiatanId ? `-k${o.kegiatanId}` : "");
const dengan = (judul: string, o?: OpsiPush) => (o?.nama ? `${judul} (${o.nama})` : judul);
/** "nilai 100" atau "nilai 80 ke atas" */
const targetNilai = (n: number) => (n >= 100 ? "nilai 100" : `nilai ${n} ke atas`);
const potong = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export function pushRilis(tanggal: string, p: Pick<QcPengaturan, "soal_per_hari" | "batas_jam" | "nilai_lulus" | "wajib_ulang">, susulan = false, o?: OpsiPush): IsiPush {
  const ulang = wajibUlangDari(p) ? `, ulangi sampai ${targetNilai(nilaiLulusDari(p))}` : "";
  return {
    judul: dengan("QC Pemahaman Petugas hari ini", o),
    isi: susulan
      ? `${p.soal_per_hari} soal QC Pemahaman terlambat dirilis (tidak dihitung terlambat). Isi sekarang${ulang}. Buka SIGAP.`
      : `${p.soal_per_hari} soal sudah dirilis. Wajib diisi sebelum pukul ${menitKeJam(jamKeMenit(p.batas_jam) ?? 0)} WIB. Buka SIGAP sekarang.`,
    url: URL_QC,
    tag: `qc-rilis-${tanggal}${akhiranTag(o)}`,
    tunda: true,
  };
}

export type KeadaanPengingat = { belumMengisi: boolean; skorTerbaik?: number; sisaUlang?: number };

export function pushIngatPetugas(tanggal: string, sisaMenit: number, p: Pick<QcPengaturan, "batas_jam" | "nilai_lulus" | "wajib_ulang">, k: KeadaanPengingat = { belumMengisi: true }, susulan = false, o?: OpsiPush): IsiPush {
  const jam = menitKeJam(jamKeMenit(p.batas_jam) ?? 0);
  const nilai = nilaiLulusDari(p);
  const ulang = wajibUlangDari(p) ? `, lalu ulangi sampai ${targetNilai(nilai)}` : "";
  let isi: string;
  if (!k.belumMengisi) {
    const sisa = k.sisaUlang !== undefined ? ` (sisa ${k.sisaUlang} kali)` : "";
    isi = `Nilai terbaik Anda ${k.skorTerbaik ?? 0}. Ulangi QC Pemahaman sampai ${targetNilai(nilai)}${sisa}.`;
  } else if (susulan || sisaMenit <= 0) {
    isi = `Anda belum mengisi QC Pemahaman hari ini. Isi sekarang${ulang}.`;
  } else {
    isi = `Anda belum selesai mengisi. Sisa ${sisaMenit} menit sampai pukul ${jam} WIB.`;
  }
  return { judul: dengan(k.belumMengisi ? "Segera isi QC Pemahaman" : nilai >= 100 ? "Ulangi QC Pemahaman sampai 100" : "Ulangi QC Pemahaman sampai lulus", o), isi, url: URL_QC, tag: `qc-ingat-${tanggal}${akhiranTag(o)}`, tunda: true };
}

export function pushIngatPml(tanggal: string, namaBelum: readonly string[], p: Pick<QcPengaturan, "batas_jam">, o?: OpsiPush): IsiPush {
  const n = namaBelum.length;
  const contoh = namaBelum.slice(0, 3).join(", ");
  const lebih = n > 3 ? ` dan ${n - 3} lainnya` : "";
  return {
    judul: dengan(`${n} petugas Anda belum mengisi QC`, o),
    isi: `${contoh}${lebih} belum mengisi. Ingatkan mereka segera (batas pukul ${menitKeJam(jamKeMenit(p.batas_jam) ?? 0)} WIB).`,
    url: URL_QC,
    tag: `qc-ingat-pml-${tanggal}${akhiranTag(o)}`,
  };
}

export function pushRekapPml(tanggal: string, t: Pick<QcRekapTim, "jumlah_ppl" | "sudah" | "belum_mengisi" | "lulus" | "rata_awal" | "salah">, o?: OpsiPush): IsiPush {
  const teratas = [...t.salah].sort((a, b) => b.jumlah - a.jumlah)[0];
  const baris: string[] = [`${t.sudah} dari ${t.jumlah_ppl} petugas sudah mengisi`];
  if (t.belum_mengisi > 0) baris.push(`${t.belum_mengisi} belum mengisi`);
  if (t.rata_awal !== null) baris.push(`rata-rata nilai awal ${t.rata_awal}`);
  if (t.salah.length > 0) baris.push(`${t.salah.length} soal dijawab salah${teratas ? ` (terbanyak: ${potong(teratas.pertanyaan, 50)})` : ""}`);
  const butuhBriefing = t.salah.length > 0 || t.belum_mengisi > 0;
  return {
    judul: dengan(butuhBriefing ? "Rekap QC kemarin: briefing ulang tim Anda" : "Rekap QC kemarin: tim Anda aman", o),
    isi: potong(`${baris.join("; ")}.${butuhBriefing ? " Segera briefing kembali petugas." : ""}`, 180),
    url: URL_QC,
    tag: `qc-rekap-${tanggal}${akhiranTag(o)}`,
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

  // (29 Okt 2026) opsi per kegiatan
  for (const [k, label] of [["wajib_ulang", "Wajib ulang"], ["undi_acak", "Undian acak"], ["acak_tampil", "Urutan acak"], ["rekap_pml", "Rekap PML"]] as const) {
    if (!(k in m)) continue;
    if (typeof m[k] !== "boolean") galat.push(`${label} harus ya/tidak`);
    else data[k] = m[k];
  }
  if ("nilai_lulus" in m) {
    const v = Number(m.nilai_lulus);
    if (!Number.isInteger(v) || v < 1 || v > 100) galat.push("Nilai lulus harus bilangan bulat 1-100");
    else data.nilai_lulus = v;
  }
  // (30 Okt 2026) sumber soal harian
  if ("sumber_soal" in m) {
    if (typeof m.sumber_soal !== "string" || !(DAFTAR_SUMBER_SOAL as readonly string[]).includes(m.sumber_soal)) galat.push("Sumber soal harus semua, paket, atau pilihan");
    else data.sumber_soal = m.sumber_soal;
  }
  if ("paket_pilihan" in m) {
    const daftar = Array.isArray(m.paket_pilihan) ? m.paket_pilihan.map(Number) : null;
    if (!daftar || daftar.length > 200 || daftar.some((x) => !Number.isInteger(x) || x < 1 || x > 32767)) galat.push("Paket pilihan harus berupa daftar nomor paket (bilangan bulat positif)");
    else data.paket_pilihan = Array.from(new Set(daftar)).sort((a, b) => a - b);
  }
  if ("soal_pilihan" in m) {
    const daftar = Array.isArray(m.soal_pilihan) ? m.soal_pilihan.map((x) => (typeof x === "string" ? x.trim() : null)) : null;
    if (!daftar || daftar.length > 2000 || daftar.some((x) => !x || x.length > 40)) galat.push("Soal pilihan harus berupa daftar kode soal");
    else data.soal_pilihan = Array.from(new Set(daftar as string[])).sort();
  }
  const sumberBaru = data.sumber_soal;
  if (sumberBaru === "paket" && "paket_pilihan" in data && (data.paket_pilihan as number[]).length < 1) galat.push("Pilih minimal satu paket soal");
  if (sumberBaru === "pilihan" && "soal_pilihan" in data && (data.soal_pilihan as string[]).length < 1) galat.push("Centang minimal satu soal");
  if ("hari_rilis" in m) {
    const daftar = Array.isArray(m.hari_rilis) ? m.hari_rilis.map(Number) : [];
    if (daftar.length < 1 || daftar.length > 7 || daftar.some((x) => !Number.isInteger(x) || x < 1 || x > 7)) galat.push("Hari rilis harus berisi minimal satu hari (1 Senin sampai 7 Minggu)");
    else data.hari_rilis = Array.from(new Set(daftar)).sort((a, b) => a - b);
  }
  if ("peran_peserta" in m) {
    const daftar = Array.isArray(m.peran_peserta) ? m.peran_peserta.map((x) => String(x)) : [];
    if (daftar.length < 1 || daftar.some((x) => x !== "pml" && x !== "ppl")) galat.push("Peserta harus berisi PML, PPL, atau keduanya");
    else data.peran_peserta = Array.from(new Set(daftar)).sort();
  }

  for (const k of ["mulai", "akhir"] as const) {
    if (!(k in m)) continue;
    const v = m[k];
    if (v === null || v === "") data[k] = null;
    else if (typeof v === "string" && TGL.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) data[k] = v;
    else galat.push(`Tanggal ${k} bukan YYYY-MM-DD`);
  }
  if ("mulai" in data && "akhir" in data && data.mulai && data.akhir && (data.akhir as string) < (data.mulai as string)) galat.push("Tanggal akhir tidak boleh sebelum tanggal mulai");
  // (30 Okt 2026) hari rilis harus cocok dengan tanggal periode: minimal satu hari rilis jatuh di dalam periode (cermin sigap_qc_pengaturan_simpan)
  if ("mulai" in data && "akhir" in data && "hari_rilis" in data && data.mulai && data.akhir && (data.akhir as string) >= (data.mulai as string)) {
    galat.push(...cekHariTanggal({ mulai: data.mulai as string, akhir: data.akhir as string, hari_rilis: data.hari_rilis as number[] }).galat);
  }

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
/** (29 Okt 2026) Soal 4 pilihan (A-D) ATAU 2 pilihan (A-B, mis. Benar/Salah): C dan D diisi bersama atau dikosongkan bersama. */
export type OpsiSoal = { A: string; B: string; C?: string; D?: string };
export const OPSI_BENAR_SALAH: Readonly<{ A: string; B: string }> = { A: "Benar", B: "Salah" };
export type SoalMasuk = { id: string; paket: number; judul_paket?: string; nomor?: number; pertanyaan: string; opsi: OpsiSoal; kunci: "A" | "B" | "C" | "D"; penjelasan?: string; kata_kunci?: string[]; aktif?: boolean };

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
  const opsi: OpsiSoal = { A: "", B: "" };
  for (const k of ["A", "B"] as const) {
    const t = String(o[k] ?? "").trim();
    if (!t) galat.push(`Pilihan ${k} wajib diisi`);
    opsi[k] = t;
  }
  // (29 Okt 2026) C dan D opsional sebagai pasangan: keduanya kosong = soal 2 pilihan (Benar/Salah)
  const c = String(o.C ?? "").trim();
  const d = String(o.D ?? "").trim();
  if (c && d) {
    opsi.C = c;
    opsi.D = d;
  } else if (c || d) galat.push("Pilihan C dan D harus diisi bersama, atau dikosongkan keduanya (soal 2 pilihan, mis. Benar/Salah)");
  const tekstual = Object.values(opsi).filter(Boolean);
  if (new Set(tekstual.map((t) => t.toLowerCase())).size !== tekstual.length) galat.push("Pilihan jawaban tidak boleh sama persis");
  if (["A", "B", "C", "D"].includes(kunci) && opsi[kunci as "A" | "B" | "C" | "D"] === undefined) galat.push(`Kunci ${kunci} tidak ada di pilihan jawaban (soal ini hanya punya pilihan A dan B)`);
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
export type QcSetSoal = {
  tanggal: string;
  ke: number;
  maks_percobaan: number;
  batas_at: string;
  lewat_batas: boolean;
  susulan?: boolean;
  /** (29 Okt 2026) kegiatan yang sedang dikerjakan petugas (bisa mengikuti lebih dari satu) */
  kegiatan_id?: number;
  kegiatan_nama?: string;
  nilai_lulus?: number;
  wajib_ulang?: boolean;
  soal: QcSoalKlien[];
};
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
  kegiatan_id?: number;
  nilai_lulus?: number;
  tinjau: QcButirTinjau[];
};

/** Kalimat hasil setelah menjawab (judul modal hasil). */
export function kalimatHasil(t: Pick<QcTinjau, "skor" | "lulus" | "perlu_ulang" | "sisa_ulang"> & { nilai_lulus?: number }): string {
  const n = nilaiLulusDari(t);
  if (t.lulus) return n >= 100 ? "Nilai 100. Semua jawaban benar." : `Nilai ${t.skor}. Lulus (batas lulus ${n}).`;
  if (t.perlu_ulang) return `Nilai ${t.skor}. Anda wajib mengulang sampai ${targetNilai(n)} (sisa ${t.sisa_ulang} kali).`;
  return n >= 100 ? `Nilai ${t.skor}. Kesempatan mengulang sudah habis; pelajari pembahasan di bawah.` : `Nilai ${t.skor} (batas lulus ${n}). Tidak ada ulangan lagi; pelajari pembahasan di bawah.`;
}
