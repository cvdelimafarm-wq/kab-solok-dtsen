// lib/keu/rabPerSurvei.ts
//
// (28 Okt 2026) RAB per survei, tahap 2 (logika murni untuk layar "RAB per survei"; tanpa React/DB). Dari rincian biaya identifikasi (rabSurvei.ts) disusun:
//  - mode pecah atau gabung PER JENIS BELANJA (kelompok rincian);
//  - kolom isian hari dibayar translok/penginapan per periode (batas = hari kerja pendataan);
//  - rencana baris RAB (isian awal = saran identifikasi, boleh diubah) dan jadwal cair sarannya;
//  - pilihan item tujuan: item POK yang cocok, item baru di RAB yang sudah ada, atau "Item belum ada, tambahkan" (item baru di RAB untuk revisi POK);
//  - pencocokan baris RAB yang sudah ditulis dari identifikasi (penanda ident_id + ident_kunci) dan deteksi saran yang berubah;
//  - data batang "satu item POK diisi beberapa survei" (batangItem.ts), dihitung dengan dasar rupiah supaya satuan yang berbeda tidak membingungkan.
// Basis data tetap yang memutuskan (penjaga tabel RAB); fungsi ini hanya menyiapkan data dan pesan.

import { bacaRupiah } from "./kekurangan";
import { hariKerjaAntara, type Libur } from "./hariKerja";
import type { BarisRincian, IsiLanjutan } from "./lanjutan";
import { sumbanganDariBaris, type KapasitasItem, type Sumbangan } from "./batangItem";
import { jumlahBaris, bacaVolume, barisKosong, diubahDariIdent, type BarisRabRow, type IsianBaris, type ItemRabRow, type PemetaanItem, type PenandaIdent } from "./rab";
import { rincianSurvei, saranNamaItem, tautkan, type HariBayar, type HasilTautan, type ModePecah, type PeriodeJadwal, type RincianSurvei } from "./rabSurvei";
import { rupiah } from "./ro";
import { acuanSelesai, keteranganSalinan, namaItem, saranCair, satuanRab, teksHarga, teksVolume } from "./usulanRab";

const akun6 = (a: string): string => a.slice(0, 6);
const MAKS_URAIAN_ITEM = 200;

// ---------------------------------------------------------------------------------------------------------------------
// Mode pecah/gabung per jenis belanja
// ---------------------------------------------------------------------------------------------------------------------
export type KelompokRincian = BarisRincian["kelompok"];
export const KELOMPOK_RINCIAN: readonly KelompokRincian[] = ["Pelatihan", "Translok dan penginapan", "Honor", "Rapat", "Lain-lain"];
export type ModeKelompok = Record<KelompokRincian, ModePecah>;
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

/** Satu kolom isian untuk tiap rincian translok/penginapan x periode; `maks` = hari kerja pendataan (Senin-Jumat tanpa libur), `batas` = batas isian (penginapan: maks - 1). */
export function kolomHari(rincian: BarisRincian[], periode: PeriodeJadwal[], libur: Libur = new Set()): KolomHari[] {
  const hasil: KolomHari[] = [];
  for (const b of rincian) {
    if (b.kelompok !== "Translok dan penginapan") continue;
    const penginapan = b.uraian.startsWith("Penginapan");
    for (const p of periode) {
      const maks = hariKerjaAntara(p.mulai, p.selesai, libur);
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
  /** Isian awal dari identifikasi (volume dan harga = saran; jadwal cair = saran dari hari terakhir kegiatan). */
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
    const cair = saranCair(selesai, { bulan: bulanCadangan }, hariCair, libur);
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
export type KeadaanRincian = "sudah" | "siap" | "isi_hari" | "belum_angka";
/** `sudah` = sudah ada di RAB; `isi_hari` = volume menunggu isian hari dibayar; `belum_angka` = volume atau harga belum ada; `siap` = bisa disalin. */
export function keadaanRincian(rc: RencanaRincian, sudah: boolean, isian: IsianBaris): KeadaanRincian {
  if (sudah) return "sudah";
  if (rc.r.volume === null && rc.r.kelompok === "Translok dan penginapan" && rc.r.hari === null && bacaVolume(isian.volume) === null) return "isi_hari";
  return bacaVolume(isian.volume) === null || bacaRupiah(isian.harga) === null ? "belum_angka" : "siap";
}

export type RingkasSurvei = { jumlah: number; sudah: number; siap: number; isiHari: number; belumAngka: number; totalSiap: number; totalSudah: number };
export function ringkasSurvei(keadaan: { k: KeadaanRincian; jumlah: number | null }[]): RingkasSurvei {
  const r: RingkasSurvei = { jumlah: keadaan.length, sudah: 0, siap: 0, isiHari: 0, belumAngka: 0, totalSiap: 0, totalSudah: 0 };
  for (const x of keadaan) {
    if (x.k === "sudah") { r.sudah++; r.totalSudah += x.jumlah ?? 0; }
    else if (x.k === "siap") { r.siap++; r.totalSiap += x.jumlah ?? 0; }
    else if (x.k === "isi_hari") r.isiHari++;
    else r.belumAngka++;
  }
  return r;
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
