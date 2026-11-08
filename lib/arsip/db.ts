// lib/arsip/db.ts  (khusus server)
//
// (7 Nov 2026) Akses basis data penomoran surat (SQL: skema-sql/fase-b/20261107c_arsip_penomoran.sql). Semua lewat service role.
// Pengambilan nomor memakai fungsi SQL `arsip_ambil_nomor` (atomik; dokumen yang sama selalu mendapat nomor yang sama).

import type { Db } from "@/lib/sigap";
import { celahUrut, periksaFormat, perluKka, kkaSah, type KategoriArsip } from "@/lib/arsip/nomor";

export type Galat = { ok: false; status: number; pesan: string };
const bulat = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function pesanDariDb(msg: string | undefined | null): string {
  const m = msg ?? "";
  if (/Could not find the function|does not exist|schema cache/i.test(m)) return "Fitur penomoran belum lengkap: jalankan SQL 20261107c_arsip_penomoran.sql lalu 20261107e_arsip_kka_perka99.sql terlebih dahulu.";
  if (/arsip_nomor_urut_uq|duplicate key/i.test(m)) return "Nomor bentrok dengan nomor yang sudah tercatat. Muat ulang lalu coba lagi.";
  return m || "Terjadi kesalahan pada basis data.";
}

export type HasilAmbil = { ok: true; id: number; nomor: string; urut: number; tahun: number; kka: string | null; sudah_ada: boolean } | Galat;

export type MasukanAmbil = {
  jenis: string;
  kka?: string | null;
  tanggal?: string | null;
  perihal?: string | null;
  kegiatanId?: number | null;
  rujukan?: string | null;
  akunId: number;
  nama: string;
};

export async function ambilNomor(db: Db, p: MasukanAmbil): Promise<HasilAmbil> {
  if (p.kka && !kkaSah(p.kka)) return { ok: false, status: 400, pesan: "Kode arsip tidak sah (contoh yang benar: VS.330)." };
  if (p.tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(p.tanggal)) return { ok: false, status: 400, pesan: "Tanggal tidak sah." };
  const { data, error } = await db.rpc("arsip_ambil_nomor", {
    p_jenis: p.jenis, p_kka: p.kka ?? null, p_tanggal: p.tanggal || null, p_perihal: p.perihal ?? null,
    p_kegiatan: p.kegiatanId ?? null, p_rujukan: p.rujukan ?? null, p_oleh: p.akunId, p_nama: p.nama,
  });
  if (error) return { ok: false, status: 400, pesan: pesanDariDb(error.message) };
  const d = data as { id: number; nomor: string; urut: number; tahun: number; kka: string | null; sudah_ada: boolean };
  return { ok: true, id: Number(d.id), nomor: d.nomor, urut: Number(d.urut), tahun: Number(d.tahun), kka: d.kka ?? null, sudah_ada: !!d.sudah_ada };
}

export type MasukanLuar = { jenis: string; urut: number; tanggal: string; perihal?: string | null; kka?: string | null; kegiatanId?: number | null; nomorTeks?: string | null; akunId: number; nama: string;
  /** (8 Nov 2026) Nomor di luar rangkaian (pengecualian): tidak ikut hitungan nomor terlewat. Wajib beralasan. */
  pengecualian?: boolean; alasanPengecualian?: string | null };

export async function catatLuar(db: Db, p: MasukanLuar): Promise<{ ok: true; id: number; nomor: string } | Galat> {
  if (p.kka && !kkaSah(p.kka)) return { ok: false, status: 400, pesan: "Kode arsip tidak sah (contoh yang benar: VS.330)." };
  const alasanPeng = (p.alasanPengecualian ?? "").trim();
  if (p.pengecualian && alasanPeng.length < 5) return { ok: false, status: 400, pesan: "Nomor pengecualian wajib beralasan (minimal 5 huruf)." };
  const { data, error } = await db.rpc("arsip_catat_luar", {
    p_jenis: p.jenis, p_urut: p.urut, p_tanggal: p.tanggal, p_perihal: p.perihal ?? null, p_kka: p.kka ?? null,
    p_kegiatan: p.kegiatanId ?? null, p_oleh: p.akunId, p_nama: p.nama, p_nomor: p.nomorTeks ?? null,
    p_pengecualian: p.pengecualian === true, p_alasan_pengecualian: p.pengecualian ? alasanPeng : null,
  });
  if (error) return { ok: false, status: 400, pesan: pesanDariDb(error.message) };
  const d = data as { id: number; nomor: string };
  return { ok: true, id: Number(d.id), nomor: d.nomor };
}

export async function batalkanNomor(db: Db, id: number, alasan: string, akunId: number): Promise<{ ok: true; nomor: string } | Galat> {
  const { data, error } = await db.rpc("arsip_batalkan", { p_id: id, p_alasan: alasan, p_oleh: akunId });
  if (error) return { ok: false, status: 400, pesan: pesanDariDb(error.message) };
  return { ok: true, nomor: (data as { nomor: string }).nomor };
}

export async function aturAwal(db: Db, register: string, tahun: number, terakhir: number, akunId: number): Promise<{ ok: true; sebelumnya: number } | Galat> {
  const { data, error } = await db.rpc("arsip_atur_awal", { p_register: register, p_tahun: tahun, p_terakhir: terakhir, p_oleh: akunId });
  if (error) return { ok: false, status: 400, pesan: pesanDariDb(error.message) };
  return { ok: true, sebelumnya: Number((data as { sebelumnya: number }).sebelumnya) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bacaan
// ---------------------------------------------------------------------------------------------------------------------
export type BarisNomor = {
  id: number; jenis: string; register: string; tahun: number; urut: number; nomor: string; kka: string | null; tanggal: string; perihal: string | null;
  kegiatan_id: number | null; sumber: string; status: string; alasan_batal: string | null; rujukan: string | null; dibuat_nama: string | null; dibuat_at: string;
  pengecualian: boolean; alasan_pengecualian: string | null;
};

export type FilterBuku = { tahun?: number | null; jenis?: string | null; status?: string | null; cari?: string | null; sumber?: string | null; limit?: number };

export async function muatBuku(db: Db, f: FilterBuku): Promise<{ ok: true; baris: BarisNomor[]; terpotong: boolean } | Galat> {
  const batas = Math.min(Math.max(f.limit ?? 500, 1), 2000);
  let q = db.from("arsip_nomor").select("id, jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, status, alasan_batal, rujukan, dibuat_nama, dibuat_at, pengecualian, alasan_pengecualian");
  if (f.tahun) q = q.eq("tahun", f.tahun);
  if (f.jenis) q = q.eq("jenis", f.jenis);
  if (f.status) q = q.eq("status", f.status);
  if (f.sumber) q = q.eq("sumber", f.sumber);
  const c = (f.cari ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  if (c) q = q.or(`nomor.ilike.%${c}%,perihal.ilike.%${c}%`);
  const { data, error } = await q.order("tahun", { ascending: false }).order("register", { ascending: true }).order("urut", { ascending: false }).limit(batas + 1);
  if (error) return { ok: false, status: 500, pesan: pesanDariDb(error.message) };
  const baris = (data ?? []) as BarisNomor[];
  return { ok: true, baris: baris.slice(0, batas), terpotong: baris.length > batas };
}

export type Counter = { register: string; tahun: number; terakhir: number };
export type Celah = { register: string; tahun: number; total: number; urut: number[] };
export type Kembar = { register: string; tahun: number; urut: number; jumlah: number; nomor: string[] };

export async function muatRingkas(db: Db, tahun: number): Promise<{ ok: true; counter: Counter[]; celah: Celah[]; kembar: Kembar[]; tahun_ada: number[] } | Galat> {
  const [c, n, k, t] = await Promise.all([
    db.from("arsip_counter").select("register, tahun, terakhir").order("tahun", { ascending: false }).order("register"),
    db.from("arsip_nomor").select("register, urut").eq("tahun", tahun).eq("status", "terpakai").eq("pengecualian", false).limit(20000),
    db.from("arsip_v_kembar").select("register, tahun, urut, jumlah, nomor").eq("tahun", tahun).order("urut").limit(500),
    db.from("arsip_counter").select("tahun"),
  ]);
  const e = c.error ?? n.error ?? k.error ?? t.error;
  if (e) return { ok: false, status: 500, pesan: pesanDariDb(e.message) };
  // Nomor terlewat dihitung dari nomor tercatat terkecil sampai nomor terakhir; nomor sebelum buku dimulai (surat lama di luar SIGAP) tidak dihitung.
  // Nomor bertanda pengecualian (di luar rangkaian) dikeluarkan dari hitungan ini.
  const urutPer = new Map<string, number[]>();
  for (const x of (n.data ?? []) as { register: string; urut: number }[]) {
    const l = urutPer.get(x.register) ?? [];
    l.push(Number(x.urut));
    urutPer.set(x.register, l);
  }
  const celah: Celah[] = [];
  for (const x of (c.data ?? []) as Counter[]) {
    if (x.tahun !== tahun) continue;
    const l = urutPer.get(x.register) ?? [];
    if (l.length === 0) continue;
    const r = celahUrut(l, x.terakhir, 300, Math.min(...l));
    if (r.total > 0) celah.push({ register: x.register, tahun, total: r.total, urut: r.celah });
  }
  const tahunAda = Array.from(new Set(((t.data ?? []) as { tahun: number }[]).map((x) => Number(x.tahun)))).sort((a, b) => b - a);
  return { ok: true, counter: (c.data ?? []) as Counter[], celah, kembar: (k.data ?? []) as Kembar[], tahun_ada: tahunAda };
}

export type KodeArsip = { kode: string; nama: string; kelompok: string; catatan: string | null; aktif: boolean; diverifikasi: boolean; fungsi: string | null; induk: string | null; tingkat: number | null; sumber: string };
export type FungsiArsip = { kode: string; nama: string; kelompok: string };
export type JenisArsip = { kode: string; nama: string; kategori: KategoriArsip; register: string; format: string; keamanan: string; kka_bawaan: string | null; aktif: boolean; urutan: number; dasar: string | null };
export type RegisterArsip = { kode: string; nama: string; catatan: string | null };

/** Kode arsip yang paling sering dipakai pada nomor yang sudah tercatat (untuk pilihan cepat). */
export async function muatSering(db: Db, batas = 6): Promise<string[]> {
  const { data } = await db.from("arsip_nomor").select("kka").not("kka", "is", null).eq("status", "terpakai").order("id", { ascending: false }).limit(2000);
  const hitung = new Map<string, number>();
  for (const r of (data ?? []) as { kka: string }[]) hitung.set(r.kka, (hitung.get(r.kka) ?? 0) + 1);
  return Array.from(hitung.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, batas).map(([k]) => k);
}

export async function muatPengaturan(db: Db): Promise<{ ok: true; kode: KodeArsip[]; fungsi: FungsiArsip[]; sering: string[]; jenis: JenisArsip[]; register: RegisterArsip[]; kegiatan_semua: { id: number; nama: string }[]; unit: string } | Galat> {
  const [k, f, j, r, keg, u, sering] = await Promise.all([
    db.from("arsip_kode").select("kode, nama, kelompok, catatan, aktif, diverifikasi, fungsi, induk, tingkat, sumber").order("kode").limit(2000),
    db.from("arsip_fungsi").select("kode, nama, kelompok").order("kode"),
    db.from("arsip_jenis").select("kode, nama, kategori, register, format, keamanan, kka_bawaan, aktif, urutan, dasar").order("urutan"),
    db.from("arsip_register").select("kode, nama, catatan").order("kode"),
    db.from("sigap_kegiatan").select("id, nama").order("id").limit(500),
    db.from("arsip_pengaturan").select("nilai").eq("kunci", "kode_unit").maybeSingle(),
    muatSering(db),
  ]);
  const e = k.error ?? f.error ?? j.error ?? r.error ?? keg.error ?? u.error;
  if (e) return { ok: false, status: 500, pesan: pesanDariDb(e.message) };
  return {
    ok: true,
    kode: (k.data ?? []) as KodeArsip[], fungsi: (f.data ?? []) as FungsiArsip[], sering, jenis: (j.data ?? []) as JenisArsip[], register: (r.data ?? []) as RegisterArsip[],
    kegiatan_semua: ((keg.data ?? []) as { id: number; nama: string }[]).map((x) => ({ id: Number(x.id), nama: x.nama })),
    unit: ((u.data as { nilai?: string } | null)?.nilai ?? ""),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pengaturan (ditulis langsung dengan service role setelah diperiksa)
// ---------------------------------------------------------------------------------------------------------------------
/**
 * Kode resmi Perka BPS 99/2018 (sumber = perka99) tidak boleh diubah uraiannya; hanya boleh dinonaktifkan agar tidak muncul di pilihan.
 * Kode tambahan (sumber = tambahan) boleh dibuat untuk kebutuhan kantor yang tidak ada di Perka; dua huruf awalnya harus fungsi resmi.
 */
export async function simpanKode(db: Db, m: { kode: string; nama: string; kelompok: string; catatan?: string | null; aktif: boolean }): Promise<{ ok: true } | Galat> {
  const kode = m.kode.trim().toUpperCase();
  if (!kkaSah(kode)) return { ok: false, status: 400, pesan: "Kode harus berbentuk dua huruf, titik, tiga angka (mis. VS.330)." };
  const { data: ada } = await db.from("arsip_kode").select("kode, sumber").eq("kode", kode).maybeSingle();
  if ((ada as { sumber?: string } | null)?.sumber === "perka99") {
    const { error } = await db.from("arsip_kode").update({ aktif: m.aktif, diubah_at: new Date().toISOString() }).eq("kode", kode);
    return error ? { ok: false, status: 400, pesan: pesanDariDb(error.message) } : { ok: true };
  }
  const nama = m.nama.trim();
  if (nama.length < 3 || nama.length > 200) return { ok: false, status: 400, pesan: "Nama kode arsip 3 sampai 200 huruf." };
  if (!["substantif", "fasilitatif"].includes(m.kelompok)) return { ok: false, status: 400, pesan: "Kelompok tidak sah." };
  const fungsi = kode.slice(0, 2);
  const { data: f } = await db.from("arsip_fungsi").select("kode").eq("kode", fungsi).maybeSingle();
  if (!f) return { ok: false, status: 400, pesan: `Awalan ${fungsi} bukan bidang resmi pada Perka BPS 99/2018. Gunakan awalan yang ada di daftar.` };
  const { error } = await db.from("arsip_kode").upsert({ kode, nama, kelompok: m.kelompok, catatan: m.catatan?.trim() || null, aktif: m.aktif, diverifikasi: false, fungsi, sumber: "tambahan", diubah_at: new Date().toISOString() }, { onConflict: "kode" });
  return error ? { ok: false, status: 400, pesan: pesanDariDb(error.message) } : { ok: true };
}

export async function simpanJenis(db: Db, m: { kode: string; nama?: string; register?: string; format?: string; keamanan?: string; kka_bawaan?: string | null; aktif?: boolean; baru?: boolean; kategori?: string }): Promise<{ ok: true } | Galat> {
  const kode = m.kode.trim();
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(kode)) return { ok: false, status: 400, pesan: "Kode jenis: huruf kecil, angka, garis bawah (mis. nota_dinas)." };
  const isi: Record<string, unknown> = {};
  if (m.nama !== undefined) {
    const n = m.nama.trim();
    if (n.length < 3 || n.length > 120) return { ok: false, status: 400, pesan: "Nama jenis dokumen 3 sampai 120 huruf." };
    isi.nama = n;
  }
  if (m.format !== undefined) {
    const f = m.format.trim();
    const g = periksaFormat(f);
    if (g) return { ok: false, status: 400, pesan: g };
    isi.format = f;
  }
  if (m.keamanan !== undefined) {
    if (!/^[A-Z]{1,2}$/.test(m.keamanan)) return { ok: false, status: 400, pesan: "Kode derajat keamanan 1 atau 2 huruf besar (B = biasa)." };
    isi.keamanan = m.keamanan;
  }
  if (m.register !== undefined) {
    const { data } = await db.from("arsip_register").select("kode").eq("kode", m.register).maybeSingle();
    if (!data) return { ok: false, status: 400, pesan: "Register tidak ditemukan." };
    isi.register = m.register;
  }
  if (m.kka_bawaan !== undefined) {
    if (m.kka_bawaan) {
      const { data } = await db.from("arsip_kode").select("kode").eq("kode", m.kka_bawaan).maybeSingle();
      if (!data) return { ok: false, status: 400, pesan: "Kode arsip bawaan tidak ada di daftar kode arsip." };
    }
    isi.kka_bawaan = m.kka_bawaan || null;
  }
  if (m.aktif !== undefined) isi.aktif = m.aktif;
  if (m.baru) {
    if (!m.nama || !m.register || !m.format) return { ok: false, status: 400, pesan: "Jenis baru wajib memiliki nama, register, dan pola nomor." };
    const kat = ["penugasan", "korespondensi_eksternal", "korespondensi_internal", "naskah_khusus"].includes(m.kategori ?? "") ? m.kategori : null;
    if (!kat) return { ok: false, status: 400, pesan: "Kategori tidak sah." };
    const { data: ada } = await db.from("arsip_jenis").select("kode").eq("kode", kode).maybeSingle();
    if (ada) return { ok: false, status: 409, pesan: "Kode jenis sudah dipakai." };
    const { error } = await db.from("arsip_jenis").insert({ kode, kategori: kat, urutan: 100, ...isi });
    return error ? { ok: false, status: 400, pesan: pesanDariDb(error.message) } : { ok: true };
  }
  if (Object.keys(isi).length === 0) return { ok: false, status: 400, pesan: "Tidak ada yang diubah." };
  // Nomor yang SUDAH terbit tidak berubah; pola baru hanya berlaku untuk nomor berikutnya.
  const { data: j } = await db.from("arsip_jenis").select("kode, format").eq("kode", kode).maybeSingle();
  if (!j) return { ok: false, status: 404, pesan: "Jenis dokumen tidak ditemukan." };
  const { error } = await db.from("arsip_jenis").update(isi).eq("kode", kode);
  return error ? { ok: false, status: 400, pesan: pesanDariDb(error.message) } : { ok: true };
}

export async function simpanUnit(db: Db, unit: string, akunId: number): Promise<{ ok: true } | Galat> {
  const u = unit.trim();
  if (!/^\d{4,6}$/.test(u)) return { ok: false, status: 400, pesan: "Kode unit kerja berupa 4 sampai 6 angka (BPS Kabupaten Solok: 13030)." };
  const { error } = await db.from("arsip_pengaturan").upsert({ kunci: "kode_unit", nilai: u, diubah_at: new Date().toISOString(), diubah_oleh: akunId }, { onConflict: "kunci" });
  return error ? { ok: false, status: 400, pesan: pesanDariDb(error.message) } : { ok: true };
}

/** Jenis yang memerlukan kode arsip tetapi belum punya bawaan (dipakai UI untuk menandai pilihan wajib). */
export const jenisButuhKka = (j: Pick<JenisArsip, "format">): boolean => perluKka(j.format);
