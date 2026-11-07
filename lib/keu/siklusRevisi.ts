// lib/keu/siklusRevisi.ts
//
// (7 Nov 2026, tahap 4c) Logika murni modal siklus revisi: tiga pilihan tanggapan per RO (Ajukan sekarang / Ingatkan saya / Tidak mengusulkan),
// pintasan waktu "Ingatkan saya", pemeriksaan waktu bebas, dan teks. Aturan yang sebenarnya ditegakkan di basis data (20261107l_keu_tanggapan_revisi.sql);
// berkas ini hanya menyiapkan tampilan dan mencegah salah pilih sebelum sampai ke server. Semua waktu dihitung dalam WIB (UTC+7, tanpa musim).

import { kroDariRo } from "./matriks";

export const MAKS_TUNDA = 2;
export const MENIT_TERDEKAT = 5;
const WIB_MS = 7 * 3_600_000;

export type StatusTanggapan = "belum" | "ajukan" | "ingat" | "tidak";
export type PilihanTanggapan = "ajukan" | "ingat" | "tidak";

/** Satu baris keluaran keu_tanggapan_saya. */
export type TanggapanSaya = {
  jadwal_id: number; judul: string; jenis: string; tutup: string; ro_kode: string;
  status: StatusTanggapan; tunda_kali: number; sisa_tunda: number; ingat_at: string | null; jatuh_tempo: boolean | null;
  oleh: number | null; oleh_nama: string | null; oleh_saya: boolean | null; alasan: string | null; ada_kurang: boolean;
  sudah_usulan: boolean; masih_buka: boolean; wajib: boolean;
};

export const HALAMAN_TANGGAPAN = "/sigap/revisi/tanggapan";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const HARI_PENUH = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

const dua = (n: number): string => String(n).padStart(2, "0");

/** Tanggal WIB (YYYY-MM-DD) dari satu saat. */
export function tglWib(d: Date): string {
  const w = new Date(d.getTime() + WIB_MS);
  return `${w.getUTCFullYear()}-${dua(w.getUTCMonth() + 1)}-${dua(w.getUTCDate())}`;
}
/** Nomor hari WIB (0 = Minggu). */
export const hariWib = (d: Date): number => new Date(d.getTime() + WIB_MS).getUTCDay();

/** Menambah n hari pada tanggal YYYY-MM-DD (kalender, bukan jam). */
export function tambahHari(tgl: string, n: number): string {
  const [y, m, d] = tgl.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${dua(x.getUTCMonth() + 1)}-${dua(x.getUTCDate())}`;
}
const hariDariTgl = (tgl: string): number => { const [y, m, d] = tgl.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

/** ISO dengan zona WIB: "2026-11-09T08:00:00+07:00". */
export const isoWib = (tgl: string, jam: string): string => `${tgl}T${jam}:00+07:00`;

/** Awal hari sesudah tanggal tutup, WIB: batas keras (waktu pengingat harus lebih awal dari ini). */
export const akhirTutupMs = (tutup: string): number => new Date(isoWib(tambahHari(tutup, 1), "00:00")).getTime();

/** "Sen, 9 Nov 08.00 WIB". */
export function labelWaktu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const w = new Date(d.getTime() + WIB_MS);
  return `${HARI[w.getUTCDay()]}, ${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} ${dua(w.getUTCHours())}.${dua(w.getUTCMinutes())} WIB`;
}
/** "Kamis, 12 Nov 2026" dari YYYY-MM-DD. */
export function labelTanggal(tgl: string): string {
  const [y, m, d] = tgl.split("-").map(Number);
  if (!y || !m || !d) return tgl;
  return `${HARI_PENUH[hariDariTgl(tgl)]}, ${d} ${BULAN[m - 1]} ${y}`;
}

export type Pintasan = { kunci: "besok" | "kerja" | "jumat"; label: string; iso: string };

/**
 * Pintasan waktu "Ingatkan saya": besok pagi 08.00, hari kerja berikutnya 14.00, dan Jumat berikutnya 14.00. Hanya yang masih sebelum penutupan
 * siklus dan paling cepat MENIT_TERDEKAT menit dari sekarang; pintasan yang jatuh pada saat yang sama dipakai sekali.
 */
export function pintasanWaktu(sekarang: Date, tutup: string): Pintasan[] {
  const hariIni = tglWib(sekarang);
  const batas = akhirTutupMs(tutup);
  const paling = sekarang.getTime() + MENIT_TERDEKAT * 60_000;
  let kerja = tambahHari(hariIni, 1);
  while (hariDariTgl(kerja) === 0 || hariDariTgl(kerja) === 6) kerja = tambahHari(kerja, 1);
  let jumat = tambahHari(hariIni, 1);
  while (hariDariTgl(jumat) !== 5) jumat = tambahHari(jumat, 1);
  const kandidat: Pintasan[] = [
    { kunci: "besok", label: "Besok pagi", iso: isoWib(tambahHari(hariIni, 1), "08:00") },
    { kunci: "kerja", label: "Hari kerja berikutnya, siang", iso: isoWib(kerja, "14:00") },
    { kunci: "jumat", label: "Jumat berikutnya, siang", iso: isoWib(jumat, "14:00") },
  ];
  const lihat = new Set<string>();
  return kandidat.filter((p) => {
    const t = new Date(p.iso).getTime();
    if (t < paling || t >= batas || lihat.has(p.iso)) return false;
    lihat.add(p.iso);
    return true;
  });
}

export type HasilWaktu = { ok: true; iso: string; peringatan: string | null } | { ok: false; pesan: string };

/** Peringatan bila waktu pengingat kurang dari 24 jam sebelum siklus ditutup. */
export function peringatanDekatTutup(waktuMs: number, tutup: string): string | null {
  return waktuMs > akhirTutupMs(tutup) - 24 * 3_600_000
    ? `Waktu ini kurang dari 24 jam sebelum siklus ditutup (${labelTanggal(tutup)}). Sisakan waktu untuk persetujuan ketua tim dan PPK.`
    : null;
}

/** Memeriksa tanggal dan jam bebas (isian date dan time, dibaca sebagai WIB). Mencerminkan aturan server. */
export function periksaWaktuBebas(tgl: string, jam: string, sekarang: Date, tutup: string): HasilWaktu {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(jam)) return { ok: false, pesan: "Isi tanggal dan jam pengingat." };
  const iso = isoWib(tgl, jam);
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { ok: false, pesan: "Tanggal atau jam tidak sah." };
  if (t < sekarang.getTime() + MENIT_TERDEKAT * 60_000) return { ok: false, pesan: `Waktu pengingat paling cepat ${MENIT_TERDEKAT} menit dari sekarang.` };
  if (t >= akhirTutupMs(tutup)) return { ok: false, pesan: `Waktu pengingat melewati penutupan siklus (tutup ${labelTanggal(tutup)}).` };
  return { ok: true, iso, peringatan: peringatanDekatTutup(t, tutup) };
}

/** Pilihan yang masih boleh dipakai pada satu RO. Kosong bila sudah ada usulan atau RO sudah ditanggapi rekan setim. */
export function pilihanTersedia(t: TanggapanSaya): PilihanTanggapan[] {
  if (t.sudah_usulan || !t.masih_buka) return [];
  if ((t.status === "ajukan" || t.status === "tidak") && t.oleh_saya !== true) return [];
  if (t.status === "tidak") return [];
  const p: PilihanTanggapan[] = ["ajukan"];
  if (t.sisa_tunda > 0 && t.tunda_kali < MAKS_TUNDA) p.push("ingat");
  p.push("tidak");
  return p;
}

/** "Tidak mengusulkan" boleh dibuka lagi selama siklus belum ditutup (siapa pun dari ketua tim atau wakil). */
export const bisaBukaLagi = (t: TanggapanSaya): boolean => t.status === "tidak" && t.masih_buka && !t.sudah_usulan;

/** Tautan ke kertas kerja revisi untuk RO ini (per KRO, dengan RO terpilih supaya kartu Isi dari rencana tindakan tampil); RO yang kodenya tak dikenal diarahkan ke daftar revisi. */
export function tautKertas(t: Pick<TanggapanSaya, "jadwal_id" | "ro_kode">): string {
  const kro = kroDariRo(t.ro_kode);
  return kro ? `/sigap/revisi/kertas?jadwal=${t.jadwal_id}&kro=${kro}&ro=${encodeURIComponent(t.ro_kode)}` : "/sigap/revisi";
}

export type KeadaanRo = { teks: string; warna: "hijau" | "kuning" | "merah" | "biru" | "abu" };

/** Keadaan RO untuk chip. */
export function keadaanRo(t: TanggapanSaya): KeadaanRo {
  if (t.sudah_usulan) return { teks: "Usulan sudah diajukan", warna: "hijau" };
  if (!t.masih_buka) return { teks: "Siklus sudah ditutup", warna: "abu" };
  if (t.status === "ajukan") return { teks: t.oleh_saya === true ? "Anda memilih mengajukan" : `Diajukan oleh ${t.oleh_nama ?? "rekan tim"}`, warna: "biru" };
  if (t.status === "tidak") return { teks: t.oleh_saya === true ? "Anda memilih tidak mengusulkan" : `Tidak mengusulkan (${t.oleh_nama ?? "rekan tim"})`, warna: "abu" };
  if (t.status === "ingat") {
    if (t.jatuh_tempo === true) return { teks: "Saatnya menanggapi", warna: "merah" };
    return { teks: t.ingat_at ? `Diingatkan ${labelWaktu(t.ingat_at)}` : "Diingatkan", warna: "kuning" };
  }
  return { teks: "Belum ditanggapi", warna: "merah" };
}

/** Keterangan sisa penundaan. */
export function teksSisaTunda(t: Pick<TanggapanSaya, "sisa_tunda">): string {
  return t.sisa_tunda > 0 ? `Dapat ditunda ${t.sisa_tunda} kali lagi.` : "Penundaan sudah dipakai habis; pilih Ajukan sekarang atau Tidak mengusulkan.";
}

/** Daftar yang wajib ditanggapi sekarang (dasar modal pemblokir). */
export const yangWajib = (daftar: readonly TanggapanSaya[]): TanggapanSaya[] => daftar.filter((x) => x.wajib);

/** Mengelompokkan per jadwal (urutan tutup lalu RO sudah dari server). */
export function perJadwal(daftar: readonly TanggapanSaya[]): { jadwal_id: number; judul: string; tutup: string; baris: TanggapanSaya[] }[] {
  const peta = new Map<number, { jadwal_id: number; judul: string; tutup: string; baris: TanggapanSaya[] }>();
  for (const x of daftar) {
    const g = peta.get(x.jadwal_id) ?? { jadwal_id: x.jadwal_id, judul: x.judul, tutup: x.tutup, baris: [] };
    g.baris.push(x);
    peta.set(x.jadwal_id, g);
  }
  return [...peta.values()];
}

/** Kalimat konfirmasi sesudah aksi berhasil. */
export function kabarAksi(pilihan: PilihanTanggapan | "buka", ro: string, data: { ingat_at?: string | null; peringatan?: string | null; ada_kurang?: boolean } | null): string {
  if (pilihan === "ajukan") return `RO ${ro}: Anda mengajukan sekarang. Lanjutkan di kertas kerja revisi.`;
  if (pilihan === "buka") return `RO ${ro}: dibuka kembali. Silakan pilih tanggapan.`;
  if (pilihan === "tidak") return `RO ${ro}: tercatat tidak mengusulkan revisi pada siklus ini.${data?.ada_kurang ? " Catatan: RO ini punya rencana tindakan Tambal atau Minta tambahan pagu yang belum terdanai." : ""}`;
  return `RO ${ro}: Anda akan diingatkan ${data?.ingat_at ? labelWaktu(data.ingat_at) : "pada waktu yang dipilih"}; butir pengingat dibuat di Delego.${data?.peringatan ? ` ${data.peringatan}` : ""}`;
}
