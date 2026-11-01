// lib/vanguardPengaturanDb.ts
//
// (1 Nov 2026) VANGUARD V5a: akses basis data untuk pengaturan per kegiatan dan cacahan kalkulator. TAHAN SQL BELUM DIJALANKAN (20261101w): bila tabel belum ada,
// pengaturan dibaca sebagai bawaan, penyimpanan menolak dengan pesan jelas, dan cacahan kalkulator diabaikan (percobaan tetap tercatat).

import type { Db } from "@/lib/sigap";
import { bacaPengaturan, PENGATURAN_BAWAAN, type Pengaturan } from "@/lib/vanguard/pengaturan";

export async function muatPengaturan(db: Db, kegiatan: number): Promise<Pengaturan> {
  try {
    const { data, error } = await db.from("sigap_vanguard_pengaturan").select("level_dibuka, nilai_lulus, buka_at, tutup_at, maks_percobaan").eq("kegiatan_id", kegiatan).maybeSingle();
    if (error || !data) return { ...PENGATURAN_BAWAAN };
    return bacaPengaturan(data);
  } catch {
    return { ...PENGATURAN_BAWAAN };
  }
}

export async function simpanPengaturan(db: Db, kegiatan: number, p: Pengaturan, oleh: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  try {
    const { error } = await db.from("sigap_vanguard_pengaturan").upsert(
      { kegiatan_id: kegiatan, level_dibuka: p.level_dibuka, nilai_lulus: p.nilai_lulus, buka_at: p.buka_at, tutup_at: p.tutup_at, maks_percobaan: p.maks_percobaan, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() },
      { onConflict: "kegiatan_id" },
    );
    if (error) return { ok: false, pesan: "Pengaturan belum dapat disimpan. Pastikan SQL 20261101w_vanguard_pengaturan sudah dijalankan." };
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
