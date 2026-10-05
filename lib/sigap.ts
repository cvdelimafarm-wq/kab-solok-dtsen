// lib/sigap.ts
//
// (5 Okt 2026) SIGAP -- Sistem Informasi Gerak Anggaran & Pertanggungjawaban.
// Modul Pelaksanaan > Transport Lokal, GENERIK utk semua kegiatan (permintaan user):
//  - Akun petugas  = sigap_akun (master bencana_mitra ±774 + petugas bencana di luar mitra).
//  - Penugasan     = sigap_penugasan (kegiatan + peran + maks hari), diatur admin anggaran / PJ kegiatan.
//  - Peran & tarif = sigap_kegiatan_tarif (peran bebas, tarif, label jabatan, maks hari default).
//  - Hari kerja    = sigap_hari_kerja -> sumber Kwitansi/Visum/Surat Pernyataan (dirakit saat dibuka,
//                    TIDAK disimpan sbg file; dibekukan hanya saat admin "Verifikasi & Kunci").
//  - Laporan & 5 foto hanya pada HARI KERJA, di hari yg sama s.d. 23:59 WIB, kecuali izin susulan admin.
//  - Hari kerja direncanakan di awal, boleh diubah s.d. hari H; tanggal lewat terkunci.
//  - Hari lampau yg laporan/fotonya tidak lengkap TIDAK masuk Kwitansi.
//  - 1 tanggal = 1 kegiatan (unique akun_id+tanggal).

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export const JUMLAH_FOTO = 5;
export const BUCKET_SIGAP = "sigap-files";

/** Tanggal hari ini menurut WIB (Asia/Jakarta), format YYYY-MM-DD. */
export function hariIniWib(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Akhir hari WIB (23:59:59.999) untuk tanggal YYYY-MM-DD, sebagai ISO UTC. */
export function akhirHariWib(tanggal: string): string {
  return new Date(`${tanggal}T23:59:59.999+07:00`).toISOString();
}

export function tanggalValid(iso: unknown): iso is string {
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(`${iso}T00:00:00Z`));
}

/** Daftar tanggal dari mulai s.d. selesai (inklusif). */
export function rentangTanggal(mulai: string, selesai: string): string[] {
  const out: string[] = [];
  const d = new Date(`${mulai}T00:00:00Z`);
  const akhir = new Date(`${selesai}T00:00:00Z`);
  while (d <= akhir && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function besok(t: string): string {
  const d = new Date(`${t}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Kelompok tanggal: tanggal berurutan digabung, terputus = kelompok baru (sama dgn penyisiran). */
export function kelompokTanggal(tanggal: string[]): { mulai: string; selesai: string; jumlah_hari: number; tanggal: string[] }[] {
  const urut = Array.from(new Set(tanggal)).sort();
  const out: { mulai: string; selesai: string; jumlah_hari: number; tanggal: string[] }[] = [];
  for (const t of urut) {
    const akhir = out[out.length - 1];
    if (akhir && besok(akhir.selesai) === t) {
      akhir.selesai = t;
      akhir.tanggal.push(t);
      akhir.jumlah_hari += 1;
    } else out.push({ mulai: t, selesai: t, jumlah_hari: 1, tanggal: [t] });
  }
  return out;
}

export type Akun = {
  id: number;
  nama: string;
  jenis: "mitra" | "organik";
  nik: string | null;
  nip: string | null;
  alamat_kecamatan: string | null;
  petugas_bencana_id: number | null;
  mitra_id: number | null;
  onboarding_selesai_at: string | null;
  aktif: boolean;
  // (6 Okt 2026) koordinat tempat tinggal (master) & hasil verifikasi lokasi HP petugas
  domisili_lat: number | null;
  domisili_lng: number | null;
  domisili_sumber: string | null;
  verif_jarak_m: number | null;
  verif_alasan: string | null;
  verif_at: string | null;
};

export async function akunDariToken(db: Db, token: string): Promise<Akun | null> {
  if (!token || token.length < 16) return null;
  const { data } = await db
    .from("sigap_akun")
    .select("id, nama, jenis, nik, nip, alamat_kecamatan, petugas_bencana_id, mitra_id, onboarding_selesai_at, aktif, domisili_lat, domisili_lng, domisili_sumber, verif_jarak_m, verif_alasan, verif_at")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.aktif) return null;
  return data as Akun;
}

export type Penugasan = {
  id: number;
  kegiatan: { id: number; kode: string; nama: string; kode_anggaran: string | null; satuan_realisasi: string };
  peran: string;
  label_jabatan: string;
  tarif: number;
  maks_hari: number | null;
  periode: { mulai: string | null; selesai: string | null };
  surat_tugas: { nomor: string; tanggal_st: string | null; tujuan: string[]; ada_file: boolean } | null;
  dikunci_at: string | null;
};

/** Semua penugasan aktif seorang akun (kegiatan aktif saja). */
export async function penugasanAkun(db: Db, akunId: number): Promise<Penugasan[]> {
  const { data: pen } = await db
    .from("sigap_penugasan")
    .select("id, kegiatan_id, peran, maks_hari, surat_tugas_id, dikunci_at")
    .eq("akun_id", akunId)
    .eq("aktif", true);
  if (!pen || pen.length === 0) return [];
  const kegIds = Array.from(new Set(pen.map((p) => p.kegiatan_id as number)));
  const stIds = pen.map((p) => p.surat_tugas_id as number | null).filter((x): x is number => !!x);
  const [{ data: keg }, { data: tarif }, { data: st }] = await Promise.all([
    db.from("sigap_kegiatan").select("id, kode, nama, kode_anggaran, satuan_realisasi, tanggal_mulai, tanggal_selesai, aktif").in("id", kegIds),
    db.from("sigap_kegiatan_tarif").select("kegiatan_id, peran, tarif, label_jabatan, maks_hari_default").in("kegiatan_id", kegIds),
    stIds.length
      ? db.from("sigap_surat_tugas").select("id, nomor_st, tanggal_st, tanggal_mulai, tanggal_selesai, tujuan, file_path").in("id", stIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const hasil: Penugasan[] = [];
  for (const p of pen) {
    const k = (keg ?? []).find((x) => x.id === p.kegiatan_id);
    if (!k || !k.aktif) continue;
    const t = (tarif ?? []).find((x) => x.kegiatan_id === p.kegiatan_id && x.peran === p.peran);
    const s = (st ?? []).find((x) => x.id === p.surat_tugas_id) as Record<string, unknown> | undefined;
    hasil.push({
      id: p.id as number,
      kegiatan: { id: k.id, kode: k.kode, nama: k.nama, kode_anggaran: k.kode_anggaran, satuan_realisasi: k.satuan_realisasi ?? "ruta" },
      peran: p.peran as string,
      label_jabatan: (t?.label_jabatan as string) ?? `${String(p.peran).toUpperCase()} ${k.nama}`,
      tarif: Number(t?.tarif ?? 0),
      maks_hari: (p.maks_hari as number | null) ?? ((t?.maks_hari_default as number | null) ?? null),
      // Periode: rentang Surat Tugas kalau ada, kalau tidak periode kegiatan.
      periode: {
        mulai: ((s?.tanggal_mulai as string | null) ?? null) || (k.tanggal_mulai as string | null),
        selesai: ((s?.tanggal_selesai as string | null) ?? null) || (k.tanggal_selesai as string | null),
      },
      surat_tugas: s ? { nomor: s.nomor_st as string, tanggal_st: (s.tanggal_st as string | null) ?? null, tujuan: (s.tujuan as string[] | null) ?? [], ada_file: !!s.file_path } : null,
      dikunci_at: (p.dikunci_at as string | null) ?? null,
    });
  }
  return hasil.sort((a, b) => a.kegiatan.nama.localeCompare(b.kegiatan.nama));
}

/** Status kunci isian laporan/foto sebuah tanggal. */
export async function statusKunci(
  db: Db,
  penugasanId: number,
  tanggal: string
): Promise<{ boleh: boolean; alasan: "hari_ini" | "izin" | "terlewat" | "akan_datang"; izinSampai: string | null }> {
  const hariIni = hariIniWib();
  if (tanggal > hariIni) return { boleh: false, alasan: "akan_datang", izinSampai: null };
  if (tanggal === hariIni) return { boleh: true, alasan: "hari_ini", izinSampai: null };
  const { data } = await db
    .from("sigap_izin_susulan")
    .select("berlaku_sampai")
    .eq("penugasan_id", penugasanId)
    .eq("tanggal", tanggal)
    .gt("berlaku_sampai", new Date().toISOString())
    .order("berlaku_sampai", { ascending: false })
    .limit(1);
  const izin = (data ?? [])[0]?.berlaku_sampai as string | undefined;
  return izin ? { boleh: true, alasan: "izin", izinSampai: izin } : { boleh: false, alasan: "terlewat", izinSampai: null };
}

/**
 * Cek akses isian laporan/foto: penugasan milik akun, belum dikunci admin,
 * tanggal termasuk hari kerja, dan masih dalam batas waktu (atau izin susulan).
 */
export async function cekAksesIsian(
  db: Db,
  akunId: number,
  penugasanId: number,
  tanggal: unknown
): Promise<{ error: string; status: number } | { penugasan: Penugasan; tanggal: string; susulan: boolean }> {
  if (!tanggalValid(tanggal)) return { error: "Tanggal tidak valid.", status: 400 };
  const pen = (await penugasanAkun(db, akunId)).find((p) => p.id === penugasanId);
  if (!pen) return { error: "Anda tidak terdaftar pada kegiatan ini.", status: 403 };
  if (pen.dikunci_at) return { error: "SPJ kegiatan ini sudah diverifikasi & dikunci admin.", status: 403 };
  const { data: hk } = await db.from("sigap_hari_kerja").select("id").eq("penugasan_id", penugasanId).eq("tanggal", tanggal).maybeSingle();
  if (!hk) return { error: "Tanggal ini bukan hari kerja Anda. Pilih dulu di menu Hari Kerja.", status: 400 };
  const kunci = await statusKunci(db, penugasanId, tanggal);
  if (!kunci.boleh) {
    return {
      error:
        kunci.alasan === "akan_datang"
          ? "Laporan & foto baru bisa diisi pada hari kerjanya."
          : "Batas waktu tanggal ini sudah lewat (23:59 WIB). Dokumentasi terlewat tidak dapat diupload kembali tanpa izin admin anggaran.",
      status: 403,
    };
  }
  return { penugasan: pen, tanggal, susulan: kunci.alasan === "izin" };
}

/** (6 Okt 2026) Jarak dua titik (meter), rumus haversine. */
export function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Batas selisih lokasi HP vs tempat tinggal sebelum alasan wajib diisi. */
export const BATAS_JARAK_M = 5000;
