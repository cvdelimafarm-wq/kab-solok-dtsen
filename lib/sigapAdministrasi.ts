// lib/sigapAdministrasi.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > tab Administrasi (permintaan user; mockup disetujui).
// Panitia/instruktur kelas: memantau pengisian Transport Lokal peserta, mencetak SPJ (6 jenis) untuk banyak
// petugas sekaligus, menambah peserta manual (Mitra + organik), dan mencetak kelengkapan pelatihan
// (Daftar Hadir, Form Daftar Hadir TTD basah, Laporan Pelatihan, Laporan Pelatihan Instruktur).
//
// Aturan:
//  - SPJ memakai mesin yang sama dengan Admin Transport Lokal (lib/sigapDokumen.ts: buatSpjPdf) -- tidak ada
//    perhitungan hari/nominal baru; angka & berkas beku (setelah dikunci) otomatis konsisten.
//  - Cakupan data: akun yang HANYA berperan Instruktur Pelatihan = kelas miliknya (sigap_kuis_instruktur_kelas);
//    peran lain yang punya izin menu (Admin Anggaran, PJ Kegiatan, Admin Aplikasi, Bendahara, Panitia Pelatihan) = semua kelas.
//  - Peserta manual = sigap_penugasan.sumber = 'administrasi' (tidak ikut tes/kuis/presensi; lihat SUMBER_ADMINISTRASI).

import type { Db } from "@/lib/sigap";
import { HK_AKTIF, aturanDari, hariIniWib, hariLengkap } from "@/lib/sigap";
import { GalatSpj, URUTAN_JENIS, buatSpjPdf, gabungkanUnit, type JenisDok } from "@/lib/sigapDokumen";
import { buatZip } from "@/lib/pdf/sigap/zip";
import {
  buatPdfDaftarHadir,
  buatPdfFormDaftarHadir,
  buatPdfLaporanInstruktur,
  buatPdfLaporanPelatihan,
  type DataLaporan,
  type InfoKelas,
  type PesertaHadir,
  type RingkasTes,
} from "@/lib/pdf/sigap/pelatihan";
import { formatTanggalIndo } from "@/lib/pdf/sigap/format";
import type { PeranAkun } from "@/lib/sigapAkses";
import { LABEL_JENIS_TES, UNDANGAN, type SesiBaris } from "@/lib/sigapTes";
import { FILTER_BUKAN_ADMINISTRASI, SUMBER_ADMINISTRASI, finalisasiBilaKedaluwarsa, muatPengaturanPresensi, muatSoal, muatTesDaftar } from "@/lib/sigapTesDb";

// Penanda peserta tambahan manual (SUMBER_ADMINISTRASI) & filternya didefinisikan di lib/sigapTesDb.ts
// (dipakai semua query peserta tes/presensi/monitoring); diekspor ulang di sini untuk kemudahan.
export { SUMBER_ADMINISTRASI, FILTER_BUKAN_ADMINISTRASI };

export const SEMUA_KELAS = [1, 2, 3, 4];
export const PERAN_PESERTA = ["ppl", "pml", "korwil"] as const;

/** Jenis dokumen kelengkapan pelatihan (selain 6 jenis SPJ). */
export type JenisPelatihan = "daftar_hadir" | "form_hadir" | "laporan_pelatihan" | "laporan_instruktur";
export const URUTAN_PELATIHAN: JenisPelatihan[] = ["daftar_hadir", "form_hadir", "laporan_pelatihan", "laporan_instruktur"];
export type JenisCetak = JenisDok | JenisPelatihan;

export type StatusTranslok = "belum" | "draft" | "sudah" | "terverifikasi";

// ----------------------------------------------------------------------------------------------
// Cakupan kelas
// ----------------------------------------------------------------------------------------------
export type Cakupan = { semua: boolean; kelas: number[]; bawaan: number | null };

export async function cakupanKelas(db: Db, akunId: number, peran: PeranAkun[], kegiatanId: number): Promise<Cakupan> {
  const berlaku = peran.filter((p) => p.kegiatan_id == null || p.kegiatan_id === kegiatanId);
  const semua = berlaku.some((p) => p.kode !== "instruktur_pelatihan");
  const { data } = await db.from("sigap_kuis_instruktur_kelas").select("kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
  const miliknya = (data?.kelas as number | undefined) ?? null;
  const kelas = semua ? SEMUA_KELAS : miliknya ? [miliknya] : [];
  return { semua, kelas, bawaan: miliknya ?? kelas[0] ?? null };
}

// ----------------------------------------------------------------------------------------------
// Peserta + status pengisian Transport Lokal
// ----------------------------------------------------------------------------------------------
export type BarisPeserta = {
  penugasan_id: number;
  akun_id: number;
  nama: string;
  jenis_akun: string;
  peran: string;
  kelas: number;
  manual: boolean;
  status: StatusTranslok;
  hari: number;
  hari_lengkap: number;
  foto: number;
  foto_total: number;
  nominal: number;
};

export async function muatPeserta(db: Db, kegiatanId: number, kelas: number): Promise<BarisPeserta[]> {
  const { data: pen } = await db
    .from("sigap_penugasan")
    .select("id, akun_id, peran, kelas, sumber, dikunci_at")
    .eq("kegiatan_id", kegiatanId)
    .eq("kelas", kelas)
    .eq("aktif", true)
    .limit(2000);
  if (!pen || pen.length === 0) return [];
  const ids = pen.map((p) => p.id as number);
  const akunIds = pen.map((p) => p.akun_id as number);
  const [{ data: ak }, { data: keg }, { data: tarif }, { data: hk }, { data: real }, { data: dok }, { data: izin }] = await Promise.all([
    db.from("sigap_akun").select("id, nama, jenis").in("id", akunIds).limit(2000),
    db.from("sigap_kegiatan").select("id, jenis, wajib_laporan, jumlah_foto").eq("id", kegiatanId).maybeSingle(),
    db.from("sigap_kegiatan_tarif").select("peran, tarif").eq("kegiatan_id", kegiatanId),
    db.from("sigap_hari_kerja").select("penugasan_id, tanggal").in("penugasan_id", ids).or(HK_AKTIF()).limit(5000),
    db.from("sigap_realisasi").select("penugasan_id, tanggal").in("penugasan_id", ids).limit(5000),
    db.from("sigap_dokumentasi").select("penugasan_id, tanggal, slot").in("penugasan_id", ids).limit(20000),
    db.from("sigap_izin_susulan").select("penugasan_id, tanggal, berlaku_sampai").in("penugasan_id", ids).limit(5000),
  ]);
  const aturan = aturanDari(keg);
  const hariIni = hariIniWib();
  const sekarang = Date.now();
  const nama = new Map((ak ?? []).map((a) => [a.id as number, { nama: String(a.nama ?? ""), jenis: String(a.jenis ?? "mitra") }]));
  const tarifPeran = new Map((tarif ?? []).map((t) => [String(t.peran), Number(t.tarif ?? 0)]));
  const tgl = (v: unknown) => String(v).slice(0, 10);

  const hasil: BarisPeserta[] = pen.map((p) => {
    const pid = p.id as number;
    const tanggal = Array.from(new Set((hk ?? []).filter((h) => h.penugasan_id === pid).map((h) => tgl(h.tanggal)))).sort();
    let lengkapN = 0;
    let dibayarN = 0;
    let adaIsian = false;
    let fotoMaks = 0;
    for (const t of tanggal) {
      const adaReal = (real ?? []).some((r) => r.penugasan_id === pid && tgl(r.tanggal) === t);
      const slot = new Set((dok ?? []).filter((d) => d.penugasan_id === pid && tgl(d.tanggal) === t).map((d) => d.slot as number));
      const lengkap = hariLengkap(adaReal, slot.size, aturan);
      const izinAktif = (izin ?? []).some((x) => x.penugasan_id === pid && tgl(x.tanggal) === t && new Date(String(x.berlaku_sampai)).getTime() > sekarang);
      if (lengkap) lengkapN++;
      if (t >= hariIni || lengkap || izinAktif) dibayarN++;
      if (adaReal || slot.size > 0) adaIsian = true;
      fotoMaks = Math.max(fotoMaks, slot.size);
    }
    const status: StatusTranslok = p.dikunci_at ? "terverifikasi" : tanggal.length > 0 && lengkapN === tanggal.length ? "sudah" : adaIsian ? "draft" : "belum";
    const a = nama.get(p.akun_id as number);
    return {
      penugasan_id: pid,
      akun_id: p.akun_id as number,
      nama: a?.nama ?? "?",
      jenis_akun: a?.jenis ?? "mitra",
      peran: String(p.peran),
      kelas,
      manual: p.sumber === SUMBER_ADMINISTRASI,
      status,
      hari: tanggal.length,
      hari_lengkap: lengkapN,
      foto: fotoMaks,
      foto_total: aturan.jumlah_foto,
      nominal: dibayarN * (tarifPeran.get(String(p.peran)) ?? 0),
    };
  });
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama));
}

// ----------------------------------------------------------------------------------------------
// Data kelas (daftar hadir & laporan)
// ----------------------------------------------------------------------------------------------
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const p2 = (n: number) => String(n).padStart(2, "0");
function wibTeks(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${p2(d.getUTCHours())}.${p2(d.getUTCMinutes())}`;
}
const jamWib = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};

async function infoKelas(db: Db, kegiatanId: number, kelas: number): Promise<InfoKelas> {
  const [{ data: keg }, pengaturan, { data: ins }] = await Promise.all([
    db.from("sigap_kegiatan").select("kode, nama").eq("id", kegiatanId).maybeSingle(),
    muatPengaturanPresensi(db, kegiatanId),
    db.from("sigap_kuis_instruktur_kelas").select("akun_id").eq("kegiatan_id", kegiatanId).eq("kelas", kelas),
  ]);
  const idIns = (ins ?? []).map((x) => x.akun_id as number);
  const { data: ak } = idIns.length ? await db.from("sigap_akun").select("id, nama").in("id", idIns) : { data: [] as Record<string, unknown>[] };
  return {
    kegiatanNama: String(keg?.nama ?? "Pelatihan"),
    kegiatanKode: String(keg?.kode ?? "SIGAP"),
    kelas,
    tanggal: UNDANGAN.tanggal_iso,
    tempat: pengaturan?.tempat || UNDANGAN.tempat,
    instruktur: (ak ?? []).map((a) => String(a.nama ?? "")).filter(Boolean),
  };
}

/** Presensi diterima per akun -> jam WIB. */
async function presensiPer(db: Db, kegiatanId: number, akunIds: number[]): Promise<Map<number, { jam: string; manual: boolean }>> {
  const peta = new Map<number, { jam: string; manual: boolean }>();
  if (akunIds.length === 0) return peta;
  const { data } = await db.from("sigap_pelatihan_presensi").select("akun_id, at, manual").eq("kegiatan_id", kegiatanId).eq("diterima", true).in("akun_id", akunIds).limit(5000);
  for (const r of data ?? []) peta.set(r.akun_id as number, { jam: jamWib(String(r.at)), manual: !!r.manual });
  return peta;
}

export async function dataDaftarHadir(db: Db, kegiatanId: number, kelas: number, peserta: BarisPeserta[]): Promise<{ info: InfoKelas; baris: PesertaHadir[] }> {
  const [info, pres] = await Promise.all([infoKelas(db, kegiatanId, kelas), presensiPer(db, kegiatanId, peserta.map((p) => p.akun_id))]);
  return {
    info,
    baris: peserta.map((p) => {
      const x = pres.get(p.akun_id);
      return { nama: p.nama, peran: p.peran, jenis: p.jenis_akun, hadir: !!x, jam: x?.jam ?? null, manual: !!x?.manual };
    }),
  };
}

export type NarasiLaporan = { ringkasan: string | null; kendala: string | null; catatan: string | null };

export async function muatNarasi(db: Db, kegiatanId: number, kelas: number): Promise<{ pelatihan: NarasiLaporan; instruktur: NarasiLaporan }> {
  const kosong: NarasiLaporan = { ringkasan: null, kendala: null, catatan: null };
  const { data } = await db.from("sigap_pelatihan_laporan").select("jenis, ringkasan, kendala, catatan").eq("kegiatan_id", kegiatanId).eq("kelas", kelas);
  const ambil = (j: string): NarasiLaporan => {
    const r = (data ?? []).find((x) => x.jenis === j);
    return r ? { ringkasan: (r.ringkasan as string | null) ?? null, kendala: (r.kendala as string | null) ?? null, catatan: (r.catatan as string | null) ?? null } : { ...kosong };
  };
  return { pelatihan: ambil("pelatihan"), instruktur: ambil("instruktur") };
}

/** Angka laporan satu kelas: dihitung dari peserta kelas (tanpa peserta manual). */
export async function dataLaporan(db: Db, kegiatanId: number, kelas: number, jenis: "pelatihan" | "instruktur"): Promise<DataLaporan> {
  const semua = await muatPeserta(db, kegiatanId, kelas);
  const inti = semua.filter((p) => !p.manual);
  const akunIds = inti.map((p) => p.akun_id);
  const [info, pres, narasi, daftarTes] = await Promise.all([infoKelas(db, kegiatanId, kelas), presensiPer(db, kegiatanId, akunIds), muatNarasi(db, kegiatanId, kelas), muatTesDaftar(db, kegiatanId)]);
  const sekarang = new Date();
  const skorPer = new Map<number, Map<number, number>>(); // tes_id -> akun_id -> skor
  const tes: RingkasTes[] = [];
  for (const t of daftarTes) {
    const soal = await muatSoal(db, t.id);
    const { data } = akunIds.length
      ? await db.from("sigap_tes_sesi").select("id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, diubah_at").eq("tes_id", t.id).in("akun_id", akunIds).limit(5000)
      : { data: [] as SesiBaris[] };
    const skor = new Map<number, number>();
    for (const s0 of (data ?? []) as SesiBaris[]) {
      const s = await finalisasiBilaKedaluwarsa(db, s0, soal, sekarang);
      if (s.selesai_at && s.skor !== null && s.skor !== undefined) skor.set(s.akun_id, Number(s.skor));
    }
    skorPer.set(t.id, skor);
    const nilai = [...skor.values()];
    tes.push({
      judul: LABEL_JENIS_TES[t.jenis] ?? t.judul,
      buka: wibTeks(t.buka_at),
      tutup: wibTeks(t.tutup_at),
      peserta: inti.length,
      selesai: nilai.length,
      rata: nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null,
      tertinggi: nilai.length ? Math.max(...nilai) : null,
      terendah: nilai.length ? Math.min(...nilai) : null,
    });
  }
  const pre = daftarTes.find((t) => t.jenis === "pretest");
  const post = daftarTes.find((t) => t.jenis === "posttest");
  let kenaikan: number | null = null;
  if (pre && post) {
    const a = skorPer.get(pre.id) ?? new Map();
    const b = skorPer.get(post.id) ?? new Map();
    const selisih = [...a.keys()].filter((id) => b.has(id)).map((id) => (b.get(id) as number) - (a.get(id) as number));
    if (selisih.length) kenaikan = selisih.reduce((x, y) => x + y, 0) / selisih.length;
  }
  const n = narasi[jenis];
  return {
    info,
    jumlahPeserta: inti.length,
    hadir: inti.filter((p) => pres.has(p.akun_id)).length,
    tes,
    kenaikanRata: kenaikan,
    ringkasan: n.ringkasan,
    kendala: n.kendala,
    catatan: n.catatan,
    tanggalCetak: `Solok, ${formatTanggalIndo(hariIniWib())}`,
  };
}

// ----------------------------------------------------------------------------------------------
// Cetak
// ----------------------------------------------------------------------------------------------
const aman = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";

/** Pisahkan daftar kode jenis dari query string menjadi jenis SPJ & jenis pelatihan (urutan baku, yang tidak dikenal dibuang). */
export function parseJenisCetak(raw: string | null | undefined): { spj: JenisDok[]; pelatihan: JenisPelatihan[] } {
  const set = new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return { spj: URUTAN_JENIS.filter((j) => set.has(j)), pelatihan: URUTAN_PELATIHAN.filter((j) => set.has(j)) };
}

export async function buatCetak(
  db: Db,
  kegiatanId: number,
  kelas: number,
  petugas: BarisPeserta[],
  jenis: { spj: JenisDok[]; pelatihan: JenisPelatihan[] },
  format: "gabungan" | "zip"
): Promise<{ bytes: Uint8Array; namaFile: string; contentType: string; dilewati: string[] }> {
  if (petugas.length === 0) throw new GalatSpj("Pilih minimal 1 petugas.", 400);
  if (jenis.spj.length + jenis.pelatihan.length === 0) throw new GalatSpj("Pilih minimal 1 jenis dokumen.", 400);
  const unit: { nama: string; bytes: Uint8Array }[] = [];
  const dilewati: string[] = [];
  const k = `Kelas${kelas}`;

  if (jenis.pelatihan.includes("daftar_hadir")) {
    const d = await dataDaftarHadir(db, kegiatanId, kelas, petugas);
    unit.push({ nama: `Daftar_Hadir_${k}.pdf`, bytes: await buatPdfDaftarHadir(d.info, d.baris) });
  }
  if (jenis.pelatihan.includes("form_hadir")) {
    const info = await infoKelas(db, kegiatanId, kelas);
    unit.push({ nama: `Form_Daftar_Hadir_TTD_${k}.pdf`, bytes: await buatPdfFormDaftarHadir(info, petugas.map((p) => ({ nama: p.nama, peran: p.peran, jenis: p.jenis_akun }))) });
  }
  if (jenis.pelatihan.includes("laporan_pelatihan")) unit.push({ nama: `Laporan_Pelatihan_${k}.pdf`, bytes: await buatPdfLaporanPelatihan(await dataLaporan(db, kegiatanId, kelas, "pelatihan")) });
  if (jenis.pelatihan.includes("laporan_instruktur")) unit.push({ nama: `Laporan_Pelatihan_Instruktur_${k}.pdf`, bytes: await buatPdfLaporanInstruktur(await dataLaporan(db, kegiatanId, kelas, "instruktur")) });

  if (jenis.spj.length > 0) {
    let no = 0;
    for (const p of petugas) {
      no++;
      try {
        const r = await buatSpjPdf(db, p.penugasan_id, { jenis: jenis.spj, format: "gabungan" });
        unit.push({ nama: `${String(no).padStart(2, "0")}_SPJ_${aman(p.nama)}.pdf`, bytes: r.bytes });
        for (const d of r.dilewati) dilewati.push(`${p.nama}: ${d}`);
      } catch (e) {
        if (e instanceof GalatSpj) dilewati.push(`${p.nama}: ${e.message}`);
        else throw e;
      }
    }
  }

  if (unit.length === 0) throw new GalatSpj(`Belum ada dokumen yang bisa dibuat. ${dilewati.slice(0, 3).join(" ")}`.trim(), 404);
  const dasar = `Administrasi_Pelatihan_${k}_${petugas.length}petugas`;
  if (format === "zip") {
    const files = unit.map((u) => ({ nama: u.nama, data: u.bytes }));
    if (dilewati.length > 0) files.push({ nama: "_dokumen_dilewati.txt", data: new TextEncoder().encode("Dokumen berikut TIDAK disertakan karena datanya belum ada:\r\n\r\n" + dilewati.join("\r\n") + "\r\n") });
    return { bytes: buatZip(files), namaFile: `${dasar}.zip`, contentType: "application/zip", dilewati };
  }
  return { bytes: await gabungkanUnit(unit, dilewati), namaFile: `${dasar}.pdf`, contentType: "application/pdf", dilewati };
}
