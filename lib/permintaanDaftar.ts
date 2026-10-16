// lib/permintaanDaftar.ts
//
// (13 Okt 2026) Kartu plotting tim di Lembar Pendataan -- permintaan user: PML mengajukan Sub SLS (batas TOTAL per PML naik bertahap sejak 15 Okt 2026: 7, 9, lalu 11; semula 2 per hari, lalu total 5), memilih PPL untuk tiap
// Sub SLS, lalu menekan Kirim untuk meminta daftar KK "keluar" di FASIH. Admin meng-assign di FASIH lalu menandai "Sudah keluar". PPL hanya melihat.
// Fungsi MURNI (tanpa DB/React): tipe, batas pengajuan, validasi isian, dan baris templat upload FASIH (Pengawas-Pencacah).

import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "@/lib/sigapPushUtil";
import { rapikanNama } from "@/lib/rekapIdentifikasi";

/**
 * (15 Okt 2026) Batas TOTAL pengajuan yang masih berlaku (menunggu + sudah keluar) per PML -- permintaan user: 7 pada 15 Okt, 9 pada 16 Okt, 11 pada 17 Okt 2026
 * dan seterusnya (setelah 17 Okt tetap 11 sampai ada perintah baru). Yang dibatalkan tidak dihitung. Dijaga atomik di fungsi DB bencana_pendataan_minta_total (parameter p_maks).
 * Tanggal = tanggal WIB. Untuk mengubah jadwal cukup ubah daftar ini + deploy.
 */
export const JADWAL_BATAS_PENGAJUAN: ReadonlyArray<readonly [string, number]> = [
  ["2026-10-15", 7],
  ["2026-10-16", 9],
  ["2026-10-17", 11],
];
export const BATAS_AWAL_PENGAJUAN = 7;
export function batasPengajuan(tanggal: string): number {
  let b = BATAS_AWAL_PENGAJUAN;
  for (const [t, n] of JADWAL_BATAS_PENGAJUAN) if (tanggal >= t) b = n;
  return b;
}
export const CATATAN_BATAS_PENGAJUAN = "Batas total pengajuan naik bertahap: 7 Sub SLS pada 15 Okt, 9 pada 16 Okt, dan 11 mulai 17 Okt 2026.";
/** Pengaman ukuran satu kiriman (bukan kuota). */
export const MAKS_SUB_SEKALI_KIRIM = 200;
export const API_PERMINTAAN = "/api/portal/pendataan/permintaan";

/** "dibatalkan" hanya muncul di layar admin: pembatalan PML atas assignment yang sudah keluar dan belum dihapus di FASIH. */
export type StatusMinta = "menunggu" | "sudah_keluar" | "dibatalkan";
export const LABEL_STATUS_MINTA: Record<StatusMinta, string> = { menunggu: "Menunggu admin", sudah_keluar: "Sudah keluar di FASIH", dibatalkan: "Dibatalkan PML" };

export type Permintaan = {
  id: number;
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  pml_id: number;
  pml_nama: string;
  ppl_akun_id: number;
  ppl_nama: string;
  tanggal: string; // yyyy-mm-dd (WIB)
  status: StatusMinta;
  diminta_at: string;
  selesai_at: string | null;
  /** (16 Okt 2026) true = diambil dari kolam wilayah kerja; TIDAK menghabiskan batas total 7/9/11 */
  dari_kolam?: boolean;
};

/** Tambahan khusus admin: email untuk templat FASIH (dari data mitra). Kosong = belum ada. */
export type PermintaanAdmin = Permintaan & { email_pengawas: string; email_pencacah: string; dibatalkan_at: string | null };

export type DataPermintaanTim = {
  sekarang: string;
  tanggal: string;
  /** batas TOTAL pengajuan yang berlaku hari ini */
  maks: number;
  /** hanya PML tim (bukan sesi "masuk sebagai") yang boleh mengirim */
  bisa_kirim: boolean;
  permintaan: Permintaan[];
};
export type DataPermintaanAdmin = { sekarang: string; boleh_kelola: boolean; permintaan: PermintaanAdmin[] };

/** Tanggal WIB (yyyy-mm-dd) dari waktu apa pun. Dasar hitung "hari ini". */
export const tanggalWib = (t: Date | number | string): string => new Date(new Date(t).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** Berapa Sub SLS yang masih boleh diajukan PML: batas total dikurangi pengajuan yang masih berlaku (menunggu/sudah keluar; yang dibatalkan tidak dihitung). */
export function sisaKuota(aktif: unknown[], maks: number): number {
  return Math.max(0, maks - aktif.length);
}

export type Pilihan = { idsubsls: string; ppl_akun_id: number };

export function periksaPilihan(x: unknown, maks = MAKS_SUB_SEKALI_KIRIM): { ok: true; pilihan: Pilihan[] } | { ok: false; pesan: string } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, pesan: "Pilih minimal satu Sub SLS." };
  if (x.length > maks) return { ok: false, pesan: `Maksimal ${maks} Sub SLS sekali kirim.` };
  const out: Pilihan[] = [];
  const sudah = new Set<string>();
  for (const r of x) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.idsubsls !== "string" || !/^\d{16}$/.test(o.idsubsls)) return { ok: false, pesan: "Kode Sub SLS tidak sah." };
    const ppl = Number(o.ppl_akun_id);
    if (!Number.isInteger(ppl) || ppl <= 0) return { ok: false, pesan: "Pilih PPL untuk setiap Sub SLS." };
    if (sudah.has(o.idsubsls)) return { ok: false, pesan: "Sub SLS yang sama dipilih dua kali." };
    sudah.add(o.idsubsls);
    out.push({ idsubsls: o.idsubsls, ppl_akun_id: ppl });
  }
  return { ok: true, pilihan: out };
}

export function periksaIds(x: unknown, maks = 200): number[] | null {
  if (!Array.isArray(x) || x.length === 0 || x.length > maks) return null;
  const ids = x.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return [...new Set(ids)];
}

const koleksi = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
const URUTAN: Record<StatusMinta, number> = { menunggu: 0, sudah_keluar: 1, dibatalkan: 2 };
/** Menunggu dulu (paling lama di atas), lalu yang sudah keluar (terbaru di atas), terakhir yang dibatalkan. */
export function urutPermintaan<T extends Permintaan>(a: T[]): T[] {
  return [...a].sort((p, q) => {
    if (p.status !== q.status) return URUTAN[p.status] - URUTAN[q.status];
    const t = p.status === "menunggu" ? p.diminta_at.localeCompare(q.diminta_at) : (q.selesai_at ?? "").localeCompare(p.selesai_at ?? "");
    return t || koleksi.compare(p.idsubsls, q.idsubsls);
  });
}

// ---------------------------------------------------------------- templat upload FASIH (format "Pengawas-Pencacah", sheet "Sheet0")
export const JUDUL_TEMPLAT_FASIH = ["PROVINSI", "KABUPATEN/KOTA", "KECAMATAN", "DESA/KELURAHAN", "SLS/SUBSLS", "Email Pengawas", "Email Pencacah"] as const;
export type BarisTemplatFasih = Record<(typeof JUDUL_TEMPLAT_FASIH)[number], string>;

/** idsubsls 16 digit = provinsi(2) kabupaten(2) kecamatan(3) desa(3) SLS(4) subSLS(2). Kolom SLS/SUBSLS di FASIH = 6 digit terakhir. */
export function pecahKodeSubsls(idsubsls: string): { prov: string; kab: string; kec: string; desa: string; slsSub: string } | null {
  if (!/^\d{16}$/.test(idsubsls)) return null;
  return { prov: idsubsls.slice(0, 2), kab: idsubsls.slice(2, 4), kec: idsubsls.slice(4, 7), desa: idsubsls.slice(7, 10), slsSub: idsubsls.slice(10, 16) };
}

const emailBersih = (s: string) => s.trim().toLowerCase();

/** Baris templat dari permintaan. Semua nilai TEKS (kode berawalan nol harus tetap). Baris dengan kode tak sah dilewati. */
export function barisTemplatFasih(p: Pick<PermintaanAdmin, "idsubsls" | "email_pengawas" | "email_pencacah">[]): BarisTemplatFasih[] {
  const out: BarisTemplatFasih[] = [];
  for (const r of p) {
    const k = pecahKodeSubsls(r.idsubsls);
    if (!k) continue;
    out.push({
      PROVINSI: k.prov,
      "KABUPATEN/KOTA": k.kab,
      KECAMATAN: k.kec,
      "DESA/KELURAHAN": k.desa,
      "SLS/SUBSLS": k.slsSub,
      "Email Pengawas": emailBersih(r.email_pengawas),
      "Email Pencacah": emailBersih(r.email_pencacah),
    });
  }
  // urut stabil menurut kode wilayah lalu pencacah
  return out.sort((a, b) => koleksi.compare(`${a.KECAMATAN}${a["DESA/KELURAHAN"]}${a["SLS/SUBSLS"]}`, `${b.KECAMATAN}${b["DESA/KELURAHAN"]}${b["SLS/SUBSLS"]}`));
}

/** Permintaan yang belum bisa diekspor utuh: email pengawas/pencacah belum ada. */
export const tanpaEmail = (p: Pick<PermintaanAdmin, "email_pengawas" | "email_pencacah">): boolean => !p.email_pengawas.trim() || !p.email_pencacah.trim();

export const namaBerkasTemplat = (tanggal: string): string => `Pengawas-Pencacah-${tanggal.replaceAll("-", "")}.xlsx`;

// ---------------------------------------------------------------- email akun FASIH (diisi admin bila data mitra belum punya)
const POLA_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Email dirapikan (huruf kecil, tanpa spasi pinggir). null = tidak sah. */
export function periksaEmail(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const e = x.trim().toLowerCase();
  return e.length <= 120 && POLA_EMAIL.test(e) ? e : null;
}
export type PeranEmail = "pengawas" | "pencacah";

// ---------------------------------------------------------------- notifikasi & catatan "sudah di-assign ke FASIH"
/** Dipakai di kartu plotting (PML/PPL) dan layar admin. */
export const CATATAN_CEK_SUBMIT = "Belum muncul di akun PPL? Periksa dulu apakah proses identifikasi jorong ini sudah tersubmit di FASIH.";
export const CATATAN_KEROYOKAN = "Jika keroyokan, seluruh petugas login memakai akun PPL penerima di atas.";

/** "JORONG TANJUNG" + "00" -> "Jorong Tanjung"; sub selain 00 ikut: "Jorong Gando 04". */
export const labelJorong = (sls: string, sub: string): string => `${rapikanNama(sls || "")}${sub && sub !== "00" ? ` ${sub}` : ""}`.trim();

const namaPertama = (n: string): string => rapikanNama(n || "").split(" ")[0] || "PPL";

export type ItemKeluar = { jorong: string; ppl: string };

/**
 * Isi notifikasi saat permintaan ditandai sudah keluar di FASIH. Selalu memuat: rincian jorong (+ nama PPL penerima untuk PML), pengingat memeriksa
 * submit identifikasi, dan catatan keroyokan. Bila daftar terlalu panjang, yang dipotong DAFTARNYA ("+N lagi"), bukan catatan di belakangnya.
 */
export function susunPushKeluar(untuk: "pml" | "ppl", items: ItemKeluar[]): { judul: string; isi: string } {
  const judul = untuk === "pml" ? "Daftar KK sudah di-assign ke FASIH" : "Daftar KK sudah ada di FASIH Anda";
  const ekor =
    untuk === "pml"
      ? " Belum ada di akun PPL? Cek apakah identifikasi jorong sudah tersubmit di FASIH. Keroyokan: semua petugas login pakai akun PPL di atas."
      : " Belum muncul? Cek apakah identifikasi jorong sudah tersubmit di FASIH. Keroyokan: semua petugas login pakai akun Anda.";
  const awal = untuk === "pml" ? "Di-assign: " : "Untuk Anda: ";
  const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const bentuk = (i: ItemKeluar) => (untuk === "pml" ? `${i.jorong} → ${namaPertama(i.ppl)}` : i.jorong);
  const ruang = MAKS_ISI_PUSH - ekor.length - awal.length - 1; // 1 = titik penutup daftar
  const pilih: string[] = [];
  let pakai = 0;
  for (let k = 0; k < items.length; k++) {
    const t = bentuk(items[k]);
    const sisa = items.length - k - 1;
    const tambah = (pilih.length ? 2 : 0) + t.length;
    const cadangan = sisa > 0 ? ` (+${sisa} lagi)`.length : 0;
    if (pakai + tambah + cadangan > ruang && pilih.length > 0) break;
    pilih.push(pilih.length === 0 ? potong(t, Math.max(10, ruang - cadangan)) : t);
    pakai += tambah;
  }
  const lagi = items.length - pilih.length;
  const isi = `${awal}${pilih.join("; ")}${lagi > 0 ? ` (+${lagi} lagi)` : ""}.${ekor}`;
  return { judul: judul.slice(0, MAKS_JUDUL_PUSH), isi: potong(isi, MAKS_ISI_PUSH) };
}

// ---------------------------------------------------------------- pembatalan assignment oleh PML (14 Okt 2026)
export const CATATAN_BATAL = "Pembatalan langsung berlaku tanpa persetujuan: Sub SLS ini dan kuota Anda bebas lagi, jadi Anda bisa memilih ulang PPL-nya. Admin diberi tahu untuk menghapus assignment lama di FASIH.";

export type ItemBatal = { jorong: string; ppl: string };

/**
 * Notifikasi pembatalan assignment. Admin: siapa yang membatalkan + apa yang harus dihapus di FASIH. PPL: assignment-nya dibatalkan, abaikan.
 * Daftar yang panjang dipotong "(+N lagi)"; pesan akhir tetap utuh dan <= MAKS_ISI_PUSH.
 */
export function susunPushBatal(untuk: "admin" | "ppl", pml: string, items: ItemBatal[]): { judul: string; isi: string } {
  const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  const judul = untuk === "admin" ? "Pembatalan assignment FASIH" : "Assignment dibatalkan PML";
  const awal = untuk === "admin" ? `PML ${namaPertama(pml)} membatalkan: ` : "Dibatalkan PML: ";
  const ekor = untuk === "admin" ? " Hapus assignment lama di FASIH; PML mengisi ulang PPL-nya." : " Abaikan daftar ini; jika ada penggantinya Anda dikabari.";
  const bentuk = (i: ItemBatal) => (untuk === "admin" ? `${i.jorong} (${namaPertama(i.ppl)})` : i.jorong);
  const ruang = MAKS_ISI_PUSH - ekor.length - awal.length - 1;
  const pilih: string[] = [];
  let pakai = 0;
  for (let k = 0; k < items.length; k++) {
    const t = bentuk(items[k]);
    const sisa = items.length - k - 1;
    const tambah = (pilih.length ? 2 : 0) + t.length;
    const cadangan = sisa > 0 ? ` (+${sisa} lagi)`.length : 0;
    if (pakai + tambah + cadangan > ruang && pilih.length > 0) break;
    pilih.push(pilih.length === 0 ? potong(t, Math.max(10, ruang - cadangan)) : t);
    pakai += tambah;
  }
  const lagi = items.length - pilih.length;
  const isi = `${awal}${pilih.join("; ")}${lagi > 0 ? ` (+${lagi} lagi)` : ""}.${ekor}`;
  return { judul: judul.slice(0, MAKS_JUDUL_PUSH), isi: potong(isi, MAKS_ISI_PUSH) };
}

/** (16 Okt 2026) Alasan penolakan admin (opsional) ikut di notifikasi ke PML. */
export const MAKS_ALASAN_TOLAK = 160;
/** Bersihkan alasan dari kotak isian: rapikan spasi, potong ke MAKS_ALASAN_TOLAK. */
export function rapikanAlasanTolak(x: unknown): string {
  const t = typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "";
  return t.length > MAKS_ALASAN_TOLAK ? t.slice(0, MAKS_ALASAN_TOLAK).trimEnd() : t;
}

/**
 * Push ke PML saat admin MENOLAK permintaan daftar KK yang masih menunggu: daftar Sub SLS (dipotong "(+N lagi)"), alasan bila ada, dan kabar bahwa
 * kuota kembali sehingga PML boleh mengajukan lagi. Pesan akhir <= MAKS_ISI_PUSH.
 */
export function susunPushTolak(jorong: string[], alasan: string): { judul: string; isi: string } {
  const potong = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
  const a = rapikanAlasanTolak(alasan);
  const awal = "Ditolak admin: ";
  const ekor = `${a ? ` Alasan: ${a}.` : ""} Kuota pengajuan Anda kembali; ajukan lagi bila perlu.`;
  const ruang = Math.max(20, MAKS_ISI_PUSH - ekor.length - awal.length - 1);
  const pilih: string[] = [];
  let pakai = 0;
  for (let k = 0; k < jorong.length; k++) {
    const t = jorong[k];
    const sisa = jorong.length - k - 1;
    const tambah = (pilih.length ? 2 : 0) + t.length;
    const cadangan = sisa > 0 ? ` (+${sisa} lagi)`.length : 0;
    if (pakai + tambah + cadangan > ruang && pilih.length > 0) break;
    pilih.push(pilih.length === 0 ? potong(t, Math.max(10, ruang - cadangan)) : t);
    pakai += tambah;
  }
  const lagi = jorong.length - pilih.length;
  const isi = `${awal}${pilih.join("; ")}${lagi > 0 ? ` (+${lagi} lagi)` : ""}.${ekor}`;
  return { judul: "Permintaan daftar KK ditolak".slice(0, MAKS_JUDUL_PUSH), isi: potong(isi, MAKS_ISI_PUSH) };
}
