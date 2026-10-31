// lib/portal/pushTerkelola.ts  (hanya server)
//
// (31 Okt 2026) Pengirim push TERKELOLA: membaca pengaturan per kegiatan (sigap_push_pengaturan), mematuhi saklar, mencatat ke sigap_push_log, dan
// menyediakan klaim tahap + denyut cron. Aturan murni ada di lib/pushPengaturan.ts. Prinsip: GAGAL MEMBACA PENGATURAN TIDAK BOLEH MEMATIKAN
// NOTIFIKASI YANG SUDAH BERJALAN -- tabel belum dibuat / galat jaringan = bawaan (notifikasi alur FASIH tetap menyala).

import type { Db } from "@/lib/sigap";
import { kirimKeAkun, type HasilKirim } from "@/lib/sigapPush";
import type { PesanPush } from "@/lib/sigapPushUtil";
import { KODE_KEGIATAN_SIARAN } from "@/lib/siaranPetugas";
import { fasihAktif, jenisLogFasih, type BarisPengaturan, type KunciFasih } from "@/lib/pushPengaturan";

type Baris = BarisPengaturan & { kegiatan_id: number };

/** Semua pengaturan satu kegiatan. Galat apa pun = daftar kosong (bawaan). */
export async function bacaPengaturan(db: Db, kegiatanId: number): Promise<BarisPengaturan[]> {
  try {
    const { data, error } = await db.from("sigap_push_pengaturan").select("kunci, aktif, nilai").eq("kegiatan_id", kegiatanId);
    if (error) return [];
    return (data ?? []) as BarisPengaturan[];
  } catch {
    return [];
  }
}

/** Pengaturan semua kegiatan sekaligus (untuk cron). */
export async function bacaPengaturanSemua(db: Db): Promise<Map<number, BarisPengaturan[]>> {
  const peta = new Map<number, BarisPengaturan[]>();
  try {
    const { data, error } = await db.from("sigap_push_pengaturan").select("kegiatan_id, kunci, aktif, nilai").limit(5000);
    if (error) return peta;
    for (const b of (data ?? []) as Baris[]) peta.set(b.kegiatan_id, [...(peta.get(b.kegiatan_id) ?? []), { kunci: b.kunci, aktif: b.aktif, nilai: b.nilai }]);
  } catch {
    /* bawaan */
  }
  return peta;
}

let cachePasca: { id: number | null; sampai: number } | null = null;
/** id kegiatan Pendataan Pascabencana (notifikasi alur FASIH hanya milik kegiatan ini); disimpan 10 menit. */
export async function idKegiatanPascabencana(db: Db): Promise<number | null> {
  if (cachePasca && cachePasca.sampai > Date.now()) return cachePasca.id;
  const { data } = await db.from("sigap_kegiatan").select("id").eq("kode", KODE_KEGIATAN_SIARAN).maybeSingle();
  const id = (data?.id as number | undefined) ?? null;
  cachePasca = { id, sampai: Date.now() + 600_000 };
  return id;
}

export type HasilTerkelola = HasilKirim & { dilewati?: boolean };
const KOSONG: HasilTerkelola = { akun_berlangganan: [], perangkat: 0, terkirim: 0, gagal: 0, dilewati: true };

/**
 * Kirim satu notifikasi alur FASIH ke `penerima` bila saklarnya menyala untuk kegiatan Pascabencana. Bentuk hasil sama dengan kirimKeAkun
 * (+ `dilewati`), jadi pemanggil lama cukup mengganti nama fungsi. Satu baris sigap_push_log per pemanggilan (jenis alur_fasih_*), bila ada yang dituju.
 */
export async function kirimFasih(db: Db, kunci: KunciFasih, penerima: number[], pesan: PesanPush & { tag?: string }, olehAkunId?: number | null): Promise<HasilTerkelola> {
  const kegiatanId = await idKegiatanPascabencana(db);
  if (kegiatanId && !fasihAktif(await bacaPengaturan(db, kegiatanId), kunci)) return KOSONG;
  const h = await kirimKeAkun(db, penerima, pesan);
  if (h.akun_berlangganan.length > 0 || h.perangkat > 0) {
    try {
      await db.from("sigap_push_log").insert({
        kegiatan_id: kegiatanId,
        oleh_akun_id: olehAkunId ?? null,
        jenis: jenisLogFasih(kunci),
        judul: pesan.judul,
        isi: pesan.isi,
        url: pesan.url,
        jumlah_akun: h.akun_berlangganan.length,
        jumlah_perangkat: h.perangkat,
        terkirim: h.terkirim,
        gagal: h.gagal,
      });
    } catch {
      /* riwayat hanya pelengkap */
    }
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------------------- klaim tahap
const KLAIM_BASI_MS = 3 * 60_000;

/**
 * Klaim (tanggal, kegiatan, kunci) agar satu tahap hanya dikerjakan satu proses.
 *   "baru"   -> diklaim sekarang, kerjakan
 *   "lanjut" -> klaim lama yang belum selesai dan sudah basi (> 3 menit; proses sebelumnya mati/terpotong), diambil alih; kiriman yang sudah ada
 *               tidak terulang karena pemanggil memeriksa riwayat per penerima
 *   "sudah"  -> sudah selesai atau sedang dikerjakan proses lain
 *   "galat"  -> tabel belum ada / galat basis data: JANGAN kirim (lebih baik terlewat daripada ganda)
 */
export async function klaimTahap(db: Db, tanggal: string, kegiatanId: number, kunci: string, nowMs: number): Promise<"baru" | "lanjut" | "sudah" | "galat"> {
  try {
    const { data, error } = await db.from("sigap_push_klaim").upsert({ tanggal, kegiatan_id: kegiatanId, kunci }, { onConflict: "tanggal,kegiatan_id,kunci", ignoreDuplicates: true }).select("kunci");
    if (error) return "galat";
    if ((data ?? []).length > 0) return "baru";
    const { data: ada, error: e2 } = await db.from("sigap_push_klaim").select("dibuat_at, selesai_at").eq("tanggal", tanggal).eq("kegiatan_id", kegiatanId).eq("kunci", kunci).maybeSingle();
    if (e2 || !ada) return "galat";
    if (ada.selesai_at) return "sudah";
    const umur = nowMs - Date.parse(ada.dibuat_at as string);
    if (!(umur > KLAIM_BASI_MS)) return "sudah";
    // ambil alih dengan membandingkan dibuat_at lama (hanya satu proses yang menang)
    const { data: ambil } = await db.from("sigap_push_klaim").update({ dibuat_at: new Date(nowMs).toISOString() }).eq("tanggal", tanggal).eq("kegiatan_id", kegiatanId).eq("kunci", kunci).eq("dibuat_at", ada.dibuat_at as string).is("selesai_at", null).select("kunci");
    return (ambil ?? []).length > 0 ? "lanjut" : "sudah";
  } catch {
    return "galat";
  }
}

export async function selesaiKlaim(db: Db, tanggal: string, kegiatanId: number, kunci: string): Promise<void> {
  try {
    await db.from("sigap_push_klaim").update({ selesai_at: new Date().toISOString() }).eq("tanggal", tanggal).eq("kegiatan_id", kegiatanId).eq("kunci", kunci);
  } catch {
    /* klaim basi akan diambil alih proses berikutnya */
  }
}

// ---------------------------------------------------------------------------------------------------------------- denyut
export async function catatDenyut(db: Db, kunci: string, ringkasan: Record<string, unknown>): Promise<void> {
  try {
    await db.from("sigap_push_denyut").upsert({ kunci, terakhir: new Date().toISOString(), ringkasan }, { onConflict: "kunci" });
  } catch {
    /* denyut hanya pelengkap */
  }
}
