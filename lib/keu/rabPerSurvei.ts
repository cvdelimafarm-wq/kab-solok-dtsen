// lib/keu/rabPerSurvei.ts
//
// (28 Okt 2026) RAB per survei, tahap 2 (logika murni untuk layar "RAB per survei"; tanpa React/DB). Dari rincian biaya identifikasi (rabSurvei.ts) disusun:
//  - mode pecah atau gabung PER JENIS BELANJA (kelompok rincian);
//  - kolom isian hari dibayar translok/penginapan per periode (batas = hari kerja pendataan);
//  - rencana baris RAB (isian awal = saran identifikasi, boleh diubah) dan jadwal cair otomatis (hari terakhir kegiatan + 1 minggu);
//  - pilihan item tujuan: item POK yang cocok, item baru di RAB yang sudah ada, atau "Item belum ada, tambahkan" (item baru di RAB untuk revisi POK);
//  - pencocokan baris RAB yang sudah ditulis dari identifikasi (penanda ident_id + ident_kunci) dan deteksi saran yang berubah;
//  - data batang "satu item POK diisi beberapa survei" (batangItem.ts), dihitung dengan dasar rupiah supaya satuan yang berbeda tidak membingungkan.
// Basis data tetap yang memutuskan (penjaga tabel RAB); fungsi ini hanya menyiapkan data dan pesan.

import { bacaRupiah } from "./kekurangan";
import type { Libur } from "./hariKerja";
import { NAMA_PERAN, pesertaKelas, type BarisRincian, type IsiLanjutan, type Kelas } from "./lanjutan";
import { sumbanganDariBaris, type KapasitasItem, type Sumbangan } from "./batangItem";
import { jumlahBaris, bacaVolume, barisKosong, dariIdent, dataBarisIdent, diubahDariIdent, type BarisRabRow, type IsianBaris, type ItemRabRow, type PemetaanItem, type PenandaIdent } from "./rab";
import { hariJadwal, rincianSurvei, saranNamaItem, tautkan, type HariBayar, type HasilTautan, type ModePecah, type PeriodeJadwal, type RincianSurvei } from "./rabSurvei";
import { periksaSiap } from "./rabStatus";
import { rupiah } from "./ro";
import { acuanSelesai, GESER_CAIR_HARI, keteranganSalinan, namaItem, saranCair, satuanRab, teksHarga, teksVolume } from "./usulanRab";

const akun6 = (a: string): string => a.slice(0, 6);
const MAKS_URAIAN_ITEM = 200;

// ---------------------------------------------------------------------------------------------------------------------
// Mode pecah/gabung per jenis belanja
// ---------------------------------------------------------------------------------------------------------------------
export type KelompokRincian = BarisRincian["kelompok"];
export const KELOMPOK_RINCIAN: readonly KelompokRincian[] = ["Pelatihan", "Translok dan penginapan", "Honor", "Rapat", "Lain-lain"];
export type ModeKelompok = Record<KelompokRincian, ModePecah>;

/**
 * (29 Okt 2026) Kelompok Honor dipecah di layar: instruktur nasional, instruktur daerah, narasumber eksternal, PML, PPL, dan petugas lain
 * (Supervisor, Kortim, entri). Hanya pengelompokan tampilan; rincian dan angkanya tidak berubah. `selalu` = tampil walau kosong (dengan petunjuk).
 */
export type SubHonor = "instruktur_nasional" | "instruktur_daerah" | "instruktur_belum" | "narasumber" | "pml" | "ppl" | "lain";
export const SUB_HONOR: { kode: SubHonor; nama: string; selalu: boolean; kosong: string }[] = [
  { kode: "instruktur_nasional", nama: "Instruktur nasional (Innas)", selalu: false, kosong: "" },
  { kode: "instruktur_daerah", nama: "Instruktur daerah (Inda)", selalu: false, kosong: "" },
  { kode: "instruktur_belum", nama: "Instruktur (level belum dipilih)", selalu: false, kosong: "" },
  { kode: "narasumber", nama: "Pengajar atau narasumber eksternal", selalu: false, kosong: "" },
  { kode: "pml", nama: "PML", selalu: true, kosong: "Tidak ada honor PML. Bila PML dibayar honor, tandai honor untuk PML pada identifikasi awal (cek aturan)." },
  { kode: "ppl", nama: "PPL", selalu: true, kosong: "Tidak ada honor PPL. Bila PPL dibayar honor, tandai honor untuk PPL pada identifikasi awal (cek aturan)." },
  { kode: "lain", nama: "Petugas lain (Supervisor, Kortim, entri)", selalu: false, kosong: "" },
];
export function subHonor(uraian: string): SubHonor {
  if (/honor instruktur Innas/i.test(uraian)) return "instruktur_nasional";
  if (/honor instruktur Inda/i.test(uraian)) return "instruktur_daerah";
  if (/honor instruktur/i.test(uraian)) return "instruktur_belum";
  if (/honor pengajar|narasumber/i.test(uraian)) return "narasumber";
  if (/^Honor PML\b/.test(uraian)) return "pml";
  if (/^Honor PPL\b/.test(uraian)) return "ppl";
  return "lain";
}

export const modeSemua = (m: ModePecah): ModeKelompok => ({ Pelatihan: m, "Translok dan penginapan": m, Honor: m, Rapat: m, "Lain-lain": m });

/** Mode tersimpan yang tidak sah (mis. dari simpanan peramban) diganti `bawaan` per kelompok. */
export function modeAman(x: unknown, bawaan: ModePecah = "periode"): ModeKelompok {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const m = modeSemua(bawaan);
  for (const k of KELOMPOK_RINCIAN) if (o[k] === "periode" || o[k] === "gabung") m[k] = o[k] as ModePecah;
  return m;
}

/** Rincian per survei dengan mode yang boleh berbeda tiap jenis belanja. Urutan: per kelompok, mengikuti KELOMPOK_RINCIAN. */
export function rincianCampuran(rincian: BarisRincian[], periode: PeriodeJadwal[], mode: ModeKelompok, hariBayar: HariBayar = {}, libur: Libur = new Set()): RincianSurvei[] {
  const per = rincianSurvei(rincian, periode, "periode", hariBayar, libur);
  const gab = rincianSurvei(rincian, periode, "gabung", hariBayar, libur);
  return KELOMPOK_RINCIAN.flatMap((k) => (mode[k] === "gabung" ? gab : per).filter((r) => r.kelompok === k));
}

// ---------------------------------------------------------------------------------------------------------------------
// Isian hari dibayar
// ---------------------------------------------------------------------------------------------------------------------
export type KolomHari = { kunci: string; uraian: string; akun: string; periode: string; penginapan: boolean; maks: number; batas: number; orang: number | null; mulai: string; selesai: string };

/**
 * Satu kolom isian untuk tiap rincian translok/penginapan x periode; `maks` = jumlah hari KALENDER pendataan (29 Okt 2026: translok dibayar per hari kalender,
 * bukan hari kerja), `batas` = batas isian (penginapan: maks - 1). Parameter `libur` tidak dipakai (dipertahankan agar pemanggil tidak berubah).
 */
export function kolomHari(rincian: BarisRincian[], periode: PeriodeJadwal[], _libur: Libur = new Set()): KolomHari[] {
  const hasil: KolomHari[] = [];
  for (const b of rincian) {
    if (b.kelompok !== "Translok dan penginapan") continue;
    const penginapan = b.uraian.startsWith("Penginapan");
    for (const p of periode) {
      const maks = hariJadwal(p.mulai, p.selesai);
      hasil.push({ kunci: `${b.akun}|${b.uraian}|${p.periode}`, uraian: b.uraian, akun: b.akun, periode: p.periode, penginapan, maks, batas: penginapan ? Math.max(maks - 1, 0) : maks, orang: b.volume, mulai: p.mulai, selesai: p.selesai });
    }
  }
  return hasil;
}

/** Teks isian hari -> bilangan bulat 0..365; kosong atau tidak sah -> null (belum diisi). */
export function bacaHari(teks: string): number | null {
  const t = teks.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 365 ? n : null;
}

/** Kumpulan teks isian (kunci -> teks) menjadi HariBayar; isian kosong atau tidak sah tidak ikut. */
export function hariDariTeks(teks: Record<string, string>): HariBayar {
  const h: HariBayar = {};
  for (const [k, v] of Object.entries(teks)) {
    const n = bacaHari(v);
    if (n !== null) h[k] = n;
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rencana baris RAB
// ---------------------------------------------------------------------------------------------------------------------
export type RencanaRincian = {
  r: RincianSurvei;
  /** Isian awal dari identifikasi (volume dan harga = saran; jadwal cair = hari terakhir kegiatan + 1 minggu). */
  saran: IsianBaris;
  selesai: string | null;
  lambat: string | null;
  /** Batas tertinggi harga menurut lembar kebijakan; null bila tarif belum ada. */
  batasHarga: number | null;
};

/** Hari terakhir kegiatan acuan jadwal cair satu rincian: lapangan dan rapat per periode memakai akhir pendataan periode itu, selain itu acuan kelas atau akhir terakhir. */
export function selesaiRincian(r: Pick<RincianSurvei, "kelompok" | "uraian" | "periode">, isi: IsiLanjutan, periode: PeriodeJadwal[]): string | null {
  const akhir = periode.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.selesai));
  if (r.periode && (r.kelompok === "Translok dan penginapan" || r.kelompok === "Rapat")) {
    const p = akhir.find((x) => x.periode === r.periode);
    if (p) return p.selesai;
  }
  return acuanSelesai(r, isi, akhir);
}

export function rencanaDari(rs: RincianSurvei[], isi: IsiLanjutan, periode: PeriodeJadwal[], bulanCadangan: number, hariCair: number | null, libur: Libur, sumber: string): RencanaRincian[] {
  return rs.map((r) => {
    const selesai = selesaiRincian(r, isi, periode);
    const cair = saranCair(selesai, { bulan: bulanCadangan }, hariCair, libur, GESER_CAIR_HARI);
    const harga = teksHarga(r.tarif);
    return {
      r, selesai, lambat: cair.lambat, batasHarga: harga ? r.tarif : null,
      saran: { ...barisKosong(satuanRab(r.satuan), cair.bulan), ket: keteranganSalinan(r, sumber), volume: teksVolume(r.volume), harga, minggu: cair.minggu },
    };
  });
}

/** Penanda yang ditulis bersama baris: saran saat disalin (volume dan harga bisa kosong bila identifikasi belum punya angka). */
export function penandaDari(identId: number, identVer: number, r: Pick<RincianSurvei, "kunci">, saran: Pick<IsianBaris, "volume" | "harga">): PenandaIdent {
  return { ident_id: identId, ident_ver: identVer, ident_kunci: r.kunci.slice(0, 300), ident_vol: bacaVolume(saran.volume), ident_harga: bacaRupiah(saran.harga) };
}

/** Isian yang diubah pengguna dari saran (volume atau harga berbeda) -> penanda "diubah dari identifikasi" sebelum disalin. */
export function berbedaDariSaran(saran: Pick<IsianBaris, "volume" | "harga">, isian: Pick<IsianBaris, "volume" | "harga">): boolean {
  const v1 = bacaVolume(saran.volume), v2 = bacaVolume(isian.volume), h1 = bacaRupiah(saran.harga), h2 = bacaRupiah(isian.harga);
  if (v1 === null && h1 === null) return false; // tidak ada saran yang bisa dibandingkan
  return v1 !== v2 || h1 !== h2;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pilihan item tujuan
// ---------------------------------------------------------------------------------------------------------------------
/** Item RAB tanpa kunci POK ("Item belum ada, tambahkan"): ikut RAB untuk bahan revisi POK. */
export type ItemBaruRow = { id: number; akun_kode: string; uraian: string; satuan: string; komponen_kode: string; selesai: boolean };

export type OpsiTujuan = { nilai: string; label: string; jenis: "pok" | "baru" | "tambah"; cocok: boolean };
export type PilihanTujuan = { hasil: HasilTautan; opsi: OpsiTujuan[]; awal: string };
export const TUJUAN_TAMBAH = "tambah";
export const kodeTujuanPok = (detailId: number): string => `pok:${detailId}`;
export const kodeTujuanBaru = (itemId: number): string => `baru:${itemId}`;

/**
 * Opsi item tujuan satu rincian. Item POK yang "RAB = Item" atau "Selesai" tidak ditawarkan (rincian tambahan menggandakan jumlah / item sudah ditutup).
 * `awal` = pilihan awal: satu-satunya item POK yang cocok; kalau tidak ada, satu-satunya item baru beakun sama; kalau akun belum ada sama sekali, "tambah".
 */
export function pilihanTujuan(r: Pick<RincianSurvei, "uraian" | "akun" | "kelompok">, peta: PemetaanItem[], itemBaru: ItemBaruRow[], survei: string): PilihanTujuan {
  const hasil = tautkan(r, peta.map((p) => p.pok), survei);
  const bisa = peta.filter((p) => akun6(p.pok.akun) === akun6(r.akun) && p.status !== "selesai" && p.status !== "sama");
  const cocokId = new Set(hasil.kandidat.map((k) => k.detail_id));
  const pok: OpsiTujuan[] = bisa
    .map((p) => ({ nilai: kodeTujuanPok(p.pok.detail_id), label: `${namaItem(p.pok)} (pagu ${rupiah(p.pok.pok)})`, jenis: "pok" as const, cocok: cocokId.has(p.pok.detail_id) }))
    .sort((a, b) => Number(b.cocok) - Number(a.cocok));
  const baru: OpsiTujuan[] = itemBaru
    .filter((i) => akun6(i.akun_kode) === akun6(r.akun) && !i.selesai)
    .map((i) => ({ nilai: kodeTujuanBaru(i.id), label: `Item baru di RAB: ${i.uraian}`, jenis: "baru" as const, cocok: true }));
  const tambah: OpsiTujuan = { nilai: TUJUAN_TAMBAH, label: `Item belum ada, tambahkan: ${hasil.saranNama ?? saranNamaItem(r, survei)}`, jenis: "tambah", cocok: false };
  const cocokPok = pok.filter((o) => o.cocok);
  const awal = cocokPok.length === 1 ? cocokPok[0].nilai
    : cocokPok.length === 0 && pok.length === 1 && hasil.status === "perlu_nama" ? pok[0].nilai
    : cocokPok.length === 0 && baru.length === 1 ? baru[0].nilai
    : bisa.length === 0 && baru.length === 0 && hasil.status === "belum_ada" ? TUJUAN_TAMBAH : "";
  return { hasil, opsi: [...pok, ...baru, tambah], awal };
}

export type TujuanBaca = { jenis: "pok" | "baru"; id: number } | { jenis: "tambah" } | null;
export function bacaTujuan(nilai: string): TujuanBaca {
  if (nilai === TUJUAN_TAMBAH) return { jenis: "tambah" };
  const m = /^(pok|baru):(\d{1,12})$/.exec(nilai);
  return m ? { jenis: m[1] as "pok" | "baru", id: Number(m[2]) } : null;
}

/** Komponen (3 angka) untuk item baru: komponen item POK beakun sama; kalau tidak ada, komponen yang paling banyak dipakai RO ini; null bila RO tanpa item. */
export function komponenUntukAkun(akun: string, peta: PemetaanItem[]): string | null {
  const sama = peta.find((p) => akun6(p.pok.akun) === akun6(akun));
  if (sama) return sama.pok.komponen;
  const hitung = new Map<string, number>();
  for (const p of peta) hitung.set(p.pok.komponen, (hitung.get(p.pok.komponen) ?? 0) + 1);
  return [...hitung.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

/** Nama item baru yang sah: dirapikan, 3..200 huruf; pesan bila tidak sah. */
export function periksaNamaItem(nama: string): string | null {
  const t = nama.trim();
  if (t.length < 3) return "Nama item baru minimal 3 huruf.";
  if (t.length > MAKS_URAIAN_ITEM) return `Nama item baru maksimal ${MAKS_URAIAN_ITEM} huruf.`;
  return null;
}

/** Kunci pengelompokan item baru yang sama (akun + nama tanpa beda huruf besar/kecil dan spasi ganda); rincian dengan kunci sama berbagi SATU item baru. */
export const kunciItemBaru = (akun: string, nama: string): string => `${akun6(akun)}|${nama.trim().replace(/\s+/g, " ").toLowerCase()}`;

export function dataItemBaru(rabId: number, o: { akun: string; nama: string; satuan: string; komponen: string }): Record<string, unknown> {
  return { rab_id: rabId, pok_kunci: null, komponen_kode: o.komponen, akun_kode: akun6(o.akun), uraian: o.nama.trim().replace(/\s+/g, " ").slice(0, MAKS_URAIAN_ITEM), satuan: o.satuan.slice(0, 20) || "PAKET", prioritas_kode: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Baris RAB yang sudah ditulis dari identifikasi
// ---------------------------------------------------------------------------------------------------------------------
export type Terpasang = { baris: BarisRabRow; itemRab: ItemRabRow; diubah: boolean };

/** Baris RAB bertanda identifikasi ini, per ident_kunci. Bila ada dua baris berkunci sama, yang pertama (baris_id terkecil) dipakai. */
export function terpasangPer(identId: number, barisRab: BarisRabRow[], itemRab: ItemRabRow[]): Map<string, Terpasang> {
  const item = new Map(itemRab.map((i) => [i.id, i]));
  const peta = new Map<string, Terpasang>();
  for (const b of [...barisRab].sort((x, y) => x.baris_id - y.baris_id)) {
    if (b.ident_id !== identId || !b.ident_kunci || peta.has(b.ident_kunci)) continue;
    const it = item.get(b.item_id);
    if (!it) continue;
    peta.set(b.ident_kunci, { baris: b, itemRab: it, diubah: diubahDariIdent(b) });
  }
  return peta;
}

/** Baris bertanda identifikasi ini yang kuncinya tidak ada lagi pada rincian sekarang (identifikasi atau mode pecah/gabung berubah). Tidak pernah dihapus otomatis. */
export function barisTanpaPasangan(identId: number, rs: Pick<RincianSurvei, "kunci">[], barisRab: BarisRabRow[]): BarisRabRow[] {
  const ada = new Set(rs.map((r) => r.kunci));
  return barisRab.filter((b) => b.ident_id === identId && !!b.ident_kunci && !ada.has(b.ident_kunci));
}

export type Sinkron = { berubah: boolean; volume: boolean; harga: boolean };
/** Saran identifikasi SEKARANG dibanding saran saat baris disalin: berubah bila identifikasi direvisi sesudah disalin (dasar tawaran "perbarui RAB"). */
export function selisihSaran(r: Pick<RincianSurvei, "volume" | "tarif">, t: Terpasang): Sinkron {
  const b = t.baris;
  const bulat2 = (n: number) => Math.round(n * 100) / 100;
  const vol = r.volume !== null && b.ident_vol !== null && b.ident_vol !== undefined && Math.abs(bulat2(r.volume) - Number(b.ident_vol)) > 0.004;
  const harga = r.tarif !== null && b.ident_harga !== null && b.ident_harga !== undefined && Math.abs(Math.round(r.tarif) - Number(b.ident_harga)) > 0.004;
  return { berubah: vol || harga, volume: vol, harga };
}

/** Data pembaruan baris dari saran sekarang: hanya bagian yang saran-nya berubah (volume dan/atau harga) yang ditimpa; saran tersimpan ikut diperbarui. Null bila tidak ada yang dapat diperbarui. */
export function dataPerbarui(saran: Pick<IsianBaris, "volume" | "harga">, identVer: number, ubah: Pick<Sinkron, "volume" | "harga">): Record<string, unknown> | null {
  const v = bacaVolume(saran.volume), h = bacaRupiah(saran.harga);
  const d: Record<string, unknown> = {};
  if (ubah.volume && v !== null) { d.volume = v; d.ident_vol = v; }
  if (ubah.harga && h !== null) { d.harga_satuan = h; d.ident_harga = h; }
  if (Object.keys(d).length === 0) return null;
  return { ...d, ident_ver: identVer, jumlah_tetap: null, sama_dengan_item: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Ringkasan keadaan
// ---------------------------------------------------------------------------------------------------------------------
export type KeadaanRincian = "sudah" | "siap" | "isi_hari" | "belum_angka" | "butuh_item" | "cek_dobel";
/** Pilihan tujuan dan keputusan dobel satu rincian (opsional; tanpa ini keadaan hanya dinilai dari angka). */
export type TujuanRincian = { tujuan: string; dobel: boolean };
/**
 * `sudah` = sudah ada di RAB; `isi_hari` = volume menunggu isian hari dibayar; `belum_angka` = volume atau harga belum ada;
 * `butuh_item` = angka lengkap tetapi item tujuan belum dipilih; `cek_dobel` = item tujuan sudah berisi baris RAB buatan sendiri (tanpa penanda) dan belum ada keputusan;
 * `siap` = bisa disusun ke RAB.
 */
export function keadaanRincian(rc: RencanaRincian, sudah: boolean, isian: IsianBaris, tj?: TujuanRincian): KeadaanRincian {
  if (sudah) return "sudah";
  if (rc.r.volume === null && rc.r.kelompok === "Translok dan penginapan" && rc.r.hari === null && bacaVolume(isian.volume) === null) return "isi_hari";
  if (bacaVolume(isian.volume) === null || bacaRupiah(isian.harga) === null) return "belum_angka";
  if (tj && tj.tujuan === "") return "butuh_item";
  if (tj && tj.dobel) return "cek_dobel";
  return "siap";
}

export type RingkasSurvei = { jumlah: number; sudah: number; siap: number; isiHari: number; belumAngka: number; butuh: number; totalSiap: number; totalSudah: number };
export function ringkasSurvei(keadaan: { k: KeadaanRincian; jumlah: number | null }[]): RingkasSurvei {
  const r: RingkasSurvei = { jumlah: keadaan.length, sudah: 0, siap: 0, isiHari: 0, belumAngka: 0, butuh: 0, totalSiap: 0, totalSudah: 0 };
  for (const x of keadaan) {
    if (x.k === "sudah") { r.sudah++; r.totalSudah += x.jumlah ?? 0; }
    else if (x.k === "siap") { r.siap++; r.totalSiap += x.jumlah ?? 0; }
    else if (x.k === "isi_hari") r.isiHari++;
    else if (x.k === "butuh_item" || x.k === "cek_dobel") r.butuh++;
    else r.belumAngka++;
  }
  return r;
}

/**
 * Syarat menyatakan survei "Siap diajukan" (keputusan pengguna 29 Okt 2026: RAB harus lengkap). `galat` menolak: belum ada rincian di RAB, atau masih ada rincian
 * ber-angka yang belum masuk RAB (siap disalin atau butuh keputusan). `peringatan` hanya memberi tahu: rincian yang belum punya angka (hari dibayar, volume, harga) tidak ikut
 * RAB dan tidak menghalangi, supaya status tidak buntu bila baris itu memang tidak diperlukan.
 */
export function periksaSiapLengkap(nTerpasang: number, r: Pick<RingkasSurvei, "siap" | "butuh" | "isiHari" | "belumAngka">): { galat: string | null; peringatan: string | null } {
  const dasar = periksaSiap(nTerpasang);
  const belumMasuk = r.siap + r.butuh;
  const galat = dasar ?? (belumMasuk > 0 ? `Masih ${belumMasuk} rincian yang belum masuk RAB (${r.siap} siap disusun, ${r.butuh} butuh keputusan). Tekan Susun RAB atau selesaikan keputusannya dulu.` : null);
  const menunggu = r.isiHari + r.belumAngka;
  return { galat, peringatan: menunggu > 0 ? `${menunggu} rincian belum punya angka lengkap (hari dibayar, volume, atau harga) dan tidak ikut RAB.` : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Batang "satu item diisi beberapa survei"
// ---------------------------------------------------------------------------------------------------------------------
export type BatangTampil = { kunci: string; judul: string; akun: string; satuan: string; kap: KapasitasItem | null; sumbangan: Sumbangan[] };
export type Mendatang = { tujuan: string; identId: number; jumlah: number | null; volume: number };

/**
 * Bahan batang untuk tiap item yang disinggung rencana atau sudah memuat baris identifikasi. Sumbangan = baris RAB yang ada (dikelompokkan per survei,
 * baris di luar identifikasi = "Lainnya") ditambah rincian yang akan disalin (`mendatang`). Item baru tidak punya kapasitas POK (kap null).
 */
export function batangPerItem(peta: PemetaanItem[], itemBaru: ItemBaruRow[], barisRab: BarisRabRow[], namaIdent: ReadonlyMap<number, string>, mendatang: Mendatang[]): BatangTampil[] {
  const nama = (id: number | null) => (id === null ? "" : namaIdent.get(id) ?? `Survei #${id}`);
  const pakai = (baris: BarisRabRow[], ekstra: Mendatang[]) =>
    sumbanganDariBaris([
      ...baris.map((b) => ({ ident_id: b.ident_id ?? null, nama: nama(b.ident_id ?? null), volume: Number(b.volume), jumlah: Number(b.jumlah) })),
      ...ekstra.map((m) => ({ ident_id: m.identId, nama: nama(m.identId), volume: m.volume, jumlah: m.jumlah })),
    ]);
  const hasil: BatangTampil[] = [];
  for (const p of peta) {
    const kunci = kodeTujuanPok(p.pok.detail_id);
    const ekstra = mendatang.filter((m) => m.tujuan === kunci);
    if (ekstra.length === 0 && !p.baris.some((b) => !!b.ident_kunci)) continue;
    hasil.push({ kunci, judul: namaItem(p.pok), akun: p.pok.akun, satuan: p.pok.satuan, kap: { volume: p.pok.volume, pagu: p.pok.pok }, sumbangan: pakai(p.baris, ekstra) });
  }
  for (const i of itemBaru) {
    const kunci = kodeTujuanBaru(i.id);
    const baris = barisRab.filter((b) => b.item_id === i.id);
    const ekstra = mendatang.filter((m) => m.tujuan === kunci);
    if (ekstra.length === 0 && baris.length === 0) continue;
    hasil.push({ kunci, judul: i.uraian, akun: i.akun_kode, satuan: i.satuan, kap: null, sumbangan: pakai(baris, ekstra) });
  }
  return hasil;
}

/** Jumlah rupiah satu isian untuk batang; null bila volume atau harga belum sah. */
export const jumlahIsian = (i: IsianBaris): number | null => jumlahBaris(i);

// ---------------------------------------------------------------------------------------------------------------------
// Penjelasan angka (tombol "?") dan ringkasan hari dibayar
// ---------------------------------------------------------------------------------------------------------------------
const namaKelas = (k: Kelas): string => k.nama || (k.sesi === "briefing" ? "Briefing" : "Pelatihan");
const rincianPeran = (isi: IsiLanjutan, k: Kelas): string[] =>
  k.untuk.map((kode) => {
    const x = isi.peran[kode];
    if (x?.on) return `${NAMA_PERAN[kode]}: ${x.nOrg} organik + ${x.nMit} mitra = ${x.nOrg + x.nMit} orang`;
    const n = isi.petugas.filter((p) => p.peran === kode).length;
    return `${NAMA_PERAN[kode]}: ${n} orang (dari daftar petugas tercatat)`;
  });
/** Kelas yang menjadi sumber satu rincian pelatihan/honor/pulsa (nama kelas, atau nama tanpa periode pada mode gabung). */
function kelasDari(uraian: string, isi: IsiLanjutan): Kelas[] {
  const nama = uraian.split(":")[0];
  const sama = isi.kelas.filter((k) => namaKelas(k) === nama);
  return sama.length > 0 ? sama : isi.kelas.filter((k) => k.periode !== "" && namaKelas(k).replace(` ${k.periode}`, "") === nama);
}

/** "N petugas × H hari = V orang-hari" (atau malam); tanpa jumlah petugas hanya menyebut alokasi hari. */
export function ringkasHari(orang: number | null, hari: number, penginapan = false): string {
  const satuan = penginapan ? "malam" : "hari";
  if (orang === null || orang <= 0) return `${hari} ${satuan} dibayar per petugas (jumlah petugas belum diidentifikasi)`;
  return `${orang} petugas × ${hari} ${satuan} = ${orang * hari} orang-${satuan}`;
}

/** Baris-baris penjelasan "dari mana volume ini" untuk satu rincian (tombol «?»). Selalu mengembalikan sedikitnya satu baris. */
export function jelaskanVolume(r: RincianSurvei, isi: IsiLanjutan): string[] {
  const vol = r.volume;
  if (r.kelompok === "Translok dan penginapan") {
    const pen = r.uraian.startsWith("Penginapan");
    if (r.hari === null) return [`Volume = jumlah petugas × jumlah ${pen ? "malam" : "hari"} dibayar per petugas. Isi alokasi ${pen ? "malam" : "hari"} dibayar pada bagian A di atas; volume baru muncul setelah alokasi lebih dari 0.`];
    if (r.periode !== null && r.hari > 0 && vol !== null) return [ringkasHari(vol / r.hari, r.hari, pen), `Dihitung per HARI KALENDER, bukan hari kerja${pen ? " (penginapan = malam)" : ""}.`];
    return [`Dijumlahkan dari tiap periode: petugas × ${pen ? "malam" : "hari"} dibayar di periode itu${vol !== null ? ` = ${vol} orang-${pen ? "malam" : "hari"}` : ""}.`];
  }
  if (r.kelompok === "Pelatihan") {
    const ks = kelasDari(r.uraian, isi);
    if (ks.length === 1) {
      const k = ks[0]; const n = pesertaKelas(isi, k);
      const tgl = k.mulai ? ` (${k.mulai}${k.selesai && k.selesai !== k.mulai ? ` s.d. ${k.selesai}` : ""})` : "";
      return [`Peserta kelas «${namaKelas(k)}»:`, ...rincianPeran(isi, k), `Jumlah peserta ${n} orang; hari kelas ${k.oh}${tgl}.`, `Volume = ${n} × ${k.oh} = ${n * k.oh} orang-hari.`];
    }
    if (ks.length > 1) return [...ks.map((k) => `${namaKelas(k)}: ${pesertaKelas(isi, k)} peserta × ${k.oh} hari = ${pesertaKelas(isi, k) * k.oh} orang-hari`), `Volume gabungan = ${ks.reduce((t, k) => t + pesertaKelas(isi, k) * k.oh, 0)} orang-hari.`];
  }
  if (r.kelompok === "Lain-lain" && /pulsa/i.test(r.uraian)) {
    const ks = kelasDari(r.uraian, isi);
    if (ks.length > 0) return [`Peserta mitra kelas «${namaKelas(ks[0])}»:`, ...ks[0].untuk.map((kode) => `${NAMA_PERAN[kode]}: ${isi.peran[kode]?.on ? isi.peran[kode].nMit : 0} mitra`), "Volume = jumlah peserta mitra (organik tidak mendapat pulsa)."];
  }
  if (r.kelompok === "Honor" && /honor instruktur|honor pengajar/.test(r.uraian)) {
    const ks = kelasDari(r.uraian, isi);
    const ins = ks.flatMap((k) => k.instruktur ?? []);
    if (ins.length > 0) return [...ins.map((i) => `${i.nama.trim() || "Instruktur"} (${i.level || "level ?"}${i.asal ? `, ${i.asal}` : ""}): ${i.jam} JP`), "Volume = jumlah JP instruktur kelompok ini; harga = tarif per JP."];
    return ["Jumlah jam (JP) dan tarif mengikuti ketentuan honor yang berlaku; isi sendiri."];
  }
  if (r.kelompok === "Honor") return ["Volume = jumlah petugas pada identifikasi awal. Tarif honor mengikuti SPKL, jadi harga satuan diisi sendiri."];
  if (r.kelompok === "Rapat") return ["Jumlah peserta rapat belum diidentifikasi; isi volume sendiri sesuai perkiraan peserta."];
  return [r.catatan || (vol !== null ? `Volume ${vol} ${r.satuan} dari identifikasi.` : "Volume belum ada pada identifikasi.")];
}

// ---------------------------------------------------------------------------------------------------------------------
// Deteksi baris RAB yang sudah ada pada item tujuan (cegah dobel)
// ---------------------------------------------------------------------------------------------------------------------
/** Baris RAB yang sudah ada pada item tujuan dan BUKAN dari identifikasi (dibuat sendiri di RAB standar). Baris bertanda identifikasi (survei ini atau lain) sengaja dibagi, jadi tidak dihitung. */
export function barisSudahAda(tujuan: string, peta: PemetaanItem[], barisRab: BarisRabRow[]): BarisRabRow[] {
  const t = bacaTujuan(tujuan);
  if (!t || t.jenis === "tambah") return [];
  const daftar = t.jenis === "pok" ? (peta.find((p) => p.pok.detail_id === t.id)?.baris ?? []) : barisRab.filter((b) => b.item_id === t.id);
  return daftar.filter((b) => !dariIdent(b));
}

/** Data pembaruan "Pakai baris ini": baris buatan sendiri diambil alih identifikasi (isian terbaru + penanda). Tidak mengubah item/urut; melepas kunci jumlah. */
export function dataAmbilAlih(isian: IsianBaris, penanda: PenandaIdent): Record<string, unknown> {
  return { ...dataBarisIdent(isian, penanda), jumlah_tetap: null, sama_dengan_item: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// Penunjuk alur penyusunan RAB survei
// ---------------------------------------------------------------------------------------------------------------------
export type LangkahAlur = { no: number; judul: string; keadaan: "selesai" | "berjalan" | "menunggu"; ket: string; tautan: "identifikasi" | "lanjutan" | null };

/**
 * Alur resmi satu survei (keputusan pengguna 29 Okt 2026): 1 identifikasi awal (sah) > 2 RAB awal > 3 identifikasi lanjutan > 4 perbarui RAB.
 * Fungsi ini hanya menyusun teks dan keadaan penunjuk; tidak menulis apa pun.
 */
export function langkahAlur(o: { lanjutanAda: boolean; lanjutanVer: number | null; lanjutanStatus: string | null; jumlah: number; sudah: number; siap: boolean; berubah: number }): LangkahAlur[] {
  const rabSelesai = o.jumlah > 0 && o.sudah >= o.jumlah;
  const lanj = o.lanjutanAda
    ? `Sudah ada${o.lanjutanVer ? ` (versi ${o.lanjutanVer}` : ""}${o.lanjutanVer ? (o.lanjutanStatus ? `, ${o.lanjutanStatus})` : ")") : o.lanjutanStatus ? ` (${o.lanjutanStatus})` : ""}. Angka RAB mengikuti versi terbaru.`
    : "Belum dibuat. Isi bila petugas, kelas, dan tanggal sudah pasti; angka RAB lalu ikut diperbarui.";
  return [
    { no: 1, judul: "Identifikasi awal", keadaan: "selesai", ket: "Sudah sah. Dasar kebutuhan biaya (jenis belanja dan perkiraan jumlah).", tautan: "identifikasi" },
    { no: 2, judul: "RAB awal", keadaan: rabSelesai ? "selesai" : "berjalan", ket: `${o.sudah} dari ${o.jumlah} rincian sudah di RAB${o.siap ? "; ditandai Siap diajukan" : "; masih Draf"}.`, tautan: null },
    { no: 3, judul: "Identifikasi lanjutan", keadaan: o.lanjutanAda ? "selesai" : "menunggu", ket: lanj, tautan: "lanjutan" },
    { no: 4, judul: "Perbarui RAB", keadaan: o.berubah > 0 ? "berjalan" : o.lanjutanAda && rabSelesai ? "selesai" : "menunggu", ket: o.berubah > 0 ? `${o.berubah} rincian berbeda dari identifikasi terbaru; perbarui di bagian Susun RAB.` : "Tidak ada rincian yang berbeda dari identifikasi terbaru.", tautan: null },
  ];
}
