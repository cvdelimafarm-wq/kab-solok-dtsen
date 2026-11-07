// lib/sigapIndukRelevan.ts
//
// (7 Nov 2026) Siapa yang melihat satu kegiatan induk di Beranda. Logika murni (tanpa DB) supaya teruji; dipakai lib/portal/induk.ts.
//
// Aturan baku (putusan Iqbal 7 Nov): petugas sebuah kegiatan = akun yang DITUGASKAN di kegiatan itu (sigap_penugasan aktif) atau pengelola
// pelatihannya (panitia/instruktur); SPDT NTP juga supervisornya. Master mitra / roster TIDAK menentukan: `sigap_akun.petugas_bencana_id` hanya
// menandai bahwa akun tertaut ke roster lama `bencana_petugas` (475 baris = seluruh mitra hasil impor, 454 aktif), bukan bahwa orang itu petugas bencana.
//
// Riwayat bug: syarat `!!akun.petugas_bencana_id` membuat kartu Seruti TW IV tampil di 450 akun yang tidak ditugaskan di Seruti, dan kartu
// Pascabencana tampil di 374 akun tanpa penugasan bencana/pelatihan PSP (dari 96 yang benar-benar ditugaskan).

export type SyaratRelevan = {
  /** jumlah penugasan aktif akun pada kegiatan induk ini (kegiatan_ids) */
  jumlahPenugasan: number;
  /** panitia/instruktur pelatihan induk ini */
  pengelola: boolean;
  /** akun supervisor SPDT NTP (hanya berarti untuk induk bermodul spdt_lembar) */
  supervisorSpdt: boolean;
  /** modul-modul (isi) seluruh tahap induk ini */
  isiModul: string[];
};

export function indukRelevan(s: SyaratRelevan): boolean {
  if (s.jumlahPenugasan > 0 || s.pengelola) return true;
  return s.isiModul.includes("spdt_lembar") && s.supervisorSpdt;
}
