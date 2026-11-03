// lib/vanguardPengingat.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) PENGINGAT URGENT Vanguard "N hari berturut-turut" (rancangan-vanguard-di-pelatihan-2nov, bagian Notifikasi). Hanya untuk mode "wajib".
//   Push: dua jendela sehari (pagi 07.00-07.44 dan sore 16.00-16.44 WIB; cron pengingat-push yang berjalan tiap 5 menit sudah cukup) untuk petugas yang HARI INI belum berlatih.
//   Modal: di Hari ini, paling banyak MAKS_MODAL_PER_HARI kali sehari (jarak minimal JEDA_MODAL_MENIT), tidak ikut batas modal pengingat biasa; ucapan sekali saat tuntas.
//   Pesan PJ: sekali sehari (jendela sore) bila ada peserta yang batas mulainya terlewat.
// Isi dihitung dari runtutan (lib/runtutanVanguard.ts); tidak ada keadaan yang disimpan selain catatan kirim (sigap_push_log) dan catatan modal di HP.

import type { HasilRuntutan, KelayakanRuntutan } from "@/lib/runtutanVanguard";

export type JendelaVg = "pagi" | "sore";
export const JENDELA_VG: Record<JendelaVg, { dari: number; sampai: number }> = { pagi: { dari: 7 * 60, sampai: 7 * 60 + 44 }, sore: { dari: 16 * 60, sampai: 16 * 60 + 44 } };

const WIB_MS = 7 * 3600_000;
const menitWib = (nowMs: number): number => {
  const d = new Date(nowMs + WIB_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const tanggalWib = (nowMs: number): string => new Date(nowMs + WIB_MS).toISOString().slice(0, 10);

/** Jendela kirim yang sedang berlaku (atau null). */
export function jendelaSekarang(nowMs: number): JendelaVg | null {
  const m = menitWib(nowMs);
  for (const j of ["pagi", "sore"] as const) if (m >= JENDELA_VG[j].dari && m <= JENDELA_VG[j].sampai) return j;
  return null;
}

export type KejadianVg = "mulai" | "lanjut" | "terputus" | "hari_terakhir" | "lewat_batas" | "sertifikasi";
export type MasukanKejadian = Pick<HasilRuntutan, "tuntas" | "hari_ini_sudah" | "terputus" | "berturut" | "hari_berturut"> & { kelayakan: Pick<KelayakanRuntutan, "mungkin" | "hari_terakhir_mulai" | "batas_mulai">; /** false = Sertifikasi wajib belum selesai (mengunci Pretest); tidak ada = tidak disyaratkan */ sertifikasi_selesai?: boolean };

/** Latihan wajib sudah tuntas, tetapi Sertifikasi wajib belum: Pretest masih terkunci. */
export const tinggalSertifikasi = (r: Pick<MasukanKejadian, "tuntas" | "sertifikasi_selesai">): boolean => r.tuntas && r.sertifikasi_selesai === false;

/** Kejadian yang patut diingatkan hari ini; null = tidak perlu (tuntas / sudah berlatih hari ini). */
export function kejadianUntuk(r: MasukanKejadian): KejadianVg | null {
  if (tinggalSertifikasi(r)) return "sertifikasi";
  if (r.tuntas || r.hari_ini_sudah) return null;
  if (r.kelayakan.mungkin === false) return "lewat_batas";
  if (r.kelayakan.hari_terakhir_mulai) return "hari_terakhir";
  if (r.terputus) return "terputus";
  return r.berturut === 0 ? "mulai" : "lanjut";
}

const tglPendek = (t: string | null | undefined): string => (t ? new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "-");
const potong = (s: string, maks: number): string => (s.length <= maks ? s : `${s.slice(0, maks - 1).trimEnd()}…`);

export type PesanVg = { judul: string; isi: string; url: string; tag: string };
export const urlLatihanVg = (kegiatanId: number): string => `/sigap/vanguard?k=${kegiatanId}`;
export const urlSertifikasiVg = (kegiatanId: number): string => `/sigap/vanguard/sertifikasi?k=${kegiatanId}`;

export function pesanPetugas(kejadian: KejadianVg, r: MasukanKejadian, kegiatanId: number): PesanVg {
  const N = r.hari_berturut;
  const batas = tglPendek(r.kelayakan.batas_mulai);
  const url = urlLatihanVg(kegiatanId);
  const tag = `vanguard-${kegiatanId}`;
  switch (kejadian) {
    case "mulai":
      return { judul: "Mulai Vanguard hari ini", isi: potong(`Pretest terkunci sampai Latihan wajib ${N} hari berturut-turut dan Sertifikasi wajib selesai. Batas mulai: ${batas}. Ketuk untuk mulai.`, 240), url, tag };
    case "lanjut":
      return { judul: potong(`Vanguard: hari ke-${r.berturut + 1} dari ${N}`, 80), isi: "Kerjakan Latihan wajib hari ini agar runtutan tidak terputus. Pretest terkunci sampai selesai.", url, tag };
    case "terputus":
      return { judul: "Runtutan Vanguard terputus", isi: potong(`Mulai lagi dari hari 1 hari ini. Batas mulai: ${batas}.`, 240), url, tag };
    case "hari_terakhir":
      return { judul: "Hari terakhir mulai Vanguard", isi: `Mulai hari ini. Besok sudah tidak sempat berlatih ${N} hari berturut-turut sebelum Pretest.`, url, tag };
    case "sertifikasi":
      return { judul: "Tinggal Sertifikasi wajib", isi: "Latihan wajib sudah selesai. Kerjakan Sertifikasi wajib (sekitar 15 menit) agar Pretest terbuka.", url: urlSertifikasiVg(kegiatanId), tag };
    case "lewat_batas":
      return { judul: "Batas mulai Vanguard terlewat", isi: "Runtutan tidak sempat tuntas sebelum Pretest. Hubungi panitia/instruktur untuk membuka kunci.", url, tag };
  }
}

export function pesanPj(jumlah: number, total: number): PesanVg {
  return {
    judul: potong(`Vanguard: ${jumlah} peserta tidak sempat tuntas`, 80),
    isi: potong(`Batas mulai terlewat untuk ${jumlah} dari ${total} peserta. Buka kunci di Monitoring atau geser jadwal Pretest.`, 240),
    url: "/sigap/kelola/pelatihan?tab=monitoring",
    tag: "vanguard-pj",
  };
}

/** Kunci anti-ganda per penerima. Harian per jendela, kecuali lewat_batas (sekali saja per petugas). */
export function kunciKirimVg(kejadian: KejadianVg, jendela: JendelaVg, nowMs: number, kegiatanId: number): string {
  return kejadian === "lewat_batas" ? `vg|${kegiatanId}|lewat_batas` : `vg|${kegiatanId}|${kejadian}|${jendela}|${tanggalWib(nowMs)}`;
}
export const kunciPjVg = (kegiatanId: number, nowMs: number): string => `vg|${kegiatanId}|pj|${tanggalWib(nowMs)}`;

// ---------- modal di Hari ini ----------

export const MAKS_MODAL_PER_HARI = 2;
export const JEDA_MODAL_MENIT = 180;

export type CatatanModalVg = { hari: string; n: number; terakhir: number; tuntas_dilihat: boolean };
export const CATATAN_KOSONG = (nowMs: number): CatatanModalVg => ({ hari: tanggalWib(nowMs), n: 0, terakhir: 0, tuntas_dilihat: false });

/** Catatan dari penyimpanan HP -> bentuk sah untuk hari ini (hari berganti: hitungan nol; "tuntas dilihat" dibawa). */
export function segarkanCatatan(mentah: unknown, nowMs: number): CatatanModalVg {
  const o = (mentah ?? {}) as Partial<CatatanModalVg>;
  const hari = tanggalWib(nowMs);
  return {
    hari,
    n: o.hari === hari && typeof o.n === "number" && o.n >= 0 ? Math.floor(o.n) : 0,
    terakhir: o.hari === hari && typeof o.terakhir === "number" ? o.terakhir : 0,
    tuntas_dilihat: o.tuntas_dilihat === true,
  };
}

export type KeputusanModal = { tampil: "ingatkan" | "ucapan" | null; kejadian: KejadianVg | null };

export function putuskanModal(mode: string, r: MasukanKejadian, catatan: CatatanModalVg, nowMs: number): KeputusanModal {
  if (mode !== "wajib") return { tampil: null, kejadian: null };
  if (r.tuntas && !tinggalSertifikasi(r)) return catatan.tuntas_dilihat ? { tampil: null, kejadian: null } : { tampil: "ucapan", kejadian: null };
  const k = kejadianUntuk(r);
  if (!k) return { tampil: null, kejadian: null };
  if (catatan.n >= MAKS_MODAL_PER_HARI || nowMs - catatan.terakhir < JEDA_MODAL_MENIT * 60_000) return { tampil: null, kejadian: k };
  return { tampil: "ingatkan", kejadian: k };
}

export const catatModalTampil = (c: CatatanModalVg, jenis: "ingatkan" | "ucapan", nowMs: number): CatatanModalVg =>
  jenis === "ucapan" ? { ...c, tuntas_dilihat: true } : { ...c, n: c.n + 1, terakhir: nowMs };
