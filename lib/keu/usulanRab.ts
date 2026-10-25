// lib/keu/usulanRab.ts
//
// (26 Okt 2026, tahap 33) Sambungan identifikasi -> RAB. Berkas ini MURNI (tanpa React/DB): mengubah rincian kebutuhan biaya identifikasi
// (`rincianBiaya`, lanjutan.ts) menjadi USULAN baris RAB yang dapat diperiksa, dilengkapi, lalu disalin pengguna ke RAB draf.
//
// Prinsip (keputusan pengguna, 26 Okt 2026):
//   - Usulan hanya saran. Tidak ada yang tertulis ke RAB kecuali lewat tombol salin, dan hanya ke RAB draf atau dikembalikan.
//   - Volume dan satuan datang dari identifikasi. Tarif lembar kebijakan adalah BATAS TERTINGGI, bukan aturan tunggal: harga satuan yang lebih rendah
//     boleh (mis. batas translok 170, survei memakai 160), yang lebih tinggi diberi peringatan (tidak memblokir). Bila tarif belum ada, pengguna
//     mengisi sendiri (baris RAB wajib volume dan harga lebih dari nol, jadi baris tanpa harga tidak dapat disalin).
//   - Jadwal cair: paling lambat H+5 sesudah hari terakhir pelaksanaan (mis. selesai tgl 10 -> dijadwalkan sekitar tgl 8-15). Saran awal: bulan dan
//     minggu yang memuat hari terakhir pelaksanaan (kelas bagi baris pelatihan, pendataan bagi lainnya); dapat diubah, dan minggu yang pasti jatuh
//     sesudah H+5 diberi peringatan. Aturan jendela ini dari penjelasan pengguna, belum dari lembar kebijakan (cek aturan).
//   - Baris RAB yang sudah ada TIDAK ditimpa; usulan yang sudah pernah disalin ditandai dan tidak ditawarkan lagi.
//   - Usulan dipasangkan ke item POK RO yang akunnya sama (enam angka). Bila ada lebih dari satu kandidat, pengguna memilih.

import type { ItemAnggaran } from "./ro";
import { bacaRupiah } from "./kekurangan";
import { barisKosong, bacaVolume, type IsianBaris, type PemetaanItem } from "./rab";
import type { BarisRincian, IsiLanjutan } from "./lanjutan";

export const MINGGU_BAWAAN = 3;
const MAKS_KET = 200;

export type UsulanBaris = {
  /** Kunci stabil (akun + uraian); dipakai untuk menandai usulan yang sudah disalin dan sebagai key React. */
  kunci: string;
  kelompok: BarisRincian["kelompok"];
  akun: string;
  uraian: string;
  /** Isian awal formulir (semua dapat diubah pengguna). */
  volume: string;
  satuan: string;
  harga: string;
  bulan: number;
  minggu: number;
  /** Hari terakhir pelaksanaan yang menjadi acuan jadwal cair, dan batas paling lambat pencairan (H+5); null bila tanggal belum ada. */
  selesai: string | null;
  lambat: string | null;
  /** Batas tertinggi harga menurut lembar kebijakan (null bila belum ada tarif). Harga lebih rendah boleh. */
  batasHarga: number | null;
  perk: boolean;
  /** Catatan dari identifikasi (mengapa tarif atau jumlah belum ada). */
  catatan: string;
  /** Asal harga awal: "kebijakan" (diisi dari batas tertinggi, boleh diturunkan) atau "manual" (tarif belum ada). */
  asalHarga: "kebijakan" | "manual";
};

const TGL = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-03-14" -> 3; selain itu null. */
export function bulanDari(tgl: string | null | undefined): number | null {
  const m = TGL.exec(tgl ?? "");
  if (!m) return null;
  const b = Number(m[2]);
  return b >= 1 && b <= 12 ? b : null;
}

/** Menambah hari pada tanggal "YYYY-MM-DD" tanpa pengaruh zona waktu; tanggal tidak sah -> null. */
export function tambahHariTgl(tgl: string, n: number): string | null {
  const m = TGL.exec(tgl);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Batas hari antara pelaksanaan terakhir dan pencairan (penjelasan pengguna: paling lambat H+5; cek aturan). */
export const HARI_CAIR_MAKS = 5;

/** Minggu pencairan menurut tanggal: 1-7 -> 1, 8-14 -> 2, 15-21 -> 3, 22 dan seterusnya -> 4. */
export function mingguDari(tgl: string): number | null {
  const m = TGL.exec(tgl);
  if (!m) return null;
  return Math.min(4, Math.floor((Number(m[3]) - 1) / 7) + 1);
}

/** Tanggal pertama minggu pencairan pada bulan tertentu ("YYYY-MM-01" untuk minggu 1, "-08" untuk 2, "-15" untuk 3, "-22" untuk 4). */
export function awalMinggu(tahun: number, bulan: number, minggu: number): string {
  return `${String(tahun).padStart(4, "0")}-${String(bulan).padStart(2, "0")}-${String((minggu - 1) * 7 + 1).padStart(2, "0")}`;
}

/**
 * Hari terakhir pelaksanaan yang menjadi acuan jadwal cair satu baris rincian. Baris yang uraiannya diawali nama kelas ("Kelas A: ...") memakai
 * tanggal selesai kelas itu; baris pelatihan lain memakai kelas paling akhir; selain itu memakai akhir pendataan paling akhir. Kosong bila belum ada tanggal.
 */
export function acuanSelesai(b: Pick<BarisRincian, "kelompok" | "uraian">, isi: IsiLanjutan, pendataan: { selesai: string }[]): string | null {
  const sah = (t: string) => (TGL.test(t) ? t : null);
  const terakhir = (a: (string | null)[]): string | null => { const x = a.filter((t): t is string => t !== null).sort(); return x.length ? x[x.length - 1] : null; };
  const kelas = isi.kelas.find((k) => b.uraian.startsWith(`${k.nama || (k.sesi === "briefing" ? "Briefing" : "Pelatihan")}:`));
  const selesaiKelas = kelas ? sah(kelas.selesai) : null;
  if (selesaiKelas) return selesaiKelas;
  if (b.kelompok === "Pelatihan") { const t = terakhir(isi.kelas.map((k) => sah(k.selesai))); if (t) return t; }
  return terakhir(pendataan.map((p) => sah(p.selesai))) ?? terakhir(isi.kelas.map((k) => sah(k.selesai)));
}

/** Saran jadwal cair dari hari terakhir pelaksanaan: bulan dan minggu yang memuat hari itu, serta batas paling lambat (H+5). */
export function saranCair(selesai: string | null, cadangan: { bulan: number }): { bulan: number; minggu: number; lambat: string | null } {
  if (!selesai) return { bulan: cadangan.bulan, minggu: MINGGU_BAWAAN, lambat: null };
  return { bulan: bulanDari(selesai) ?? cadangan.bulan, minggu: mingguDari(selesai) ?? MINGGU_BAWAAN, lambat: tambahHariTgl(selesai, HARI_CAIR_MAKS) };
}

/**
 * Peringatan jadwal cair (tidak memblokir). Hanya menandai yang pasti terlambat: minggu yang hari pertamanya sudah sesudah batas H+5.
 * `tahun` = tahun batas lambat bila diketahui; bulan lebih awal dari bulan pelaksanaan tidak diperiksa (pencairan di muka diperbolehkan).
 */
export function periksaCair(lambat: string | null, bulan: number, minggu: number): string | null {
  const m = lambat ? TGL.exec(lambat) : null;
  if (!lambat || !m) return null;
  const awal = awalMinggu(Number(m[1]), bulan, minggu);
  if (awal > lambat) return `Jadwal cair sesudah batas H+${HARI_CAIR_MAKS} dari hari terakhir pelaksanaan (paling lambat ${lambat}). Pilih minggu yang lebih awal.`;
  return null;
}

/** Peringatan harga: tarif kebijakan adalah batas tertinggi; harga di bawahnya boleh, di atasnya diberi peringatan (tidak memblokir). */
export function periksaHarga(harga: string, batas: number | null): string | null {
  const h = bacaRupiah(harga);
  if (h === null || batas === null || batas <= 0) return null;
  return h > batas ? `Harga melebihi batas tertinggi kebijakan (Rp ${Math.round(batas).toLocaleString("id-ID")}).` : null;
}

/** Satuan baris RAB maksimal 20 huruf: buang keterangan dalam kurung ("orang (jumlah hari menyusul)" -> "orang"). */
export function satuanRab(s: string): string {
  const t = s.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return (t || "paket").slice(0, 20);
}

/** Volume dari identifikasi sebagai teks isian ("12,5"); null atau tidak sah -> kosong supaya pengguna mengisi. */
export function teksVolume(v: number | null): string {
  if (v === null || !Number.isFinite(v) || v <= 0) return "";
  const t = (Math.round(v * 100) / 100).toString().replace(".", ",");
  return bacaVolume(t) === null ? "" : t;
}

/** Harga dari tarif lembar kebijakan sebagai teks bilangan bulat; kosong bila tarif belum ada. */
export function teksHarga(t: number | null): string {
  if (t === null || !Number.isFinite(t) || t <= 0) return "";
  const r = String(Math.round(t));
  return bacaRupiah(r) === null ? "" : r;
}

/** Rincian identifikasi -> usulan baris RAB. Urutan sama dengan rincian. `pendataan` = jadwal efektif per periode (sudah memuat pembaruan H-15). */
export function usulanDari(rincian: BarisRincian[], isi: IsiLanjutan, pendataan: { mulai: string; selesai: string }[], bulanCadangan: number): UsulanBaris[] {
  const dipakai = new Map<string, number>();
  return rincian.map((b) => {
    const dasar = `${b.akun}|${b.uraian}`;
    const n = (dipakai.get(dasar) ?? 0) + 1;
    dipakai.set(dasar, n);
    const harga = teksHarga(b.tarif);
    const selesai = acuanSelesai(b, isi, pendataan);
    const cair = saranCair(selesai, { bulan: bulanCadangan });
    return {
      kunci: n === 1 ? dasar : `${dasar}#${n}`,
      kelompok: b.kelompok, akun: b.akun, uraian: b.uraian,
      volume: teksVolume(b.volume), satuan: satuanRab(b.satuan), harga,
      bulan: cair.bulan, minggu: cair.minggu, selesai, lambat: cair.lambat,
      batasHarga: harga ? b.tarif : null,
      perk: b.perk, catatan: b.catatan, asalHarga: harga ? "kebijakan" : "manual",
    };
  });
}

/** Keterangan baris RAB yang ditulis saat menyalin; selalu diawali uraian usulan (dipakai untuk mengenali usulan yang sudah disalin). */
export function keteranganSalinan(u: Pick<UsulanBaris, "uraian">, sumber: string): string {
  const akhir = ` · ${sumber}`;
  return u.uraian.slice(0, Math.max(0, MAKS_KET - akhir.length)) + akhir;
}

/** Isian formulir baris RAB dari usulan (periode "sekali"). */
export function isianDari(u: UsulanBaris, sumber: string): IsianBaris {
  return { ...barisKosong(u.satuan, u.bulan), ket: keteranganSalinan(u, sumber), volume: u.volume, harga: u.harga, minggu: u.minggu };
}

/** Akun enam angka: "524113" cocok dengan "524113" maupun "524113.xxx". */
const akun6 = (a: string): string => a.slice(0, 6);

/** Item POK RO yang dapat menampung usulan: akun sama, belum "Selesai", dan bukan "RAB = Item" (rincian tambahan akan menggandakan jumlah). */
export function kandidatItem(akun: string, peta: PemetaanItem[]): { bisa: PemetaanItem[]; sama: PemetaanItem[] } {
  const cocok = peta.filter((p) => akun6(p.pok.akun) === akun6(akun) && p.status !== "selesai");
  return { bisa: cocok.filter((p) => p.status !== "sama"), sama: cocok.filter((p) => p.status === "sama") };
}

/** Usulan sudah disalin bila ada baris RAB (pada item mana pun) yang keterangannya diawali uraian usulan dan akun itemnya sama. */
export function sudahDisalin(u: Pick<UsulanBaris, "uraian" | "akun">, peta: PemetaanItem[]): boolean {
  const awalan = u.uraian.slice(0, 120);
  return peta.some((p) => akun6(p.pok.akun) === akun6(u.akun) && p.baris.some((b) => b.ket.startsWith(awalan)));
}

export type RingkasUsulan = { jumlah: number; sudah: number; siap: number; butuhHarga: number; tanpaItem: number; total: number };

/** Ringkasan kartu: berapa usulan, berapa sudah disalin, berapa siap disalin, berapa menunggu harga, berapa tanpa item POK. */
export function ringkasUsulan(daftar: UsulanBaris[], peta: PemetaanItem[]): RingkasUsulan {
  let sudah = 0; let siap = 0; let butuhHarga = 0; let tanpaItem = 0; let total = 0;
  for (const u of daftar) {
    if (sudahDisalin(u, peta)) { sudah += 1; continue; }
    if (kandidatItem(u.akun, peta).bisa.length === 0) { tanpaItem += 1; continue; }
    if (u.harga === "") { butuhHarga += 1; continue; }
    siap += 1;
    const v = bacaVolume(u.volume); const h = bacaRupiah(u.harga);
    if (v !== null && h !== null) total += Math.round(v * h);
  }
  return { jumlah: daftar.length, sudah, siap, butuhHarga, tanpaItem, total };
}

/** Item POK untuk ditampilkan sebagai pilihan: "nomor. uraian (Akun, pagu)". */
export const namaItem = (i: Pick<ItemAnggaran, "nomor_item" | "uraian">): string => `${i.nomor_item ? `${i.nomor_item}. ` : ""}${i.uraian}`;

/** Label sumber usulan: dari lanjutan versi n (Final/Draf) atau dari identifikasi awal. */
export function labelSumber(o: { lanjutanAda: boolean; lanjutanVer: number | null; lanjutanStatus: string | null }): { panjang: string; pendek: string } {
  if (o.lanjutanAda && o.lanjutanVer !== null) {
    const st = o.lanjutanStatus === "final" ? "Final" : "Draf";
    return { panjang: `Identifikasi lanjutan versi ${o.lanjutanVer} (${st})`, pendek: `identifikasi lanjutan v${o.lanjutanVer}` };
  }
  return { panjang: "Identifikasi awal (belum ada lanjutan)", pendek: "identifikasi awal" };
}
