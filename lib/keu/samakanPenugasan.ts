// lib/keu/samakanPenugasan.ts  (murni, tanpa basis data)
//
// (7 Nov 2026) "Samakan dengan lanjutan": usulan penugasan (keu_usulan_penugasan, lihat lib/keu/pelaksanaan.ts) hanya MENAMBAH petugas baru. Perubahan peran,
// nama yang dicoret, atau nama yang ditugaskan kembali di identifikasi lanjutan tidak pernah sampai ke penugasan SIGAP. Fungsi ini membandingkan daftar petugas
// lanjutan (yang sudah dicocokkan ke akun) dengan penugasan kegiatan sekarang dan menyusun tiga jenis tindakan:
//   ubah_peran : penugasan aktif, perannya berbeda dari lanjutan
//   aktifkan   : penugasan sudah ada tetapi nonaktif, lanjutan menyebut nama itu
//   cabut      : penugasan aktif, tetapi namanya tidak ada di lanjutan (dinonaktifkan, bukan dihapus)
// Penugasan bersumber "administrasi" (panitia) tidak disentuh. Surat tugas yang sudah terbit dan memuat peran lama hanya DILAPORKAN (perlu terbit ulang).

export type ButirLanjutan = { kode: string; nama: string; peran_sigap: string | null; akun_id: number | null; status: string };
export type BarisPenugasanKegiatan = { id: number; akun_id: number; nama: string; peran: string; aktif: boolean; sumber: string | null };
export type BarisSuratTugas = { penugasan_id: number; nomor_st: string | null; peran_tertera: string | null };

export type AksiSamakan = "ubah_peran" | "aktifkan" | "cabut";

export type SelisihPenugasan = {
  penugasan_id: number;
  akun_id: number;
  nama: string;
  aksi: AksiSamakan;
  /** Keadaan sekarang. */
  dari: { peran: string; aktif: boolean };
  /** Keadaan menurut lanjutan (peran null untuk cabut). */
  ke: { peran: string | null; aktif: boolean };
  /** true bila bisa diterapkan; false bila peran tujuan belum punya tarif pada kegiatan itu. */
  bisa: boolean;
  catatan: string | null;
  /** Surat tugas yang sudah ada untuk penugasan ini dan memuat peran lain dari tujuan (perlu diterbitkan ulang). */
  surat: { nomor_st: string | null; peran_tertera: string | null }[];
};

export type HasilSelisih = { selisih: SelisihPenugasan[]; peringatan: string[] };

const BUTIR_BERAKUN = new Set(["siap", "sudah_ada", "tarif_belum"]);
const URUT_AKSI: Record<AksiSamakan, number> = { ubah_peran: 0, aktifkan: 1, cabut: 2 };

export const LABEL_AKSI: Record<AksiSamakan, string> = { ubah_peran: "Ubah peran", aktifkan: "Aktifkan kembali", cabut: "Nonaktifkan" };

/**
 * @param tarifPeran peran yang punya tarif pada kegiatan itu (sigap_kegiatan_tarif); null = tidak diketahui (tarif tidak diperiksa).
 */
export function selisihPenugasan(butir: readonly ButirLanjutan[], penugasan: readonly BarisPenugasanKegiatan[], surat: readonly BarisSuratTugas[], tarifPeran: ReadonlySet<string> | null): HasilSelisih {
  const peringatan: string[] = [];
  const perAkun = new Map<number, string>();
  for (const b of butir) {
    if (b.akun_id === null || !BUTIR_BERAKUN.has(b.status) || !b.peran_sigap) continue;
    if (!perAkun.has(b.akun_id)) perAkun.set(b.akun_id, b.peran_sigap);
  }
  const belumTertaut = butir.filter((b) => b.akun_id === null && (b.status === "tidak_ada" || b.status === "ambigu"));
  if (belumTertaut.length > 0) peringatan.push(`${belumTertaut.length} nama pada lanjutan belum tertaut ke akun (${belumTertaut.slice(0, 3).map((b) => b.nama || b.kode).join(", ")}${belumTertaut.length > 3 ? ", …" : ""}). Periksa dulu sebelum menonaktifkan siapa pun: orang itu bisa jadi sebenarnya ada di lanjutan.`);

  const suratPer = new Map<number, BarisSuratTugas[]>();
  for (const s of surat) suratPer.set(s.penugasan_id, [...(suratPer.get(s.penugasan_id) ?? []), s]);
  const suratBeda = (id: number, tujuan: string | null) =>
    (suratPer.get(id) ?? []).filter((s) => tujuan === null || (s.peran_tertera ?? "") !== tujuan).map((s) => ({ nomor_st: s.nomor_st, peran_tertera: s.peran_tertera }));

  const hasil: SelisihPenugasan[] = [];
  for (const p of penugasan) {
    if (p.sumber === "administrasi") continue;
    const tujuan = perAkun.get(p.akun_id) ?? null;
    let aksi: AksiSamakan | null = null;
    if (tujuan !== null) {
      if (!p.aktif) aksi = "aktifkan";
      else if (p.peran !== tujuan) aksi = "ubah_peran";
    } else if (p.aktif) {
      aksi = "cabut";
    }
    if (!aksi) continue;
    const perluTarif = aksi !== "cabut" && tarifPeran !== null && tujuan !== null && !tarifPeran.has(tujuan);
    hasil.push({
      penugasan_id: p.id,
      akun_id: p.akun_id,
      nama: p.nama,
      aksi,
      dari: { peran: p.peran, aktif: p.aktif },
      ke: aksi === "cabut" ? { peran: null, aktif: false } : { peran: tujuan, aktif: true },
      bisa: !perluTarif,
      catatan: perluTarif ? `Peran ${tujuan} belum punya tarif pada kegiatan ini (isi di Kegiatan dan Tarif).` : null,
      surat: suratBeda(p.id, aksi === "cabut" ? null : tujuan),
    });
  }
  hasil.sort((a, b) => URUT_AKSI[a.aksi] - URUT_AKSI[b.aksi] || a.nama.localeCompare(b.nama, "id") || a.akun_id - b.akun_id);
  return { selisih: hasil, peringatan };
}

/** Kalimat ringkas satu tindakan untuk daftar. */
export function kalimatSelisih(s: SelisihPenugasan): string {
  if (s.aksi === "ubah_peran") return `peran ${s.dari.peran} → ${s.ke.peran}`;
  if (s.aksi === "aktifkan") return `nonaktif → aktif sebagai ${s.ke.peran}${s.dari.peran !== s.ke.peran ? ` (tadinya ${s.dari.peran})` : ""}`;
  return `aktif sebagai ${s.dari.peran} → dinonaktifkan (tidak ada di lanjutan)`;
}
