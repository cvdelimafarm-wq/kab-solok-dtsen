// lib/revisit.ts  (murni; dipakai server DAN klien)
//
// (31 Okt 2026) REVISIT pendataan bencana -- permintaan user. Admin menandai sebuah Sub SLS "revisit" (Kelola Pendataan > Persiapan > kartu
// "Permintaan daftar KK ke FASIH" > tab Revisit). Selama ditandai, semua KK di Sub SLS itu mendapat satu pilihan hasil tambahan di kartu KK:
// "Tidak terdampak, revisit menjadi terdampak".
// Penyimpanan: hasil KK tetap 'terdampak' (tiga kategori hasil tidak berubah, jadi Monitoring tetap menghitungnya sebagai terdampak) + penanda
// revisit=true di KK dan di log. Penanda per Sub SLS ada di tabel bencana_pendataan_revisit (SQL 20261031c).

export const LABEL_REVISIT = "Tidak terdampak, revisit menjadi terdampak";
export const LABEL_REVISIT_PENDEK = "Revisit: menjadi terdampak";
export const KETERANGAN_REVISIT = "Sub SLS ini sedang direvisit";
export const MAKS_SUB_SEKALI_ATUR = 100;

const ID_SUBSLS = /^\d{16}$/;

export type IsiAturRevisit = { ids: string[]; aktif: boolean };

/** Validasi isi POST { aksi:"revisit", ids:[idsubsls], aktif }. */
export function periksaAturRevisit(b: unknown): { ok: true; isi: IsiAturRevisit } | { ok: false; pesan: string } {
  const x = (b ?? {}) as Record<string, unknown>;
  if (typeof x.aktif !== "boolean") return { ok: false, pesan: "Pilihan revisit tidak sah." };
  if (!Array.isArray(x.ids) || x.ids.length === 0) return { ok: false, pesan: "Pilih minimal satu Sub SLS." };
  if (x.ids.length > MAKS_SUB_SEKALI_ATUR) return { ok: false, pesan: `Maksimal ${MAKS_SUB_SEKALI_ATUR} Sub SLS sekali atur.` };
  const ids: string[] = [];
  for (const v of x.ids) {
    if (typeof v !== "string" || !ID_SUBSLS.test(v)) return { ok: false, pesan: "Ada Sub SLS yang tidak sah." };
    if (!ids.includes(v)) ids.push(v);
  }
  return { ok: true, isi: { ids, aktif: x.aktif } };
}

/** Pilihan revisit hanya berlaku untuk hasil 'terdampak'; selain itu diabaikan (bukan kesalahan: antrean offline tidak boleh macet). */
export const revisitBerlaku = (hasil: string, revisit: unknown): boolean => hasil === "terdampak" && revisit === true;

/** Tombol revisit tampil di kartu KK bila Sub SLS ditandai, bukan mode perbaikan laporan. */
export const tampilkanRevisit = (subDitandai: boolean | undefined, perbaikan: boolean): boolean => subDitandai === true && !perbaikan;

export type SubPermintaan = { idsubsls: string; status: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; pml_nama: string; ppl_nama: string };
export type BarisRevisit = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; pml_nama: string; ppl_nama: string; aktif: boolean };

/**
 * Daftar Sub SLS untuk tab Revisit: Sub SLS yang assignment-nya sudah keluar di FASIH (sudah ada pendataan), ditambah yang masih bertanda revisit
 * walau permintaannya berstatus lain (supaya tandanya selalu bisa dicabut). Satu baris per Sub SLS; yang bertanda di depan, lalu menurut wilayah.
 */
export function daftarSubRevisit(permintaan: readonly SubPermintaan[], aktif: ReadonlySet<string>): BarisRevisit[] {
  const per = new Map<string, SubPermintaan>();
  for (const p of permintaan) {
    if (p.status === "dibatalkan") continue;
    const ada = per.get(p.idsubsls);
    if (!ada || (ada.status !== "sudah_keluar" && p.status === "sudah_keluar")) per.set(p.idsubsls, p);
  }
  const baris: BarisRevisit[] = [];
  for (const p of per.values()) {
    const bertanda = aktif.has(p.idsubsls);
    if (p.status !== "sudah_keluar" && !bertanda) continue;
    baris.push({ idsubsls: p.idsubsls, kecamatan: p.kecamatan, nagari: p.nagari, sls: p.sls, sub_sls: p.sub_sls, pml_nama: p.pml_nama, ppl_nama: p.ppl_nama, aktif: bertanda });
  }
  return baris.sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.sls.localeCompare(b.sls) || a.sub_sls.localeCompare(b.sub_sls));
}
