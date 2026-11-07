// lib/tagSampel.ts  (logika murni; aman diimpor klien dan server)
//
// (7 Nov 2026) TAG SAMPEL STAGE 2 + JENDELA RILIS (tahap A2 rancangan "sampel lintas survei"). Petugas/Ketua MENANDAI KK master sebagai sampel utama atau cadangan.
// Penegakan aturan ada di basis data (migrasi 20261107f); berkas ini hanya: tipe layar, hitung mundur jendela, templat Excel, dan pemeriksaan berkas unggahan
// (pratinjau di server dan klien memakai logika yang sama, DB tetap memeriksa ulang).
//
// Templat unggah (satu baris per KK pada sub SLS beralokasi):
//   Kode Sub SLS | NKS | Kecamatan | Nagari | Jorong | ID KK | Nama KK | Anggota Lain | Patokan | PPL | Peran Sampel
// Kolom yang dibaca saat unggah: Kode Sub SLS, ID KK, Peran Sampel. Peran: "utama" atau "cadangan" (juga U/C, 1/2, x); kosong = bukan sampel.

import { bacaKodeSubsls, PANJANG_SUBSLS } from "@/lib/alokasiWilayah";
import type { GalatBaris } from "@/lib/sampelSls";

export const API_TAG_ADMIN = "/api/portal/pendataan/tag";
export const MAKS_BARIS_TAG = 20000;
export const JAM_JENDELA = 24;

export type PeranTag = "utama" | "cadangan";
export type HasilTag = "didata" | "menolak" | "tidak_ditemukan";
export const LABEL_HASIL: Record<HasilTag, string> = { didata: "Didata", menolak: "Menolak", tidak_ditemukan: "Tidak ditemukan" };
export type StatusJendela = "belum" | "terbuka" | "terkunci";

export type InfoJendela = {
  status: StatusJendela;
  id?: number;
  dibuka_at?: string;
  /** waktu tutup sebenarnya (lebih awal bila ditutup manual) */
  ditutup_at?: string;
  batas_at?: string;
  detik_sisa: number;
  dibuka_oleh?: string | null;
  alasan?: string | null;
  buka_kembali?: boolean;
  jumlah_buka: number;
  /** jam server saat data dibuat; dipakai menghitung selisih jam HP */
  sekarang: string;
};
export const JENDELA_AWAL: InfoJendela = { status: "belum", detik_sisa: 0, jumlah_buka: 0, sekarang: new Date(0).toISOString() };

/** Satu tag aktif pada satu KK. */
export type TagKk = { kk_id: number; peran: PeranTag; hasil: HasilTag | null; via: "hp" | "unggah" };

/** Rekap tag satu sub SLS. */
export type RekapTagSub = { idsubsls: string; target: number; cadangan: number; utama: number; cad: number; didata: number; menolak: number; tidak_ditemukan: number };

export function rekapTagSub(idsubsls: string, target: number, cadangan: number, tag: readonly TagKk[]): RekapTagSub {
  const r: RekapTagSub = { idsubsls, target, cadangan, utama: 0, cad: 0, didata: 0, menolak: 0, tidak_ditemukan: 0 };
  for (const t of tag) {
    if (t.peran === "utama") r.utama++;
    else r.cad++;
    if (t.hasil) r[t.hasil]++;
  }
  return r;
}

/** Data satu sub SLS di HP: jendela, batas jumlah, dan tag aktif. */
export type DataTagSub = { jendela: InfoJendela; target: number; cadangan: number; tag: TagKk[] };

// ---------------------------------------------------------------------------------------------------------------------------------
// Hitung mundur
// ---------------------------------------------------------------------------------------------------------------------------------

/** Selisih jam server terhadap jam HP (ms), diukur saat data diterima. Jam HP yang salah tidak memengaruhi hitung mundur. */
export const selisihJam = (sekarangServer: string, nowMs: number = Date.now()): number => {
  const t = Date.parse(sekarangServer);
  return Number.isFinite(t) ? t - nowMs : 0;
};

/** Sisa detik jendela pada saat `nowMs` (jam HP) dengan koreksi selisih; 0 bila tidak terbuka atau sudah lewat. */
export function sisaDetik(j: InfoJendela, selisihMs: number, nowMs: number = Date.now()): number {
  if (j.status !== "terbuka" || !j.batas_at) return 0;
  const batas = Date.parse(j.batas_at);
  if (!Number.isFinite(batas)) return 0;
  return Math.max(0, Math.floor((batas - (nowMs + selisihMs)) / 1000));
}

export function formatSisa(detik: number): string {
  if (detik <= 0) return "0 menit";
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (j > 0) return `${j} jam ${m} menit`;
  if (m > 0) return `${m} menit`;
  return "kurang dari 1 menit";
}

/** Status efektif di klien: jendela yang hitung mundurnya habis dianggap terkunci walau data belum dimuat ulang. */
export function statusEfektif(j: InfoJendela, selisihMs: number, nowMs: number = Date.now()): StatusJendela {
  if (j.status === "terbuka" && sisaDetik(j, selisihMs, nowMs) <= 0) return "terkunci";
  return j.status;
}

export const KET_JENDELA: Record<StatusJendela, string> = {
  belum: "Penandaan sampel belum dibuka oleh Ketua tim.",
  terbuka: "Penandaan sampel sedang dibuka.",
  terkunci: "Daftar sampel sudah dikunci. Anda hanya mengisi hasil pendataan.",
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Peran
// ---------------------------------------------------------------------------------------------------------------------------------

/** "utama" | "cadangan" | "" (bukan sampel) | null (tidak dikenali). */
export function bacaPeranTag(v: unknown): PeranTag | "" | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9✓✔]/g, "");
  if (s === "") return "";
  if (["utama", "u", "1", "x", "ya", "y", "v", "✓", "✔", "sampel", "sampelutama"].includes(s)) return "utama";
  if (["cadangan", "c", "cad", "cd", "2", "sampelcadangan"].includes(s)) return "cadangan";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Templat
// ---------------------------------------------------------------------------------------------------------------------------------

export const KOLOM_TEMPLAT_TAG = ["Kode Sub SLS", "NKS", "Kecamatan", "Nagari", "Jorong", "ID KK", "Nama KK", "Anggota Lain", "Patokan", "PPL", "Peran Sampel"] as const;

/** Satu baris templat dari server: KK master pada sub SLS beralokasi, dengan tag yang sudah ada. */
export type BarisTemplatTag = {
  idsubsls: string;
  nks: string | null;
  kecamatan: string;
  nagari: string;
  sls: string;
  kk_id: number;
  nama_kk: string;
  anggota_lain: string | null;
  patokan: string | null;
  ppl_nama: string | null;
  peran: PeranTag | null;
};

export function templatTag(baris: readonly BarisTemplatTag[]): string[][] {
  return [
    [...KOLOM_TEMPLAT_TAG],
    ...baris.map((b) => [b.idsubsls, b.nks ?? "", b.kecamatan, b.nagari, b.sls, String(b.kk_id), b.nama_kk, b.anggota_lain ?? "", b.patokan ?? "", b.ppl_nama ?? "", b.peran ?? ""]),
  ];
}

export const PETUNJUK_TEMPLAT_TAG = [
  "Isi kolom Peran Sampel dengan utama atau cadangan; kosongkan bila KK bukan sampel.",
  "Jangan mengubah Kode Sub SLS dan ID KK; keduanya dipakai untuk mencocokkan.",
  "Jumlah utama per sub SLS tidak boleh melebihi target, dan cadangan tidak boleh melebihi jatah cadangan kegiatan.",
  "Unggahan hanya bisa selama jendela rilis belum pernah dibuka atau sedang terbuka.",
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Pemeriksaan berkas unggahan
// ---------------------------------------------------------------------------------------------------------------------------------

type Medan = "kode" | "kk" | "peran";
const ALIAS: Record<Medan, string[]> = {
  kode: ["kodesubsls", "idsubsls", "kodewilayah", "kodesub"],
  kk: ["idkk", "kkid", "idkeluarga", "idmasterkk"],
  peran: ["peransampel", "peran", "tagsampel", "sampel", "jenissampel"],
};
const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

export function petaKolomTag(judul: readonly string[]): Partial<Record<Medan, string>> {
  const hasil: Partial<Record<Medan, string>> = {};
  for (const j of judul) {
    const r = rapat(String(j ?? "").replace(/\([^)]*\)/g, ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS) as Medan[]) {
      if (!hasil[m] && ALIAS[m].includes(r)) {
        hasil[m] = String(j);
        break;
      }
    }
  }
  return hasil;
}

export type BarisTag = { idsubsls: string; kk_id: number; peran: PeranTag };
export type ModeTag = "tambah" | "ganti";

/** Keadaan basis data yang dibutuhkan pemeriksaan (dikumpulkan server/klien). */
export type KonteksTag = {
  /** sub SLS beralokasi -> target utama */
  alokasi: ReadonlyMap<string, number>;
  /** jatah cadangan per sub SLS */
  cadangan: number;
  /** KK aktif pada sub SLS beralokasi: id -> sub SLS */
  kk: ReadonlyMap<number, string>;
  /** tag aktif sekarang: kk_id -> tag */
  ada: ReadonlyMap<number, { idsubsls: string; peran: PeranTag; hasil: HasilTag | null }>;
};

export type RingkasTagUnggah = { dibaca: number; sampel: number; baru: number; sama: number; ganti_peran: number; dilepas: number; konflik: number; subsls: number };
export type HasilTagUnggah = { baris: BarisTag[]; galat: GalatBaris[]; peringatan: GalatBaris[]; ringkas: RingkasTagUnggah; dilewati: number; bisa_simpan: boolean };

/** Baris hasil sheet_to_json -> baris tag bersih + pemeriksaan terhadap konteks. Galat = berkas tidak boleh disimpan. */
export function periksaTagUnggah(mentah: readonly Record<string, unknown>[], k: KonteksTag, mode: ModeTag): HasilTagUnggah {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  const baris: BarisTag[] = [];
  const kosong = (pesan: string): HasilTagUnggah => ({ baris, galat: [{ baris: 0, pesan }], peringatan, ringkas: { dibaca: 0, sampel: 0, baru: 0, sama: 0, ganti_peran: 0, dilepas: 0, konflik: 0, subsls: 0 }, dilewati: 0, bisa_simpan: false });
  if (mentah.length === 0) return kosong("Berkas tidak berisi baris.");
  if (mentah.length > MAKS_BARIS_TAG) return kosong(`Berkas memuat ${mentah.length} baris; batas satu unggahan ${MAKS_BARIS_TAG}.`);
  const kolom = petaKolomTag(Object.keys(mentah[0]));
  const hilang = (["kode", "kk", "peran"] as Medan[]).filter((m) => !kolom[m]).map((m) => ({ kode: "Kode Sub SLS", kk: "ID KK", peran: "Peran Sampel" })[m]);
  if (hilang.length > 0) return kosong(`Kolom tidak ditemukan: ${hilang.join(", ")}. Unduh templat untuk melihat format.`);
  const ambil = (b: Record<string, unknown>, m: Medan) => teks(b[kolom[m] as string]);

  const pernah = new Map<number, number>();
  const subDiBerkas = new Set<string>();
  let dilewati = 0;
  let dibaca = 0;
  mentah.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    dibaca++;
    const kode = bacaKodeSubsls(ambil(b, "kode"));
    if (!kode.ok) {
      galat.push({ baris: no, pesan: kode.pesan });
      return;
    }
    subDiBerkas.add(kode.kode);
    const peran = bacaPeranTag(ambil(b, "peran"));
    if (peran === null) {
      galat.push({ baris: no, pesan: `Peran Sampel "${ambil(b, "peran")}" tidak dikenal. Isi utama, cadangan, atau kosongkan.` });
      return;
    }
    if (peran === "") return; // bukan sampel
    const kkTeks = ambil(b, "kk");
    const kkId = Number(kkTeks);
    if (!/^[0-9]{1,15}$/.test(kkTeks) || !Number.isSafeInteger(kkId) || kkId <= 0) {
      galat.push({ baris: no, pesan: `ID KK "${kkTeks}" tidak sah. Jangan mengubah kolom ID KK dari templat.` });
      return;
    }
    if (!k.alokasi.has(kode.kode)) {
      galat.push({ baris: no, pesan: `Sub SLS ${kode.kode} tidak ada dalam alokasi kegiatan ini.` });
      return;
    }
    const sub = k.kk.get(kkId);
    if (sub === undefined || sub !== kode.kode) {
      galat.push({ baris: no, pesan: `ID KK ${kkId} tidak cocok dengan sub SLS ${kode.kode} (atau KK sudah tidak aktif).` });
      return;
    }
    const sebelum = pernah.get(kkId);
    if (sebelum !== undefined) {
      galat.push({ baris: no, pesan: `ID KK ${kkId} sudah ada di baris ${sebelum}. Satu KK hanya boleh satu peran.` });
      return;
    }
    pernah.set(kkId, no);
    baris.push({ idsubsls: kode.kode, kk_id: kkId, peran });
  });
  if (dibaca === 0) return kosong("Berkas tidak berisi baris.");

  // jumlah per sub SLS dan konflik terhadap tag yang sudah ada
  const ringkas: RingkasTagUnggah = { dibaca, sampel: baris.length, baru: 0, sama: 0, ganti_peran: 0, dilepas: 0, konflik: 0, subsls: new Set(baris.map((x) => x.idsubsls)).size };
  const dalamBerkas = new Set(baris.map((x) => x.kk_id));
  const perSub = new Map<string, { utama: number; cad: number }>();
  for (const x of baris) {
    const p = perSub.get(x.idsubsls) ?? { utama: 0, cad: 0 };
    if (x.peran === "utama") p.utama++;
    else p.cad++;
    perSub.set(x.idsubsls, p);
    const a = k.ada.get(x.kk_id);
    if (!a) ringkas.baru++;
    else if (a.peran === x.peran) ringkas.sama++;
    else if (mode === "ganti" && a.hasil === null) ringkas.ganti_peran++;
    else {
      ringkas.konflik++;
      galat.push({ baris: pernah.get(x.kk_id) ?? 0, pesan: a.hasil !== null ? `KK ${x.kk_id} sudah punya hasil pendataan (${LABEL_HASIL[a.hasil]}); perannya tidak dapat diubah.` : `KK ${x.kk_id} sudah bertag ${a.peran}, berkas menulis ${x.peran}. Pilih mode "Ganti" bila berkas yang benar.` });
    }
  }
  // tag aktif di sub SLS berkas yang tidak ada di berkas
  const sisa = new Map<string, { utama: number; cad: number }>();
  for (const [kkId, a] of k.ada) {
    if (!subDiBerkas.has(a.idsubsls) || dalamBerkas.has(kkId)) continue;
    if (mode === "ganti") {
      if (a.hasil !== null) {
        galat.push({ baris: 0, pesan: `Sub SLS ${a.idsubsls}: KK ${kkId} sudah punya hasil pendataan (${LABEL_HASIL[a.hasil]}) tetapi tidak ada di berkas; tag itu tidak dapat dilepas.` });
        ringkas.konflik++;
      } else ringkas.dilepas++;
    } else {
      const p = sisa.get(a.idsubsls) ?? { utama: 0, cad: 0 };
      if (a.peran === "utama") p.utama++;
      else p.cad++;
      sisa.set(a.idsubsls, p);
    }
  }
  for (const [sub, p] of perSub) {
    const target = k.alokasi.get(sub) ?? 0;
    const s = sisa.get(sub) ?? { utama: 0, cad: 0 };
    if (p.utama + s.utama > target) galat.push({ baris: 0, pesan: `Sub SLS ${sub}: sampel utama menjadi ${p.utama + s.utama}, melebihi target ${target}.` });
    else if (p.utama + s.utama < target) peringatan.push({ baris: 0, pesan: `Sub SLS ${sub}: sampel utama ${p.utama + s.utama} dari target ${target} (masih kurang).` });
    if (p.cad + s.cad > k.cadangan) galat.push({ baris: 0, pesan: k.cadangan === 0 ? `Sub SLS ${sub}: kegiatan ini tidak memakai sampel cadangan, tetapi berkas memuat ${p.cad}.` : `Sub SLS ${sub}: sampel cadangan menjadi ${p.cad + s.cad}, melebihi jatah ${k.cadangan}.` });
    else if (k.cadangan > 0 && p.cad + s.cad < k.cadangan) peringatan.push({ baris: 0, pesan: `Sub SLS ${sub}: sampel cadangan ${p.cad + s.cad} dari jatah ${k.cadangan} (masih kurang).` });
  }
  if (baris.length === 0 && galat.length === 0) galat.push({ baris: 0, pesan: "Tidak ada KK yang diberi peran sampel pada berkas." });
  galat.sort((a, b) => a.baris - b.baris);
  return { baris, galat, peringatan, ringkas, dilewati, bisa_simpan: galat.length === 0 && baris.length > 0 };
}

export const PANJANG_KODE = PANJANG_SUBSLS;
