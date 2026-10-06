// lib/sigapLog.ts
//
// (6 Okt 2026) Log login & aktivitas SIGAP -- permintaan user: admin bisa melihat kapan terakhir login dan
// berapa lama (durasi) tiap pengguna memakai SIGAP.
//  - Satu "sesi" = rentang mulai_at s.d. terakhir_aktif_at. Masuk (nama + PIN) selalu membuka sesi baru.
//  - Halaman SIGAP mengirim "detak" tiap ±1 menit selama tab terlihat; detak memperpanjang sesi terakhir
//    bila jeda < 30 menit, kalau lebih lama dianggap sesi baru (mis. membuka lagi dari HP yg masih tersimpan).
//  - Durasi = terakhir_aktif_at - mulai_at (perkiraan waktu aktif, bukan waktu persis).

import type { Db } from "@/lib/sigap";

export const JEDA_SESI_MENIT = 30;

/** Ringkas user-agent jadi "Android · Chrome" dsb. (tanpa data pribadi lain). */
export function ringkasPerangkat(ua: string | null): string {
  const u = ua ?? "";
  const os = /android/i.test(u) ? "Android" : /iphone|ipad|ios/i.test(u) ? "iOS" : /windows/i.test(u) ? "Windows" : /mac os/i.test(u) ? "macOS" : /linux/i.test(u) ? "Linux" : "Lainnya";
  const br = /edg\//i.test(u) ? "Edge" : /opr\//i.test(u) ? "Opera" : /samsungbrowser/i.test(u) ? "Samsung Internet" : /chrome\//i.test(u) ? "Chrome" : /firefox\//i.test(u) ? "Firefox" : /safari\//i.test(u) ? "Safari" : "Peramban lain";
  return `${os} · ${br}`;
}

export async function catatAktivitas(db: Db, akunId: number, opsi: { halaman?: string | null; perangkat?: string | null; sesiBaru?: boolean; cara?: string }) {
  const sekarang = new Date();
  if (!opsi.sesiBaru) {
    const { data: akhir } = await db
      .from("sigap_log_sesi")
      .select("id, terakhir_aktif_at")
      .eq("akun_id", akunId)
      .order("terakhir_aktif_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (akhir) {
      const jeda = sekarang.getTime() - new Date(akhir.terakhir_aktif_at as string).getTime();
      if (jeda < 45_000) return; // terlalu rapat, abaikan
      if (jeda < JEDA_SESI_MENIT * 60_000) {
        await db.from("sigap_log_sesi").update({ terakhir_aktif_at: sekarang.toISOString(), halaman: opsi.halaman ?? null }).eq("id", akhir.id);
        return;
      }
    }
  }
  await db.from("sigap_log_sesi").insert({
    akun_id: akunId,
    mulai_at: sekarang.toISOString(),
    terakhir_aktif_at: sekarang.toISOString(),
    halaman: opsi.halaman ?? null,
    perangkat: opsi.perangkat ?? null,
    cara: opsi.cara ?? (opsi.sesiBaru ? "masuk" : "lanjut"),
  });
}
