// lib/pushTranslok.ts  (logika murni)
//
// (31 Okt 2026) Putusan pengingat Translok tiga tahap untuk SATU petugas pada SATU kegiatan. Aturan dan bawaannya ada di lib/pushPengaturan.ts.
// Pelaksana: app/api/sigap/pengingat-push (slot=auto). Pesan = isi kartu/modal "yang belum dilengkapi" (satu sumber: lib/sigapKekurangan.ts).
//
// Hanya petugas yang HARI INI hari Translok-nya (adaJadwal) yang pernah diingatkan -- itu aturan kode, bukan pengaturan. Supervisor/korwil mengikuti
// aturan hari ganjil periode yang sama dengan peringatan Beranda (wajibDiperiksa).

import type { Kekurangan } from "@/lib/sigapKekurangan";
import type { RingkasHariIni } from "@/lib/sigapKegiatan";
import { peranKartu, wajibDiperiksa } from "@/lib/sigapBerandaKartu";
import { tanggalWib, type SetelanTranslok, type TahapTranslok } from "@/lib/pushPengaturan";

export type AlasanLewat = "bukan_hari_translok" | "bukan_giliran" | "foto_cukup" | "lengkap";
export type PutusanTranslok = { kirim: true; kekurangan: Kekurangan } | { kirim: false; alasan: AlasanLewat };

const JENIS_HARI_INI = new Set(["foto", "laporan", "lembar"]);

/** Foto yang disyaratkan pada tahap itu, dibatasi jumlah foto kegiatan (kegiatan 3 foto tidak mungkin diminta 4). */
export function ambangFoto(s: SetelanTranslok, tahap: TahapTranslok, fotoTotal: number): number {
  const mentah = tahap === 1 ? s.foto1 : tahap === 2 ? s.foto2 : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(mentah, fotoTotal > 0 ? fotoTotal : mentah));
}

export function putusanTranslok(o: { tahap: TahapTranslok; setelan: SetelanTranslok; hariIni: RingkasHariIni | undefined; kekurangan: Kekurangan[] | undefined; nowMs: number }): PutusanTranslok {
  const h = o.hariIni;
  if (!h || !h.adaJadwal || h.tanggal !== tanggalWib(o.nowMs)) return { kirim: false, alasan: "bukan_hari_translok" };
  if (!wajibDiperiksa(peranKartu(h.peran), h)) return { kirim: false, alasan: "bukan_giliran" };
  const hariIni = (o.kekurangan ?? []).filter((k) => JENIS_HARI_INI.has(k.jenis) && k.tanggal === h.tanggal);
  if (hariIni.length === 0) return { kirim: false, alasan: "lengkap" };
  if (o.tahap !== 3 && h.slot.length >= ambangFoto(o.setelan, o.tahap, h.fotoTotal)) return { kirim: false, alasan: "foto_cukup" };
  const pilih = [...hariIni].sort((a, b) => b.skor - a.skor)[0];
  return { kirim: true, kekurangan: pilih };
}

/** Kunci yang dicatat di isi log untuk mencegah kiriman kembar: satu per (tahap, tanggal, kegiatan). */
export const kunciKirimTranslok = (tahap: TahapTranslok, tanggal: string, kegiatanId: number): string => `translok_${tahap}|${tanggal}|${kegiatanId}`;
