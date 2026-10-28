// lib/keu/keluaran.ts
//
// (28 Okt 2026) Keluaran dari RAB per survei yang berstatus Siap: (1) kebutuhan dana untuk Bendahara (akun > item > rincian, dan per bulan cair),
// (2) rencana pembayaran untuk PPK dan TU (tenggat SPJ dan bayar dari hari terakhir kegiatan), (3) permintaan pengadaan untuk PBJ (butir pengadaan
// dari identifikasi lanjutan, dikaitkan ke rincian RAB, ditambah spesifikasi). Ketiganya dirangkum menjadi satu paket beku berversi (keu_keluaran, 20261028h).
// Berkas ini MURNI (tanpa React/DB). Angka rupiah selalu dari baris RAB yang tersimpan, bukan dari identifikasi.
// Metode dan nilai pengadaan, serta tenggat resmi, tetap ditetapkan PPK atau pejabat pengadaan (cek aturan); di sini hanya penyajian.

import { HARI_BAYAR_BAWAAN, HARI_SPJ_BAWAAN, tenggatBayar, tenggatSpj, type Libur } from "./hariKerja";
import type { BarisRincian, IsiLanjutan } from "./lanjutan";
import type { ItemPengadaan, JenisPengadaan } from "./pengadaan";
import type { BarisRabRow, ItemRabRow } from "./rab";
import { selesaiRincian } from "./rabPerSurvei";
import { rincianSurvei, type PeriodeJadwal } from "./rabSurvei";

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const akun6 = (a: string): string => a.slice(0, 6);
const bulat = (n: number): number => Math.round(n * 100) / 100;
const angka = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------------------------------------------------------------
// Baris RAB milik satu identifikasi
// ---------------------------------------------------------------------------------------------------------------------
export type BarisKel = {
  baris_id: number; item_id: number; ket: string; volume: number; satuan: string; harga: number; jumlah: number; bulan: number; minggu: number;
  kunci: string | null; akun: string; itemUraian: string;
};

/** Baris RAB bertanda identifikasi ini, digabung dengan akun dan nama item RAB-nya. Baris tanpa item dikenal dibuang. Urut menurut baris_id. */
export function barisKeluaran(barisRab: Pick<BarisRabRow, "baris_id" | "item_id" | "ket" | "volume" | "satuan" | "harga_satuan" | "jumlah" | "bulan_mulai" | "minggu" | "ident_id" | "ident_kunci">[],
  itemRab: Pick<ItemRabRow, "id" | "akun_kode" | "uraian">[], identId: number): BarisKel[] {
  const item = new Map(itemRab.map((i) => [i.id, i]));
  return barisRab
    .filter((b) => b.ident_id === identId && item.has(b.item_id))
    .map((b) => {
      const i = item.get(b.item_id);
      return {
        baris_id: b.baris_id, item_id: b.item_id, ket: b.ket, volume: angka(b.volume), satuan: b.satuan, harga: angka(b.harga_satuan), jumlah: angka(b.jumlah),
        bulan: b.bulan_mulai, minggu: b.minggu, kunci: b.ident_kunci ?? null, akun: akun6(i?.akun_kode ?? ""), itemUraian: i?.uraian ?? "",
      };
    })
    .sort((a, b) => a.baris_id - b.baris_id);
}

export const jumlahTotal = (b: { jumlah: number }[]): number => bulat(b.reduce((s, x) => s + x.jumlah, 0));

// ---------------------------------------------------------------------------------------------------------------------
// Acuan hari terakhir kegiatan per kunci rincian
// ---------------------------------------------------------------------------------------------------------------------
export type MetaKunci = { kelompok: BarisRincian["kelompok"]; uraian: string; akun: string; periode: string | null; selesai: string | null };

/**
 * Kunci rincian (ident_kunci) -> kelompok, uraian, dan hari terakhir kegiatan. Dibentuk dari kedua mode (pecah dan gabung) supaya baris yang disalin dengan
 * mode mana pun dikenali tanpa bergantung pada pilihan di peramban; hari dibayar tidak memengaruhi kunci.
 */
export function petaKunci(rincian: BarisRincian[], periode: PeriodeJadwal[], isi: IsiLanjutan, libur: Libur): Map<string, MetaKunci> {
  const m = new Map<string, MetaKunci>();
  for (const mode of ["gabung", "periode"] as const) {
    for (const r of rincianSurvei(rincian, periode, mode, {}, libur)) {
      m.set(r.kunci, { kelompok: r.kelompok, uraian: r.uraian, akun: akun6(r.akun), periode: r.periode, selesai: selesaiRincian(r, isi, periode) });
    }
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Kebutuhan dana (Bendahara)
// ---------------------------------------------------------------------------------------------------------------------
export type DanaRincian = { ket: string; volume: number; satuan: string; harga: number; jumlah: number; bulan: number; minggu: number };
export type DanaItem = { itemId: number; uraian: string; total: number; rincian: DanaRincian[] };
export type DanaAkun = { akun: string; nama: string; total: number; item: DanaItem[] };
export type DanaBulan = { bulan: number; total: number; minggu: { minggu: number; total: number }[] };
export type Dana = { total: number; akun: DanaAkun[]; bulan: DanaBulan[] };

export function susunDana(baris: BarisKel[], namaAkun: (akun: string) => string = () => ""): Dana {
  const peta = new Map<string, Map<number, BarisKel[]>>();
  for (const b of baris) {
    const a = peta.get(b.akun) ?? new Map<number, BarisKel[]>();
    a.set(b.item_id, [...(a.get(b.item_id) ?? []), b]);
    peta.set(b.akun, a);
  }
  const akun: DanaAkun[] = [...peta.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([kode, items]) => {
    const item: DanaItem[] = [...items.entries()].sort(([, x], [, y]) => x[0].baris_id - y[0].baris_id).map(([itemId, rs]) => ({
      itemId, uraian: rs[0].itemUraian, total: jumlahTotal(rs),
      rincian: rs.map((r) => ({ ket: r.ket, volume: r.volume, satuan: r.satuan, harga: r.harga, jumlah: r.jumlah, bulan: r.bulan, minggu: r.minggu })),
    }));
    return { akun: kode, nama: namaAkun(kode), total: bulat(item.reduce((s, i) => s + i.total, 0)), item };
  });
  const perBulan = new Map<number, Map<number, number>>();
  for (const b of baris) {
    const m = perBulan.get(b.bulan) ?? new Map<number, number>();
    m.set(b.minggu, (m.get(b.minggu) ?? 0) + b.jumlah);
    perBulan.set(b.bulan, m);
  }
  const bulan: DanaBulan[] = [...perBulan.entries()].sort(([x], [y]) => x - y).map(([b, mm]) => {
    const minggu = [...mm.entries()].sort(([x], [y]) => x - y).map(([w, t]) => ({ minggu: w, total: bulat(t) }));
    return { bulan: b, total: bulat(minggu.reduce((s, x) => s + x.total, 0)), minggu };
  });
  return { total: jumlahTotal(baris), akun, bulan };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Rencana pembayaran (PPK dan TU)
// ---------------------------------------------------------------------------------------------------------------------
export type BayarRincian = {
  ket: string; akun: string; kelompok: string; jumlah: number; bulanCair: number; mingguCair: number;
  selesai: string | null; tenggatSpj: string | null; tenggatBayar: string | null;
};
export type BayarBulan = { bulan: string; total: number; n: number };
export type Bayar = { rincian: BayarRincian[]; tanpaTanggal: number; totalTanpaTanggal: number; perBulan: BayarBulan[]; hariSpj: number; hariBayar: number | null };

/**
 * Hari terakhir kegiatan dari `petaKunci` (baris yang kuncinya tidak dikenal = tanggal belum ada). Tenggat SPJ = `hariSpj` hari kerja sesudahnya, tenggat bayar =
 * `hariBayar` hari kerja (null = tanpa batas menurut lembar kebijakan, sehingga tenggat bayar kosong).
 */
export function susunBayar(baris: BarisKel[], meta: ReadonlyMap<string, MetaKunci>, libur: Libur, hariSpj: number = HARI_SPJ_BAWAAN, hariBayar: number | null = HARI_BAYAR_BAWAAN): Bayar {
  const rincian: BayarRincian[] = baris.map((b) => {
    const m = b.kunci ? meta.get(b.kunci) : undefined;
    const selesai = m?.selesai && TGL.test(m.selesai) ? m.selesai : null;
    return {
      ket: b.ket, akun: b.akun, kelompok: m?.kelompok ?? "", jumlah: b.jumlah, bulanCair: b.bulan, mingguCair: b.minggu, selesai,
      tenggatSpj: selesai ? tenggatSpj(selesai, libur, hariSpj) || null : null,
      tenggatBayar: selesai && hariBayar !== null ? tenggatBayar(selesai, libur, hariBayar) || null : null,
    };
  });
  rincian.sort((a, b) => (a.tenggatBayar ?? a.tenggatSpj ?? "9999").localeCompare(b.tenggatBayar ?? b.tenggatSpj ?? "9999") || a.ket.localeCompare(b.ket));
  const bulanDari = (r: BayarRincian): string | null => { const t = r.tenggatBayar ?? r.tenggatSpj; return t ? t.slice(0, 7) : null; };
  const perBulan = new Map<string, BayarBulan>();
  let tanpa = 0, totalTanpa = 0;
  for (const r of rincian) {
    const b = bulanDari(r);
    if (b === null) { tanpa += 1; totalTanpa += r.jumlah; continue; }
    const x = perBulan.get(b) ?? { bulan: b, total: 0, n: 0 };
    x.total = bulat(x.total + r.jumlah); x.n += 1;
    perBulan.set(b, x);
  }
  return { rincian, tanpaTanggal: tanpa, totalTanpaTanggal: bulat(totalTanpa), perBulan: [...perBulan.values()].sort((a, b) => a.bulan.localeCompare(b.bulan)), hariSpj, hariBayar };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Spesifikasi dan permintaan pengadaan (PBJ)
// ---------------------------------------------------------------------------------------------------------------------
export type KolomSpek = { kunci: string; label: string; tipe: "teks" | "angka" | "pilih" | "panjang"; pilihan?: readonly string[]; wajib: boolean; bantuan?: string };

const KOL = (kunci: string, label: string, wajib = false, tipe: KolomSpek["tipe"] = "teks", pilihan?: readonly string[], bantuan?: string): KolomSpek => ({ kunci, label, wajib, tipe, ...(pilihan ? { pilihan } : {}), ...(bantuan ? { bantuan } : {}) });

/** Kolom spesifikasi bawaan tiap jenis pengadaan. Daftar barang (rincian barang) tersedia untuk semua jenis. */
export const KOLOM_SPEK: Readonly<Record<JenisPengadaan, readonly KolomSpek[]>> = {
  "Paket meeting": [
    KOL("tempat", "Nama hotel atau tempat", true), KOL("paket", "Paket", true, "pilih", ["fullday", "fullboard"]), KOL("peserta", "Jumlah peserta", true, "angka"),
    KOL("hari", "Jumlah hari", false, "angka"), KOL("malam", "Jumlah malam menginap", false, "angka"), KOL("ruang", "Ruang dan perlengkapan (layar, mikrofon, dll.)"),
    KOL("makan", "Menu dan waktu makan (coffee break, makan siang)", false, "panjang"), KOL("khusus", "Kebutuhan khusus (halal, alergi, aksesibilitas)", false, "panjang"),
  ],
  Konsumsi: [
    KOL("jenis", "Jenis konsumsi", true, "pilih", ["Nasi kotak", "Prasmanan", "Snack", "Nasi kotak dan snack"]), KOL("porsi", "Jumlah porsi per kali", true, "angka"),
    KOL("kali", "Jumlah kali penyajian", true, "angka"), KOL("waktu", "Waktu dan lokasi antar"), KOL("khusus", "Kebutuhan khusus (halal, alergi)", false, "panjang"),
  ],
  Perlengkapan: [
    KOL("tujuan", "Kegunaan perlengkapan", false, "panjang"), KOL("lokasi", "Lokasi pengiriman"), KOL("batas", "Dibutuhkan paling lambat (tanggal)"),
  ],
  Pulsa: [
    KOL("jenis", "Jenis", true, "pilih", ["Pulsa", "Paket data"]), KOL("nominal", "Nominal per orang (Rp)", true, "angka"), KOL("penerima", "Jumlah penerima", true, "angka"),
    KOL("operator", "Operator atau kuota yang diminta"), KOL("kirim", "Cara pengiriman", false, "pilih", ["Disalurkan penyedia", "Dibeli lalu diteruskan"]),
  ],
  Penggandaan: [
    KOL("judul", "Dokumen yang digandakan", true), KOL("eksemplar", "Jumlah eksemplar", true, "angka"), KOL("halaman", "Halaman per eksemplar", false, "angka"),
    KOL("kertas", "Ukuran dan jenis kertas", false, "pilih", ["A4 80 gram", "A4 70 gram", "F4 80 gram", "Lainnya"]), KOL("warna", "Warna", false, "pilih", ["Hitam putih", "Berwarna"]),
    KOL("jilid", "Penjilidan", false, "pilih", ["Tanpa jilid", "Dijepit", "Dijilid"]),
  ],
  "Cetak buku": [
    KOL("judul", "Judul buku", true), KOL("oplah", "Oplah (eksemplar)", true, "angka"), KOL("halaman", "Jumlah halaman", false, "angka"), KOL("ukuran", "Ukuran (mis. A4, B5)"),
    KOL("isi", "Kertas isi dan warna"), KOL("sampul", "Kertas sampul dan finishing"), KOL("jilid", "Penjilidan"),
  ],
};

export type BarangSpek = { nama: string; jumlah: string; satuan: string; spesifikasi: string };
export type Spek = { isi: Record<string, string>; barang: BarangSpek[]; catatan: string };
export const MAKS_BARANG = 60;
export const MAKS_TEKS_SPEK = 300;
export const MAKS_PANJANG_SPEK = 800;
export const MAKS_CATATAN_SPEK = 500;

export const spekKosong = (): Spek => ({ isi: {}, barang: [], catatan: "" });

const rapi = (x: unknown, maks: number): string => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, maks) : "");

/** Isian spesifikasi mentah (dari basis data atau formulir) -> bentuk baku: hanya kolom jenis itu, teks dirapikan dan dibatasi, daftar barang tanpa baris kosong. */
export function bersihkanSpek(jenis: JenisPengadaan, mentah: unknown): Spek {
  const o = typeof mentah === "object" && mentah !== null && !Array.isArray(mentah) ? (mentah as Record<string, unknown>) : {};
  const sumber = typeof o.isi === "object" && o.isi !== null && !Array.isArray(o.isi) ? (o.isi as Record<string, unknown>) : {};
  const isi: Record<string, string> = {};
  for (const k of KOLOM_SPEK[jenis]) {
    const v = rapi(sumber[k.kunci], k.tipe === "panjang" ? MAKS_PANJANG_SPEK : MAKS_TEKS_SPEK);
    if (v === "") continue;
    if (k.tipe === "pilih" && k.pilihan && !k.pilihan.includes(v)) continue;
    if (k.tipe === "angka" && !/^\d{1,12}([.,]\d{1,2})?$/.test(v)) continue;
    isi[k.kunci] = v;
  }
  const barang: BarangSpek[] = [];
  if (Array.isArray(o.barang)) {
    for (const b of o.barang) {
      if (typeof b !== "object" || b === null) continue;
      const r = b as Record<string, unknown>;
      const x: BarangSpek = { nama: rapi(r.nama, 120), jumlah: rapi(r.jumlah, 20), satuan: rapi(r.satuan, 20), spesifikasi: rapi(r.spesifikasi, MAKS_PANJANG_SPEK) };
      if (x.nama === "" && x.spesifikasi === "") continue;
      barang.push(x);
      if (barang.length >= MAKS_BARANG) break;
    }
  }
  return { isi, barang, catatan: rapi(o.catatan, MAKS_CATATAN_SPEK) };
}

/** Hal wajib yang belum diisi (tidak memblokir; hanya penanda untuk pengusul). */
export function kurangSpek(jenis: JenisPengadaan, spek: Spek): string[] {
  const k = KOLOM_SPEK[jenis].filter((c) => c.wajib && !spek.isi[c.kunci]).map((c) => `${c.label} belum diisi`);
  if (jenis === "Perlengkapan" && spek.barang.length === 0) k.push("daftar barang belum diisi");
  return k;
}

export type RujukanRab = { kunci: string; ket: string; volume: number; satuan: string; harga: number; jumlah: number; bulan: number; minggu: number };
export type ButirKeluaran = {
  id: string; jenis: JenisPengadaan; kelompok: string; uraian: string; akun: string; satuan: string;
  /** Volume dan nilai menurut RAB (jumlah baris yang cocok); null bila belum ada baris RAB yang cocok atau baris itu dipakai bersama butir lain. */
  volumeRab: number | null; nilaiRab: number | null; digabung: boolean;
  tempat: string; paket: string; butuhMulai: string | null; butuhSelesai: string | null; perkiraan: boolean;
  perlu: string[]; catatan: string[]; rab: RujukanRab[]; spek: Spek; kurangSpek: string[];
};

const hapusPeriode = (u: string, nama: string[]): string => nama.reduce((s, p) => (p === "Kegiatan" ? s : s.split(` ${p}`).join("")), u).replace(/\s+/g, " ").trim();

/**
 * Butir pengadaan (susunPengadaan) dikaitkan ke baris RAB: akun sama dan uraian rincian sama (nama periode diabaikan). Baris RAB yang cocok dengan lebih dari satu
 * butir (mode gabung) tidak diisikan ke nilai butir mana pun; butirnya ditandai `digabung`.
 */
export function susunButir(butir: ItemPengadaan[], baris: BarisKel[], meta: ReadonlyMap<string, MetaKunci>, namaPeriode: string[], spek: ReadonlyMap<string, unknown>): ButirKeluaran[] {
  const cocok = (b: ItemPengadaan, k: BarisKel): boolean => {
    const m = k.kunci ? meta.get(k.kunci) : undefined;
    return !!m && m.akun === akun6(b.akun) && hapusPeriode(m.uraian, namaPeriode) === hapusPeriode(b.uraian, namaPeriode);
  };
  const dipakai = new Map<number, number>();
  for (const b of butir) for (const k of baris) if (cocok(b, k)) dipakai.set(k.baris_id, (dipakai.get(k.baris_id) ?? 0) + 1);
  return butir.map((b) => {
    const rs = baris.filter((k) => cocok(b, k));
    const bersama = rs.some((k) => (dipakai.get(k.baris_id) ?? 0) > 1);
    const utuh = rs.length > 0 && !bersama;
    const s = bersihkanSpek(b.jenis, spek.get(b.id));
    return {
      id: b.id, jenis: b.jenis, kelompok: b.kelompok, uraian: b.uraian, akun: b.akun, satuan: b.satuan,
      volumeRab: utuh ? bulat(rs.reduce((t, k) => t + k.volume, 0)) : null, nilaiRab: utuh ? jumlahTotal(rs) : null, digabung: bersama,
      tempat: b.tempat, paket: b.paket, butuhMulai: b.butuhMulai, butuhSelesai: b.butuhSelesai, perkiraan: b.perkiraan,
      perlu: b.perlu, catatan: b.catatan,
      rab: rs.map((k) => ({ kunci: k.kunci ?? "", ket: k.ket, volume: k.volume, satuan: k.satuan, harga: k.harga, jumlah: k.jumlah, bulan: k.bulan, minggu: k.minggu })),
      spek: s, kurangSpek: kurangSpek(b.jenis, s),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Paket keluaran
// ---------------------------------------------------------------------------------------------------------------------
export type IdentitasKeluaran = { identNama: string; roKode: string; tahun: number; identVer: number; rabNomor: string; rabStatus: string };
export type IsiKeluaran = { v: 1; survei: IdentitasKeluaran; n: number; total: number; dana: Dana; bayar: Bayar; pengadaan: ButirKeluaran[] };

export function susunKeluaran(identitas: IdentitasKeluaran, baris: BarisKel[], dana: Dana, bayar: Bayar, pengadaan: ButirKeluaran[]): IsiKeluaran {
  return { v: 1, survei: identitas, n: baris.length, total: jumlahTotal(baris), dana, bayar, pengadaan };
}

/** Alasan paket belum dapat diajukan; kosong bila boleh. Survei harus Siap dan ada rincian. */
export function hambatanAjukan(statusSurvei: "draf" | "siap", nRincian: number): string[] {
  const h: string[] = [];
  if (nRincian === 0) h.push("Belum ada rincian RAB dari survei ini.");
  if (statusSurvei !== "siap") h.push("RAB per survei belum ditandai Siap diajukan (tab RAB, bagian RAB per survei).");
  return h;
}

/** Sidik isi paket tanpa data waktu: dua paket dengan sidik sama dianggap tidak berbeda (pengajuan ulang tidak membuat versi baru). */
export function sidikIsi(i: IsiKeluaran): string { return JSON.stringify(i); }

const urutKunci = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(urutKunci);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().filter((k) => (x as Record<string, unknown>)[k] !== undefined).map((k) => [k, urutKunci((x as Record<string, unknown>)[k])]));
  return x;
};
/** Dua isi dianggap sama bila isinya sama, tak peduli urutan kunci (jsonb tidak menjaga urutan kunci). */
export function samaIsi(a: unknown, b: unknown): boolean { return JSON.stringify(urutKunci(a)) === JSON.stringify(urutKunci(b)); }

// ---------------------------------------------------------------------------------------------------------------------
// Paket tersimpan (dibaca kembali dari basis data)
// ---------------------------------------------------------------------------------------------------------------------
export type BagianKeluaran = "dana" | "bayar" | "pengadaan";
export const BAGIAN: readonly BagianKeluaran[] = ["dana", "bayar", "pengadaan"];
export const LABEL_BAGIAN: Readonly<Record<BagianKeluaran, { judul: string; penerima: string }>> = {
  dana: { judul: "Kebutuhan dana", penerima: "Bendahara" },
  bayar: { judul: "Rencana pembayaran", penerima: "PPK dan TU" },
  pengadaan: { judul: "Permintaan pengadaan", penerima: "PBJ" },
};
export type StatusTanda = "diterima" | "ditanyakan";
export type BarisTanda = { keluaran_id: number; bagian: BagianKeluaran; status: StatusTanda; catatan: string; oleh_nama: string | null; at: string };

/** Tanda terima terbaru per bagian untuk satu paket. */
export function petaTanda(baris: readonly Partial<BarisTanda>[] | null | undefined, keluaranId: number): Map<BagianKeluaran, BarisTanda> {
  const m = new Map<BagianKeluaran, BarisTanda>();
  for (const b of baris ?? []) {
    if (b.keluaran_id !== keluaranId || !b.bagian || !(BAGIAN as readonly string[]).includes(b.bagian)) continue;
    if (b.status !== "diterima" && b.status !== "ditanyakan") continue;
    m.set(b.bagian, { keluaran_id: keluaranId, bagian: b.bagian, status: b.status, catatan: b.catatan ?? "", oleh_nama: b.oleh_nama ?? null, at: b.at ?? "" });
  }
  return m;
}

/** Isi paket dari jsonb: memeriksa bentuk dasar saja; null bila bukan paket versi 1. */
export function bacaIsiKeluaran(x: unknown): IsiKeluaran | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || typeof o.dana !== "object" || o.dana === null || typeof o.bayar !== "object" || o.bayar === null || !Array.isArray(o.pengadaan) || typeof o.survei !== "object" || o.survei === null) return null;
  return o as unknown as IsiKeluaran;
}

