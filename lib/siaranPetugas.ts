// lib/siaranPetugas.ts
//
// (13 Okt 2026) Siaran ke petugas pendataan (PML/PPL/korwil): satu aksi mengirim notifikasi push DAN/ATAU memunculkan modal pengumuman
// yang cukup dikonfirmasi satu kali (lalu hilang) di halaman tahap Pendataan -- permintaan user. Fungsi MURNI (tanpa DB/React): validasi isian.

import { MAKS_ISI, MAKS_JUDUL, MAKS_LABEL_TOMBOL, jenisPengumumanValid, urlAman, type JenisPengumuman } from "@/lib/sigapPengumuman";
import { urlInternalAman, validasiPesanPush, type PesanPush } from "@/lib/sigapPushUtil";

/** Lama modal siaran tampil sejak dikirim (hari); sesudahnya otomatis berhenti tampil (tanpa perlu dimatikan manual). */
export const HARI_MODAL_SIARAN = 14;
/** Kode kegiatan induk tempat modal siaran disimpan (tabel sigap_pengumuman). */
export const KODE_KEGIATAN_SIARAN = "pascabencana_2026";
export const PERAN_PENERIMA_SIARAN = ["ppl", "pml", "korwil"] as const;

/**
 * (19 Okt 2026) Modal siaran yang tombolnya menuju Lembar Pendataan (/sigap/pendataan...) hanya berlaku bagi PML/PPL: Lembar itu khusus anggota tim,
 * jadi korwil (yang hanya memantau) tak perlu melihat instruksi pengajuan Sub SLS/Kolam wilayah dan tombolnya hanya berujung galat "khusus anggota tim".
 * Modal ke tujuan lain (mis. tautan briefing) tetap untuk semua penerima.
 */
export function modalBerlakuUntukPeran(tombolUrl: string | null | undefined, peran: ReadonlySet<string>): boolean {
  if (typeof tombolUrl === "string" && /^\/sigap\/pendataan(?:[/?#]|$)/.test(tombolUrl.trim())) return peran.has("pml") || peran.has("ppl");
  return true;
}

/** Tombol navigasi di modal: label + tujuan (halaman SIGAP "/sigap/..." atau https). null = tanpa tombol. */
export type TombolSiaran = { label: string; url: string };
export type ModalSiaran = { judul: string; isi: string; jenis: JenisPengumuman; tombol: TombolSiaran | null };

/** Tujuan tombol di dalam aplikasi: hanya path "/sigap/..." tanpa spasi, "//" atau karakter aneh. Dibuka di tab yang sama (tanpa kehilangan sesi). */
export function urlInternalSigap(u: unknown): u is string {
  if (typeof u !== "string") return false;
  const s = u.trim();
  return s.startsWith("/sigap/") && s.length <= 200 && !s.startsWith("//") && !/[\\\s\u0000-\u001f]/.test(s) && !s.includes("..");
}
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
    const tl = typeof modalIn.tombol_label === "string" ? modalIn.tombol_label.replace(/\s+/g, " ").trim() : "";
    const tu = typeof modalIn.tombol_url === "string" ? modalIn.tombol_url.trim() : "";
    let tombol: TombolSiaran | null = null;
    if (tl || tu) {
      if (!tl || !tu) return { ok: false, pesan: "Tombol modal perlu label DAN tujuan (atau kosongkan keduanya)." };
      if (tl.length > MAKS_LABEL_TOMBOL) return { ok: false, pesan: `Label tombol maksimal ${MAKS_LABEL_TOMBOL} karakter.` };
      if (!urlInternalSigap(tu) && !urlAman(tu)) return { ok: false, pesan: "Tujuan tombol harus halaman SIGAP (diawali /sigap/) atau tautan https://." };
      tombol = { label: tl, url: tu };
    }
    modal = { judul, isi, jenis, tombol };
  }
  return { ok: true, nilai: { push, modal } };
}

/** Batas waktu tampil modal siaran: `HARI_MODAL_SIARAN` hari sesudah `dari`. */
export const akhirModalSiaran = (dari: Date): string => new Date(dari.getTime() + HARI_MODAL_SIARAN * 86_400_000).toISOString();

/** Kunci penanda "sudah dikonfirmasi" = id modal + versi (diubah_at); berubahnya versi memunculkan modal lagi. */
export const kunciBacaSiaran = (id: number, versi: string): string => `${id}_${versi}`;

/**
 * (17 Okt 2026) Notifikasi ke SATU petugas pendataan (mis. mengajak mencoba menu baru): validasi isian. Penerima dipilih admin dari daftar petugas
 * yang ditugaskan; server menolak akun di luar daftar itu. Tanpa modal, tidak masuk riwayat siaran massal.
 */
export function validasiKirimSatu(x: unknown): { ok: true; nilai: { akun: number; pesan: PesanPush } } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const akun = Number(o.akun_id);
  if (!Number.isInteger(akun) || akun <= 0) return { ok: false, pesan: "Pilih petugas penerima." };
  const v = validasiPesanPush({ judul: o.judul, isi: o.isi, url: o.url });
  if (!v.ok) return v;
  return { ok: true, nilai: { akun, pesan: v.nilai } };
}
