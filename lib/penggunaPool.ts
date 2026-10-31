// lib/penggunaPool.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Fondasi arus kegiatan: pool Mitra Kepka + Manajemen Pengguna (tab "Mitra Kepka" dan "Pegawai organik" di Kelola Peran & Akses).
// Mitra Kepka = Mitra yang disahkan Keputusan Kepala BPS; HANYA mereka yang boleh dipekerjakan. Anggota pool dicatat per TAHUN
// (tabel sigap_mitra_pool) -- akun SIGAP jenis "mitra" yang belum ditandai pool tahun itu tampil "belum masuk pool" dan tidak otomatis dianggap sah.
// Dipakai bersama oleh API (app/api/sigap/pengguna) dan layar (app/sigap/akses/Pengguna.tsx); seleksi/penunjukan berikutnya memakai tipe yang sama.

export type JenisPengguna = "mitra" | "organik";
export type StatusPool = "aktif" | "nonaktif";
export type StatusLokasi = "terverifikasi" | "berkoordinat" | "belum";
export type FilterPool = "semua" | "aktif" | "nonaktif" | "belum";
export type FilterLokasi = "semua" | StatusLokasi;

export type BarisPool = { status: StatusPool; no_kepka: string | null; catatan: string | null };

export type AkunPengguna = {
  id: number;
  nama: string;
  jenis: JenisPengguna;
  nik: string | null;
  nip: string | null;
  alamat_kecamatan: string | null;
  /** Nagari/desa tempat tinggal (dari data pendaftaran Mitra/petugas bila ada). */
  alamat_nagari?: string | null;
  /** Data pendaftaran Mitra (hanya jenis mitra): nomor HP, email, tanggal lahir (yyyy-mm-dd), dan penilaian Mitra SE2026 (1-5). */
  no_hp?: string | null;
  email?: string | null;
  tanggal_lahir?: string | null;
  nilai_se2026?: number | null;
  domisili_lat: number | null;
  domisili_lng: number | null;
  domisili_sumber: string | null;
  verif_at: string | null;
  verif_jarak_m: number | null;
  terakhir_masuk_at: string | null;
  aktif: boolean;
  pool: BarisPool | null;
};

export const TAHUN_MIN = 2020;
export const TAHUN_MAKS = 2100;
export const MAKS_MASSAL = 500;

/** Tahun bernilai bulat dalam rentang wajar; selain itu null. */
export function tahunSah(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= TAHUN_MIN && n <= TAHUN_MAKS ? n : null;
}

/** Titik domisili dianggap ada bila lat/lng berupa angka berhingga dalam rentang bumi (0,0 ditolak: itu nilai isian kosong, bukan Solok). */
export function titikSah(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

export function statusLokasi(a: Pick<AkunPengguna, "domisili_lat" | "domisili_lng" | "verif_at">): StatusLokasi {
  if (!titikSah(a.domisili_lat, a.domisili_lng)) return "belum";
  return a.verif_at ? "terverifikasi" : "berkoordinat";
}

/** Buang kode BPS di depan nama wilayah: "(002) SUNGAI NANAM" -> "SUNGAI NANAM". Kosong -> null. */
export function buangKodeWilayah(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/^\s*\(\d+\)\s*/, "").trim();
  return t === "" ? null : t;
}

export type BarisBencanaMitra = { id: number; alamat_desa: string | null; no_telp: string | null; email: string | null; tanggal_lahir: string | null };
export type BarisBencanaPetugas = { id: number; alamat_nagari: string | null; no_hp: string | null; nilai_kinerja: number | null; nilai_kinerja_sumber: string | null };
export type RincianAkun = { nagari: string | null; no_hp: string | null; email: string | null; tanggal_lahir: string | null; nilai_se2026: number | null };

const teksAtauNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Rincian akun dari data pendaftaran: bencana_mitra (via mitra_id) diutamakan, bencana_petugas (via petugas_bencana_id) sebagai cadangan.
 * Penilaian Mitra SE2026 = nilai_kinerja 1-5 bersumber "SE2026" (nilai ini yang menandai Mitra SE2026 dan dibawa sebagai rekam jejak ke kegiatan berikutnya).
 */
export function rincianAkun(m: BarisBencanaMitra | undefined, p: BarisBencanaPetugas | undefined): RincianAkun {
  const lahir = /^\d{4}-\d{2}-\d{2}/.exec(m?.tanggal_lahir ?? "");
  const n = p?.nilai_kinerja;
  const nilaiSah = typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 && (p?.nilai_kinerja_sumber ?? "").toUpperCase() === "SE2026";
  return {
    nagari: buangKodeWilayah(m?.alamat_desa) ?? buangKodeWilayah(p?.alamat_nagari),
    no_hp: teksAtauNull(m?.no_telp) ?? teksAtauNull(p?.no_hp),
    email: teksAtauNull(m?.email),
    tanggal_lahir: lahir ? lahir[0] : null,
    nilai_se2026: nilaiSah ? (n as number) : null,
  };
}

/** Samarkan identitas untuk tampilan daftar: hanya 4 digit terakhir. */
export function samarkanId(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (s.length <= 4) return "•".repeat(s.length);
  return "•".repeat(Math.min(s.length - 4, 14)) + s.slice(-4);
}

export type Ringkasan = {
  total: number;
  aktif: number;
  pool_aktif: number;
  pool_nonaktif: number;
  belum_pool: number;
  lokasi_terverifikasi: number;
  lokasi_berkoordinat: number;
  lokasi_belum: number;
};

export function ringkas(daftar: AkunPengguna[]): Ringkasan {
  const r: Ringkasan = { total: daftar.length, aktif: 0, pool_aktif: 0, pool_nonaktif: 0, belum_pool: 0, lokasi_terverifikasi: 0, lokasi_berkoordinat: 0, lokasi_belum: 0 };
  for (const a of daftar) {
    if (a.aktif) r.aktif++;
    if (!a.pool) r.belum_pool++;
    else if (a.pool.status === "aktif") r.pool_aktif++;
    else r.pool_nonaktif++;
    const l = statusLokasi(a);
    if (l === "terverifikasi") r.lokasi_terverifikasi++;
    else if (l === "berkoordinat") r.lokasi_berkoordinat++;
    else r.lokasi_belum++;
  }
  return r;
}

const normal = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export type Saringan = { q?: string; pool?: FilterPool; lokasi?: FilterLokasi; kecamatan?: string; hanyaAktif?: boolean };

export function saring(daftar: AkunPengguna[], f: Saringan): AkunPengguna[] {
  const q = normal(f.q);
  const kec = normal(f.kecamatan);
  return daftar.filter((a) => {
    if (f.hanyaAktif && !a.aktif) return false;
    if (q && !normal(a.nama).includes(q)) return false;
    if (kec && normal(a.alamat_kecamatan) !== kec) return false;
    const p = f.pool ?? "semua";
    if (p === "belum" && a.pool) return false;
    if ((p === "aktif" || p === "nonaktif") && a.pool?.status !== p) return false;
    const l = f.lokasi ?? "semua";
    if (l !== "semua" && statusLokasi(a) !== l) return false;
    return true;
  });
}

/** Daftar kecamatan unik (urut abjad) untuk pilihan filter. */
export function daftarKecamatan(daftar: AkunPengguna[]): string[] {
  return Array.from(new Set(daftar.map((a) => (a.alamat_kecamatan ?? "").trim()).filter(Boolean))).sort((x, y) => x.localeCompare(y, "id"));
}

export type PermintaanPool = { akun_ids: number[]; tahun: number; status: StatusPool; no_kepka: string | null; catatan: string | null };

/** Memeriksa isi POST set_pool. Mengembalikan permintaan bersih atau pesan galat. */
export function periksaPermintaanPool(isi: unknown): { ok: true; nilai: PermintaanPool } | { ok: false; pesan: string } {
  const o = (isi ?? {}) as Record<string, unknown>;
  const tahun = tahunSah(o.tahun);
  if (tahun === null) return { ok: false, pesan: "Tahun pool tidak sah." };
  const status = o.status;
  if (status !== "aktif" && status !== "nonaktif") return { ok: false, pesan: "Status pool harus aktif atau nonaktif." };
  const mentah = Array.isArray(o.akun_ids) ? o.akun_ids : [];
  const ids = Array.from(new Set(mentah.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0)));
  if (ids.length === 0) return { ok: false, pesan: "Pilih minimal satu akun." };
  if (ids.length > MAKS_MASSAL) return { ok: false, pesan: `Paling banyak ${MAKS_MASSAL} akun sekali proses.` };
  const bersih = (v: unknown, maks: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, maks) : null;
  };
  return { ok: true, nilai: { akun_ids: ids, tahun, status, no_kepka: bersih(o.no_kepka, 80), catatan: bersih(o.catatan, 300) } };
}
