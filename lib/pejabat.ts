// lib/pejabat.ts
//
// (14 Nov 2026) SATU SUMBER nama pejabat yang dicetak di dokumen (putusan Ketua Tim): Kepala (KPA), PPK, Bendahara Pengeluaran,
// Pejabat Pengadaan. Datanya di tabel keu_pejabat (SQL 20261114s), berlaku per tanggal, diatur di SIGAP Master data > Pejabat penandatangan (/sigap/master?bagian=pejabat).
// Berkas ini MURNI (tanpa impor server) agar bisa dipakai di server, browser, dan tes. Pengambilan dari basis data: lib/pejabatServer.ts.

export type KodeJabatan = "KPA" | "PPK" | "BEND" | "PP";

export const NAMA_JABATAN: Record<KodeJabatan, string> = {
  KPA: "Kepala (KPA)",
  PPK: "Pejabat Pembuat Komitmen (PPK)",
  BEND: "Bendahara Pengeluaran",
  PP: "Pejabat Pengadaan",
};
export const URUTAN_JABATAN: readonly KodeJabatan[] = ["KPA", "PPK", "BEND", "PP"];

/** Satu pejabat seperti dicetak: nama (dengan gelar), NIP 18 angka tanpa spasi, jabatan, dan SK. */
export type Pejabat = { nama: string; nip: string; jabatan: string; skNomor: string; skTanggal: string | null; akunId: number | null };

/** Pejabat yang berlaku pada satu tanggal. Jabatan yang belum diatur tidak ada (undefined). */
export type PejabatPada = Partial<Record<KodeJabatan, Pejabat>>;

/** Pejabat yang dicetak di kwitansi dan visum (Kepala, PPK, Bendahara). */
export type PejabatSpj = { kepalaBps: Pejabat; ppk: Pejabat; bendaharaPengeluaran: Pejabat };

export class GalatPejabat extends Error {}

const teks = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/** Hasil fungsi basis data keu_pejabat_pada (objek per kode jabatan) menjadi PejabatPada. Isi yang tidak dikenal diabaikan. */
export function dariJsonPejabat(j: unknown): PejabatPada {
  const hasil: PejabatPada = {};
  if (!j || typeof j !== "object") return hasil;
  for (const kode of URUTAN_JABATAN) {
    const r = (j as Record<string, unknown>)[kode];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const nama = teks(o.nama).trim();
    if (!nama) continue;
    const akun = Number(o.akun_id);
    hasil[kode] = {
      nama,
      nip: teks(o.nip).replace(/\D/g, ""),
      jabatan: teks(o.jabatan).trim(),
      skNomor: teks(o.sk_nomor).trim(),
      skTanggal: teks(o.sk_tanggal) || null,
      akunId: Number.isSafeInteger(akun) && akun > 0 ? akun : null,
    };
  }
  return hasil;
}

/** Tanggal ISO (YYYY-MM-DD) dalam format "1 Januari 2026"; teks kosong bila bukan tanggal. */
export function tanggalIndo(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][Number(m[2]) - 1];
  return bulan ? `${Number(m[3])} ${bulan} ${m[1]}` : "";
}

/** NIP 18 angka menjadi bentuk berspasi "19801113 200604 1 003"; selain 18 angka dikembalikan apa adanya. */
export function nipBerspasi(nip: string): string {
  const d = nip.replace(/\D/g, "");
  return d.length === 18 ? `${d.slice(0, 8)} ${d.slice(8, 14)} ${d.slice(14, 15)} ${d.slice(15)}` : nip;
}

/** Pesan bila jabatan yang diperlukan dokumen belum diatur pada tanggalnya. */
export function pesanPejabatKurang(kurang: KodeJabatan[], tanggal: string): string {
  const daftar = kurang.map((k) => NAMA_JABATAN[k]).join(", ");
  return `Pejabat ${daftar} belum diatur untuk tanggal ${tanggalIndo(tanggal) || tanggal}. Atur di SIGAP Master data > Pejabat penandatangan.`;
}

/** Pejabat untuk kwitansi dan visum. Melempar GalatPejabat bila Kepala, PPK, atau Bendahara belum diatur pada tanggal itu. */
export function pejabatSpj(p: PejabatPada, tanggal: string): PejabatSpj {
  const kurang = (["KPA", "PPK", "BEND"] as const).filter((k) => !p[k]);
  if (kurang.length) throw new GalatPejabat(pesanPejabatKurang([...kurang], tanggal));
  return { kepalaBps: p.KPA!, ppk: p.PPK!, bendaharaPengeluaran: p.BEND! };
}

/** Kunci master kontrak yang diisi dari data pejabat (tidak diubah di halaman master kontrak). */
export const KUNCI_KONTRAK_PEJABAT = ["Nama_PPK", "NIP_PPK", "No_SK_PPK", "Tgl_SK_PPK", "Nama_Pejabat_Pengadaan", "NIP_Pejabat", "No_SK_PP", "Tgl_SK_PP"] as const;

/**
 * Master kontrak per tahun ditimpa data pejabat: nama, NIP (berspasi, seperti di kontrak), nomor dan tanggal SK untuk PPK dan
 * Pejabat Pengadaan. Bila pejabatnya belum diatur pada tanggal acuan (mis. tahun 2025), nilai master lama dibiarkan.
 */
export function timpaMasterKontrak(master: Record<string, string>, p: PejabatPada): Record<string, string> {
  const m = { ...master };
  if (p.PPK) {
    m.Nama_PPK = p.PPK.nama;
    m.NIP_PPK = nipBerspasi(p.PPK.nip);
    m.No_SK_PPK = p.PPK.skNomor;
    m.Tgl_SK_PPK = tanggalIndo(p.PPK.skTanggal);
  }
  if (p.PP) {
    m.Nama_Pejabat_Pengadaan = p.PP.nama;
    m.NIP_Pejabat = nipBerspasi(p.PP.nip);
    m.No_SK_PP = p.PP.skNomor;
    m.Tgl_SK_PP = tanggalIndo(p.PP.skTanggal);
  }
  return m;
}

/** Tanggal acuan pejabat untuk satu tahun anggaran: hari ini bila tahun berjalan, selain itu 31 Desember tahun itu. */
export function tanggalAcuanTahun(tahun: number, hariIni: string): string {
  return hariIni.startsWith(`${tahun}-`) ? hariIni : `${tahun}-12-31`;
}

/** Tanggal ISO yang sah, atau cadangan bila kosong/tidak sah. */
export function tanggalAtau(iso: string | null | undefined, cadangan: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso ?? "");
  return m ? m[1] : cadangan;
}

/** Hari ini menurut WIB (YYYY-MM-DD). */
export function hariIniWib(ms: number = Date.now()): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Pemeriksaan isian formulir pejabat di halaman master. Mengembalikan daftar pesan (kosong = sah). */
export function periksaIsianPejabat(x: { nama: string; nip: string; jabatan: string; mulai?: string }): string[] {
  const g: string[] = [];
  if (x.nama.trim().length < 3) g.push("Nama pejabat wajib diisi (gelar boleh ditulis).");
  const nip = x.nip.replace(/\D/g, "");
  if (nip !== "" && nip.length !== 18) g.push("NIP harus 18 angka.");
  if (x.jabatan.trim().length < 3) g.push("Jabatan wajib diisi.");
  if (x.mulai !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(x.mulai)) g.push("Tanggal mulai berlaku wajib diisi.");
  return g;
}
