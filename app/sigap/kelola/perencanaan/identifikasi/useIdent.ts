"use client";

// app/sigap/kelola/perencanaan/identifikasi/useIdent.ts
//
// (25 Okt 2026) Pengambil data Identifikasi survei: semua baca lewat GET /api/sigap/keu/baca (daftar putih lib/keu/tampilan.ts),
// semua tulis lewat fungsi keu_ident_* di gerbang POST /api/sigap/keu/panggil (aksiKeu). Hak ditegakkan basis data.

import { useCallback, useEffect, useMemo, useState } from "react";
import { urlBaca } from "@/lib/keu/ro";
import { HAK_KOSONG, type BarisIdent, type BarisPaket, type BarisPok, type HakIdent, type RiwayatIdent } from "@/lib/keu/identifikasiHilir";
import { aksiKeu, useBacaKeu } from "@/app/sigap/ro/useKeu";

/** Kolom daftar (tanpa isian formulir lengkap); form_sah dan upd dipakai untuk lencana H-15. */
export type BarisDaftar = Pick<BarisIdent, "id" | "tahun" | "ro_kode" | "nama" | "status" | "ver" | "rev" | "langkah" | "menunggu" | "form_sah" | "upd" | "diubah_at" | "ok_ppk" | "ok_tu" | "pasca_h15">;
const KOLOM_DAFTAR = ["id", "tahun", "ro_kode", "nama", "status", "ver", "rev", "langkah", "menunggu", "form_sah", "upd", "diubah_at", "ok_ppk", "ok_tu", "pasca_h15"];

export function useDaftarIdent() {
  return useBacaKeu<BarisDaftar>(urlBaca("keu_v_ident", {}, { urut: "ro_kode", batas: 500, kolom: KOLOM_DAFTAR }));
}

/** Versi Gap terbaru per identifikasi (untuk lencana temuan keras pada daftar). Kegagalan membaca tidak mengganggu daftar. */
export type GapTerbaru = { ident_id: number; ver: number; jenis: "berjalan" | "akhir"; n_keras: number; n_sedang: number; n_info: number; dibuat_at: string };
export function useGapTerbaru() {
  return useBacaKeu<GapTerbaru>(urlBaca("keu_v_gap_terbaru", {}, { batas: 1000 }));
}

export type RoRingkas = { kode: string; nama: string; aktif: boolean; sementara: boolean };
export function useDaftarRo() {
  return useBacaKeu<RoRingkas>(urlBaca("keu_ro", {}, { urut: "kode", batas: 2000, kolom: ["kode", "nama", "aktif", "sementara"] }));
}

/** Satu survei lengkap: baris, riwayat, dan hak akun pada RO-nya. */
export function useIdent(id: number | null) {
  const baris = useBacaKeu<BarisIdent>(id ? urlBaca("keu_v_ident", { id }, { batas: 1 }) : null);
  const riwayat = useBacaKeu<RiwayatIdent>(id ? urlBaca("keu_v_ident_riwayat", { ident_id: id }, { urut: "-id", batas: 100 }) : null);
  const row = baris.baris?.[0] ?? null;
  const ro = row?.ro_kode ?? null;
  const [hak, setHak] = useState<HakIdent>(HAK_KOSONG);
  const [hakSiap, setHakSiap] = useState(false);
  useEffect(() => {
    let hidup = true;
    if (!ro) return;
    void aksiKeu<HakIdent>("keu_ident_hak", { p_ro: ro }).then((r) => {
      if (!hidup) return;
      setHak(r.ok ? { ...HAK_KOSONG, ...r.data } : HAK_KOSONG);
      setHakSiap(true);
    });
    return () => { hidup = false; };
  }, [ro]);
  const muatSemua = useCallback(async () => {
    await Promise.all([baris.muat(), riwayat.muat()]);
  }, [baris, riwayat]);
  return { row, riwayat: riwayat.baris ?? [], hak, hakSiap, memuat: baris.memuat, galat: baris.galat ?? riwayat.galat, muatSemua };
}

type BarisLembarRingkas = { kunci_stabil: string; akun_kode: string; uraian: string; jumlah: number | string };

/** Baris POK berlaku suatu RO beserta paket belanja yang sudah dipetakan (keu_ident_paket). */
export function usePokRo(ro: string | null) {
  const lembar = useBacaKeu<BarisLembarRingkas>(ro ? urlBaca("keu_v_adm_lembar", { ro_kode: ro }, { batas: 5000, kolom: ["kunci_stabil", "akun_kode", "uraian", "jumlah"] }) : null);
  const paket = useBacaKeu<BarisPaket>(ro ? urlBaca("keu_v_ident_paket", { ro_kode: ro }, { batas: 5000 }) : null);
  const baris = useMemo<(BarisPok & { jumlah: number })[] | null>(() => {
    if (!lembar.baris || !paket.baris) return null;
    const peta = new Map(paket.baris.map((p) => [p.kunci_stabil, p.paket ?? []]));
    return lembar.baris.map((r) => ({ kunci: r.kunci_stabil, akun: r.akun_kode, uraian: r.uraian, paket: peta.get(r.kunci_stabil) ?? [], jumlah: Number(r.jumlah) || 0 }));
  }, [lembar.baris, paket.baris]);
  const muat = useCallback(async () => { await Promise.all([lembar.muat(), paket.muat()]); }, [lembar, paket]);
  return { baris, memuat: ro !== null && !baris && !lembar.galat && !paket.galat, galat: lembar.galat ?? paket.galat, muat };
}

/** Hari ini menurut WIB sebagai "YYYY-MM-DD". */
export function hariIniWib(): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
