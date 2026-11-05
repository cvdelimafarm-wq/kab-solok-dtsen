"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/useLanjutan.ts
//
// (25 Okt 2026, tahap 29) Pengambil data Identifikasi lanjutan: baca lewat GET /api/sigap/keu/baca (daftar putih lib/keu/tampilan.ts),
// tulis lewat fungsi keu_lanjutan_simpan dan keu_ident_dokumen_simpan di gerbang POST /api/sigap/keu/panggil. Hak ditegakkan basis data.

import { useCallback, useMemo } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { calonMitra, calonOrganik } from "@/lib/keu/pilihNama";
import type { IsiKebijakan } from "@/lib/keu/kebijakan";
import type { StatusLanjutan } from "@/lib/keu/lanjutan";
import type { BarisPengecualian } from "@/lib/keu/notifikasi";

export type BarisLanjutan = {
  id: number; ident_id: number; tahun: number; ro_kode: string; ver: number; ident_ver: number; ident_ver_sekarang: number;
  kebijakan_id: number | null; kebijakan_ver: number | null; isi: unknown; status: StatusLanjutan; pasca_h15: boolean;
  dibuat_oleh: number | null; diubah_oleh: number | null; diubah_oleh_nama: string | null; dibuat_at: string; diubah_at: string;
  /** (5 Nov 2026, SQL 20261105a) Penanda versi yang DIPAKAI modul hilir; kosong = hilir mengikuti versi terbaru. Tidak ada bila SQL belum dijalankan. */
  ver_hilir?: number | null; status_hilir?: StatusLanjutan | null; isi_hilir?: unknown;
};
export type VersiLanjutan = { id: number; ident_id: number; ver: number; status: StatusLanjutan; ident_ver: number; kebijakan_id: number | null; pasca_h15: boolean; alasan: string; oleh_nama: string | null; waktu: string };
export type BarisDokumen = {
  id: number; ident_id: number; jenis: "undangan" | "pengantar" | "tugas"; kunci: string; nomor: string; tanggal: string | null; ttd_akun: number | null; ttd_nama: string;
  ttd_jabatan: string; status: "konsep" | "terbit"; lanjutan_ver: number | null; catatan: string; dibuat_at: string; diubah_at: string; terbit_at: string | null;
};
export type CalonTtd = { akun_id: number; akun_nama: string; peran_kode: string; ro_kode: string | null };
type LembarBerlaku = { lembar_id: number; tahun: number; ver: number; isi: IsiKebijakan; berlaku_at: string | null };

/** Satu identifikasi lanjutan: isi terakhir, versi, dokumen, calon penandatangan, dan lembar kebijakan yang berlaku pada tahunnya. */
export function useLanjutan(identId: number | null, tahun: number | null, ro: string | null) {
  const baris = useBacaKeu<BarisLanjutan>(identId ? urlBaca("keu_v_ident_lanjutan", { ident_id: identId }, { batas: 1 }) : null);
  const versi = useBacaKeu<VersiLanjutan>(identId ? urlBaca("keu_v_ident_lanjutan_versi", { ident_id: identId }, { urut: "-ver", batas: 100, kolom: ["id", "ident_id", "ver", "status", "ident_ver", "kebijakan_id", "pasca_h15", "alasan", "oleh_nama", "waktu"] }) : null);
  const dok = useBacaKeu<BarisDokumen>(identId ? urlBaca("keu_v_ident_dokumen", { ident_id: identId }, { batas: 2000 }) : null);
  const pengecualian = useBacaKeu<BarisPengecualian>(identId ? urlBaca("keu_v_pengecualian", { ident_id: identId }, { urut: "-id", batas: 200 }) : null);
  const ttd = useBacaKeu<CalonTtd>(urlBaca("keu_v_ident_ttd", {}, { urut: "akun_nama", batas: 500 }));
  // (2 Nov 2026) pegawai organik aktif untuk dropdown nama instruktur; gagal memuat (mis. SQL 20261102a belum dijalankan) = nama diketik bebas
  const org = useBacaKeu<{ akun_id: number; nama: string }>(urlBaca("keu_v_pegawai_organik", {}, { urut: "nama", batas: 500 }));
  const organik = useMemo(() => (org.baris ? calonOrganik(org.baris) : null), [org.baris]);
  // mitra aktif (±760) untuk pemilih nama petugas berstatus Mitra; keterangan = kecamatan (membedakan nama kembar)
  const mit = useBacaKeu<{ akun_id: number; nama: string; kecamatan: string | null }>(urlBaca("keu_v_mitra_aktif", {}, { urut: "nama", batas: 3000 }));
  const mitra = useMemo(() => (mit.baris ? calonMitra(mit.baris) : null), [mit.baris]);
  const lembar = useBacaKeu<LembarBerlaku>(tahun ? urlBaca("keu_v_kebijakan_berlaku", { tahun }, { batas: 1 }) : null);
  const muatSemua = useCallback(async () => { await Promise.all([baris.muat(), versi.muat(), dok.muat(), pengecualian.muat()]); }, [baris, versi, dok, pengecualian]);
  const calon = useMemo(() => (ttd.baris ?? []).filter((t) => t.ro_kode === null || t.ro_kode === ro), [ttd.baris, ro]);
  const row = baris.baris?.[0] ?? null;
  // Baris menurut modul hilir: bila ada penanda, versi/status/isi diganti salinan penanda; selain itu sama dengan baris terbaru.
  const pinAda = !!(row && row.ver_hilir != null && row.isi_hilir != null);
  const rowHilir = useMemo<BarisLanjutan | null>(
    () => (row && row.ver_hilir != null && row.isi_hilir != null ? { ...row, ver: row.ver_hilir, status: row.status_hilir ?? row.status, isi: row.isi_hilir } : row),
    [row],
  );
  return {
    row,
    rowHilir,
    pinAda,
    versi: versi.baris ?? [],
    dokumen: dok.baris ?? [],
    pengecualian: pengecualian.baris ?? [],
    calon,
    organik,
    mitra,
    daftarNamaGalat: !!(org.galat || mit.galat),
    lembar: lembar.baris?.[0] ?? null,
    lembarSiap: !tahun || lembar.baris !== null || lembar.galat !== null,
    memuat: identId !== null && !baris.baris && !baris.galat,
    galat: baris.galat ?? versi.galat ?? dok.galat,
    muatSemua,
  };
}
