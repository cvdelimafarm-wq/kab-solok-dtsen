// lib/hierarkiSelaras.ts  (murni, tanpa basis data)
//
// (7 Nov 2026) Hierarki pelatihan disamakan dengan data Tim (alokasi Stage 1) kegiatan saudara dalam induk yang sama (mis. Seruti: Pelatihan = 7, Pendataan = 6).
// Sebelumnya dua tabel itu hidup terpisah: unggahan Stage 1 hanya mengisi sigap_tim, sedangkan layar Hierarki membaca sigap_pelatihan_hierarki yang diisi sekali
// (salin PSP / template / manual) lalu tidak pernah ikut berubah. Di sini: (1) pembanding atasan Hierarki vs Tim, (2) penyaring baris hierarki yang penugasannya sudah nonaktif.

import type { PeranPelatihan, SimpulHierarki } from "@/lib/hierarkiPelatihan";

export type BarisTim = { akun_id: number; atasan_akun_id: number | null };

export type SelisihTim = {
  akun_id: number;
  nama: string;
  peran: PeranPelatihan;
  atasan_sekarang: number | null;
  atasan_sekarang_nama: string | null;
  atasan_tim: number;
  atasan_tim_nama: string | null;
  /** true bila bisa diterapkan: atasan Tim adalah peserta pelatihan ini dan bukan diri sendiri. */
  bisa: boolean;
  /** Alasan tidak bisa diterapkan (bila bisa=false). */
  alasan: string | null;
  /** Atasan menurut Tim berperan PPL di pelatihan ini: layak diperiksa (atasan seharusnya PML/korwil). */
  atasan_ppl: boolean;
};

/**
 * Peserta yang atasannya di Hierarki berbeda dari Tim. Baris Tim TANPA atasan diabaikan (kosong = belum diisi, bukan perintah menghapus atasan).
 * Peserta yang tidak ada di Tim juga diabaikan (mis. peserta khusus pelatihan).
 */
export function selisihDenganTim(simpul: readonly SimpulHierarki[], tim: readonly BarisTim[]): SelisihTim[] {
  const peta = new Map(simpul.map((s) => [s.akun_id, s]));
  const hasil: SelisihTim[] = [];
  for (const t of tim) {
    const s = peta.get(t.akun_id);
    if (!s || t.atasan_akun_id === null) continue;
    if (s.atasan_akun_id === t.atasan_akun_id) continue;
    const atasanTim = peta.get(t.atasan_akun_id);
    const sekarang = s.atasan_akun_id === null ? null : peta.get(s.atasan_akun_id);
    let alasan: string | null = null;
    if (t.atasan_akun_id === s.akun_id) alasan = "Atasan menurut Tim adalah dirinya sendiri.";
    else if (!atasanTim) alasan = "Atasan menurut Tim bukan peserta pelatihan ini.";
    hasil.push({
      akun_id: s.akun_id,
      nama: s.nama,
      peran: s.peran,
      atasan_sekarang: s.atasan_akun_id,
      atasan_sekarang_nama: sekarang ? sekarang.nama : null,
      atasan_tim: t.atasan_akun_id,
      atasan_tim_nama: atasanTim ? atasanTim.nama : null,
      bisa: alasan === null,
      alasan,
      atasan_ppl: !!atasanTim && atasanTim.peran === "ppl",
    });
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, "id") || a.akun_id - b.akun_id);
}

/**
 * Baris hierarki yang hanya boleh dipakai bila penugasan aktif di kegiatan itu ada. Baris yatim (penugasan sudah dinonaktifkan: orang menolak, diganti) tidak lagi
 * tampil sebagai peserta dan tidak lagi menjadi atasan siapa pun. `aktif` null = daftar penugasan gagal dibaca: jangan menyaring apa pun.
 */
export function saringHierarkiAktif<T extends { akun_id: number }>(baris: readonly T[], aktif: ReadonlySet<number> | null): T[] {
  if (aktif === null) return [...baris];
  return baris.filter((b) => aktif.has(b.akun_id));
}
