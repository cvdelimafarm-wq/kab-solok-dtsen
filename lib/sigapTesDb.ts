// lib/sigapTesDb.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- akses database utk pretest/posttest (khusus server).
// Waktu SELALU dari jam server (bukan jam perangkat peserta). Finalisasi sesi yang kedaluwarsa
// dilakukan "lazy": saat sesi dibaca/disimpan/dipantau dan batas_at sudah lewat.

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Db } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { SESI_BAWAAN, aturanDariJamLama, hariKegiatan, jadwalSesi, tanggalWib, validasiSesi, type AturanSesi, type PengaturanPresensi, type RekamPresensi } from "@/lib/sigapPresensi";
import {
  KODE_KEGIATAN_PELATIHAN,
  bersihkanJawaban,
  bisaUlang,
  hasilBolehTampil,
  hitungBatas,
  hitungSkor,
  skorResmi,
  statusTes,
  type JenisTes,
  type SesiBaris,
  type SoalLengkap,
  type SoalPeserta,
  type StatusTes,
  type TesBaris,
} from "@/lib/sigapTes";

export function dbAdmin(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/** Akun aktif dari header Authorization: Bearer <sesi>, atau null. */
export async function akunDariRequest(req: NextRequest, db: Db): Promise<{ id: number; nama: string; jenis: string } | null> {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif, jenis").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  return { id: a.id as number, nama: a.nama as string, jenis: a.jenis as string };
}

export async function idKegiatanPelatihan(db: Db): Promise<number | null> {
  const { data } = await db.from("sigap_kegiatan").select("id").eq("kode", KODE_KEGIATAN_PELATIHAN).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

const KOLOM_TES = "id, kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at, aktif, ulang_maks";

export async function muatTesDaftar(db: Db, kegiatanId: number): Promise<TesBaris[]> {
  const { data } = await db.from("sigap_tes").select(KOLOM_TES).eq("kegiatan_id", kegiatanId).order("jenis", { ascending: false }); // pretest dulu
  return (data ?? []) as TesBaris[];
}

export async function muatTes(db: Db, kegiatanId: number, jenis: JenisTes): Promise<TesBaris | null> {
  const { data } = await db.from("sigap_tes").select(KOLOM_TES).eq("kegiatan_id", kegiatanId).eq("jenis", jenis).maybeSingle();
  return (data as TesBaris | null) ?? null;
}

export async function muatSoal(db: Db, tesId: number): Promise<SoalLengkap[]> {
  const { data } = await db.from("sigap_tes_soal").select("nomor, teks, opsi, kunci, bobot").eq("tes_id", tesId).order("nomor");
  return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    nomor: x.nomor as number,
    teks: x.teks as string,
    opsi: (x.opsi as SoalLengkap["opsi"]) ?? [],
    kunci: x.kunci as string,
    bobot: Number(x.bobot),
  }));
}

export async function jumlahSoal(db: Db, tesIds: number[]): Promise<Map<number, number>> {
  const peta = new Map<number, number>();
  if (tesIds.length === 0) return peta;
  const { data } = await db.from("sigap_tes_soal").select("tes_id").in("tes_id", tesIds).limit(5000);
  for (const r of data ?? []) peta.set(r.tes_id as number, (peta.get(r.tes_id as number) ?? 0) + 1);
  return peta;
}

const KOLOM_SESI = "id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, diubah_at, percobaan, skor_terbaik";

export async function muatSesi(db: Db, tesId: number, akunId: number): Promise<SesiBaris | null> {
  const { data } = await db.from("sigap_tes_sesi").select(KOLOM_SESI).eq("tes_id", tesId).eq("akun_id", akunId).maybeSingle();
  return (data as SesiBaris | null) ?? null;
}

export const KOLOM_SESI_PUBLIK = KOLOM_SESI;

/**
 * Nilai & tutup sesi. Idempoten: hanya baris yang selesai_at-nya masih null yang diubah.
 * `selesaiAt`: saat peserta menekan Kirim = sekarang; saat kedaluwarsa = batas_at.
 */
export async function finalisasiSesi(db: Db, sesi: SesiBaris, soal: SoalLengkap[], selesaiAt: Date): Promise<SesiBaris> {
  if (sesi.selesai_at) return sesi;
  const jawaban = bersihkanJawaban(sesi.jawaban, soal);
  const h = hitungSkor(soal, jawaban);
  const { data } = await db
    .from("sigap_tes_sesi")
    .update({ selesai_at: selesaiAt.toISOString(), jawaban, skor: h.skor, benar: h.benar, total: h.total, diubah_at: new Date().toISOString() })
    .eq("id", sesi.id)
    .is("selesai_at", null)
    .select(KOLOM_SESI)
    .maybeSingle();
  if (data) return data as SesiBaris;
  // sudah difinalisasi permintaan lain -> baca ulang
  const { data: ulang } = await db.from("sigap_tes_sesi").select(KOLOM_SESI).eq("id", sesi.id).maybeSingle();
  return (ulang as SesiBaris) ?? sesi;
}

/** Finalisasi bila batas_at sudah lewat. */
export async function finalisasiBilaKedaluwarsa(db: Db, sesi: SesiBaris, soal: SoalLengkap[], sekarang: Date): Promise<SesiBaris> {
  if (!sesi.selesai_at && sekarang.getTime() >= new Date(sesi.batas_at).getTime()) {
    return finalisasiSesi(db, sesi, soal, new Date(sesi.batas_at));
  }
  return sesi;
}

export type KeadaanTes = {
  tes: { jenis: JenisTes; judul: string; buka_at: string; tutup_at: string; durasi_menit: number };
  sekarang: string;
  status: StatusTes;
  jumlah_soal: number;
  sesi: { mulai_at: string; batas_at: string; selesai_at: string | null; terjawab: number } | null;
  /** (8 Okt 2026) Percobaan yang sedang/terakhir dikerjakan, kuota maksimal, dan apakah tombol "Ulangi" boleh ditampilkan. */
  percobaan: number;
  ulang_maks: number;
  bisa_ulang: boolean;
  /** Hanya saat status "mengerjakan". */
  soal?: SoalPeserta[];
  jawaban?: Record<string, string>;
  /** Sudah kirim/selesai tetapi tes belum ditutup: hasil disembunyikan. */
  hasil_tertunda: boolean;
  /** Hanya setelah tutup_at & peserta punya sesi. */
  hasil?: {
    /** Nilai resmi = skor tertinggi dari semua percobaan; butir = pembahasan percobaan terbaik itu. */
    skor: number;
    benar: number;
    total: number;
    dari_percobaan: number;
    butir: { nomor: number; teks: string; opsi: SoalLengkap["opsi"]; jawab: string | null; kunci: string; benar: boolean }[];
  };
};

/** Susun keadaan tes bagi seorang peserta (dipakai GET & balasan POST). Menjalankan finalisasi lazy. */
export async function susunKeadaan(db: Db, tes: TesBaris, akunId: number, sekarang: Date): Promise<KeadaanTes> {
  const soal = await muatSoal(db, tes.id);
  let sesi = await muatSesi(db, tes.id, akunId);
  if (sesi) sesi = await finalisasiBilaKedaluwarsa(db, sesi, soal, sekarang);
  const status = statusTes(tes, soal.length, sesi, sekarang);
  const k: KeadaanTes = {
    tes: { jenis: tes.jenis, judul: tes.judul, buka_at: tes.buka_at, tutup_at: tes.tutup_at, durasi_menit: tes.durasi_menit },
    sekarang: sekarang.toISOString(),
    status,
    jumlah_soal: soal.length,
    sesi: sesi ? { mulai_at: sesi.mulai_at, batas_at: sesi.batas_at, selesai_at: sesi.selesai_at, terjawab: Object.keys(bersihkanJawaban(sesi.jawaban, soal)).length } : null,
    percobaan: sesi?.percobaan ?? 1,
    ulang_maks: tes.jenis === "posttest" ? Math.max(1, tes.ulang_maks ?? 1) : 1,
    bisa_ulang: bisaUlang(tes, sesi, soal.length, sekarang),
    hasil_tertunda: false,
  };
  if (status === "mengerjakan" && sesi) {
    k.soal = soal.map((s) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi }));
    k.jawaban = bersihkanJawaban(sesi.jawaban, soal);
  }
  if (status === "selesai" && sesi) {
    if (hasilBolehTampil(tes, sekarang)) {
      // percobaan terbaik: yang berjalan, atau (bila skor percobaan sebelumnya lebih tinggi) baris arsip dengan skor tertinggi
      let jawabanTerbaik = bersihkanJawaban(sesi.jawaban, soal);
      let darinya = sesi.percobaan ?? 1;
      let skorTerbaik = sesi.skor !== null ? Number(sesi.skor) : null;
      if (sesi.skor_terbaik != null && (skorTerbaik === null || Number(sesi.skor_terbaik) > skorTerbaik)) {
        const { data: arsip } = await db
          .from("sigap_tes_sesi_arsip")
          .select("percobaan, jawaban, skor")
          .eq("sesi_id", sesi.id)
          .order("skor", { ascending: false, nullsFirst: false })
          .order("percobaan", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (arsip && arsip.skor != null && (skorTerbaik === null || Number(arsip.skor) > skorTerbaik)) {
          jawabanTerbaik = bersihkanJawaban(arsip.jawaban, soal);
          darinya = Number(arsip.percobaan);
          skorTerbaik = Number(arsip.skor);
        }
      }
      const h = hitungSkor(soal, jawabanTerbaik);
      k.hasil = {
        skor: skorTerbaik ?? h.skor,
        benar: h.benar,
        total: sesi.total ?? h.total,
        dari_percobaan: darinya,
        butir: soal.map((s, i) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi, jawab: h.rincian[i].jawab, kunci: s.kunci, benar: h.rincian[i].benar })),
      };
    } else {
      k.hasil_tertunda = true;
    }
  }
  return k;
}

export type HasilUlang = { ok: true } | { ok: false; pesan: string; status: number };

/**
 * (8 Okt 2026) Peserta mengulang tes (posttest): baris sesi percobaan sebelumnya DIARSIPKAN (tidak dihapus) ke
 * sigap_tes_sesi_arsip, lalu baris sesi di-reset utk percobaan berikutnya. skor_terbaik menyimpan skor tertinggi dari
 * percobaan-percobaan yang sudah lewat, sehingga nilai resmi = max(skor_terbaik, skor percobaan berjalan yang selesai).
 * Aman dari klik ganda/dua perangkat: reset hanya berhasil bila percobaan & status selesai masih seperti yang dibaca.
 */
export async function mulaiUlang(db: Db, tes: TesBaris, sesi: SesiBaris, soal: SoalLengkap[], sekarang: Date): Promise<HasilUlang> {
  if (!bisaUlang(tes, sesi, soal.length, sekarang)) {
    if (tes.jenis !== "posttest" || !(tes.ulang_maks > 1)) return { ok: false, pesan: "Tes ini tidak membuka kesempatan mengulang.", status: 409 };
    if (!sesi.selesai_at) return { ok: false, pesan: "Selesaikan percobaan yang sedang berjalan terlebih dahulu.", status: 409 };
    if (sesi.percobaan >= tes.ulang_maks) return { ok: false, pesan: `Kesempatan mengulang sudah habis (maksimal ${tes.ulang_maks} percobaan).`, status: 409 };
    return { ok: false, pesan: "Waktu tes sudah hampir/ sudah ditutup, tidak bisa mengulang lagi.", status: 409 };
  }
  // 1) arsipkan percobaan yang baru selesai (unik per sesi+percobaan: klik ganda tidak menggandakan)
  const { error: eArsip } = await db.from("sigap_tes_sesi_arsip").upsert(
    {
      sesi_id: sesi.id,
      tes_id: sesi.tes_id,
      akun_id: sesi.akun_id,
      percobaan: sesi.percobaan,
      mulai_at: sesi.mulai_at,
      batas_at: sesi.batas_at,
      selesai_at: sesi.selesai_at,
      jawaban: sesi.jawaban ?? {},
      skor: sesi.skor,
      benar: sesi.benar,
      total: sesi.total,
    },
    { onConflict: "sesi_id,percobaan", ignoreDuplicates: true }
  );
  if (eArsip) return { ok: false, pesan: eArsip.message, status: 500 };
  // 2) reset baris sesi utk percobaan baru
  const lama = sesi.skor_terbaik != null ? Number(sesi.skor_terbaik) : null;
  const baru = sesi.skor != null ? Number(sesi.skor) : null;
  const terbaik = lama === null ? baru : baru === null ? lama : Math.max(lama, baru);
  const batas = hitungBatas(sekarang, tes.durasi_menit, tes.tutup_at);
  const { data, error } = await db
    .from("sigap_tes_sesi")
    .update({
      percobaan: sesi.percobaan + 1,
      skor_terbaik: terbaik,
      mulai_at: sekarang.toISOString(),
      batas_at: batas.toISOString(),
      selesai_at: null,
      jawaban: {},
      skor: null,
      benar: null,
      total: null,
      diubah_at: sekarang.toISOString(),
    })
    .eq("id", sesi.id)
    .eq("percobaan", sesi.percobaan)
    .not("selesai_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, pesan: error.message, status: 500 };
  // data null = permintaan lain sudah mereset lebih dulu (klik ganda) -> anggap berhasil, klien akan memuat keadaan terbaru
  void data;
  return { ok: true };
}

/**
 * (8 Okt 2026) Peserta tambahan manual dari tab Administrasi (sigap_penugasan.sumber = 'administrasi') HANYA untuk
 * administrasi (SPJ translok, daftar hadir, laporan): tidak ikut tes, kuis, presensi, maupun monitoring peserta.
 * Semua query "peserta pelatihan" memakai FILTER_BUKAN_ADMINISTRASI (sumber boleh null).
 */
export const SUMBER_ADMINISTRASI = "administrasi";
export const FILTER_BUKAN_ADMINISTRASI = `sumber.is.null,sumber.neq.${SUMBER_ADMINISTRASI}`;

/** Peserta pelatihan = akun dengan penugasan aktif pada kegiatan pelatihan (kecuali peserta tambahan manual administrasi). */
export async function pesertaPelatihan(db: Db, akunId: number, kegiatanId: number): Promise<{ penugasan_id: number; peran: string; kelas: number | null } | null> {
  const { data } = await db.from("sigap_penugasan").select("id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).maybeSingle();
  if (!data) return null;
  return { penugasan_id: data.id as number, peran: data.peran as string, kelas: (data.kelas as number | null) ?? null };
}

// ---------------------------------------------------------------------------------------------
// (7 Okt 2026) Langkah Pelatihan -- catatan "undangan dibuka" & "instrumen diunduh" + hitung foto transport lokal.
// ---------------------------------------------------------------------------------------------
export const JUMLAH_FOTO_TRANSLOK = 5;

/** Catat sebuah langkah (idempoten; yang pertama menang). Kegagalan dicatat diam-diam: tidak boleh menghalangi alur utama. */
export async function catatLangkah(db: Db, akunId: number, kegiatanId: number, kode: "undangan" | "instrumen" | "akses"): Promise<void> {
  await db.from("sigap_pelatihan_langkah").upsert({ akun_id: akunId, kegiatan_id: kegiatanId, kode }, { onConflict: "akun_id,kegiatan_id,kode", ignoreDuplicates: true });
}

export type LangkahPeserta = { sudah_akses: boolean; undangan_dibuka: boolean; instrumen_diunduh: boolean; foto: number; foto_total: number; slot: number[] };

export async function muatLangkah(db: Db, akunId: number, kegiatanId: number, penugasanId: number, tanggalIso: string): Promise<LangkahPeserta> {
  const [{ data: l }, { data: f }, { data: k }] = await Promise.all([
    db.from("sigap_pelatihan_langkah").select("kode").eq("akun_id", akunId).eq("kegiatan_id", kegiatanId),
    db.from("sigap_dokumentasi").select("slot").eq("kegiatan_id", kegiatanId).eq("penugasan_id", penugasanId).eq("tanggal", tanggalIso),
    db.from("sigap_kegiatan").select("jumlah_foto").eq("id", kegiatanId).maybeSingle(),
  ]);
  const kode = new Set((l ?? []).map((x) => x.kode as string));
  const total = Number(k?.jumlah_foto) > 0 ? Number(k?.jumlah_foto) : JUMLAH_FOTO_TRANSLOK;
  const slot = [...new Set((f ?? []).map((x) => x.slot as number))].filter((x) => x >= 1 && x <= total).sort((a, b) => a - b);
  return { sudah_akses: kode.has("akses"), undangan_dibuka: kode.has("undangan"), instrumen_diunduh: kode.has("instrumen"), foto: slot.length, foto_total: total, slot };
}

// ---------------------------------------------------------------------------------------------
// (7 Okt 2026) Presensi di lokasi pelatihan.
// ---------------------------------------------------------------------------------------------
export async function muatPengaturanPresensi(db: Db, kegiatanId: number): Promise<PengaturanPresensi | null> {
  const [{ data }, { data: titik }, { data: keg }] = await Promise.all([
    db.from("sigap_pelatihan_pengaturan").select("*").eq("kegiatan_id", kegiatanId).maybeSingle(),
    db.from("sigap_pelatihan_titik").select("nama, lat, lng, radius_m").eq("kegiatan_id", kegiatanId).eq("aktif", true).order("urut").order("id"),
    db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle(),
  ]);
  if (!data) return null;
  const buka = data.presensi_buka_at as string;
  const tutup = data.presensi_tutup_at as string;
  // (8 Okt 2026) aturan sesi: bila belum pernah disimpan dalam bentuk sesi, turunkan dari jam buka/tutup lama (1 sesi)
  const cek = validasiSesi(data.presensi_sesi);
  const sesi: AturanSesi[] = cek.ok ? cek.sesi : aturanDariJamLama(buka, tutup);
  const hari = hariKegiatan((keg?.tanggal_mulai as string | null) ?? null, (keg?.tanggal_selesai as string | null) ?? null, tanggalWib(new Date(buka).getTime()));
  const jadwal = jadwalSesi(sesi, hari);
  return {
    titik: (titik ?? []).map((t) => ({ nama: t.nama as string, lat: Number(t.lat), lng: Number(t.lng), radius_m: Number(t.radius_m) })),
    buka_at: jadwal[0]?.buka_at ?? buka,
    tutup_at: jadwal[0]?.tutup_at ?? tutup,
    akurasi_maks_m: Number(data.akurasi_maks_m),
    tempat: (data.tempat as string | null) ?? null,
    sesi,
    hari,
    jadwal,
    susulan_sampai: (data.presensi_susulan_sampai as string | null | undefined) ?? null,
  };
}

/**
 * (8 Okt 2026) Isian awal pengaturan presensi untuk kegiatan yang belum pernah disimpan: 1 sesi 06.00-18.00 di hari kegiatan,
 * akurasi 100 m, titik lokasi disalin dari pengaturan kegiatan pelatihan lain terakhir (bila ada). Tidak menyimpan apa pun.
 */
export async function bawaanPengaturanPresensi(db: Db, kegiatanId: number): Promise<PengaturanPresensi> {
  const [{ data: keg }, { data: lain }] = await Promise.all([
    db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai, nama").eq("id", kegiatanId).maybeSingle(),
    db.from("sigap_pelatihan_titik").select("kegiatan_id, nama, lat, lng, radius_m").neq("kegiatan_id", kegiatanId).eq("aktif", true).order("kegiatan_id", { ascending: false }).order("urut").limit(10),
  ]);
  const hariIni = tanggalWib(Date.now());
  const hari = hariKegiatan((keg?.tanggal_mulai as string | null) ?? null, (keg?.tanggal_selesai as string | null) ?? null, hariIni);
  const sesi = SESI_BAWAAN.map((x) => ({ ...x }));
  const jadwal = jadwalSesi(sesi, hari);
  const idLain = (lain ?? [])[0]?.kegiatan_id;
  return {
    titik: (lain ?? []).filter((t) => t.kegiatan_id === idLain).map((t) => ({ nama: t.nama as string, lat: Number(t.lat), lng: Number(t.lng), radius_m: Number(t.radius_m) })),
    buka_at: jadwal[0].buka_at,
    tutup_at: jadwal[0].tutup_at,
    akurasi_maks_m: 100,
    tempat: null,
    sesi,
    hari,
    jadwal,
  };
}

export type PresensiPeserta = { sudah: boolean; at: string | null; jarak_m: number | null; manual: boolean; titik_nama: string | null };

/** (8 Okt 2026) Semua presensi DITERIMA seorang peserta (satu per sesi per hari), urut waktu. */
export async function muatRekamPresensi(db: Db, kegiatanId: number, akunId: number): Promise<RekamPresensi[]> {
  const { data } = await db.from("sigap_pelatihan_presensi").select("tanggal, sesi_no, at, jarak_m, manual, titik_nama, terlambat").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("diterima", true).order("at", { ascending: true }).limit(200);
  return (data ?? []).map((r) => ({
    tanggal: String(r.tanggal ?? "").slice(0, 10),
    sesi_no: Number(r.sesi_no ?? 1),
    at: r.at as string,
    jarak_m: r.jarak_m != null ? Number(r.jarak_m) : null,
    manual: !!r.manual,
    titik_nama: (r.titik_nama as string | null | undefined) ?? null,
    terlambat: !!r.terlambat,
  }));
}
