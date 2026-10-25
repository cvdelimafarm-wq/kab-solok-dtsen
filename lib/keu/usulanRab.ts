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

import { NAMA_AKUN } from "./identifikasi";
import type { ItemAnggaran } from "./ro";
import { bacaRupiah } from "./kekurangan";
import { barisKosong, bacaVolume, type IsianBaris, type PemetaanItem } from "./rab";
import type { BarisRincian, IsiLanjutan } from "./lanjutan";
import type { IsiKebijakan } from "./kebijakan";

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
  /** Hari terakhir pelaksanaan yang menjadi acuan jadwal cair, dan batas paling lambat pencairan (H+hariCair); null bila tanggal belum ada atau tanpa batas. */
  selesai: string | null;
  lambat: string | null;
  /** Jendela pencairan yang dipakai (hari setelah hari terakhir pelaksanaan); null = tanpa batas. */
  hariCair: number | null;
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

/** Batas hari bawaan antara pelaksanaan terakhir dan pencairan bila lembar kebijakan belum memuatnya (penjelasan pengguna: paling lambat H+5; cek aturan). */
export const HARI_CAIR_BAWAAN = 5;
export const HARI_CAIR_MAKS = HARI_CAIR_BAWAAN;

export type JendelaCair = { hari: number | null; dariLembar: boolean };

/**
 * Jendela pencairan dari lembar kebijakan berlaku (parameter hari_cair_maks, nilai KEBIJAKAN). Tanpa lembar atau tanpa parameter (lembar lama) -> bawaan H+5.
 * Nilai kosong pada lembar = tanpa batas (hari null). Nilai yang bukan bilangan bulat 0..60 diabaikan (bawaan).
 */
export function jendelaCair(lembar: Pick<IsiKebijakan, "param"> | null | undefined): JendelaCair {
  const bawaan: JendelaCair = { hari: HARI_CAIR_BAWAAN, dariLembar: false };
  const daftar: unknown = lembar?.param;
  if (!Array.isArray(daftar)) return bawaan;
  const x = (daftar as Record<string, unknown>[]).find((p) => p && p.k === "hari_cair_maks");
  if (!x || x.jenis !== "angka") return bawaan;
  if (x.kebijakan === null) return { hari: null, dariLembar: true };
  const n = x.kebijakan;
  if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 60) return { hari: n, dariLembar: true };
  return bawaan;
}

/** Kalimat jendela untuk layar; "(cek aturan)" hanya bila angkanya bawaan, bukan dari lembar kebijakan. */
export function teksJendela(j: JendelaCair): string {
  if (j.hari === null) return "tanpa batas hari (lembar kebijakan)";
  return `paling lambat H+${j.hari}${j.dariLembar ? " (lembar kebijakan)" : " (bawaan, cek aturan)"}`;
}

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

/** Saran jadwal cair dari hari terakhir pelaksanaan: bulan dan minggu yang memuat hari itu, serta batas paling lambat (H+hari; null hari = tanpa batas). */
export function saranCair(selesai: string | null, cadangan: { bulan: number }, hari: number | null = HARI_CAIR_BAWAAN): { bulan: number; minggu: number; lambat: string | null } {
  if (!selesai) return { bulan: cadangan.bulan, minggu: MINGGU_BAWAAN, lambat: null };
  return { bulan: bulanDari(selesai) ?? cadangan.bulan, minggu: mingguDari(selesai) ?? MINGGU_BAWAAN, lambat: hari === null ? null : tambahHariTgl(selesai, hari) };
}

/**
 * Peringatan jadwal cair (tidak memblokir). Hanya menandai yang pasti terlambat: minggu yang hari pertamanya sudah sesudah batas H+5.
 * `tahun` = tahun batas lambat bila diketahui; bulan lebih awal dari bulan pelaksanaan tidak diperiksa (pencairan di muka diperbolehkan).
 */
export function periksaCair(lambat: string | null, bulan: number, minggu: number, hari: number | null = HARI_CAIR_BAWAAN): string | null {
  const m = lambat ? TGL.exec(lambat) : null;
  if (!lambat || !m) return null;
  const awal = awalMinggu(Number(m[1]), bulan, minggu);
  if (awal > lambat) return `Jadwal cair sesudah batas H+${hari ?? HARI_CAIR_BAWAAN} dari hari terakhir pelaksanaan (paling lambat ${lambat}). Pilih minggu yang lebih awal.`;
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
export function usulanDari(rincian: BarisRincian[], isi: IsiLanjutan, pendataan: { mulai: string; selesai: string }[], bulanCadangan: number, hariCair: number | null = HARI_CAIR_BAWAAN): UsulanBaris[] {
  const dipakai = new Map<string, number>();
  return rincian.map((b) => {
    const dasar = `${b.akun}|${b.uraian}`;
    const n = (dipakai.get(dasar) ?? 0) + 1;
    dipakai.set(dasar, n);
    const harga = teksHarga(b.tarif);
    const selesai = acuanSelesai(b, isi, pendataan);
    const cair = saranCair(selesai, { bulan: bulanCadangan }, hariCair);
    return {
      kunci: n === 1 ? dasar : `${dasar}#${n}`,
      kelompok: b.kelompok, akun: b.akun, uraian: b.uraian,
      volume: teksVolume(b.volume), satuan: satuanRab(b.satuan), harga,
      bulan: cair.bulan, minggu: cair.minggu, selesai, lambat: cair.lambat, hariCair,
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

// ---------------------------------------------------------------------------------------------------------------------
// Rencana realisasi dari identifikasi (tahap 33, sambungan kedua)
// ---------------------------------------------------------------------------------------------------------------------
// Penjagaan konsistensi sengaja sederhana (keputusan pengguna, 26 Okt 2026): hanya MENGECEK apakah anggaran akun itu ADA pada POK RO atau BELUM ADA,
// berapa pun nilainya. Tidak membandingkan nominal rencana dengan pagu (urusan RAB dan revisi), dan item "Selesai" tetap dihitung ada.

export type JagaAkun = { akun: string; nama: string; status: "ada" | "belum_ada"; usulan: number; item: string[]; pesan: string };

/** Per akun yang dibutuhkan identifikasi: ada atau belum ada pada POK RO. Urutan menurut kemunculan pertama. */
export function jagaAnggaran(daftar: Pick<UsulanBaris, "akun">[], peta: PemetaanItem[]): JagaAkun[] {
  const urut: string[] = []; const hitung = new Map<string, number>();
  for (const u of daftar) { const k = akun6(u.akun); if (!hitung.has(k)) urut.push(k); hitung.set(k, (hitung.get(k) ?? 0) + 1); }
  return urut.map((k) => {
    const item = peta.filter((p) => akun6(p.pok.akun) === k).map((p) => namaItem(p.pok));
    const ada = item.length > 0;
    return {
      akun: k, nama: NAMA_AKUN[k] ?? "", status: ada ? "ada" : "belum_ada", usulan: hitung.get(k) ?? 0, item,
      pesan: ada ? `Anggaran akun ${k} ada pada POK RO ini.` : `Belum ada anggaran akun ${k} pada POK RO ini. Tambahkan lewat revisi POK, atau ubah kebutuhan di identifikasi.`,
    };
  });
}

export type SelCair = { bulan: number; minggu: number; baris: number; tanpaHarga: number; sudahDisalin: number; jumlah: number };
export type RencanaCair = { sel: SelCair[]; total: number; tanpaHarga: number; sudahDisalin: number; selesaiAkhir: string | null; lambatAkhir: string | null };

/**
 * Perkiraan pencairan dari identifikasi menurut jadwal saran (bulan dan minggu) tiap usulan. Jumlah = volume x harga bila keduanya sah;
 * baris tanpa harga atau volume dihitung terpisah (tidak masuk jumlah). `sudahDisalin` = usulan yang sudah menjadi baris RAB.
 */
export function rencanaBulanan(daftar: UsulanBaris[], peta: PemetaanItem[]): RencanaCair {
  const peta2 = new Map<string, SelCair>();
  let total = 0; let tanpa = 0; let sudah = 0;
  let selesaiAkhir: string | null = null; let lambatAkhir: string | null = null;
  for (const u of daftar) {
    const kunci = `${u.bulan}-${u.minggu}`;
    const sel = peta2.get(kunci) ?? { bulan: u.bulan, minggu: u.minggu, baris: 0, tanpaHarga: 0, sudahDisalin: 0, jumlah: 0 };
    sel.baris += 1;
    const v = bacaVolume(u.volume); const h = bacaRupiah(u.harga);
    if (v !== null && h !== null) { const j = Math.round(v * h); sel.jumlah += j; total += j; } else { sel.tanpaHarga += 1; tanpa += 1; }
    if (sudahDisalin(u, peta)) { sel.sudahDisalin += 1; sudah += 1; }
    peta2.set(kunci, sel);
    if (u.selesai && (selesaiAkhir === null || u.selesai > selesaiAkhir)) selesaiAkhir = u.selesai;
    if (u.lambat && (lambatAkhir === null || u.lambat > lambatAkhir)) lambatAkhir = u.lambat;
  }
  const sel = [...peta2.values()].sort((a, b) => a.bulan - b.bulan || a.minggu - b.minggu);
  return { sel, total, tanpaHarga: tanpa, sudahDisalin: sudah, selesaiAkhir, lambatAkhir };
}
