// lib/sigapIndukRelevan.ts
//
// (7 Nov 2026) Siapa yang melihat satu kegiatan induk di Beranda. Logika murni (tanpa DB) supaya teruji; dipakai lib/portal/induk.ts.
//
// Temuan 7 Nov: kartu "Pelatihan Seruti TW IV" dan "Pendataan Seruti TW IV" muncul di Beranda SEMUA akun yang punya petugas_bencana_id
// (450 akun yang tidak ditugaskan di Seruti ikut melihatnya), padahal petugas Seruti hanya 23 nama pada identifikasi lanjutan. Penyebab: syarat
// `!!akun.petugas_bencana_id` (milik induk Pascabencana) berlaku untuk SETIAP induk non-SPDT. Aturan sekarang:
//  - induk yang punya modul khas pendataan bencana (konfirmasi, wilayah_tim, identifikasi, pendataan, monitoring_korwil): tetap terbuka bagi
//    petugas bencana, atau yang punya penugasan, atau pengelola pelatihannya;
//  - induk SPDT NTP: penugasan atau supervisor;
//  - induk lain (mis. Seruti): HANYA yang punya penugasan aktif pada kegiatan induk itu, atau pengelola (panitia/instruktur) pelatihannya.

export const MODUL_KHAS_BENCANA = ["konfirmasi", "wilayah_tim", "identifikasi", "pendataan", "monitoring_korwil"] as const;

export type SyaratRelevan = {
  /** modul-modul (isi) seluruh tahap induk ini */
  isiModul: string[];
  /** akun punya petugas_bencana_id */
  petugasBencana: boolean;
  /** jumlah penugasan akun pada kegiatan induk ini */
  jumlahPenugasan: number;
  /** panitia/instruktur pelatihan induk ini */
  pengelola: boolean;
  /** akun supervisor SPDT NTP */
  supervisorSpdt: boolean;
};

export function indukRelevan(s: SyaratRelevan): boolean {
  const adaModul = (m: string) => s.isiModul.includes(m);
  const ditugaskan = s.jumlahPenugasan > 0;
  if (adaModul("spdt_lembar")) return ditugaskan || s.supervisorSpdt;
  if (MODUL_KHAS_BENCANA.some(adaModul)) return s.petugasBencana || ditugaskan || s.pengelola;
  return ditugaskan || s.pengelola;
}
