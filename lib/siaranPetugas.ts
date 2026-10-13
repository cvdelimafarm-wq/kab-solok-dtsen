// lib/siaranPetugas.ts
//
// (13 Okt 2026) Siaran ke petugas pendataan (PML/PPL/korwil): satu aksi mengirim notifikasi push DAN/ATAU memunculkan modal pengumuman
// yang cukup dikonfirmasi satu kali (lalu hilang) di halaman tahap Pendataan -- permintaan user. Fungsi MURNI (tanpa DB/React): validasi isian.

import { MAKS_ISI, MAKS_JUDUL, jenisPengumumanValid, type JenisPengumuman } from "@/lib/sigapPengumuman";
import { urlInternalAman, validasiPesanPush, type PesanPush } from "@/lib/sigapPushUtil";

/** Lama modal siaran tampil sejak dikirim (hari); sesudahnya otomatis berhenti tampil (tanpa perlu dimatikan manual). */
export const HARI_MODAL_SIARAN = 14;
/** Kode kegiatan induk tempat modal siaran disimpan (tabel sigap_pengumuman). */
export const KODE_KEGIATAN_SIARAN = "pascabencana_2026";
export const PERAN_PENERIMA_SIARAN = ["ppl", "pml", "korwil"] as const;

export type ModalSiaran = { judul: string; isi: string; jenis: JenisPengumuman };
export type Siaran = { push: PesanPush | null; modal: ModalSiaran | null };

export function validasiSiaran(x: unknown): { ok: true; nilai: Siaran } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const kirimPush = o.kirim_push === true;
  const modalIn = (o.modal ?? null) as Record<string, unknown> | null;
  const adaModal = !!modalIn && modalIn.aktif === true;
  if (!kirimPush && !adaModal) return { ok: false, pesan: "Pilih minimal satu: kirim notifikasi atau tampilkan modal." };

  let push: PesanPush | null = null;
  if (kirimPush) {
    const url = urlInternalAman(o.url);
    if (url === null) return { ok: false, pesan: "Tautan tujuan notifikasi tidak sah." };
    const v = validasiPesanPush({ judul: o.judul, isi: o.isi, url });
    if (!v.ok) return { ok: false, pesan: v.pesan };
    push = v.nilai;
  }

  let modal: ModalSiaran | null = null;
  if (adaModal && modalIn) {
    const judul = typeof modalIn.judul === "string" ? modalIn.judul.replace(/\s+/g, " ").trim() : "";
    const isi = typeof modalIn.isi === "string" ? modalIn.isi.replace(/\r\n?/g, "\n").trim() : "";
    const jenis: JenisPengumuman = jenisPengumumanValid(modalIn.jenis) ? modalIn.jenis : "info";
    if (!judul) return { ok: false, pesan: "Judul modal wajib diisi." };
    if (!isi) return { ok: false, pesan: "Isi modal wajib diisi." };
    if (judul.length > MAKS_JUDUL) return { ok: false, pesan: `Judul modal maksimal ${MAKS_JUDUL} karakter.` };
    if (isi.length > MAKS_ISI) return { ok: false, pesan: `Isi modal maksimal ${MAKS_ISI} karakter.` };
    modal = { judul, isi, jenis };
  }
  return { ok: true, nilai: { push, modal } };
}

/** Batas waktu tampil modal siaran: `HARI_MODAL_SIARAN` hari sesudah `dari`. */
export const akhirModalSiaran = (dari: Date): string => new Date(dari.getTime() + HARI_MODAL_SIARAN * 86_400_000).toISOString();

/** Kunci penanda "sudah dikonfirmasi" = id modal + versi (diubah_at); berubahnya versi memunculkan modal lagi. */
export const kunciBacaSiaran = (id: number, versi: string): string => `${id}_${versi}`;
