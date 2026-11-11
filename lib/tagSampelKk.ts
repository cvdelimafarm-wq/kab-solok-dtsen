// lib/tagSampelKk.ts  (logika murni; aman diimpor klien dan server)
//
// (11 Nov 2026) UNGGAH SAMPEL SATU KALI. Berkas pembagian sampel (Kode Sub SLS, Nama KK, Anggota Lain, Patokan, PPL, Peran Sampel; ID KK boleh kosong) langsung
// menjadi tag untuk PPL pemilik sub SLS dan PML-nya, tanpa unggah KK master terpisah lebih dulu. Tiap baris sampel dicocokkan ke KK master:
//   1. ID KK ada dan cocok dengan sub SLS-nya            -> pakai KK itu (cocok_id);
//   2. selain itu, nama (dan anggota ruta bila perlu) sama dengan satu KK master di sub SLS yang sama -> pakai KK itu (cocok_nama);
//   3. tidak ada yang cocok (atau KK master itu sudah dipakai baris lain) -> perlu diputuskan: tambahkan sebagai KK baru di master (bawaan), pakai KK master lain, atau lewati;
//   4. nama cocok dengan beberapa KK master dan anggota ruta tidak membedakan -> WAJIB diputuskan.
// Hasilnya baris bernormalisasi (Kode Sub SLS | ID KK | Peran Sampel) yang diperiksa periksaTagUnggah() seperti biasa. KK baru memakai ID sementara
// (SINTETIS_AWAL + urutan) yang diganti ID master sebenarnya oleh server saat menyimpan.

import { bacaKodeSubsls } from "@/lib/alokasiWilayah";
import { bacaPeranTag, petaKolomTag, type PeranTag } from "@/lib/tagSampel";
import type { GalatBaris } from "@/lib/sampelSls";

export const SINTETIS_AWAL = 900_000_000_000_000;
export const adalahSintetis = (id: number): boolean => id >= SINTETIS_AWAL;
export const HEADER_NORMAL = { kode: "Kode Sub SLS", kk: "ID KK", peran: "Peran Sampel" } as const;

export type MasterKk = { id: number; idsubsls: string; nama_kk: string; anggota_lain: string | null; patokan: string | null };
export type Keputusan = "tambah" | "lewati" | `pakai:${number}`;
export type AlasanPerlu = "tidak_ada" | "kandidat_banyak" | "master_terpakai";

export type PerluKeputusan = {
  /** nomor baris Excel (judul = baris 1) */
  baris: number;
  idsubsls: string;
  nama: string;
  anggota: string | null;
  peran: PeranTag;
  alasan: AlasanPerlu;
  /** KK master yang dapat dipilih (kandidat senama, atau semua KK sub SLS bila tidak ada yang senama dan jumlahnya kecil) */
  kandidat: { id: number; nama_kk: string; anggota_lain: string | null; patokan: string | null }[];
  /** keputusan yang berlaku sekarang; null = belum diputuskan (hanya kandidat_banyak) */
  keputusan: Keputusan | null;
  /** true bila keputusan datang dari petugas (bukan bawaan) */
  eksplisit: boolean;
};

export type KkBaru = { sintetis: number; baris: number; idsubsls: string; nama_kk: string; anggota_lain: string | null; patokan: string | null };

export type HasilCocok = {
  /** satu baris per baris masukan (urutan sama, nomor baris sama), siap diperiksa periksaTagUnggah */
  rows: Record<string, unknown>[];
  baru: KkBaru[];
  perlu: PerluKeputusan[];
  ringkas: { cocok_id: number; cocok_nama: number; baru: number; dilewati: number; perlu: number; belum_diputuskan: number };
  galat: GalatBaris[];
  peringatan: GalatBaris[];
};

const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
/** Bentuk perbandingan nama: huruf kecil, hanya huruf/angka, satu spasi. */
export const rapatNama = (s: unknown): string => teks(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Bentuk simpan nama_kk_norm di master_kk (sama dengan unggahan KK master): huruf kecil, satu spasi. */
export const normSimpan = (s: unknown): string => teks(s).toLowerCase();

const ALIAS_EKSTRA: Record<"nama" | "anggota" | "patokan" | "ppl", string[]> = {
  nama: ["namakk", "namakepalakeluarga", "namakeluarga", "kepalakeluarga", "nama"],
  anggota: ["anggotalain", "anggotarutalain", "anggotaruta", "anggotakeluarga"],
  patokan: ["patokan", "patokanrumah"],
  ppl: ["ppl", "namappl", "petugas", "petugasppl"],
};
const rapatJudul = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

export function petaKolomKk(judul: readonly string[]): { kode?: string; kk?: string; peran?: string; nama?: string; anggota?: string; patokan?: string; ppl?: string } {
  const hasil: { kode?: string; kk?: string; peran?: string; nama?: string; anggota?: string; patokan?: string; ppl?: string } = { ...petaKolomTag(judul) };
  for (const j of judul) {
    const r = rapatJudul(String(j ?? ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS_EKSTRA) as (keyof typeof ALIAS_EKSTRA)[]) {
      if (!hasil[m] && ALIAS_EKSTRA[m].includes(r)) hasil[m] = String(j);
    }
  }
  return hasil;
}

/** Urai teks keputusan menjadi bentuk baku; null = tidak sah. */
export function bacaKeputusan(v: unknown): Keputusan | null {
  const s = String(v ?? "").trim();
  if (s === "tambah" || s === "lewati") return s;
  const m = /^pakai:(\d{1,15})$/.exec(s);
  return m && Number(m[1]) > 0 ? (`pakai:${Number(m[1])}` as Keputusan) : null;
}

/**
 * Cocokkan baris berkas ke KK master. `keputusan` = peta nomor baris Excel -> keputusan petugas (kosong = bawaan).
 * `pplAlokasi` (opsional) = sub SLS -> nama PPL pada alokasi, hanya untuk peringatan bila kolom PPL berkas berbeda.
 */
export function cocokkanKkUnggah(
  mentah: readonly Record<string, unknown>[],
  master: readonly MasterKk[],
  alokasi: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  keputusan: Readonly<Record<string, unknown>> = {},
  pplAlokasi?: ReadonlyMap<string, string | null>
): HasilCocok {
  const hasil: HasilCocok = { rows: [], baru: [], perlu: [], ringkas: { cocok_id: 0, cocok_nama: 0, baru: 0, dilewati: 0, perlu: 0, belum_diputuskan: 0 }, galat: [], peringatan: [] };
  if (mentah.length === 0) return hasil;
  const kolom = petaKolomKk(Object.keys(mentah[0]));
  const adaAlokasi = (s: string) => alokasi.has(s);
  const ambil = (b: Record<string, unknown>, m: keyof typeof kolom) => (kolom[m] ? teks(b[kolom[m] as string]) : "");

  const perSub = new Map<string, MasterKk[]>();
  const perId = new Map<number, MasterKk>();
  for (const k of master) {
    perId.set(k.id, k);
    const l = perSub.get(k.idsubsls) ?? [];
    l.push(k);
    perSub.set(k.idsubsls, l);
  }

  type Baris = { no: number; kode: string; peran: PeranTag; idTeks: string; idCocok: MasterKk | null; nama: string; anggota: string; patokan: string };
  const sampel = new Map<number, Baris>(); // nomor baris -> baris sampel yang sah dibaca
  const pakai = new Set<number>(); // id master yang sudah dipakai
  mentah.forEach((b, i) => {
    const no = i + 2;
    const kode = bacaKodeSubsls(ambil(b, "kode"));
    const peran = bacaPeranTag(ambil(b, "peran"));
    if (!kode.ok || !peran || !adaAlokasi(kode.kode)) return; // kosong / bukan sampel / galat: dilewatkan apa adanya ke periksaTagUnggah
    const idTeks = ambil(b, "kk");
    const idNum = /^[0-9]{1,15}$/.test(idTeks) ? Number(idTeks) : 0;
    const m = idNum > 0 ? perId.get(idNum) : undefined;
    const idCocok = m && m.idsubsls === kode.kode ? m : null;
    sampel.set(no, { no, kode: kode.kode, peran, idTeks, idCocok, nama: ambil(b, "nama"), anggota: ambil(b, "anggota"), patokan: ambil(b, "patokan") });
    if (idCocok) pakai.add(idCocok.id);
  });

  let urutBaru = 0;
  mentah.forEach((b, i) => {
    const no = i + 2;
    const s = sampel.get(no);
    const asli = { [HEADER_NORMAL.kode]: ambil(b, "kode"), [HEADER_NORMAL.kk]: ambil(b, "kk"), [HEADER_NORMAL.peran]: ambil(b, "peran") };
    if (!s) {
      hasil.rows.push(asli);
      return;
    }
    const keluar = (id: number | string, peran: string = ambil(b, "peran")) => hasil.rows.push({ [HEADER_NORMAL.kode]: s.kode, [HEADER_NORMAL.kk]: String(id), [HEADER_NORMAL.peran]: peran });
    const subPpl = pplAlokasi?.get(s.kode);
    const pplBerkas = ambil(b, "ppl");
    if (subPpl && pplBerkas && rapatNama(subPpl) !== rapatNama(pplBerkas)) {
      hasil.peringatan.push({ baris: no, pesan: `PPL pada berkas (${pplBerkas}) berbeda dari PPL alokasi sub SLS ${s.kode} (${subPpl}); sampel mengikuti alokasi.` });
    }

    // 1. cocok ID
    if (s.idCocok) {
      hasil.ringkas.cocok_id++;
      keluar(s.idCocok.id);
      return;
    }

    // keputusan petugas (bila ada)
    const mentahKep = keputusan[String(no)];
    const kep = mentahKep === undefined || mentahKep === null || mentahKep === "" ? null : bacaKeputusan(mentahKep);
    if (mentahKep !== undefined && mentahKep !== null && mentahKep !== "" && kep === null) hasil.galat.push({ baris: no, pesan: `Keputusan "${String(mentahKep)}" tidak dikenal.` });

    // 2. cocok nama
    const di = perSub.get(s.kode) ?? [];
    const rn = rapatNama(s.nama);
    let kandidat: MasterKk[] = rn ? di.filter((k) => rapatNama(k.nama_kk) === rn) : [];
    const sebelumSaring = kandidat.length;
    if (kandidat.length > 1 && s.anggota) kandidat = kandidat.filter((k) => rapatNama(k.anggota_lain) === rapatNama(s.anggota));
    const bebas = kandidat.filter((k) => !pakai.has(k.id));
    let alasan: AlasanPerlu | null = null;
    if (!kep && bebas.length === 1) {
      hasil.ringkas.cocok_nama++;
      pakai.add(bebas[0].id);
      keluar(bebas[0].id);
      return;
    }
    if (bebas.length > 1) alasan = "kandidat_banyak";
    else alasan = sebelumSaring > 0 ? "master_terpakai" : "tidak_ada";
    const pilihan = (bebas.length > 0 ? bebas : sebelumSaring > 0 ? di.filter((k) => rapatNama(k.nama_kk) === rn) : []).slice(0, 12);

    // 3/4. perlu keputusan
    const entri: PerluKeputusan = {
      baris: no, idsubsls: s.kode, nama: s.nama, anggota: s.anggota || null, peran: s.peran, alasan, kandidat: pilihan.map((k) => ({ id: k.id, nama_kk: k.nama_kk, anggota_lain: k.anggota_lain, patokan: k.patokan })),
      keputusan: null, eksplisit: !!kep,
    };
    let putus: Keputusan | null = kep ?? (alasan === "kandidat_banyak" ? null : "tambah");
    if (putus && putus.startsWith("pakai:")) {
      const id = Number(putus.slice(6));
      const m = perId.get(id);
      if (!m || m.idsubsls !== s.kode) {
        hasil.galat.push({ baris: no, pesan: `KK master ${id} bukan KK sub SLS ${s.kode}.` });
        putus = null;
      } else if (pakai.has(id)) {
        hasil.galat.push({ baris: no, pesan: `KK master ${id} (${m.nama_kk}) sudah dipakai baris lain.` });
        putus = null;
      } else pakai.add(id);
    }
    entri.keputusan = putus;
    hasil.perlu.push(entri);
    if (putus === null) {
      hasil.ringkas.belum_diputuskan++;
      if (!hasil.galat.some((g) => g.baris === no)) hasil.galat.push({ baris: no, pesan: `Putuskan KK "${s.nama}": cocok dengan ${bebas.length} KK master. Pilih salah satu, tambahkan sebagai KK baru, atau lewati.` });
      keluar(s.idTeks || "0");
      return;
    }
    if (putus === "lewati") {
      hasil.ringkas.dilewati++;
      keluar("", "");
      return;
    }
    if (putus === "tambah") {
      if (!s.nama) {
        hasil.galat.push({ baris: no, pesan: "Nama KK kosong, tidak dapat ditambahkan sebagai KK baru. Isi kolom Nama KK atau lewati." });
        keluar(s.idTeks || "0");
        return;
      }
      const sintetis = SINTETIS_AWAL + ++urutBaru;
      hasil.baru.push({ sintetis, baris: no, idsubsls: s.kode, nama_kk: s.nama, anggota_lain: s.anggota || null, patokan: s.patokan || null });
      hasil.ringkas.baru++;
      keluar(sintetis);
      return;
    }
    keluar(putus.slice(6)); // pakai:<id>
    hasil.ringkas.cocok_nama++;
  });
  hasil.ringkas.perlu = hasil.perlu.length;
  return hasil;
}
