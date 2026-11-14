// lib/sigapTahapan.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) BLOKIR ANTAR TAHAPAN + BUKA KUNCI (rancangan-pelatihan-5-tab-hierarki, 5.5 dan 5.6, keputusan 11, 12, 20).
//   Rangkaian: [Video wajib] -> [Vanguard wajib] -> Pretest -> Kuis (Adu Sigap) -> Posttest.
//   Tahapan yang BELUM TUNTAS memblokir tahapan sesudahnya. "Tuntas": tes biasa = sudah dikerjakan sampai selesai; tes "wajib 100" = skor tertinggi 100;
//   Vanguard = rangkaian selesai dikerjakan (bukan harus lulus); video = ditonton sampai habis; kuis = tercatat ikut. Tahapan yang tidak diatur (ada = false) dilewati.
//   Yang DIKUNCI hanya tes (pretest, posttest): kuis adalah kegiatan bersama di kelas, tidak dikunci, tetapi ikut menentukan kapan posttest terbuka.
//   Blokir hanya berlaku bila kegiatan menyalakannya (sigap_pelatihan_aturan.blokir_tahap). Izin buka kunci (sigap_pelatihan_izin_buka) menembus blokir
//   untuk SATU tahapan dan satu orang, sekaligus memberi jendela tes pribadi sampai 23.59 WIB hari itu.

export type KodeTahap = "video" | "vanguard" | "pretest" | "kuis" | "posttest";
export const URUTAN_TAHAP: readonly KodeTahap[] = ["video", "vanguard", "pretest", "kuis", "posttest"];
/** Tahapan yang dapat dikunci / dibuka kuncinya (tes). */
export const TAHAP_TES: readonly KodeTahap[] = ["pretest", "posttest"];

export const LABEL_TAHAP: Record<KodeTahap, string> = {
  video: "Video wajib",
  vanguard: "Vanguard",
  pretest: "Pretest",
  kuis: "Kuis Adu Sigap",
  posttest: "Posttest",
};

export const tahapValid = (x: unknown): x is KodeTahap => typeof x === "string" && (URUTAN_TAHAP as readonly string[]).includes(x);
export const tahapTesValid = (x: unknown): x is "pretest" | "posttest" => x === "pretest" || x === "posttest";

export type KeadaanTahap = {
  /** Tahapan ini ada / diwajibkan untuk kegiatan ini. */
  ada: boolean;
  tuntas: boolean;
};
export type MasukanTahapan = Record<KodeTahap, KeadaanTahap>;

export const TAHAP_KOSONG = (): MasukanTahapan => ({
  video: { ada: false, tuntas: false },
  vanguard: { ada: false, tuntas: false },
  pretest: { ada: false, tuntas: false },
  kuis: { ada: false, tuntas: false },
  posttest: { ada: false, tuntas: false },
});

export type StatusIzin = "menunggu" | "disetujui" | "ditolak";
export type BarisIzin = {
  id?: number;
  akun_id?: number;
  tahap: string;
  alasan?: string | null;
  asal?: "petugas" | "pengelola" | string;
  status: StatusIzin | string;
  berlaku_sampai?: string | null;
  dibuat_at?: string | null;
  diputuskan_at?: string | null;
};

const ms = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : NaN);

/** Izin yang masih menembus blokir: disetujui dan belum lewat berlaku_sampai. */
export function izinBerlaku(b: BarisIzin | null | undefined, sekarang: number): boolean {
  return !!b && b.status === "disetujui" && ms(b.berlaku_sampai) > sekarang;
}

export type HasilTahap = {
  kode: KodeTahap;
  label: string;
  ada: boolean;
  tuntas: boolean;
  terkunci: boolean;
  /** Tahapan pertama (sebelum ini) yang menghalangi; null bila tidak terkunci. */
  kunci_oleh: KodeTahap | null;
  /** Terkunci seharusnya, tetapi dibuka oleh izin. */
  dibuka_izin: boolean;
  /** "Selesaikan Pretest dulu" bila terkunci. */
  pesan: string | null;
};

export const pesanKunci = (oleh: KodeTahap): string => `Selesaikan ${LABEL_TAHAP[oleh]} dulu.`;

/**
 * Keadaan tiap tahapan. `blokir` mati -> tidak ada yang terkunci. Izin berlaku per tahapan yang dibuka (bukan tahapan penghalangnya).
 */
export function hitungTahapan(m: MasukanTahapan, blokir: boolean, izin: readonly BarisIzin[], sekarang: number): HasilTahap[] {
  const hasil: HasilTahap[] = [];
  let penghalang: KodeTahap | null = null;
  for (const kode of URUTAN_TAHAP) {
    const k = m[kode];
    const seharusnyaTerkunci = blokir && k.ada && penghalang !== null;
    const dibuka = seharusnyaTerkunci && izin.some((b) => b.tahap === kode && izinBerlaku(b, sekarang));
    const terkunci = seharusnyaTerkunci && !dibuka;
    hasil.push({
      kode,
      label: LABEL_TAHAP[kode],
      ada: k.ada,
      tuntas: k.ada && k.tuntas,
      terkunci,
      kunci_oleh: seharusnyaTerkunci ? penghalang : null,
      dibuka_izin: !!dibuka,
      pesan: terkunci && penghalang ? pesanKunci(penghalang) : null,
    });
    // tahapan yang ada tetapi belum tuntas menjadi penghalang bagi yang berikutnya (yang pertama menang)
    if (k.ada && !k.tuntas && penghalang === null) penghalang = kode;
  }
  return hasil;
}

export const cariTahap = (h: readonly HasilTahap[], kode: KodeTahap): HasilTahap | undefined => h.find((x) => x.kode === kode);

/** Ringkasan satu tahapan tes untuk keluaran API. */
export function kunciUntuk(h: readonly HasilTahap[], kode: KodeTahap): { oleh: KodeTahap; oleh_label: string; pesan: string } | null {
  const t = cariTahap(h, kode);
  if (!t || !t.terkunci || !t.kunci_oleh) return null;
  return { oleh: t.kunci_oleh, oleh_label: LABEL_TAHAP[t.kunci_oleh], pesan: pesanKunci(t.kunci_oleh) };
}

/**
 * (14 Nov 2026) Kunci untuk layar Monitoring: tes yang SUDAH dikerjakan tidak pernah tertulis terkunci (sebelumnya peserta dengan posttest 100
 * tetap tertulis "Posttest terkunci · Selesaikan Pretest dulu", dan semua 22 orang terhitung terkunci).
 */
export function kunciMonitoring(h: readonly HasilTahap[], kode: KodeTahap, sudahDikerjakan: boolean): { oleh: KodeTahap; oleh_label: string; pesan: string } | null {
  return sudahDikerjakan ? null : kunciUntuk(h, kode);
}

/**
 * Status permintaan / izin terbaru untuk satu tahapan, sebagai yang dilihat petugas pada kartu terkunci:
 * izin berlaku (disetujui) > menunggu > ditolak. Baris yang sudah kedaluwarsa (disetujui lalu lewat) dianggap tidak ada.
 */
export function ringkasIzin(baris: readonly BarisIzin[], kode: KodeTahap, sekarang: number): { status: StatusIzin; alasan: string | null; berlaku_sampai: string | null } | null {
  const untuk = baris.filter((b) => b.tahap === kode);
  const aktif = untuk.find((b) => izinBerlaku(b, sekarang));
  if (aktif) return { status: "disetujui", alasan: aktif.alasan ?? null, berlaku_sampai: aktif.berlaku_sampai ?? null };
  const terbaru = (xs: BarisIzin[]) => [...xs].sort((a, b) => (ms(b.dibuat_at) || 0) - (ms(a.dibuat_at) || 0))[0];
  const menunggu = terbaru(untuk.filter((b) => b.status === "menunggu"));
  if (menunggu) return { status: "menunggu", alasan: menunggu.alasan ?? null, berlaku_sampai: null };
  const ditolak = terbaru(untuk.filter((b) => b.status === "ditolak"));
  if (ditolak) return { status: "ditolak", alasan: ditolak.alasan ?? null, berlaku_sampai: null };
  return null;
}

const WIB_MS = 7 * 3600_000;
const HARI_MS = 86_400_000;
/** Akhir hari ini menurut WIB (23.59.59), sebagai ISO UTC. */
export function akhirHariWib(sekarang: number): string {
  const awalHariWib = Math.floor((sekarang + WIB_MS) / HARI_MS) * HARI_MS;
  return new Date(awalHariWib + HARI_MS - 1000 - WIB_MS).toISOString();
}

/** Bentuk tes minimal yang dibutuhkan untuk jendela pribadi. */
type JendelaTes = { buka_at: string; tutup_at: string };

/**
 * Jendela tes pribadi karena izin: tes dianggap sudah dibuka (paling lambat sekarang) dan tutup paling cepat pada berlaku_sampai.
 * Tanpa izin berlaku, tes dikembalikan apa adanya (objek yang sama).
 */
export function tesDenganIzin<T extends JendelaTes>(tes: T, izin: BarisIzin | null | undefined, sekarang: number): T {
  if (!izinBerlaku(izin, sekarang)) return tes;
  const buka = ms(tes.buka_at) <= sekarang ? tes.buka_at : new Date(sekarang).toISOString(); // nilai asli dipertahankan bila sudah memadai
  const tutup = ms(tes.tutup_at) >= ms(izin!.berlaku_sampai) ? tes.tutup_at : (izin!.berlaku_sampai as string);
  return { ...tes, buka_at: buka, tutup_at: tutup };
}

export const ALASAN_CEPAT = ["Kendala HP / sinyal", "Terlambat datang", "Lainnya"] as const;
export const MAKS_ALASAN_IZIN = 200;

export type PermintaanIzin = { tahap: "pretest" | "posttest"; alasan: string };

/** Validasi isi minta / buka langsung: tahapan tes dan alasan 3-200 huruf. */
export function periksaPermintaanIzin(x: unknown): { ok: true; izin: PermintaanIzin } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  if (!tahapTesValid(o.tahap)) return { ok: false, pesan: "Pilih tahapan yang dibuka: Pretest atau Posttest." };
  const alasan = typeof o.alasan === "string" ? o.alasan.trim().replace(/\s+/g, " ") : "";
  if (alasan.length < 3) return { ok: false, pesan: "Tulis alasan singkat (minimal 3 huruf)." };
  if (alasan.length > MAKS_ALASAN_IZIN) return { ok: false, pesan: `Alasan terlalu panjang (maksimal ${MAKS_ALASAN_IZIN} huruf).` };
  return { ok: true, izin: { tahap: o.tahap, alasan } };
}

export const LABEL_STATUS_IZIN: Record<StatusIzin, string> = {
  menunggu: "Menunggu persetujuan",
  disetujui: "Dibuka",
  ditolak: "Ditolak",
};

/** Teks kartu terkunci untuk petugas. */
export function teksKartuTerkunci(
  kunci: { oleh_label: string },
  izin: { status: StatusIzin; berlaku_sampai: string | null } | null,
  bolehMinta: boolean
): { judul: string; ket: string; tombolMinta: boolean } {
  if (izin?.status === "menunggu") return { judul: "Menunggu persetujuan", ket: `Permintaan buka kunci Anda sudah dikirim ke panitia/instruktur. Selesaikan ${kunci.oleh_label} bila diminta.`, tombolMinta: false };
  if (izin?.status === "ditolak") return { judul: "Permintaan ditolak", ket: `Permintaan buka kunci ditolak. Selesaikan ${kunci.oleh_label} dulu${bolehMinta ? ", atau hubungi panitia/instruktur." : "."}`, tombolMinta: bolehMinta };
  return { judul: "Terkunci", ket: `Selesaikan ${kunci.oleh_label} dulu.${bolehMinta ? " Bila ada kendala, Anda dapat meminta panitia/instruktur membuka kunci." : " Bila ada kendala, hubungi panitia/instruktur."}`, tombolMinta: bolehMinta };
}
