// lib/vanguardPengaturanDb.ts
//
// (1 Nov 2026) VANGUARD V5a: akses basis data untuk pengaturan per kegiatan dan cacahan kalkulator. TAHAN SQL BELUM DIJALANKAN (20261101w): bila tabel belum ada,
// pengaturan dibaca sebagai bawaan, penyimpanan menolak dengan pesan jelas, dan cacahan kalkulator diabaikan (percobaan tetap tercatat).

import type { Db } from "@/lib/sigap";
import { bacaPengaturan, PENGATURAN_BAWAAN, type Pengaturan } from "@/lib/vanguard/pengaturan";

const KOLOM_DASAR = "level_dibuka, nilai_lulus, buka_at, tutup_at, maks_percobaan";

export async function muatPengaturan(db: Db, kegiatan: number): Promise<Pengaturan> {
  try {
    // Kolom `mode` (SQL 20261101x) boleh belum ada: bila gagal, baca ulang tanpa kolom itu (mode = latihan).
    let r = await db.from("sigap_vanguard_pengaturan").select(`${KOLOM_DASAR}, mode`).eq("kegiatan_id", kegiatan).maybeSingle();
    if (r.error) r = await db.from("sigap_vanguard_pengaturan").select(KOLOM_DASAR).eq("kegiatan_id", kegiatan).maybeSingle();
    if (r.error || !r.data) return { ...PENGATURAN_BAWAAN };
    return bacaPengaturan(r.data);
  } catch {
    return { ...PENGATURAN_BAWAAN };
  }
}

/**
 * (3 Nov 2026) Bank soal (84 kasus) untuk PESERTA PELATIHAN dipisah dari kewajiban pelatihan: boleh dicoba sebanyak-banyaknya, dengan petunjuk dan kunci jawaban,
 * dan tidak memengaruhi apa pun. Untuk kegiatan berjenis "pelatihan", pengaturan tersimpan (mode uji, nilai lulus, batas percobaan, jadwal buka/tutup, level dibuka)
 * TIDAK berlaku pada bank soal; kewajiban pelatihan ada di aturan runtutan (Menu wajib: Latihan wajib dan Sertifikasi wajib). Kegiatan lain tidak berubah.
 */
export async function kegiatanBerjenisPelatihan(db: Db, kegiatan: number): Promise<boolean> {
  try {
    const { data, error } = await db.from("sigap_kegiatan").select("jenis").eq("id", kegiatan).maybeSingle();
    return !error && (data as { jenis?: string } | null)?.jenis === "pelatihan";
  } catch {
    return false;
  }
}

export async function muatPengaturanPeserta(db: Db, kegiatan: number): Promise<Pengaturan> {
  if (await kegiatanBerjenisPelatihan(db, kegiatan)) return { ...PENGATURAN_BAWAAN };
  return muatPengaturan(db, kegiatan);
}

/** Kegiatan yang sedang bermode uji beserta pengaturannya (jumlahnya kecil). Kosong bila tabel atau kolom mode belum ada. */
export async function muatKegiatanUji(db: Db): Promise<{ kegiatan: number; pengaturan: Pengaturan }[]> {
  try {
    const { data, error } = await db.from("sigap_vanguard_pengaturan").select(`kegiatan_id, ${KOLOM_DASAR}, mode`).eq("mode", "uji").limit(200);
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).filter((r) => typeof r.kegiatan_id === "number").map((r) => ({ kegiatan: r.kegiatan_id as number, pengaturan: bacaPengaturan(r) }));
  } catch {
    return [];
  }
}

export async function simpanPengaturan(db: Db, kegiatan: number, p: Pengaturan, oleh: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  try {
    const dasar = { kegiatan_id: kegiatan, level_dibuka: p.level_dibuka, nilai_lulus: p.nilai_lulus, buka_at: p.buka_at, tutup_at: p.tutup_at, maks_percobaan: p.maks_percobaan, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() };
    const { error } = await db.from("sigap_vanguard_pengaturan").upsert({ ...dasar, mode: p.mode }, { onConflict: "kegiatan_id" });
    if (!error) return { ok: true };
    // Kolom mode belum ada (SQL 20261101x belum dijalankan): latihan tetap dapat disimpan tanpanya; uji tidak.
    if (p.mode === "uji") return { ok: false, pesan: "Mode uji belum dapat disimpan. Pastikan SQL 20261101x_vanguard_mode sudah dijalankan." };
    const { error: e2 } = await db.from("sigap_vanguard_pengaturan").upsert(dasar, { onConflict: "kegiatan_id" });
    if (e2) return { ok: false, pesan: "Pengaturan belum dapat disimpan. Pastikan SQL 20261101w_vanguard_pengaturan sudah dijalankan." };
    return { ok: true };
  } catch {
    return { ok: false, pesan: "Pengaturan belum dapat disimpan." };
  }
}

/** Menambah cacahan kalkulator seorang petugas. Terbaik-upaya: galat apa pun diabaikan. */
export async function tambahKalkulator(db: Db, kegiatan: number, akun: number, n: number): Promise<void> {
  if (!(n > 0)) return;
  try {
    const { data } = await db.from("sigap_vanguard_kalkulator").select("jumlah").eq("kegiatan_id", kegiatan).eq("akun_id", akun).maybeSingle();
    const lama = typeof (data as { jumlah?: unknown } | null)?.jumlah === "number" ? ((data as { jumlah: number }).jumlah) : 0;
    await db.from("sigap_vanguard_kalkulator").upsert({ kegiatan_id: kegiatan, akun_id: akun, jumlah: lama + n, terakhir_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
  } catch {
    /* abaikan */
  }
}

/** Cacahan kalkulator per akun satu kegiatan (kosong bila tabel belum ada). */
export async function muatKalkulator(db: Db, kegiatan: number): Promise<Record<number, number>> {
  try {
    const { data, error } = await db.from("sigap_vanguard_kalkulator").select("akun_id, jumlah").eq("kegiatan_id", kegiatan).limit(5000);
    if (error) return {};
    return Object.fromEntries(((data ?? []) as { akun_id: number; jumlah: number }[]).map((r) => [r.akun_id, r.jumlah]));
  } catch {
    return {};
  }
}
