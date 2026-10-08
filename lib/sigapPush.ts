// lib/sigapPush.ts  (hanya server)
//
// (8 Okt 2026) Notifikasi push SIGAP -- pengirim ke perangkat peserta (Web Push + VAPID), muncul walau aplikasi ditutup.
// Perlu variabel lingkungan di server (Railway):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (buat sekali: `npx web-push generate-vapid-keys`)
//   VAPID_SUBJECT (opsional; bawaan alamat situs)
// Tanpa kunci ini pengiriman dinonaktifkan dengan pesan jelas (bagian lain aplikasi tidak terpengaruh).

import webpush from "web-push";
import type { Db } from "@/lib/sigap";
import type { PesanPush } from "@/lib/sigapPushUtil";

export const pushSiap = (): boolean => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const kunciPublikPush = (): string | null => process.env.VAPID_PUBLIC_KEY ?? null;

export type HasilKirim = {
  /** akun yang punya minimal satu perangkat aktif */
  akun_berlangganan: number[];
  perangkat: number;
  terkirim: number;
  gagal: number;
};

type Baris = { id: number; akun_id: number; endpoint: string; p256dh: string; auth: string; gagal: number };
const GAGAL_MAKS = 5;
const PARALEL = 10;

/** Kirim ke semua perangkat aktif milik `akunIds`. Langganan yang sudah dicabut browser (404/410) dinonaktifkan. */
export async function kirimKeAkun(db: Db, akunIds: number[], pesan: PesanPush & { tag?: string }): Promise<HasilKirim> {
  const kosong: HasilKirim = { akun_berlangganan: [], perangkat: 0, terkirim: 0, gagal: 0 };
  const ids = [...new Set(akunIds)].filter((x) => Number.isInteger(x) && x > 0);
  if (!ids.length || !pushSiap()) return kosong;
  const { data } = await db.from("sigap_push_langganan").select("id, akun_id, endpoint, p256dh, auth, gagal").in("akun_id", ids).eq("aktif", true).limit(5000);
  const baris = (data ?? []) as Baris[];
  if (!baris.length) return kosong;

  const vapid = {
    subject: process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "https://bps-solokkab.up.railway.app",
    publicKey: process.env.VAPID_PUBLIC_KEY as string,
    privateKey: process.env.VAPID_PRIVATE_KEY as string,
  };
  const muatan = JSON.stringify({ judul: pesan.judul, isi: pesan.isi, url: pesan.url, tag: pesan.tag ?? "sigap" });
  const ok: number[] = [];
  const mati: number[] = [];
  const gagalLain: Baris[] = [];

  let i = 0;
  async function pekerja() {
    while (i < baris.length) {
      const b = baris[i++];
      try {
        await webpush.sendNotification({ endpoint: b.endpoint, keys: { p256dh: b.p256dh, auth: b.auth } }, muatan, { TTL: 6 * 3600, urgency: "high", vapidDetails: vapid, timeout: 15_000 });
        ok.push(b.id);
      } catch (e) {
        const kode = (e as { statusCode?: number }).statusCode;
        if (kode === 404 || kode === 410) mati.push(b.id);
        else gagalLain.push(b);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALEL, baris.length) }, pekerja));

  const sekarang = new Date().toISOString();
  if (ok.length) await db.from("sigap_push_langganan").update({ gagal: 0, terakhir_ok_at: sekarang }).in("id", ok);
  if (mati.length) await db.from("sigap_push_langganan").update({ aktif: false, diperbarui_at: sekarang }).in("id", mati);
  for (const b of gagalLain) {
    const n = (b.gagal ?? 0) + 1;
    await db.from("sigap_push_langganan").update({ gagal: n, aktif: n < GAGAL_MAKS, diperbarui_at: sekarang }).eq("id", b.id);
  }
  return { akun_berlangganan: [...new Set(baris.map((b) => b.akun_id))], perangkat: baris.length, terkirim: ok.length, gagal: baris.length - ok.length };
}
