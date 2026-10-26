// lib/portal/qc.ts  (hanya server)
//
// (26 Okt 2026) QC Pemahaman Petugas -- lapisan server di atas fungsi database `sigap_qc_*` (migrasi 20261026k; hanya service_role).
// Dipakai oleh: /api/portal/qc (petugas), /api/portal/qc/admin (menu Kelola Pendataan > QC Pemahaman), /api/sigap/qc/jadwal (cron).
// Keputusan "apa yang jatuh tempo" ada di lib/sigapQc.ts (murni, diuji); fungsi di sini hanya memanggil database dan mengirim push.
// Pesan galat P0001 dari database sudah berbahasa Indonesia dan aman ditampilkan; galat lain dijadikan 500 generik oleh pemanggil.

import type { Db } from "@/lib/sigap";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { KEGIATAN_PENDATAAN } from "@/lib/sigapPendataanTab";
import {
  hariBerlaku,
  jendelaQc,
  pushIngatPetugas,
  pushIngatPml,
  pushRekapPml,
  pushRilis,
  rencanaAksi,
  validasiPengaturan,
  validasiSoal,
  type AksiQc,
  type IsiPush,
  type QcPengaturan,
  type QcRekapTim,
} from "@/lib/sigapQc";

/** Galat yang pesannya boleh dilihat petugas (aturan bisnis dari database atau validasi). */
export class GalatQc extends Error {
  status: number;
  constructor(pesan: string, status = 409) {
    super(pesan);
    this.name = "GalatQc";
    this.status = status;
  }
}

/** Kegiatan yang dikelola QC: Pendataan Pascabencana (id 1). */
export const KEGIATAN_QC = KEGIATAN_PENDATAAN;

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (error.code === "P0001") throw new GalatQc(error.message, 409);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

// ---------------------------------------------------------------- petugas
export type StatusQc = {
  aktif: boolean;
  alasan?: string;
  kegiatan_id?: number;
  peran?: "pml" | "ppl";
  tanggal?: string;
  rilis_at?: string;
  batas_at?: string;
  lewat_batas?: boolean;
  /** hari susulan: dirilis setelah lewat batas; tidak dihitung terlambat */
  susulan?: boolean;
  susulan_at?: string | null;
  perlu?: boolean;
  percobaan?: number;
  maks_percobaan?: number;
  sisa_ulang?: number;
  skor_terbaik?: number;
  lulus?: boolean;
  ppl_belum?: string[];
};
export type RekapUntukPml = { ada: boolean; dibaca?: boolean; tanggal?: string; kegiatan_id?: number; tim?: QcRekapTim };

/** Satu panggilan untuk gerbang di peramban: status hari ini + rekap tim kemarin (khusus PML). */
export async function statusDanRekap(db: Db, akunId: number): Promise<{ status: StatusQc; rekap: RekapUntukPml; sekarang: string }> {
  const [status, rekap] = await Promise.all([rpc<StatusQc>(db, "sigap_qc_status", { p_akun: akunId }), rpc<RekapUntukPml>(db, "sigap_qc_rekap_untuk", { p_akun: akunId })]);
  return { status, rekap, sekarang: new Date().toISOString() };
}

export const soalUntuk = (db: Db, akunId: number) => rpc<Record<string, unknown>>(db, "sigap_qc_soal_untuk", { p_akun: akunId });

const KODE = new Set(["A", "B", "C", "D"]);
/** Jawaban dari peramban: { "<id soal>": "A".."D" }. Kelengkapan terhadap 10 soal diperiksa database. */
export function bersihkanJawaban(x: unknown): Record<string, string> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const hasil: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (typeof v !== "string" || !KODE.has(v.toUpperCase()) || k.length === 0 || k.length > 60) return null;
    hasil[k] = v.toUpperCase();
  }
  return Object.keys(hasil).length > 0 && Object.keys(hasil).length <= 40 ? hasil : null;
}

export const jawab = (db: Db, akunId: number, jawaban: Record<string, string>) => rpc<Record<string, unknown>>(db, "sigap_qc_jawab", { p_akun: akunId, p_jawaban: jawaban });

export async function tandaiRekapDibaca(db: Db, akunId: number, tanggal: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new GalatQc("Tanggal rekap tidak sah.", 400);
  return rpc<boolean>(db, "sigap_qc_rekap_baca_tandai", { p_akun: akunId, p_tanggal: tanggal });
}

// ---------------------------------------------------------------- admin
export type SoalAdmin = {
  id: string;
  paket: number;
  judul_paket: string;
  nomor: number;
  pertanyaan: string;
  opsi: Record<string, string>;
  kunci: string;
  penjelasan: string;
  kata_kunci: string[];
  aktif: boolean;
};

const KOLOM_SOAL = "id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif";

export async function dataAdmin(db: Db, tanggal: string | null) {
  const { data: p } = await db.from("sigap_qc_pengaturan").select("*").eq("kegiatan_id", KEGIATAN_QC).maybeSingle();
  const pengaturan = (p ?? null) as (QcPengaturan & { kegiatan_id: number; diubah_oleh: string | null; diubah_at: string }) | null;
  const { data: soal } = await db.from("sigap_qc_soal").select(KOLOM_SOAL).order("paket").order("nomor").order("id").limit(1000);
  const peserta = await rpc<{ akun_id: number; nama: string; peran: string; pml_akun_id: number | null }[]>(db, "sigap_qc_peserta", { p_kegiatan: KEGIATAN_QC });
  const langgan = new Set<number>();
  const ids = peserta.map((x) => x.akun_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).in("akun_id", ids.slice(i, i + 200));
    for (const r of data ?? []) langgan.add(r.akun_id as number);
  }
  // hari yang dilihat: parameter, atau hari berlaku sekarang menurut pengaturan
  let hari: string | null = tanggal;
  if (!hari && pengaturan) hari = hariBerlaku(new Date(), pengaturan);
  let rekap: QcRekapTim[] = [];
  let soalHari: string[] = [];
  let susulanAt: string | null = null;
  if (hari) {
    const { data: h } = await db.from("sigap_qc_hari").select("soal_ids, susulan_at").eq("kegiatan_id", KEGIATAN_QC).eq("tanggal", hari).maybeSingle();
    soalHari = ((h?.soal_ids ?? []) as string[]) || [];
    susulanAt = (h?.susulan_at as string | null) ?? null;
    if (soalHari.length > 0) rekap = await rpc<QcRekapTim[]>(db, "sigap_qc_rekap", { p_kegiatan: KEGIATAN_QC, p_tanggal: hari, p_pml: null });
  }
  return {
    kegiatan_id: KEGIATAN_QC,
    sekarang: new Date().toISOString(),
    pengaturan,
    soal: (soal ?? []) as SoalAdmin[],
    peserta: {
      pml: peserta.filter((x) => x.peran === "pml").length,
      ppl: peserta.filter((x) => x.peran === "ppl").length,
      ppl_tanpa_pml: peserta.filter((x) => x.peran === "ppl" && x.pml_akun_id == null).length,
      tanpa_notifikasi: peserta.filter((x) => !langgan.has(x.akun_id)).map((x) => x.nama),
    },
    hari,
    soal_hari: soalHari,
    susulan_at: susulanAt,
    rekap,
  };
}

export async function simpanPengaturan(db: Db, data: unknown, oleh: string): Promise<unknown> {
  const v = validasiPengaturan(data);
  if (!v.ok) throw new GalatQc(v.galat.join(" "), 422);
  return rpc(db, "sigap_qc_pengaturan_simpan", { p_kegiatan: KEGIATAN_QC, p_data: v.data, p_oleh: oleh });
}

export async function simpanSoal(db: Db, data: unknown): Promise<unknown> {
  const v = validasiSoal(data);
  if (!v.ok) throw new GalatQc(v.galat.join(" "), 422);
  return rpc(db, "sigap_qc_soal_simpan", { p_data: v.data });
}

export async function imporSoal(db: Db, daftar: unknown): Promise<{ diimpor: number }> {
  if (!Array.isArray(daftar) || daftar.length === 0 || daftar.length > 300) throw new GalatQc("Daftar soal impor harus 1-300 butir.", 422);
  const bersih = [];
  for (let i = 0; i < daftar.length; i++) {
    const v = validasiSoal(daftar[i]);
    if (!v.ok) throw new GalatQc(`Soal ke-${i + 1}: ${v.galat.join(" ")}`, 422);
    bersih.push(v.data);
  }
  return rpc(db, "sigap_qc_soal_impor", { p_data: bersih });
}

/** Mengaktifkan/menonaktifkan satu soal. Tidak ada penghapusan permanen. */
export async function ubahAktifSoal(db: Db, id: string, aktif: boolean): Promise<void> {
  const { data, error } = await db.from("sigap_qc_soal").update({ aktif, diubah_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(`soal_aktif: ${error.message}`);
  if (!data) throw new GalatQc("Soal tidak ditemukan.", 404);
}

export const undiUlang = (db: Db, tanggal: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new GalatQc("Tanggal tidak sah.", 400);
  return rpc<string[]>(db, "sigap_qc_hari_undi_ulang", { p_kegiatan: KEGIATAN_QC, p_tanggal: tanggal });
};

/** Menandai (true) / mencabut (false) tanda hari susulan: tanpa label terlambat, tetap memblokir, diingatkan berkala. */
export const tandaiSusulan = (db: Db, tanggal: string, susulan: boolean) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new GalatQc("Tanggal tidak sah.", 400);
  return rpc<string | null>(db, "sigap_qc_hari_susulan", { p_kegiatan: KEGIATAN_QC, p_tanggal: tanggal, p_susulan: susulan });
};

/** Contoh notifikasi ke perangkat admin sendiri (tidak mencatat apa pun, tidak ke petugas). */
export async function kirimContoh(db: Db, akunId: number, jenis: "rilis" | "ingat" | "rekap"): Promise<{ perangkat: number; terkirim: number; gagal: number }> {
  if (!pushSiap()) throw new GalatQc("Kunci VAPID belum dipasang di server.", 503);
  const { data: p } = await db.from("sigap_qc_pengaturan").select("*").eq("kegiatan_id", KEGIATAN_QC).maybeSingle();
  const peng = (p ?? { soal_per_hari: 10, batas_jam: "20:00" }) as Pick<QcPengaturan, "soal_per_hari" | "batas_jam">;
  const pesan: IsiPush =
    jenis === "rilis"
      ? pushRilis("contoh", peng)
      : jenis === "ingat"
        ? pushIngatPetugas("contoh", 20, peng)
        : pushRekapPml("contoh", {
            jumlah_ppl: 6,
            sudah: 5,
            belum_mengisi: 1,
            lulus: 3,
            rata_awal: 72,
            salah: [{ soal_id: "contoh", pertanyaan: "Apa fungsi Surat Tugas dalam pendataan?", kunci: "A", kunci_teks: "", penjelasan: "", jumlah: 3, nama: ["Contoh"] }],
          });
  const h = await kirimKeAkun(db, [akunId], { judul: `[CONTOH] ${pesan.judul}`.slice(0, 80), isi: pesan.isi, url: pesan.url, tag: "uji-qc" });
  return { perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal };
}

// ---------------------------------------------------------------- cron
export type HasilJadwal = {
  waktu: string;
  uji: boolean;
  kegiatan: number;
  aksi: { jenis: string; tanggal: string; slot: number; penerima: number; terkirim: number; gagal: number; dilewati: number }[];
};

type Belum = { akun_id: number; nama: string; peran: string; pml_akun_id: number | null; pml_nama: string | null; percobaan: number; skor_terbaik: number };

/**
 * Menjalankan semua aksi yang jatuh tempo SEKARANG untuk kegiatan yang QC-nya aktif. Aman dipanggil berulang (tiap 5 menit): setiap
 * (tanggal, jenis, penerima, slot) hanya sekali berhasil "diklaim" lewat sigap_qc_kirim_catat sebelum dikirim, sehingga dua proses cron
 * yang tumpang tindih tidak mengirim ganda. `uji` = hanya menghitung penerima, tidak mengklaim dan tidak mengirim.
 */
export async function jalankanJadwal(db: Db, nowMs: number, uji: boolean): Promise<HasilJadwal[]> {
  const { data: daftar } = await db.from("sigap_qc_pengaturan").select("*").eq("aktif", true);
  const hasil: HasilJadwal[] = [];
  for (const raw of daftar ?? []) {
    const p = raw as QcPengaturan & { kegiatan_id: number };
    const keg = p.kegiatan_id;
    // hari yang sedang berlaku ditandai susulan? (menentukan rilis susulan + pengingat berkala tanpa menunggu batas)
    const hari = hariBerlaku(new Date(nowMs), p);
    let susulanAt: Date | null = null;
    if (hari) {
      const { data: h } = await db.from("sigap_qc_hari").select("susulan_at").eq("kegiatan_id", keg).eq("tanggal", hari).maybeSingle();
      if (h?.susulan_at) susulanAt = new Date(h.susulan_at as string);
    }
    const rencana = rencanaAksi(new Date(nowMs), p, { susulanAt });
    const keluar: HasilJadwal = { waktu: new Date(nowMs).toISOString(), uji, kegiatan: keg, aksi: [] };
    for (const a of rencana) keluar.aksi.push(await jalankanAksi(db, keg, p, a, nowMs, uji, susulanAt !== null));
    hasil.push(keluar);
  }
  return hasil;
}

async function klaim(db: Db, keg: number, tanggal: string, jenis: string, akun: number, slot: number): Promise<boolean> {
  return rpc<boolean>(db, "sigap_qc_kirim_catat", { p_kegiatan: keg, p_tanggal: tanggal, p_jenis: jenis, p_akun: akun, p_slot: slot });
}

async function jalankanAksi(db: Db, keg: number, p: QcPengaturan, a: AksiQc, nowMs: number, uji: boolean, susulan: boolean) {
  const out = { jenis: a.jenis, tanggal: a.tanggal, slot: a.slot, penerima: 0, terkirim: 0, gagal: 0, dilewati: 0 };
  const sisaMenit = jendelaQc(new Date(nowMs), p, susulan)?.sisaMenit ?? 0;

  /** Klaim lalu kirim ke satu kelompok penerima dengan pesan yang sama. */
  const kirimKelompok = async (akunIds: number[], pesan: IsiPush) => {
    const siap: number[] = [];
    for (const id of akunIds) {
      if (uji) {
        siap.push(id);
        continue;
      }
      if (await klaim(db, keg, a.tanggal, a.jenis, id, a.slot)) siap.push(id);
      else out.dilewati++;
    }
    out.penerima += siap.length;
    if (uji || siap.length === 0) return;
    const h = await kirimKeAkun(db, siap, { judul: pesan.judul, isi: pesan.isi, url: pesan.url, tag: pesan.tag });
    out.terkirim += h.terkirim;
    out.gagal += h.gagal;
  };

  if (a.jenis === "rilis") {
    // undian dibuat sekali (idempoten) agar semua petugas melihat set yang sama sejak soal dirilis
    if (!uji) await rpc(db, "sigap_qc_hari_pastikan", { p_kegiatan: keg, p_tanggal: a.tanggal });
    const peserta = await rpc<{ akun_id: number }[]>(db, "sigap_qc_peserta", { p_kegiatan: keg });
    await kirimKelompok(
      peserta.map((x) => x.akun_id),
      pushRilis(a.tanggal, p, susulan)
    );
    return out;
  }

  if (a.jenis === "ingat_petugas") {
    // dua kelompok dengan pesan berbeda: yang belum mengisi sama sekali, dan yang sudah mengisi tetapi belum 100 (masih ada sisa ulangan)
    const belum = await rpc<Belum[]>(db, "sigap_qc_belum", { p_kegiatan: keg, p_tanggal: a.tanggal });
    await kirimKelompok(
      belum.filter((x) => x.percobaan === 0).map((x) => x.akun_id),
      pushIngatPetugas(a.tanggal, sisaMenit, p, { belumMengisi: true }, susulan)
    );
    const maks = 1 + (p.maks_ulang ?? 3);
    // skor berbeda-beda: pesan memuat nilai terbaik masing-masing, jadi dikirim per orang
    for (const x of belum.filter((y) => y.percobaan > 0)) {
      await kirimKelompok([x.akun_id], pushIngatPetugas(a.tanggal, sisaMenit, p, { belumMengisi: false, skorTerbaik: x.skor_terbaik, sisaUlang: Math.max(maks - x.percobaan, 0) }, susulan));
    }
    return out;
  }

  if (a.jenis === "ingat_pml") {
    // PML diingatkan tentang PPL-nya yang BELUM mengisi sama sekali (percobaan = 0)
    const belum = (await rpc<Belum[]>(db, "sigap_qc_belum", { p_kegiatan: keg, p_tanggal: a.tanggal })).filter((x) => x.peran === "ppl" && x.percobaan === 0 && x.pml_akun_id != null);
    const perPml = new Map<number, string[]>();
    for (const x of belum) perPml.set(x.pml_akun_id as number, [...(perPml.get(x.pml_akun_id as number) ?? []), x.nama]);
    for (const [pml, nama] of perPml) {
      if (!uji && !(await klaim(db, keg, a.tanggal, a.jenis, pml, a.slot))) {
        out.dilewati++;
        continue;
      }
      out.penerima++;
      if (uji) continue;
      const pesan = pushIngatPml(a.tanggal, nama.sort((x, y) => x.localeCompare(y)), p);
      const h = await kirimKeAkun(db, [pml], { judul: pesan.judul, isi: pesan.isi, url: pesan.url, tag: pesan.tag });
      out.terkirim += h.terkirim;
      out.gagal += h.gagal;
    }
    return out;
  }

  // rekap_pml: nilai tim kemarin, soal yang salah, ajakan briefing ulang
  const tim = await rpc<QcRekapTim[]>(db, "sigap_qc_rekap", { p_kegiatan: keg, p_tanggal: a.tanggal, p_pml: null });
  for (const t of tim) {
    if (!t.pml_akun_id || t.jumlah_ppl === 0) continue;
    if (!uji && !(await klaim(db, keg, a.tanggal, a.jenis, t.pml_akun_id, a.slot))) {
      out.dilewati++;
      continue;
    }
    out.penerima++;
    if (uji) continue;
    const pesan = pushRekapPml(a.tanggal, t);
    const h = await kirimKeAkun(db, [t.pml_akun_id], { judul: pesan.judul, isi: pesan.isi, url: pesan.url, tag: pesan.tag });
    out.terkirim += h.terkirim;
    out.gagal += h.gagal;
  }
  return out;
}
