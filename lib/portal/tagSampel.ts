// lib/portal/tagSampel.ts  (hanya server)
//
// (7 Nov 2026) Tag sampel stage 2 + jendela rilis 24 jam (tahap A2). Semua aturan ditegakkan di fungsi basis data (migrasi 20261107f); modul ini membaca data layar,
// memanggil fungsi itu, dan menerjemahkan penolakannya menjadi pesan. Aman dipakai SEBELUM migrasi dijalankan: pembacaan memberi `siap: false`.

import type { Db } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { GalatSampel, peranSampel } from "@/lib/portal/sampel";
import { bacaAlokasi, muatKonfigAlokasi } from "@/lib/portal/alokasiWilayah";
import { bacaGanti, bacaSetelanGanti, dataGantiAdmin } from "@/lib/portal/gantiSampel";
import { GANTI_KOSONG, type DataGantiAdmin } from "@/lib/gantiSampel";
import { bacaKodeSubsls, type DataAlokasiSaya, type KonfigAlokasi, type WilayahAlokasi } from "@/lib/alokasiWilayah";
import {
  JENDELA_AWAL, MAKS_BARIS_TAG, periksaTagUnggah, petaKolomTag, rekapTagSub,
  type BarisTemplatTag, type DataTagSub, type HasilTag, type HasilTagUnggah, type InfoJendela, type ModeTag, type PeranTag, type RekapTagSub, type TagKk,
} from "@/lib/tagSampel";
import { cocokkanKkUnggah, normSimpan, type HasilCocok, type KkBaru, type PerluKeputusan } from "@/lib/tagSampelKk"; // (11 Nov 2026) unggah sampel satu kali

const PESAN_BELUM_MIGRASI = "Penandaan sampel belum aktif di basis data (migrasi 20261107f belum dijalankan).";
const belumMigrasi = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === "42P01" || e.code === "42883" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache|Could not find/i.test(e.message ?? ""));
const potong = <T,>(a: readonly T[], n: number): T[][] => {
  const h: T[][] = [];
  for (let i = 0; i < a.length; i += n) h.push(a.slice(i, i + n));
  return h;
};

type Hasil = { ok?: boolean; pesan?: string; kode?: string } & Record<string, unknown>;

/** Memanggil fungsi basis data yang mengembalikan {ok, pesan, kode}; penolakan aturan menjadi GalatSampel 409. */
async function panggil(db: Db, fn: string, args: Record<string, unknown>): Promise<Hasil> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = (data ?? {}) as Hasil;
  if (!h.ok) throw new GalatSampel(h.pesan ?? "Permintaan ditolak.", 409, h.kode);
  return h;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Jendela rilis
// ---------------------------------------------------------------------------------------------------------------------------------

export async function infoJendela(db: Db, kegiatanId: number): Promise<{ jendela: InfoJendela; siap: boolean }> {
  const { data, error } = await db.rpc("sigap_jendela_info", { p_kegiatan: kegiatanId });
  if (error) {
    if (belumMigrasi(error)) return { jendela: { ...JENDELA_AWAL, sekarang: new Date().toISOString() }, siap: false };
    throw new Error(error.message);
  }
  return { jendela: data as InfoJendela, siap: true };
}

export async function bukaJendela(db: Db, akun: AkunPortal, kegiatanId: number, alasan: unknown): Promise<{ jendela: InfoJendela; buka_kembali: boolean }> {
  const h = await panggil(db, "sigap_jendela_buka", { p_kegiatan: kegiatanId, p_akun: akun.id, p_nama: akun.nama, p_alasan: typeof alasan === "string" ? alasan : "" });
  return { jendela: h.info as InfoJendela, buka_kembali: h.buka_kembali === true };
}

export async function tutupJendela(db: Db, akun: AkunPortal, kegiatanId: number): Promise<InfoJendela> {
  const h = await panggil(db, "sigap_jendela_tutup", { p_kegiatan: kegiatanId, p_nama: akun.nama });
  return h.info as InfoJendela;
}

export type RiwayatJendela = { id: number; dibuka_at: string; ditutup_at: string; ditutup_awal_at: string | null; dibuka_oleh: string | null; ditutup_oleh: string | null; alasan: string | null; buka_kembali: boolean };

async function riwayatJendela(db: Db, kegiatanId: number): Promise<RiwayatJendela[]> {
  const { data, error } = await db.from("sigap_sampel_jendela").select("id, dibuka_at, ditutup_at, ditutup_awal_at, dibuka_oleh, ditutup_oleh, alasan, buka_kembali").eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(10);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    dibuka_at: String(r.dibuka_at),
    ditutup_at: String(r.ditutup_at),
    ditutup_awal_at: (r.ditutup_awal_at as string | null) ?? null,
    dibuka_oleh: (r.dibuka_oleh as string | null) ?? null,
    ditutup_oleh: (r.ditutup_oleh as string | null) ?? null,
    alasan: (r.alasan as string | null) ?? null,
    buka_kembali: r.buka_kembali === true,
  }));
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan tag
// ---------------------------------------------------------------------------------------------------------------------------------

type BarisTag = { kk_id: number; idsubsls: string; peran: PeranTag; hasil: HasilTag | null; via: "hp" | "unggah" };

/** Semua tag aktif kegiatan pada sub SLS tertentu (dibaca bertahap karena batas baris per permintaan). */
async function tagAktif(db: Db, kegiatanId: number, subIds: readonly string[]): Promise<BarisTag[]> {
  const hasil: BarisTag[] = [];
  for (const bagian of potong(Array.from(new Set(subIds)), 100)) {
    for (let dari = 0; ; dari += 1000) {
      const { data, error } = await db.from("sigap_sampel_tag").select("kk_id, idsubsls, peran, hasil, via").eq("kegiatan_id", kegiatanId).is("dilepas_at", null).in("idsubsls", bagian).order("id").range(dari, dari + 999);
      if (error) {
        if (belumMigrasi(error)) return [];
        throw new Error(error.message);
      }
      const baris = (data ?? []) as Record<string, unknown>[];
      for (const r of baris) hasil.push({ kk_id: Number(r.kk_id), idsubsls: String(r.idsubsls), peran: r.peran as PeranTag, hasil: (r.hasil as HasilTag | null) ?? null, via: r.via === "unggah" ? "unggah" : "hp" });
      if (baris.length < 1000) break;
    }
  }
  return hasil;
}

/** Melengkapi data HP (alokasi saya) dengan status jendela dan rekap tag per sub SLS. Tidak gagal bila migrasi belum jalan. */
export async function lengkapiTagSaya(db: Db, data: DataAlokasiSaya): Promise<DataAlokasiSaya> {
  const { jendela, siap } = await infoJendela(db, data.kegiatan.id);
  if (!siap) return data;
  const tag = await tagAktif(db, data.kegiatan.id, data.wilayah.map((w) => w.idsubsls));
  const per = new Map<string, { utama: number; cadangan: number; hasil: number }>();
  for (const t of tag) {
    const p = per.get(t.idsubsls) ?? { utama: 0, cadangan: 0, hasil: 0 };
    if (t.peran === "utama") p.utama++;
    else p.cadangan++;
    if (t.hasil) p.hasil++;
    per.set(t.idsubsls, p);
  }
  return { ...data, jendela, wilayah: data.wilayah.map((w): WilayahAlokasi => ({ ...w, tag: per.get(w.idsubsls) ?? { utama: 0, cadangan: 0, hasil: 0 } })) };
}

/** Jendela + batas + tag aktif satu sub SLS bagi petugas yang memegangnya (PPL atau PML-nya). */
export async function dataTagSub(db: Db, akun: AkunPortal, kegiatanId: number, idsubsls: string): Promise<DataTagSub> {
  if (!/^\d{16}$/.test(idsubsls)) throw new GalatSampel("Kode sub SLS tidak sah.");
  const peran = await peranSampel(db, akun.id, kegiatanId);
  if (!peran) throw new GalatSampel("Khusus PPL dan PML sub SLS ini.", 403);
  const { data: al, error } = await db.from("sigap_alokasi_wilayah").select("target_sampel").eq("kegiatan_id", kegiatanId).eq("idsubsls", idsubsls).is("nonaktif_at", null).eq(peran === "ppl" ? "ppl_akun_id" : "pml_akun_id", akun.id).maybeSingle();
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  if (!al) throw new GalatSampel("Sub SLS ini bukan bagian dari alokasi Anda.", 403);
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const target = typeof (al as { target_sampel: unknown }).target_sampel === "number" ? ((al as { target_sampel: number }).target_sampel) : konfig.target_per_sls;
  const [{ jendela }, tag, ganti, setelan] = await Promise.all([infoJendela(db, kegiatanId), tagAktif(db, kegiatanId, [idsubsls]), bacaGanti(db, kegiatanId, { idsubsls, batas: 100 }), bacaSetelanGanti(db, kegiatanId)]);
  return { jendela, target, cadangan: konfig.cadangan_per_sls, tag: tag.map((t): TagKk => ({ kk_id: t.kk_id, peran: t.peran, hasil: t.hasil, via: t.via })), ganti: ganti.daftar, boleh_ganti: setelan.boleh_ganti };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Aksi PPL (HP)
// ---------------------------------------------------------------------------------------------------------------------------------

const idPositif = (v: unknown, nama: string): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new GalatSampel(`${nama} tidak sah.`);
  return n;
};

export async function tandaiTag(db: Db, akun: AkunPortal, kegiatanId: number, idsubsls: unknown, kkId: unknown, peran: unknown): Promise<void> {
  if (typeof idsubsls !== "string" || !/^\d{16}$/.test(idsubsls)) throw new GalatSampel("Kode sub SLS tidak sah.");
  if (peran !== "utama" && peran !== "cadangan") throw new GalatSampel("Peran sampel harus utama atau cadangan.");
  await panggil(db, "sigap_tag_set", { p_kegiatan: kegiatanId, p_akun: akun.id, p_idsubsls: idsubsls, p_kk: idPositif(kkId, "KK"), p_peran: peran });
}

export async function lepasTag(db: Db, akun: AkunPortal, kegiatanId: number, kkId: unknown): Promise<void> {
  await panggil(db, "sigap_tag_lepas", { p_kegiatan: kegiatanId, p_akun: akun.id, p_kk: idPositif(kkId, "KK") });
}

export async function isiHasilTag(db: Db, akun: AkunPortal, kegiatanId: number, kkId: unknown, hasil: unknown): Promise<void> {
  if (hasil !== null && hasil !== "didata" && hasil !== "menolak" && hasil !== "tidak_ditemukan") throw new GalatSampel("Hasil harus didata, menolak, atau tidak ditemukan.");
  await panggil(db, "sigap_tag_hasil", { p_kegiatan: kegiatanId, p_akun: akun.id, p_kk: idPositif(kkId, "KK"), p_hasil: hasil });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Admin (Kelola)
// ---------------------------------------------------------------------------------------------------------------------------------

export type BarisProgresTag = RekapTagSub & {
  nks: string | null;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  ppl_nama: string | null;
  pml_nama: string | null;
  jumlah_kk: number;
};
export type DataTagAdmin = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  boleh_kelola: boolean;
  siap: boolean;
  jendela: InfoJendela;
  riwayat: RiwayatJendela[];
  konfig: KonfigAlokasi;
  progres: BarisProgresTag[];
  total: { subsls: number; target: number; utama: number; cadangan: number; didata: number; selesai_ditag: number };
  /** tahap B */
  ganti: DataGantiAdmin;
};

export async function dataTagAdmin(db: Db, kegiatanId: number, bolehKelola: boolean): Promise<DataTagAdmin> {
  const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", kegiatanId).maybeSingle();
  if (!keg) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const [{ wilayah }, { jendela, siap }] = await Promise.all([bacaAlokasi(db, kegiatanId, konfig.target_per_sls), infoJendela(db, kegiatanId)]);
  const tag = siap ? await tagAktif(db, kegiatanId, wilayah.map((w) => w.idsubsls)) : [];
  const per = new Map<string, TagKk[]>();
  for (const t of tag) {
    const l = per.get(t.idsubsls) ?? [];
    l.push({ kk_id: t.kk_id, peran: t.peran, hasil: t.hasil, via: t.via });
    per.set(t.idsubsls, l);
  }
  const progres: BarisProgresTag[] = wilayah.map((w) => ({
    ...rekapTagSub(w.idsubsls, w.target, konfig.cadangan_per_sls, per.get(w.idsubsls) ?? []),
    nks: w.nks, kecamatan: w.kecamatan, nagari: w.nagari, sls: w.sls, sub_sls: w.sub_sls, ppl_nama: w.ppl_nama, pml_nama: w.pml_nama, jumlah_kk: w.jumlah_kk,
  }));
  const total = progres.reduce((a, p) => ({ subsls: a.subsls + 1, target: a.target + p.target, utama: a.utama + p.utama, cadangan: a.cadangan + p.cad, didata: a.didata + p.didata, selesai_ditag: a.selesai_ditag + (p.utama >= p.target && p.target > 0 ? 1 : 0) }), { subsls: 0, target: 0, utama: 0, cadangan: 0, didata: 0, selesai_ditag: 0 });
  return { sekarang: new Date().toISOString(), kegiatan: { id: kegiatanId, nama: String(keg.nama) }, boleh_kelola: bolehKelola, siap, jendela, riwayat: siap ? await riwayatJendela(db, kegiatanId) : [], konfig, progres, total, ganti: siap ? await dataGantiAdmin(db, kegiatanId, wilayah) : GANTI_KOSONG };
}

type KkRow = { id: number; idsubsls: string; nama_kk: string; anggota_lain: string | null; patokan: string | null };

async function kkPadaSub(db: Db, subIds: readonly string[]): Promise<KkRow[]> {
  const hasil: KkRow[] = [];
  for (const bagian of potong(Array.from(new Set(subIds)), 50)) {
    for (let dari = 0; ; dari += 1000) {
      const { data, error } = await db.from("master_kk").select("id, idsubsls, nama_kk, anggota_lain, patokan").in("idsubsls", bagian).eq("aktif", true).order("idsubsls").order("nama_kk").order("id").range(dari, dari + 999);
      if (error) {
        if (belumMigrasi(error)) throw new GalatSampel("Master KK belum aktif (migrasi 20261107e belum dijalankan).", 503);
        throw new Error(error.message);
      }
      const baris = (data ?? []) as Record<string, unknown>[];
      for (const r of baris) hasil.push({ id: Number(r.id), idsubsls: String(r.idsubsls), nama_kk: String(r.nama_kk), anggota_lain: (r.anggota_lain as string | null) ?? null, patokan: (r.patokan as string | null) ?? null });
      if (baris.length < 1000) break;
      if (hasil.length > MAKS_BARIS_TAG) throw new GalatSampel(`Daftar KK melebihi ${MAKS_BARIS_TAG} baris; unduh per bagian alokasi.`);
    }
  }
  return hasil;
}

/** Baris templat unggah: semua KK master pada sub SLS beralokasi (yang sudah ber-PPL), dengan tag sekarang. */
export async function templatTagData(db: Db, kegiatanId: number): Promise<BarisTemplatTag[]> {
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const { wilayah, siap } = await bacaAlokasi(db, kegiatanId, konfig.target_per_sls);
  if (!siap || wilayah.length === 0) throw new GalatSampel("Belum ada alokasi sub SLS. Unggah alokasi lebih dulu.", 409);
  const ids = wilayah.map((w) => w.idsubsls);
  const [kk, tag] = await Promise.all([kkPadaSub(db, ids), tagAktif(db, kegiatanId, ids)]);
  const peranKk = new Map(tag.map((t) => [t.kk_id, t.peran]));
  const w = new Map(wilayah.map((x) => [x.idsubsls, x]));
  const urut = new Map(wilayah.map((x, i) => [x.idsubsls, i]));
  return kk
    .sort((a, b) => (urut.get(a.idsubsls) ?? 0) - (urut.get(b.idsubsls) ?? 0))
    .map((k): BarisTemplatTag => {
      const x = w.get(k.idsubsls) as WilayahAlokasi;
      return { idsubsls: k.idsubsls, nks: x.nks, kecamatan: x.kecamatan, nagari: x.nagari, sls: x.sls, kk_id: k.id, nama_kk: k.nama_kk, anggota_lain: k.anggota_lain, patokan: k.patokan, ppl_nama: x.ppl_nama, peran: peranKk.get(k.id) ?? null };
    });
}

export type PratinjauTag = HasilTagUnggah & {
  mode: ModeTag; jendela: InfoJendela; boleh_unggah: boolean; alasan_tolak: string | null;
  /** (11 Nov 2026) baris yang tidak cocok dengan KK master dan perlu (atau sudah) diputuskan; ringkasan pencocokan; jumlah KK yang akan ditambahkan ke master */
  perlu: PerluKeputusan[]; ringkas_kk: HasilCocok["ringkas"]; kk_baru: number;
};
type SiapTag = PratinjauTag & { _baru: KkBaru[] };

async function siapkanTag(db: Db, kegiatanId: number, mentah: unknown, mode: ModeTag, keputusan: Readonly<Record<string, unknown>> = {}): Promise<SiapTag> {
  if (mode !== "tambah" && mode !== "ganti") throw new GalatSampel("Mode unggah harus tambah atau ganti.");
  if (!Array.isArray(mentah)) throw new GalatSampel("Isi berkas tidak terbaca.");
  const baris = mentah.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const { wilayah, siap } = await bacaAlokasi(db, kegiatanId, konfig.target_per_sls);
  if (!siap || wilayah.length === 0) throw new GalatSampel("Belum ada alokasi sub SLS. Unggah alokasi lebih dulu.", 409);
  const alokasi = new Map(wilayah.map((w) => [w.idsubsls, w.target]));
  // sub SLS yang disebut berkas dan beralokasi -> hanya itu yang dimuat KK dan tag-nya
  const kolom = baris.length > 0 ? petaKolomTag(Object.keys(baris[0])) : {};
  const disebut = new Set<string>();
  if (kolom.kode) for (const b of baris) {
    const k = bacaKodeSubsls(String(b[kolom.kode] ?? "").trim());
    if (k.ok && alokasi.has(k.kode)) disebut.add(k.kode);
  }
  const ids = Array.from(disebut);
  const [kk, tag] = ids.length > 0 ? await Promise.all([kkPadaSub(db, ids), tagAktif(db, kegiatanId, ids)]) : [[], []];
  // (11 Nov 2026) pencocokan ke KK master (ID, lalu nama); yang tidak cocok diputuskan petugas (bawaan: tambahkan sebagai KK baru di master)
  const pplAlokasi = new Map(wilayah.map((w) => [w.idsubsls, w.ppl_nama ?? null] as const));
  const cocok = cocokkanKkUnggah(baris, kk, alokasi, keputusan, pplAlokasi);
  const kkPeta = new Map<number, string>(kk.map((k) => [k.id, k.idsubsls] as const));
  for (const b of cocok.baru) kkPeta.set(b.sintetis, b.idsubsls);
  const periksa = periksaTagUnggah(cocok.rows, { alokasi, cadangan: konfig.cadangan_per_sls, kk: kkPeta, ada: new Map(tag.map((t) => [t.kk_id, { idsubsls: t.idsubsls, peran: t.peran, hasil: t.hasil }])) }, mode);
  const barisBermasalah = new Set(cocok.galat.map((g) => g.baris));
  const galatGabung = [...cocok.galat, ...periksa.galat.filter((g) => g.baris === 0 || !barisBermasalah.has(g.baris))].sort((a, b) => a.baris - b.baris);
  const hasil: HasilTagUnggah = {
    ...periksa,
    galat: galatGabung,
    peringatan: [...cocok.peringatan, ...periksa.peringatan],
    bisa_simpan: galatGabung.length === 0 && periksa.baris.length > 0,
    ringkas: { ...periksa.ringkas, baru: periksa.ringkas.baru },
  };
  const { jendela, siap: siapTag } = await infoJendela(db, kegiatanId);
  const alasanTolak = !siapTag ? PESAN_BELUM_MIGRASI : jendela.status === "terkunci" ? "Daftar sampel sudah dikunci. Buka kembali jendela rilis (dengan alasan) bila perlu mengunggah." : null;
  return {
    ...hasil, mode, jendela, boleh_unggah: alasanTolak === null, alasan_tolak: alasanTolak, bisa_simpan: hasil.bisa_simpan && alasanTolak === null,
    perlu: cocok.perlu, ringkas_kk: cocok.ringkas, kk_baru: cocok.baru.length, _baru: cocok.baru,
  };
}

export async function pratinjauTag(db: Db, kegiatanId: number, mentah: unknown, mode: ModeTag, keputusan: Readonly<Record<string, unknown>> = {}): Promise<PratinjauTag> {
  const { _baru, ...p } = await siapkanTag(db, kegiatanId, mentah, mode, keputusan);
  void _baru;
  return { ...p, galat: p.galat.slice(0, 200), peringatan: p.peringatan.slice(0, 200), perlu: p.perlu.slice(0, 500), baris: [] };
}

export type HasilImporTag = { ditambah: number; diganti: number; dilepas: number; sama: number; /** (11 Nov 2026) KK yang ditambahkan ke master dari berkas */ kk_baru: number };

/** Tambahkan KK baru ke master_kk (sumber "unggahan"); mengembalikan peta ID sementara -> ID master. Gagal di tengah -> yang sudah masuk dihapus lagi. */
async function tambahKkMaster(db: Db, baru: readonly KkBaru[]): Promise<Map<number, number>> {
  const peta = new Map<number, number>();
  try {
    for (const b of baru) {
      const { data, error } = await db
        .from("master_kk")
        .insert({ idsubsls: b.idsubsls, nama_kk: b.nama_kk, nama_kk_norm: normSimpan(b.nama_kk), anggota_lain: b.anggota_lain, patokan: b.patokan, sumber: "unggahan", aktif: true })
        .select("id")
        .single();
      if (error || !data) throw new GalatSampel(`Baris ${b.baris}: KK "${b.nama_kk}" gagal ditambahkan ke master (${error?.message ?? "tanpa keterangan"}).`, 409);
      peta.set(b.sintetis, Number((data as { id: number }).id));
    }
    return peta;
  } catch (e) {
    const ids = Array.from(peta.values());
    if (ids.length > 0) await db.from("master_kk").delete().in("id", ids);
    throw e;
  }
}

export async function imporTag(db: Db, akun: AkunPortal, kegiatanId: number, namaBerkas: string, mentah: unknown, mode: ModeTag, keputusan: Readonly<Record<string, unknown>> = {}): Promise<HasilImporTag> {
  const p = await siapkanTag(db, kegiatanId, mentah, mode, keputusan);
  if (p.alasan_tolak) throw new GalatSampel(p.alasan_tolak, 409);
  if (p.galat.length > 0) throw new GalatSampel(`Berkas masih memuat ${p.galat.length} masalah. Perbaiki lalu pratinjau lagi.`, 400, "BERKAS_BERMASALAH");
  if (p.baris.length === 0) throw new GalatSampel("Tidak ada KK yang diberi peran sampel pada berkas.");
  // KK baru masuk master lebih dulu (ID sementara -> ID master); bila penyimpanan tag ditolak, KK baru itu dihapus lagi
  const peta = p._baru.length > 0 ? await tambahKkMaster(db, p._baru) : new Map<number, number>();
  const barisFinal = p.baris.map((b) => ({ ...b, kk_id: peta.get(b.kk_id) ?? b.kk_id }));
  try {
    const h = await panggil(db, "sigap_tag_impor", { p_kegiatan: kegiatanId, p_akun: akun.id, p_nama: akun.nama, p_berkas: namaBerkas.slice(0, 200) || null, p_baris: barisFinal, p_mode: mode });
    return { ditambah: Number(h.ditambah ?? 0), diganti: Number(h.diganti ?? 0), dilepas: Number(h.dilepas ?? 0), sama: Number(h.sama ?? 0), kk_baru: peta.size };
  } catch (e) {
    const ids = Array.from(peta.values());
    if (ids.length > 0) await db.from("master_kk").delete().in("id", ids);
    throw e;
  }
}
