"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/keluaran/useKeluaran.ts
//
// (28 Okt 2026) Bahan halaman keluaran satu identifikasi: RAB RO, status RAB per survei, hari libur, nama akun, paket tersimpan (keu_v_keluaran), tanda terima, dan
// spesifikasi pengadaan. Pratinjau dibentuk dari RAB yang sedang berlaku (lib/keu/keluaran.ts); mengajukan = membekukannya sebagai versi baru (keu_keluaran_ajukan).

import { useCallback, useMemo } from "react";
import { useBacaKeu, useKirim, useRabRo } from "@/app/sigap/ro/useKeu";
import { bangunLibur } from "@/lib/keu/hariKerja";
import type { IsiKebijakan } from "@/lib/keu/kebijakan";
import type { BarisDok } from "@/lib/keu/dokumenLanjutan";
import type { BarisRincian, IsiLanjutan } from "@/lib/keu/lanjutan";
import {
  bacaIsiKeluaran, barisKeluaran, hambatanAjukan, petaKunci, petaTanda, samaIsi, susunBayar, susunButir, susunDana, susunKeluaran,
  type BagianKeluaran, type BarisTanda, type IsiKeluaran, type Spek,
} from "@/lib/keu/keluaran";
import type { ItemPengadaan } from "@/lib/keu/pengadaan";
import type { PeriodeJadwal } from "@/lib/keu/rabSurvei";
import { urlBaca } from "@/lib/keu/ro";
import { jendelaCair } from "@/lib/keu/usulanRab";

export type RingkasPaket = {
  id: number; rab_id: number; ident_id: number; ver: number; ident_ver: number; total: number | string; n_rincian: number; catatan: string; dibuat_at: string;
  dibuat_oleh_nama: string | null; rab_nomor: number | string | null; rab_status: string;
};
type BarisStatus = { ident_id: number; status: "draf" | "siap" };
type BarisSpek = { ident_id: number; butir: string; jenis: string; spek: unknown };

export type BahanKeluaran = {
  ident: { id: number; ro_kode: string; nama: string; tahun: number; ver: number };
  isi: IsiLanjutan; rincian: BarisRincian[]; periode: PeriodeJadwal[]; butirDasar: ItemPengadaan[]; lembar: IsiKebijakan | null;
  /** Jenis periode identifikasi (mis. Triwulanan), untuk dokumen cetak. */
  jenisPeriode: string;
};

const KOLOM_RINGKAS = ["id", "rab_id", "ident_id", "ver", "ident_ver", "total", "n_rincian", "catatan", "dibuat_at", "dibuat_oleh_nama", "rab_nomor", "rab_status"];

/** `pilih`: id paket yang dibuka, "pratinjau" untuk RAB sekarang, null = paket terbaru bila ada (bila tidak, pratinjau). */
export function useKeluaran(b: BahanKeluaran, pilih: number | "pratinjau" | null) {
  const { ident } = b;
  const rabRo = useRabRo(ident.ro_kode);
  const rabId = rabRo.rab?.rab_id ?? null;
  const status = useBacaKeu<BarisStatus>(rabId ? urlBaca("keu_rab_survei", { rab_id: rabId, ident_id: ident.id }, { batas: 1, kolom: ["ident_id", "status"] }) : null);
  const hariLibur = useBacaKeu<{ tanggal: string; aktif: boolean }>(urlBaca("keu_v_libur", {}, { urut: "tanggal", batas: 2000 }));
  const akun = useBacaKeu<{ kode: string; nama: string; pola_kode: string }>(urlBaca("keu_master_akun", {}, { batas: 3000, kolom: ["kode", "nama", "pola_kode"] }));
  const dokR = useBacaKeu<BarisDok>(urlBaca("keu_master_dok", {}, { urut: "kode", batas: 3000, kolom: ["sumber", "kode", "seksi_urut", "seksi_huruf", "seksi_judul", "no", "uraian", "pihak", "ket", "gen", "aktif"] }));
  const paket = useBacaKeu<RingkasPaket>(urlBaca("keu_v_keluaran", { ident_id: ident.id }, { urut: "-ver", batas: 50, kolom: KOLOM_RINGKAS }));
  const ada = paket.baris ?? [];
  const pakai = pilih === "pratinjau" ? null : ada.find((p) => p.id === pilih) ?? ada[0] ?? null;
  const detail = useBacaKeu<{ id: number; isi: unknown }>(pakai ? urlBaca("keu_v_keluaran", { id: pakai.id }, { batas: 1, kolom: ["id", "isi"] }) : null);
  const tandaR = useBacaKeu<BarisTanda>(pakai ? urlBaca("keu_v_keluaran_tanda", { keluaran_id: pakai.id }, { batas: 10 }) : null);
  const spekR = useBacaKeu<BarisSpek>(urlBaca("keu_v_keluaran_spek", { ident_id: ident.id }, { batas: 500 }));

  const muatSemua = useCallback(async () => {
    await Promise.all([rabRo.muatSemua(), status.muat(), paket.muat(), detail.muat(), tandaR.muat(), spekR.muat()]);
  }, [rabRo, status, paket, detail, tandaR, spekR]);
  const kirim = useKirim(muatSemua);

  const libur = useMemo(() => bangunLibur(hariLibur.baris), [hariLibur.baris]);
  const namaAkun = useMemo(() => new Map((akun.baris ?? []).map((a) => [a.kode.slice(0, 6), a.nama] as const)), [akun.baris]);
  const polaAkun = useMemo(() => new Map((akun.baris ?? []).map((a) => [a.kode.slice(0, 6), a.pola_kode] as const)), [akun.baris]);
  const spekPeta = useMemo(() => new Map((spekR.baris ?? []).map((s) => [s.butir, s.spek] as const)), [spekR.baris]);
  const jendela = useMemo(() => jendelaCair(b.lembar), [b.lembar]);

  const pratinjau = useMemo<IsiKeluaran | null>(() => {
    if (!rabRo.rab) return null;
    const baris = barisKeluaran(rabRo.barisRab, rabRo.itemRab, ident.id);
    const periode = b.periode.filter((p) => p.mulai && p.selesai);
    const meta = petaKunci(b.rincian, periode, b.isi, libur);
    const hariBayar = jendela.dariLembar ? jendela.hari : undefined;
    const bayar = hariBayar === undefined ? susunBayar(baris, meta, libur) : susunBayar(baris, meta, libur, undefined, hariBayar);
    const pengadaan = susunButir(b.butirDasar, baris, meta, b.periode.map((p) => p.periode), spekPeta);
    return susunKeluaran(
      { identNama: ident.nama, roKode: ident.ro_kode, tahun: ident.tahun, identVer: ident.ver, rabNomor: String(rabRo.rab.nomor ?? ""), rabStatus: rabRo.rab.status },
      baris, susunDana(baris, (a) => namaAkun.get(a) ?? ""), bayar, pengadaan,
    );
  }, [rabRo.rab, rabRo.barisRab, rabRo.itemRab, ident, b.periode, b.rincian, b.isi, b.butirDasar, libur, jendela, namaAkun, spekPeta]);

  const statusSurvei: "draf" | "siap" = status.baris?.[0]?.status === "siap" ? "siap" : "draf";
  const hambatan = pratinjau ? hambatanAjukan(statusSurvei, pratinjau.n) : ["RO ini belum punya RAB."];
  const terbaru = ada[0] ?? null;
  const isiTerbaru = useMemo(() => (terbaru && pakai?.id === terbaru.id ? bacaIsiKeluaran(detail.baris?.[0]?.isi) : null), [terbaru, pakai, detail.baris]);
  const tersimpan = useMemo(() => bacaIsiKeluaran(detail.baris?.[0]?.isi), [detail.baris]);
  const tanda = useMemo(() => (pakai ? petaTanda(tandaR.baris, pakai.id) : new Map<BagianKeluaran, BarisTanda>()), [pakai, tandaR.baris]);
  /** Pratinjau berbeda dari paket terbaru (hanya diketahui bila paket terbaru sedang dibuka). */
  const berubah = pratinjau && isiTerbaru ? !samaIsi(pratinjau, isiTerbaru) : null;

  const ajukan = (catatan: string): Promise<boolean> => {
    if (!pratinjau || !rabId) return Promise.resolve(false);
    return kirim.kirim("keu_keluaran_ajukan", { p_ident: ident.id, p_rab: rabId, p_isi: pratinjau, p_catatan: catatan.trim() });
  };
  const tandai = (bagian: BagianKeluaran, st: "diterima" | "ditanyakan", catatan: string): Promise<boolean> =>
    pakai ? kirim.kirim("keu_keluaran_tandai", { p_keluaran: pakai.id, p_bagian: bagian, p_status: st, p_catatan: catatan }) : Promise.resolve(false);
  const simpanSpek = (butir: string, jenis: string, spek: Spek): Promise<boolean> =>
    kirim.kirim("keu_keluaran_spek_simpan", { p_ident: ident.id, p_butir: butir, p_jenis: jenis, p_spek: spek });

  const siap = rabRo.siap && paket.baris !== null && (status.baris !== null || status.galat !== null || rabId === null);
  // paket belum ada di basis data (berkas SQL 20261028h belum dijalankan) -> galat baca; diberi tahu terpisah
  const belumTersedia = paket.galat !== null;
  return {
    rab: rabRo.rab, siap, belumTersedia, galat: rabRo.galat ?? akun.galat ?? hariLibur.galat, pratinjau, dok: dokR.baris ?? [], dokSiap: dokR.baris !== null || dokR.galat !== null, polaAkun, paketVer: terbaru?.ver ?? null, statusSurvei, hambatan, paket: ada, terbaru, pakai, tersimpan, tanda, spekR: spekR.baris ?? [],
    berubah, jendela, ajukan, tandai, simpanSpek, mengirim: kirim.mengirim, galatKirim: kirim.galat, hapusGalat: kirim.hapusGalat, muatSemua,
  };
}
