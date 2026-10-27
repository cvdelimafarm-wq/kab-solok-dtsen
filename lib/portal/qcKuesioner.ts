// lib/portal/qcKuesioner.ts  (hanya server)
//
// (27 Okt 2026) Kuesioner Quality Check + Lembar Supervisi -- lapisan server di atas tabel sigap_qc_kuesioner / sigap_qc_lembar
// (migrasi 20261027b). Aturan murni (baca Excel, periksa jawaban, skor aspek, kategori petugas) ada di lib/sigapQcKuesioner.ts.
// Dipakai oleh /api/portal/qc/kuesioner/admin (Kelola Pendataan > QC > Kuesioner supervisi) dan /api/portal/qc/kuesioner (halaman Lembar Supervisi).

import type { Db } from "@/lib/sigap";
import { hariIniWib } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_ID } from "@/lib/pendataan";
import { GalatQc } from "@/lib/portal/qc";
import { anggotaKelompok, type AnggotaPeriksa } from "@/lib/portal/korwilMonitor";
import { periksaJawaban, tanggalLembarValid, type Jawaban, type Kesimpulan, type ObjekKuesioner, type StrukturKuesioner } from "@/lib/sigapQcKuesioner";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type VersiKuesioner = { id: number; objek: ObjekKuesioner; versi: number; aktif: boolean; judul: string; berkas_nama: string | null; jumlah_aspek: number; jumlah_soal: number; dibuat_oleh: string | null; dibuat_at: string; jumlah_lembar: number };
export type KuesionerAktif = { id: number; objek: ObjekKuesioner; versi: number; judul: string; struktur: StrukturKuesioner };

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (error.code === "P0001") throw new GalatQc(error.message, 409);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

/** Versi kuesioner yang sedang berlaku untuk satu objek; null bila belum pernah diunggah. */
export async function kuesionerAktif(db: Db, objek: ObjekKuesioner): Promise<KuesionerAktif | null> {
  const { data, error } = await db.from("sigap_qc_kuesioner").select("id, objek, versi, judul, struktur").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("objek", objek).eq("aktif", true).maybeSingle();
  if (error) throw new Error(`Gagal membaca kuesioner: ${error.message}`);
  if (!data) return null;
  const k = data as { id: number; objek: ObjekKuesioner; versi: number; judul: string; struktur: StrukturKuesioner };
  return { id: n(k.id), objek: k.objek, versi: n(k.versi), judul: String(k.judul ?? ""), struktur: k.struktur };
}

// ---------------------------------------------------------------- admin
export type DataAdminKuesioner = { aktif: Record<ObjekKuesioner, KuesionerAktif | null>; riwayat: VersiKuesioner[] };

export async function dataAdminKuesioner(db: Db): Promise<DataAdminKuesioner> {
  const [petugas, kk, riw, lem] = await Promise.all([
    kuesionerAktif(db, "petugas"),
    kuesionerAktif(db, "kk"),
    db.from("sigap_qc_kuesioner").select("id, objek, versi, aktif, judul, berkas_nama, jumlah_aspek, jumlah_soal, dibuat_oleh, dibuat_at").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).order("objek").order("versi", { ascending: false }),
    db.from("sigap_qc_lembar").select("kuesioner_id").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).limit(20000),
  ]);
  if (riw.error) throw new Error(`Gagal membaca riwayat kuesioner: ${riw.error.message}`);
  const per = new Map<number, number>();
  for (const l of (lem.data ?? []) as { kuesioner_id: number }[]) per.set(n(l.kuesioner_id), (per.get(n(l.kuesioner_id)) ?? 0) + 1);
  const riwayat = ((riw.data ?? []) as Omit<VersiKuesioner, "jumlah_lembar">[]).map((r) => ({ ...r, id: n(r.id), versi: n(r.versi), jumlah_aspek: n(r.jumlah_aspek), jumlah_soal: n(r.jumlah_soal), jumlah_lembar: per.get(n(r.id)) ?? 0 }));
  return { aktif: { petugas, kk }, riwayat };
}

export async function unggahKuesioner(db: Db, objek: ObjekKuesioner, judul: string, berkas: string | null, struktur: StrukturKuesioner, oleh: string): Promise<{ id: number; versi: number; aspek: number; soal: number }> {
  return rpc(db, "sigap_qc_kuesioner_unggah", { p_kegiatan: KEGIATAN_PENDATAAN_ID, p_objek: objek, p_judul: judul.slice(0, 120), p_berkas: berkas ? berkas.slice(0, 200) : null, p_struktur: struktur, p_oleh: oleh });
}

export async function aktifkanVersiKuesioner(db: Db, id: number): Promise<{ id: number; versi: number }> {
  const { data } = await db.from("sigap_qc_kuesioner").select("kegiatan_id").eq("id", id).maybeSingle();
  if (!data || n((data as { kegiatan_id: number }).kegiatan_id) !== KEGIATAN_PENDATAAN_ID) throw new GalatQc("Versi kuesioner tidak ditemukan.", 404);
  return rpc(db, "sigap_qc_kuesioner_aktifkan", { p_id: id });
}

/** Rekap untuk admin: jumlah lembar per kelompok dan objek, sebaran kategori petugas, dan tanggal terakhir. */
export type RekapLembar = { kelompok: number | null; objek: ObjekKuesioner; jumlah: number; baik: number; cukup: number; pembinaan: number; terakhir: string | null };
export async function rekapLembarAdmin(db: Db): Promise<RekapLembar[]> {
  const { data, error } = await db.from("sigap_qc_lembar").select("kelompok, objek, tanggal, ringkas").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).order("tanggal", { ascending: false }).limit(5000);
  if (error) throw new Error(`Gagal membaca rekap lembar: ${error.message}`);
  const peta = new Map<string, RekapLembar>();
  for (const l of (data ?? []) as { kelompok: number | null; objek: ObjekKuesioner; tanggal: string; ringkas: Partial<Kesimpulan> | null }[]) {
    const kunci = `${l.kelompok ?? 0}:${l.objek}`;
    const r = peta.get(kunci) ?? { kelompok: l.kelompok == null ? null : n(l.kelompok), objek: l.objek, jumlah: 0, baik: 0, cukup: 0, pembinaan: 0, terakhir: null };
    r.jumlah++;
    if (l.ringkas?.kategori === "Baik") r.baik++;
    else if (l.ringkas?.kategori === "Cukup") r.cukup++;
    else if (l.ringkas?.kategori === "Perlu pembinaan") r.pembinaan++;
    if (!r.terakhir || l.tanggal > r.terakhir) r.terakhir = l.tanggal;
    peta.set(kunci, r);
  }
  return [...peta.values()].sort((a, b) => (a.kelompok ?? 99) - (b.kelompok ?? 99) || a.objek.localeCompare(b.objek));
}

// ---------------------------------------------------------------- korwil / admin mengisi lembar
export type KkPeriksa = { id: number; nama_kk: string; idsubsls: string; hasil: string };
export type Identitas = { kecamatan: string; nagari: string; sls: string; jenis_qc: string };
export type LembarTersimpan = {
  id: number;
  objek: ObjekKuesioner;
  kelompok: number | null;
  tanggal: string;
  pemeriksa_akun_id: number;
  pemeriksa_nama: string;
  subjek_akun_id: number | null;
  subjek_nama: string | null;
  kk_id: number | null;
  kk_nama: string | null;
  identitas: Partial<Identitas>;
  jawaban: Partial<Jawaban>;
  ringkas: Partial<Kesimpulan>;
  catatan: string;
  tindak_lanjut: string;
  tenggat: string | null;
  versi: number;
  diubah_at: string;
};

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const hasil = new Map<number, string>();
  const unik = Array.from(new Set(ids.filter((x) => x > 0)));
  if (unik.length === 0) return hasil;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", unik);
  for (const r of (data ?? []) as { id: number; nama: string }[]) hasil.set(n(r.id), String(r.nama ?? ""));
  return hasil;
}

/** KK yang sudah didata (hasil terisi) oleh satu PPL. Dibatasi 300 terbaru supaya daftar tetap ringan. */
export async function daftarKkPpl(db: Db, pplAkunId: number): Promise<KkPeriksa[]> {
  const { data, error } = await db
    .from("bencana_pendataan_kk")
    .select("id, nama_kk, idsubsls, hasil")
    .eq("kegiatan_id", KEGIATAN_PENDATAAN_ID)
    .eq("ppl_akun_id", pplAkunId)
    .eq("aktif", true)
    .not("hasil", "is", null)
    .order("status_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Gagal membaca daftar KK: ${error.message}`);
  return ((data ?? []) as KkPeriksa[]).map((k) => ({ id: n(k.id), nama_kk: String(k.nama_kk ?? ""), idsubsls: String(k.idsubsls ?? ""), hasil: String(k.hasil ?? "") }));
}

export type DataLembar = {
  kelompok: number;
  hari_ini: string;
  anggota: AnggotaPeriksa[];
  kuesioner: Record<ObjekKuesioner, KuesionerAktif | null>;
  lembar: LembarTersimpan[];
};

export async function dataLembar(db: Db, kelompok: number): Promise<DataLembar | null> {
  const anggota = await anggotaKelompok(db, kelompok);
  if (!anggota) return null;
  const [petugas, kk, lem] = await Promise.all([
    kuesionerAktif(db, "petugas"),
    kuesionerAktif(db, "kk"),
    db.from("sigap_qc_lembar").select("id, kuesioner_id, objek, kelompok, tanggal, pemeriksa_akun_id, subjek_akun_id, kk_id, identitas, jawaban, ringkas, catatan, tindak_lanjut, tenggat, diubah_at").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("kelompok", kelompok).order("tanggal", { ascending: false }).order("diubah_at", { ascending: false }).limit(200),
  ]);
  if (lem.error) throw new Error(`Gagal membaca lembar: ${lem.error.message}`);
  type Baris = Omit<LembarTersimpan, "pemeriksa_nama" | "subjek_nama" | "kk_nama" | "versi"> & { kuesioner_id: number };
  const baris = (lem.data ?? []) as Baris[];
  const nama = await namaAkun(db, baris.flatMap((b) => [n(b.pemeriksa_akun_id), n(b.subjek_akun_id)]));
  const kkIds = Array.from(new Set(baris.map((b) => n(b.kk_id)).filter((x) => x > 0)));
  const kkNama = new Map<number, string>();
  if (kkIds.length) {
    const { data } = await db.from("bencana_pendataan_kk").select("id, nama_kk").in("id", kkIds);
    for (const r of (data ?? []) as { id: number; nama_kk: string }[]) kkNama.set(n(r.id), String(r.nama_kk ?? ""));
  }
  const kuIds = Array.from(new Set(baris.map((b) => n(b.kuesioner_id))));
  const versi = new Map<number, number>();
  if (kuIds.length) {
    const { data } = await db.from("sigap_qc_kuesioner").select("id, versi").in("id", kuIds);
    for (const r of (data ?? []) as { id: number; versi: number }[]) versi.set(n(r.id), n(r.versi));
  }
  const lembar: LembarTersimpan[] = baris.map((b) => ({
    id: n(b.id),
    objek: b.objek,
    kelompok: b.kelompok == null ? null : n(b.kelompok),
    tanggal: b.tanggal,
    pemeriksa_akun_id: n(b.pemeriksa_akun_id),
    pemeriksa_nama: nama.get(n(b.pemeriksa_akun_id)) ?? `Akun ${b.pemeriksa_akun_id}`,
    subjek_akun_id: b.subjek_akun_id == null ? null : n(b.subjek_akun_id),
    subjek_nama: b.subjek_akun_id == null ? null : (nama.get(n(b.subjek_akun_id)) ?? `Akun ${b.subjek_akun_id}`),
    kk_id: b.kk_id == null ? null : n(b.kk_id),
    kk_nama: b.kk_id == null ? null : (kkNama.get(n(b.kk_id)) ?? `KK ${b.kk_id}`),
    identitas: b.identitas ?? {},
    jawaban: b.jawaban ?? {},
    ringkas: b.ringkas ?? {},
    catatan: String(b.catatan ?? ""),
    tindak_lanjut: String(b.tindak_lanjut ?? ""),
    tenggat: b.tenggat ?? null,
    versi: versi.get(n(b.kuesioner_id)) ?? 0,
    diubah_at: b.diubah_at,
  }));
  return { kelompok, hari_ini: hariIniWib(), anggota, kuesioner: { petugas, kk }, lembar };
}

export type MasukanLembar = {
  kelompok: number;
  objek: ObjekKuesioner;
  tanggal: unknown;
  subjekAkunId: number;
  kkId: number | null;
  jawaban: unknown;
  identitas: unknown;
  catatan: unknown;
  tindakLanjut: unknown;
  tenggat: unknown;
};

export class GalatJawaban extends GalatQc {
  galat: Record<string, string>;
  constructor(galat: Record<string, string>) {
    super(galat["_"] ?? "Ada jawaban yang belum benar. Periksa pertanyaan yang ditandai.", 422);
    this.galat = galat;
  }
}

const potong = (v: unknown, maks: number): string => (typeof v === "string" ? v.trim().slice(0, maks) : "");

/** Simpan (baru/ubah) satu lembar. Satu lembar per (versi kuesioner, tanggal, pemeriksa, petugas, KK): mengirim lagi = memperbarui. */
export async function simpanLembar(db: Db, pemeriksaAkunId: number, m: MasukanLembar): Promise<{ id: number; kesimpulan: Kesimpulan }> {
  const hariIni = hariIniWib();
  if (!tanggalLembarValid(m.tanggal, hariIni)) throw new GalatQc("Tanggal lembar tidak valid (tidak boleh lewat dari hari ini).", 400);
  const anggota = await anggotaKelompok(db, m.kelompok);
  if (!anggota) throw new GalatQc(`Kelompok ${m.kelompok} tidak ditemukan.`, 404);
  const subjek = anggota.find((a) => a.akun_id === m.subjekAkunId);
  if (!subjek) throw new GalatQc("Petugas itu bukan anggota kelompok ini.", 400);
  if (m.objek === "petugas" && subjek.akun_id === pemeriksaAkunId) throw new GalatQc("Lembar tidak bisa diisi untuk diri sendiri.", 400);

  let kkId: number | null = null;
  if (m.objek === "kk") {
    if (subjek.peran !== "ppl") throw new GalatQc("KK dipilih dari daftar PPL.", 400);
    const kk = (await daftarKkPpl(db, subjek.akun_id)).find((k) => k.id === m.kkId);
    if (!kk) throw new GalatQc("KK itu bukan hasil pendataan PPL tersebut.", 400);
    kkId = kk.id;
  }
  const ku = await kuesionerAktif(db, m.objek);
  if (!ku) throw new GalatQc("Kuesioner untuk objek ini belum diunggah admin.", 409);

  const p = periksaJawaban(ku.struktur, m.jawaban);
  if (Object.keys(p.galat).length > 0) throw new GalatJawaban(p.galat);

  const idn = m.identitas && typeof m.identitas === "object" ? (m.identitas as Record<string, unknown>) : {};
  const identitas: Identitas = { kecamatan: potong(idn.kecamatan, 80), nagari: potong(idn.nagari, 80), sls: potong(idn.sls, 120), jenis_qc: potong(idn.jenis_qc, 40) };
  const tenggat = typeof m.tenggat === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.tenggat) && !Number.isNaN(Date.parse(m.tenggat)) ? m.tenggat : null;
  const isi = {
    identitas,
    jawaban: p.jawaban,
    ringkas: p.kesimpulan,
    catatan: potong(m.catatan, 2000),
    tindak_lanjut: potong(m.tindakLanjut, 2000),
    tenggat,
    diubah_at: new Date().toISOString(),
  };

  // satu lembar per kunci: cari dulu, lalu ubah atau tambah (indeks unik di basis data menjaga dari lembar ganda saat serentak)
  let cari = db.from("sigap_qc_lembar").select("id").eq("kuesioner_id", ku.id).eq("tanggal", m.tanggal).eq("pemeriksa_akun_id", pemeriksaAkunId).eq("subjek_akun_id", subjek.akun_id);
  cari = kkId == null ? cari.is("kk_id", null) : cari.eq("kk_id", kkId);
  const ada = await cari.maybeSingle();
  if (ada.error) throw new Error(`Gagal memeriksa lembar: ${ada.error.message}`);
  if (ada.data) {
    const id = n((ada.data as { id: number }).id);
    const { error } = await db.from("sigap_qc_lembar").update(isi).eq("id", id);
    if (error) throw new Error(`Gagal menyimpan lembar: ${error.message}`);
    return { id, kesimpulan: p.kesimpulan };
  }
  const { data, error } = await db
    .from("sigap_qc_lembar")
    .insert({ kuesioner_id: ku.id, kegiatan_id: KEGIATAN_PENDATAAN_ID, objek: m.objek, kelompok: m.kelompok, tanggal: m.tanggal, pemeriksa_akun_id: pemeriksaAkunId, subjek_akun_id: subjek.akun_id, kk_id: kkId, ...isi })
    .select("id")
    .single();
  if (error) throw new Error(`Gagal menyimpan lembar: ${error.message}`);
  return { id: n((data as { id: number }).id), kesimpulan: p.kesimpulan };
}
