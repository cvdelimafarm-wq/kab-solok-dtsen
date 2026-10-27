// lib/sigapQcTunda.ts
//
// (28 Okt 2026) QC Pemahaman Petugas -- "Tunda 2 jam" pada pengingat push. Logika MURNI (tanpa tampilan, tanpa basis data), dipakai rute cron
// (lib/portal/qc.ts) dan modal QC. Aturan (permintaan M. Iqbal Hadi, 28 Okt 2026):
//  * Petugas yang belum mengerjakan boleh menunda pengingat 2 jam (tombol pada notifikasi, atau "Ingatkan lagi 2 jam" di modal QC).
//  * Modal pemblokir TIDAK berubah: tetap wajib sampai nilai 100. Yang ditunda hanya notifikasi pengingat.
//  * Selama menunda, pengingat terjadwal biasa tidak dikirim ke petugas itu. Saat tunda berakhir dikirim SATU pengingat (bila belum 100).
//  * Pengingat TENGGAT (tepat jam batas) tetap dikirim walau sedang menunda; tunda sebelum batas tidak pernah melewati batas (diatur SQL).
//  * Petugas yang baru saja dikirimi pengingat (kurang dari JEDA_PUSH_MENIT) tidak dikirimi pengingat terjadwal lagi (hindari dua push berdekatan).

import { SLOT_TENGGAT, SLOT_TUNDA, adalahJamSenyap, bagianWib, menitKeJam } from "@/lib/sigapQc";

/** Lama tunda bawaan (menit). SQL menerima 15-720. */
export const MENIT_TUNDA = 120;
/** Tidak ada pengingat terjadwal untuk petugas yang sudah dikirimi push rilis/pengingat dalam rentang ini. */
export const JEDA_PUSH_MENIT = 60;

/** Satu baris keluaran sigap_qc_tunda_aktif: tunda TERAKHIR petugas pada hari tersebut. */
export type TundaAktif = { akun_id: number; ke: number; sampai: string };

export const slotTunda = (ke: number): number => SLOT_TUNDA + ke;

const ms = (s: string): number => Date.parse(s);

/** akun -> saat tunda berakhir (ms), hanya tunda yang MASIH berlaku pada `nowMs`. */
export function petaTundaBerlaku(daftar: readonly TundaAktif[], nowMs: number): Map<number, number> {
  const peta = new Map<number, number>();
  for (const t of daftar) {
    const s = ms(t.sampai);
    if (Number.isFinite(s) && s > nowMs) peta.set(t.akun_id, s);
  }
  return peta;
}

/**
 * Tunda yang sudah berakhir dan pengingat "tunda selesai"-nya belum dikirim (`sudahKirim` berisi `${akun}:${slot}`).
 * Bukan jam senyap (23.00-05.59 WIB): pengingat menunggu sampai senyap berakhir, tetapi hanya selama hari QC yang sama masih berlaku
 * (cron hanya menanyakan tunda milik hari yang sedang berlaku). `batasMs` (hari biasa): tunda yang berakhir tepat di batas dilewati karena pengingat TENGGAT menggantikannya.
 */
export function tundaJatuhTempo(daftar: readonly TundaAktif[], nowMs: number, sudahKirim: ReadonlySet<string> = new Set(), batasMs: number | null = null): TundaAktif[] {
  if (adalahJamSenyap(bagianWib(new Date(nowMs)).menit)) return [];
  return daftar.filter((t) => {
    const s = ms(t.sampai);
    if (!Number.isFinite(s) || s > nowMs || sudahKirim.has(`${t.akun_id}:${slotTunda(t.ke)}`)) return false;
    // tunda yang dipotong tepat di jam batas digantikan pengingat TENGGAT (jangan kirim dua push pada menit yang sama)
    if (batasMs !== null && Math.abs(s - batasMs) < 1000) return false;
    return true;
  });
}

/**
 * Penerima pengingat terjadwal biasa (slot +N menit dan berkala): buang yang sedang menunda dan yang baru saja dikirimi push.
 * Slot TENGGAT tidak disaring sama sekali (selalu dikirim ke semua yang masih wajib).
 */
export function saringPenerima(akunIds: readonly number[], slot: number, tunda: ReadonlyMap<number, number>, barusaja: ReadonlySet<number>, nowMs: number): number[] {
  if (slot === SLOT_TENGGAT) return [...akunIds];
  return akunIds.filter((id) => !((tunda.get(id) ?? 0) > nowMs) && !barusaja.has(id));
}

/** Penanda "baru dikirimi": baris catatan kirim (jenis rilis/ingat_petugas) yang dibuat dalam JEDA_PUSH_MENIT terakhir. */
export function akunBarusaja(baris: readonly { akun_id: number; dibuat_at: string }[], nowMs: number, jedaMenit: number = JEDA_PUSH_MENIT): Set<number> {
  const batas = nowMs - jedaMenit * 60_000;
  const hasil = new Set<number>();
  for (const b of baris) {
    const t = ms(b.dibuat_at);
    if (Number.isFinite(t) && t >= batas) hasil.add(b.akun_id);
  }
  return hasil;
}

/** Himpunan `${akun}:${slot}` untuk catatan kirim slot tunda (>= SLOT_TUNDA) yang sudah ada. */
export function tundaSudahDikirim(baris: readonly { akun_id: number; slot: number }[]): Set<string> {
  const h = new Set<string>();
  for (const b of baris) if (b.slot >= SLOT_TUNDA) h.add(`${b.akun_id}:${b.slot}`);
  return h;
}

/** Kalimat untuk petugas: kapan pengingat berikutnya. null bila tunda sudah berakhir / tidak ada. */
export function teksTunda(sampai: string | null | undefined, nowMs: number): string | null {
  if (!sampai) return null;
  const s = ms(sampai);
  if (!Number.isFinite(s) || s <= nowMs) return null;
  return `Pengingat berikutnya pukul ${menitKeJam(bagianWib(new Date(s)).menit)} WIB.`;
}

/** Pesan konfirmasi dari server (juga ditampilkan notifikasi setelah tombol "Tunda 2 jam" ditekan). */
export function pesanTunda(sampai: string, sampaiBatas: boolean): string {
  const jam = menitKeJam(bagianWib(new Date(ms(sampai))).menit);
  return sampaiBatas
    ? `Ditunda sampai batas pengisian pukul ${jam} WIB. Soal tetap wajib diisi.`
    : `Ditunda. Pengingat berikutnya pukul ${jam} WIB. Soal tetap wajib diisi.`;
}
