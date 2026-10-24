// lib/keu/lampiran.ts
//
// (25 Okt 2026, tahap 19) Papan 4 mockup: "Lampiran per jenis revisi, tenggat, dan draf surat". Tanpa React/DB.
//  - Tenggat Pasal 175: tanggal batas dari master waktu (keu_master_waktu), dimajukan ke hari kerja terakhir (ayat 18), sisa hari kerja
//    dari "hari acuan", warna aman / mendekati (<= 10 hari kerja) / mendesak (<= 3) / lewat. Pengingat saja, tidak mengunci apa pun.
//  - Lampiran per jenis revisi: master keu_master_lampiran (12 lampiran) + catatan per kertas kerja keu_kk_lampiran (belum | ada).
//  - Draf isi surat usulan, disusun dari baris kertas kerja jadwal dan lampiran. Draf, bukan dokumen resmi.

export type JenisRevisi = "pok" | "administrasi" | "dipa_djpb" | "dipa_dja";
export const URUTAN_JENIS: JenisRevisi[] = ["pok", "administrasi", "dipa_djpb", "dipa_dja"];
export const NAMA_JENIS: Record<JenisRevisi, string> = {
  pok: "Revisi POK", administrasi: "Revisi Administrasi", dipa_djpb: "Revisi DIPA jalur DJPb", dipa_dja: "Revisi DIPA jalur DJA",
};
export const JENIS_SURAT: Record<JenisRevisi, string> = {
  pok: "Revisi POK", administrasi: "Revisi Administrasi", dipa_djpb: "Revisi DIPA jalur DJPb (Kanwil)", dipa_dja: "Revisi DIPA jalur DJA",
};
export const ayatTenggat: Record<JenisRevisi, string> = {
  pok: "Pasal 175 ayat 14 (batas lunak, KPA memutuskan sendiri)", administrasi: "Pasal 175 ayat 14", dipa_djpb: "Pasal 175 ayat 1b dan 1c", dipa_dja: "Pasal 175 ayat 1a",
};
/** Kode baris keu_master_waktu yang memuat tanggal batas tiap jenis. POK dan Administrasi berbagi satu tenggat. */
export const KODE_WAKTU: Record<JenisRevisi, string> = { pok: "tenggat_pok", administrasi: "tenggat_pok", dipa_djpb: "tenggat_dipa_djpb", dipa_dja: "tenggat_dipa_dja" };

export const adalahJenis = (v: unknown): v is JenisRevisi => typeof v === "string" && (URUTAN_JENIS as string[]).includes(v);

// ---------------------------------------------------------------- hari kerja
/** Libur nasional dan cuti bersama yang diketahui (Okt-Des 2026). Tetap konstanta di sini; bila tahun berganti, hanya Sabtu dan Minggu yang dihitung sampai daftar diperbarui. */
export const LIBUR: Readonly<Record<string, string>> = { "2026-12-24": "Cuti bersama Natal", "2026-12-25": "Natal (libur nasional)" };

const utc = (iso: string): Date => { const p = iso.split("-"); return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))); };
const isoDari = (d: Date): string => d.toISOString().slice(0, 10);
const tanggalSah = (iso: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && isoDari(utc(iso)) === iso;

export function hariKerja(iso: string): boolean {
  const w = utc(iso).getUTCDay();
  return w !== 0 && w !== 6 && !LIBUR[iso];
}
/** Batas yang jatuh pada akhir pekan atau libur dimajukan ke hari kerja terakhir sebelumnya (ayat 18). */
export function efektif(iso: string): string {
  let d = utc(iso);
  for (let i = 0; i < 15 && !hariKerja(isoDari(d)); i++) d = new Date(d.getTime() - 86400000);
  return isoDari(d);
}
/** Hari kerja setelah `dari` sampai dengan `ke` (hari `dari` tidak dihitung). Negatif (-1) bila `ke` lebih awal dari `dari`. */
export function sisaHariKerja(dari: string, ke: string): number {
  if (ke < dari) return -1;
  let n = 0;
  let d = utc(dari);
  const tujuan = utc(ke);
  while (d < tujuan) { d = new Date(d.getTime() + 86400000); if (hariKerja(isoDari(d))) n++; }
  return n;
}

export type WarnaTenggat = "aman" | "kuning" | "merah" | "lewat";
export const LABEL_TENGGAT: Record<WarnaTenggat, string> = { aman: "Aman", kuning: "Mendekati", merah: "Mendesak", lewat: "Lewat" };
export const CHIP_TENGGAT: Record<WarnaTenggat, "hijau" | "kuning" | "merah" | "abu"> = { aman: "hijau", kuning: "kuning", merah: "merah", lewat: "abu" };

export type InfoTenggat = {
  jenis: JenisRevisi; batas: string; efektif: string; sisa: number; warna: WarnaTenggat; lunak: boolean; ayat: string; catatan: string; ada: boolean;
};
/** `batas` = tanggal dari master waktu (null bila belum diisi). */
export function hitungTenggat(jenis: JenisRevisi, batas: string | null | undefined, hari: string): InfoTenggat {
  const ayat = ayatTenggat[jenis];
  if (!batas || !tanggalSah(batas) || !tanggalSah(hari)) return { jenis, batas: batas ?? "", efektif: "", sisa: 0, warna: "aman", lunak: jenis === "pok", ayat, catatan: "Tanggal batas belum diisi pada master waktu.", ada: false };
  const ef = efektif(batas);
  const sisa = sisaHariKerja(hari, ef);
  const warna: WarnaTenggat = sisa < 0 ? "lewat" : sisa <= 3 ? "merah" : sisa <= 10 ? "kuning" : "aman";
  const bagian: string[] = [];
  if (ef !== batas) bagian.push(`Batas ${batas} jatuh pada hari libur, dimajukan ke hari kerja terakhir sebelumnya (ayat 18).`);
  if (warna === "lewat") bagian.push("Lewat batas: hanya dapat diproses atas persetujuan Menteri Keuangan untuk direktif Presiden atau prioritas mendesak (Pasal 179). Tidak ada yang dikunci.");
  return { jenis, batas, efektif: ef, sisa, warna, lunak: jenis === "pok", ayat, catatan: bagian.join(" "), ada: true };
}

/** Hari acuan pilihan cepat untuk tahun anggaran tertentu. */
export function hariAcuanCepat(tahun: number): { iso: string; nama: string }[] {
  const t = (m: number, d: number, nama: string) => ({ iso: `${tahun}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, nama });
  return [t(10, 27, "27 Okt"), t(11, 25, "25 Nov"), t(12, 21, "21 Des"), t(12, 28, "28 Des")];
}

// ---------------------------------------------------------------- lampiran
export type MasterLampiran = {
  kode: string; urut: number; uraian: string; dasar: string; pok: string; administrasi: string; dipa_djpb: string; dipa_dja: string; aktif: boolean;
};
export type CatatanLampiran = { jadwal_id: number | string; kode: string; status: string; nomor: string; tanggal: string | null; catatan: string };
export type SifatLampiran = "wajib" | "kondisional" | "tidak";
export type BarisLampiran = {
  kode: string; uraian: string; ket: string; sifat: SifatLampiran; dasar: string; ada: boolean; bisa: boolean; nomor: string; tanggal: string | null; catatan: string;
};
export const LABEL_SIFAT: Record<SifatLampiran, string> = { wajib: "Wajib", kondisional: "Bila berlaku", tidak: "Tidak diperlukan" };
export const CHIP_SIFAT: Record<SifatLampiran, "merah" | "kuning" | "abu"> = { wajib: "merah", kondisional: "kuning", tidak: "abu" };

/** Teks ketentuan diawali "Ya" = wajib, "Tidak" = tidak diperlukan, selain itu = bila berlaku. */
export function sifatDari(teks: string): SifatLampiran {
  const t = (teks ?? "").trim();
  if (/^Ya\b/i.test(t)) return "wajib";
  if (/^Tidak\b/i.test(t)) return "tidak";
  return "kondisional";
}

export function lampiranUntuk(master: MasterLampiran[], catatan: CatatanLampiran[], jenis: JenisRevisi): BarisLampiran[] {
  const c = new Map(catatan.map((x) => [x.kode, x]));
  return [...master].filter((m) => m.aktif).sort((a, b) => a.urut - b.urut || a.kode.localeCompare(b.kode)).map((m) => {
    const ket = m[jenis];
    const sifat = sifatDari(ket);
    const s = c.get(m.kode);
    return { kode: m.kode, uraian: m.uraian, ket, sifat, dasar: m.dasar, ada: s?.status === "ada", bisa: sifat !== "tidak", nomor: s?.nomor ?? "", tanggal: s?.tanggal ?? null, catatan: s?.catatan ?? "" };
  });
}

export type RekapLampiran = { kurang: string[]; warna: "kuning" | "hijau"; teks: string };
export function rekapLampiran(baris: BarisLampiran[]): RekapLampiran {
  const kurang = baris.filter((l) => l.sifat === "wajib" && !l.ada).map((l) => l.kode);
  return kurang.length
    ? { kurang, warna: "kuning", teks: `${kurang.length} lampiran wajib belum ada: ${kurang.join(", ")}` }
    : { kurang, warna: "hijau", teks: "Semua lampiran wajib sudah tercatat" };
}

export type ArgsLampiran = { p_jadwal: number; p_kode: string; p_status: "ada" | "belum"; p_nomor: string; p_tanggal: string | null; p_catatan: string };
export function argsLampiran(jadwalId: number, kode: string, ada: boolean, nomor = "", tanggal: string | null = null, catatan = ""): ArgsLampiran {
  return { p_jadwal: jadwalId, p_kode: kode, p_status: ada ? "ada" : "belum", p_nomor: nomor.trim().slice(0, 120), p_tanggal: tanggal && tanggalSah(tanggal) ? tanggal : null, p_catatan: catatan.trim().slice(0, 300) };
}

// ---------------------------------------------------------------- draf surat
export type BarisSurat = { ro_kode: string; jumlah_semula: number | string | null; jumlah_menjadi: number | string | null; baru?: boolean | null };
const n = (v: number | string | null | undefined): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const fmt = (v: number) => Math.round(v).toLocaleString("id-ID");
const selTeks = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${fmt(Math.abs(v))}`);

export type RingkasSurat = { nBaris: number; nRo: number; kro: string[]; semula: number; menjadi: number; selisih: number };
/** `kro` = kode KRO lengkap (mis. 2903.BMA) bila surat dibatasi satu KRO; null = seluruh baris yang dimuat. */
export function ringkasSurat(baris: BarisSurat[], kro: string | null): RingkasSurat {
  const kroDari = (ro: string) => (/^\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}$/.test(ro) ? ro.slice(0, 8) : ro);
  const pakai = kro ? baris.filter((b) => kroDari(b.ro_kode) === kro) : baris;
  const semula = pakai.reduce((t, b) => t + n(b.jumlah_semula), 0);
  const menjadi = pakai.reduce((t, b) => t + n(b.jumlah_menjadi), 0);
  const berubah = pakai.filter((b) => n(b.jumlah_semula) !== n(b.jumlah_menjadi) || !!b.baru);
  return {
    nBaris: berubah.length, nRo: new Set(berubah.map((b) => b.ro_kode)).size, kro: [...new Set(berubah.map((b) => kroDari(b.ro_kode)))].sort(), semula, menjadi, selisih: menjadi - semula,
  };
}

export function susunSurat(jenis: JenisRevisi, r: RingkasSurat, lampiran: BarisLampiran[], cakupan: string): string {
  const kepada: Record<JenisRevisi, string> = {
    pok: "Keputusan KPA (Revisi POK tidak memerlukan surat usulan ke luar satker)",
    administrasi: "Yth. Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan [nama Kanwil]",
    dipa_djpb: "Yth. Kepala Kantor Wilayah Direktorat Jenderal Perbendaharaan [nama Kanwil]",
    dipa_dja: "Yth. [Pejabat Eselon I] untuk diteruskan kepada Direktur Jenderal Anggaran",
  };
  const daftar = lampiran.filter((l) => l.sifat === "wajib" || (l.sifat === "kondisional" && l.ada))
    .map((l, i) => `${i + 1}. ${l.uraian}${l.ada ? (l.nomor ? ` (terlampir, ${l.nomor})` : " (terlampir)") : " (belum ada)"}`).join("\n");
  const kroTeks = r.kro.length ? r.kro.join(", ") : "[belum ada KRO yang berubah]";
  return [
    "Nomor   : [Nomor surat]", "Tanggal : [Tanggal surat]", `Hal     : Usulan ${JENIS_SURAT[jenis]} TA [tahun anggaran]`, "",
    kepada[jenis], "",
    `Bersama ini Kuasa Pengguna Anggaran BPS Kabupaten Solok mengajukan ${JENIS_SURAT[jenis]} pada KRO ${kroTeks}.`, "",
    `Perubahan meliputi ${r.nBaris} baris detail pada ${r.nRo} RO (${cakupan}). Pagu pada baris tersebut sebelum revisi Rp ${fmt(r.semula)}, sesudah revisi Rp ${fmt(r.menjadi)}, selisih Rp ${selTeks(r.selisih)}. Rincian terdapat pada matriks semula menjadi terlampir.`, "",
    "RAB menjadi dasar kebutuhan dan tidak diubah oleh revisi ini.", "",
    "Lampiran:", daftar || "[belum ada lampiran yang tercatat]", "",
    "Demikian disampaikan, mohon penelaahan dan penetapan sesuai ketentuan.", "", "Kuasa Pengguna Anggaran,", "[Nama dan NIP]",
  ].join("\n");
}
