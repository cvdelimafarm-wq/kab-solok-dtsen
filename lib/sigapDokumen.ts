// lib/sigapDokumen.ts
//
// (5 Okt 2026) SIGAP Transport Lokal -- perakit dokumen SPJ (permintaan user). 6 dokumen spt modul
// penyisiran: Surat Tugas (file unggahan admin), Kwitansi, Visum, Surat Pernyataan Kendaraan Dinas,
// Laporan, Dokumentasi.
//
// Aturan (keputusan user):
//  - Kwitansi/Visum/Surat Pernyataan dibuat per KELOMPOK TANGGAL (hari dibayar yg berurutan digabung,
//    kelompokTanggal() di lib/sigap.ts). Hari dibayar = hari kerja yg (a) lengkap (realisasi + 5 foto),
//    (b) tanggal >= hari ini WIB, atau (c) punya izin susulan aktif. Hari lampau tidak lengkap TIDAK masuk.
//    Nominal = jumlah hari x tarif peran. Rumus SAMA dgn app/api/sigap/translok/[token]/route.ts.
//  - Dokumen TIDAK disimpan sbg file: dirakit dari data saat diminta. KECUALI setelah admin mengunci
//    (sigap_penugasan.dikunci_at): bekukanSpj() menyimpan PDF sekali ke storage + baris
//    sigap_dokumen_final; sesudah terkunci, unduhan gabungan lengkap memakai file beku itu.
//  - Selama terkunci, perakitan dari data memakai ACUAN waktu kunci (bukan "sekarang"), supaya hari
//    yg dibayar tidak berubah hanya karena hari berganti setelah dikunci.
//  - Laporan = template dari isian harian (lokasi, jumlah {satuan}, kendala) -- tanpa angka karangan.
//  - Dokumentasi = foto slot 1-5 per hari dari bucket sigap-files.
//  - Nomor kwitansi/visum = nomor ST; tujuan = sigap_surat_tugas.tujuan (fallback kecamatan lokasi
//    realisasi); tempat kedudukan = sigap_akun.alamat_kecamatan (fallback "Solok"); NIK utk mitra,
//    NIP utk organik; label jabatan = sigap_kegiatan_tarif.label_jabatan; nama kegiatan dari
//    sigap_kegiatan.nama.
// Generator PDF ada di lib/pdf/sigap/* (salinan terparameter dari generator penyisiran -- file
// penyisiran lib/pdf/*.ts TIDAK diubah).

import { PDFDocument } from "pdf-lib";
import { BUCKET_SIGAP, aturanDari, hariLengkap, hariIniWib, kelompokTanggal, type AturanIsian, type Db, HK_AKTIF } from "@/lib/sigap";
import { buatPdfKwitansiSigap } from "@/lib/pdf/sigap/kwitansi";
import { buatPdfVisumSigap } from "@/lib/pdf/sigap/visum";
import { buatPdfSuratPernyataanSigap } from "@/lib/pdf/sigap/suratPernyataan";
import { buatPdfLaporanSigap } from "@/lib/pdf/sigap/laporan";
import { buatPdfDokumentasiSigap, type SigapFotoInput } from "@/lib/pdf/sigap/dokumentasi";
import { buatZip } from "@/lib/pdf/sigap/zip";
import { judulKecamatan } from "@/lib/pdf/sigap/format";

// ----------------------------------------------------------------------------------------------
export type JenisDok = "surat_tugas" | "kwitansi" | "visum" | "laporan" | "dokumentasi" | "surat_pernyataan";

/** Urutan baku di PDF gabungan (per kelompok: kwitansi, visum, surat pernyataan, lalu laporan & dokumentasi per hari). */
export const URUTAN_JENIS: JenisDok[] = ["surat_tugas", "kwitansi", "visum", "surat_pernyataan", "laporan", "dokumentasi"];

export const LABEL_JENIS: Record<JenisDok, string> = {
  surat_tugas: "Surat Tugas",
  kwitansi: "Kwitansi",
  visum: "Visum",
  surat_pernyataan: "Surat Pernyataan Kendaraan Dinas",
  laporan: "Laporan",
  dokumentasi: "Dokumentasi",
};

/** Jenis yg dibekukan ke sigap_dokumen_final (Surat Tugas tidak: itu file unggahan admin). */
const JENIS_BEKU: Exclude<JenisDok, "surat_tugas">[] = ["kwitansi", "visum", "surat_pernyataan", "laporan", "dokumentasi"];

/** Galat dgn status HTTP, supaya route bisa membalas 400/404 yg tepat. */
export class GalatSpj extends Error {
  status: number;
  constructor(pesan: string, status = 400) {
    super(pesan);
    this.status = status;
  }
}

/** Ubah daftar mentah (mis. dari query string) jadi daftar jenis valid berurutan baku. */
export function parseJenis(raw: string | null | undefined): JenisDok[] {
  if (!raw || raw === "semua") return [...URUTAN_JENIS];
  const set = new Set(raw.split(",").map((s) => s.trim()));
  return URUTAN_JENIS.filter((j) => set.has(j));
}

// ----------------------------------------------------------------------------------------------
type LokasiRealisasi = { kecamatan: string | null; nagari: string | null; jorong: string | null; idsubsls?: string | null };

export type HariSpj = {
  tanggal: string;
  realisasi: { lokasi: LokasiRealisasi[]; jumlah_realisasi: number; kendala: string | null } | null;
  foto: { slot: number; file_path: string }[];
  izinAktif: boolean;
  lengkap: boolean;
  dibayar: boolean;
};

export type KelompokSpj = { mulai: string; selesai: string; jumlah_hari: number; tanggal: string[]; nominal: number };

export type DataSpj = {
  penugasan: { id: number; kegiatan_id: number; akun_id: number; peran: string; dikunci_at: string | null; dikunci_oleh: string | null };
  akun: { id: number; nama: string; jenis: "mitra" | "organik"; nik: string | null; nip: string | null; alamat_kecamatan: string | null };
  kegiatan: { id: number; kode: string; nama: string; kode_anggaran: string | null; satuan_realisasi: string } & AturanIsian;
  tarif: number;
  label_jabatan: string;
  suratTugas: { id: number; nomor_st: string; tanggal_st: string | null; tujuan: string[]; file_path: string | null } | null;
  /** Acuan waktu penentuan hari dibayar: saat ini, atau waktu kunci bila sudah dikunci. */
  acuan: { hariIni: string; waktu: string; dariKunci: boolean };
  hari: HariSpj[];
  kelompok: KelompokSpj[];
  totalNominal: number;
  final: { jenis: string; file_path: string; tanggal_mulai: string | null; tanggal_selesai: string | null; nominal: number | null; difinalkan_at: string }[];
};

/** Kumpulkan semua data SPJ satu penugasan (akun, kegiatan, tarif, ST, hari kerja, realisasi, foto, izin, kelompok dibayar). */
export async function dataSpj(db: Db, penugasanId: number): Promise<DataSpj> {
  if (!Number.isInteger(penugasanId) || penugasanId <= 0) throw new GalatSpj("penugasan_id tidak valid.", 400);
  const { data: pen } = await db
    .from("sigap_penugasan")
    .select("id, kegiatan_id, akun_id, peran, surat_tugas_id, dikunci_at, dikunci_oleh")
    .eq("id", penugasanId)
    .maybeSingle();
  if (!pen) throw new GalatSpj("Penugasan tidak ditemukan.", 404);

  const stQuery = pen.surat_tugas_id
    ? db.from("sigap_surat_tugas").select("id, nomor_st, tanggal_st, tujuan, file_path").eq("id", pen.surat_tugas_id).maybeSingle()
    : db.from("sigap_surat_tugas").select("id, nomor_st, tanggal_st, tujuan, file_path").eq("penugasan_id", penugasanId).order("id", { ascending: false }).limit(1).maybeSingle();

  const [{ data: akun }, { data: keg }, { data: tarif }, { data: st }, { data: hk }, { data: real }, { data: foto }, { data: izin }, { data: final }] = await Promise.all([
    db.from("sigap_akun").select("id, nama, jenis, nik, nip, alamat_kecamatan").eq("id", pen.akun_id).maybeSingle(),
    db.from("sigap_kegiatan").select("id, kode, nama, kode_anggaran, satuan_realisasi, jenis, wajib_laporan, jumlah_foto").eq("id", pen.kegiatan_id).maybeSingle(),
    db.from("sigap_kegiatan_tarif").select("tarif, label_jabatan").eq("kegiatan_id", pen.kegiatan_id).eq("peran", pen.peran).maybeSingle(),
    stQuery,
    db.from("sigap_hari_kerja").select("tanggal").eq("penugasan_id", penugasanId).or(HK_AKTIF()), // (6 Okt 2026) hari uji coba kedaluwarsa diabaikan
    db.from("sigap_realisasi").select("tanggal, lokasi, jumlah_realisasi, kendala").eq("penugasan_id", penugasanId),
    db.from("sigap_dokumentasi").select("tanggal, slot, file_path").eq("penugasan_id", penugasanId),
    db.from("sigap_izin_susulan").select("tanggal, berlaku_sampai").eq("penugasan_id", penugasanId),
    db.from("sigap_dokumen_final").select("jenis, file_path, tanggal_mulai, tanggal_selesai, nominal, difinalkan_at").eq("penugasan_id", penugasanId),
  ]);
  if (!akun) throw new GalatSpj("Akun petugas tidak ditemukan.", 404);
  if (!keg) throw new GalatSpj("Kegiatan tidak ditemukan.", 404);

  const dikunciAt = (pen.dikunci_at as string | null) ?? null;
  const acuanWaktu = dikunciAt ? new Date(dikunciAt) : new Date();
  const acuan = { hariIni: hariIniWib(acuanWaktu), waktu: acuanWaktu.toISOString(), dariKunci: !!dikunciAt };

  const tarifNum = Number(tarif?.tarif ?? 0);
  const aturan = aturanDari(keg); // (7 Okt 2026) wajib laporan & jumlah foto per kegiatan
  const tanggalKerja = Array.from(new Set((hk ?? []).map((h) => String(h.tanggal).slice(0, 10)))).sort();
  const hari: HariSpj[] = tanggalKerja.map((t) => {
    const r = (real ?? []).find((x) => String(x.tanggal).slice(0, 10) === t);
    const f = (foto ?? [])
      .filter((x) => String(x.tanggal).slice(0, 10) === t)
      .map((x) => ({ slot: Number(x.slot), file_path: String(x.file_path) }))
      .sort((a, b) => a.slot - b.slot);
    const izinAktif = (izin ?? []).some((x) => String(x.tanggal).slice(0, 10) === t && new Date(String(x.berlaku_sampai)).getTime() > acuanWaktu.getTime());
    const realisasi = r
      ? {
          lokasi: (Array.isArray(r.lokasi) ? (r.lokasi as LokasiRealisasi[]) : []).filter((l) => l && typeof l === "object"),
          jumlah_realisasi: Number(r.jumlah_realisasi ?? 0),
          kendala: (r.kendala as string | null) ?? null,
        }
      : null;
    const lengkap = hariLengkap(!!realisasi, new Set(f.map((x) => x.slot)).size, aturan);
    return { tanggal: t, realisasi, foto: f, izinAktif, lengkap, dibayar: t >= acuan.hariIni || lengkap || izinAktif };
  });
  const kelompok = kelompokTanggal(hari.filter((h) => h.dibayar).map((h) => h.tanggal)).map((k) => ({ ...k, nominal: k.jumlah_hari * tarifNum }));

  return {
    penugasan: {
      id: pen.id as number,
      kegiatan_id: pen.kegiatan_id as number,
      akun_id: pen.akun_id as number,
      peran: String(pen.peran),
      dikunci_at: dikunciAt,
      dikunci_oleh: (pen.dikunci_oleh as string | null) ?? null,
    },
    akun: {
      id: akun.id as number,
      nama: String(akun.nama ?? ""),
      jenis: akun.jenis === "organik" ? "organik" : "mitra",
      nik: (akun.nik as string | null) ?? null,
      nip: (akun.nip as string | null) ?? null,
      alamat_kecamatan: (akun.alamat_kecamatan as string | null) ?? null,
    },
    kegiatan: {
      id: keg.id as number,
      kode: String(keg.kode ?? ""),
      nama: String(keg.nama ?? ""),
      kode_anggaran: (keg.kode_anggaran as string | null) ?? null,
      satuan_realisasi: String(keg.satuan_realisasi ?? "") || "ruta",
      ...aturan,
    },
    tarif: tarifNum,
    // Fallback label SAMA dgn penugasanAkun() di lib/sigap.ts.
    label_jabatan: (tarif?.label_jabatan as string | null) || `${String(pen.peran).toUpperCase()} ${keg.nama}`,
    suratTugas: st
      ? {
          id: st.id as number,
          nomor_st: String(st.nomor_st ?? ""),
          tanggal_st: (st.tanggal_st as string | null) ?? null,
          tujuan: Array.isArray(st.tujuan) ? (st.tujuan as string[]).filter(Boolean) : [],
          file_path: (st.file_path as string | null) ?? null,
        }
      : null,
    acuan,
    hari,
    kelompok,
    totalNominal: kelompok.reduce((s, k) => s + k.nominal, 0),
    final: (final ?? []).map((f) => ({
      jenis: String(f.jenis),
      file_path: String(f.file_path),
      tanggal_mulai: (f.tanggal_mulai as string | null) ?? null,
      tanggal_selesai: (f.tanggal_selesai as string | null) ?? null,
      nominal: f.nominal == null ? null : Number(f.nominal),
      difinalkan_at: String(f.difinalkan_at),
    })),
  };
}

/** Ringkasan jumlah dokumen per jenis (utk tampilan/admin). */
export function ringkasDokumen(data: DataSpj): Record<JenisDok, number> & { nominal: number; hari_dibayar: number } {
  const hariKel = new Set(data.kelompok.flatMap((k) => k.tanggal));
  const hariDlmKel = data.hari.filter((h) => hariKel.has(h.tanggal));
  return {
    surat_tugas: data.suratTugas?.file_path ? 1 : 0,
    kwitansi: data.kelompok.length,
    visum: data.kelompok.length,
    surat_pernyataan: data.kelompok.length,
    laporan: hariDlmKel.filter((h) => h.realisasi).length,
    dokumentasi: hariDlmKel.filter((h) => h.foto.length > 0).length,
    nominal: data.totalNominal,
    hari_dibayar: hariKel.size,
  };
}

// ----------------------------------------------------------------------------------------------
export type BerkasSpj = { bytes: Uint8Array; contentType: string };
export type PemuatBerkas = (path: string) => Promise<BerkasSpj | null>;
export type UnitSpj = { jenis: JenisDok; nama: string; bytes: Uint8Array; contentType: string; kelompok: string | null };

function amanNama(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
}

/** Tujuan: ST.tujuan digabung koma; fallback kecamatan unik dari lokasi realisasi tanggal terkait. */
function teksTujuan(data: DataSpj, tanggal?: string[]): string {
  const dariSt = (data.suratTugas?.tujuan ?? []).map((t) => judulKecamatan(t)).filter(Boolean);
  if (dariSt.length) return dariSt.join(", ");
  const set = tanggal ? new Set(tanggal) : null;
  const kec = Array.from(
    new Set(
      data.hari
        .filter((h) => !set || set.has(h.tanggal))
        .flatMap((h) => h.realisasi?.lokasi ?? [])
        .map((l) => judulKecamatan(l.kecamatan))
        .filter(Boolean)
    )
  );
  return kec.length ? kec.join(", ") : "-";
}

function identitas(data: DataSpj): { label: "NIK" | "NIP"; nilai: string | null } {
  return data.akun.jenis === "organik" ? { label: "NIP", nilai: data.akun.nip?.trim() || null } : { label: "NIK", nilai: data.akun.nik?.trim() || null };
}

/** "Jorong X" -- awalan tidak diulang bila data master sudah memuatnya ("JORONG BALAI BALAI"). */
function awalan(label: string, nilai: string | null | undefined): string {
  const t = judulKecamatan(nilai);
  if (!t) return "";
  const dasar = label.replace(/\.$/, "").toLowerCase();
  return t.toLowerCase().startsWith(dasar) ? t : `${label} ${t}`;
}

function teksLokasiDokumentasi(lok: LokasiRealisasi[]): string {
  const bagian = Array.from(
    new Set(
      lok.map((l) =>
        [awalan("Jorong", l.jorong), awalan("Nagari", l.nagari), awalan("Kec.", l.kecamatan)]
          .filter(Boolean)
          .join(", ")
      )
    )
  ).filter(Boolean);
  if (bagian.length === 0) return "-";
  return bagian.length <= 4 ? bagian.join("; ") : `${bagian.slice(0, 4).join("; ")}; dan ${bagian.length - 4} lokasi lainnya`;
}

const rentangNama = (k: { mulai: string; selesai: string }) => (k.mulai === k.selesai ? k.mulai : `${k.mulai}_sd_${k.selesai}`);

/**
 * Rakit dokumen dari data (tanpa Supabase -- berkas diambil lewat `muat`, sehingga bisa diuji lokal).
 * Urutan: Surat Tugas, lalu per kelompok: Kwitansi, Visum, Surat Pernyataan, lalu Laporan &
 * Dokumentasi per hari di kelompok itu.
 */
export async function rakitUnit(
  data: DataSpj,
  opsi: { jenis: JenisDok[]; kelompokMulai?: string },
  muat: PemuatBerkas
): Promise<{ unit: UnitSpj[]; dilewati: string[] }> {
  const pilih = new Set(opsi.jenis);
  const unit: UnitSpj[] = [];
  const dilewati: string[] = [];
  const nomorSt = data.suratTugas?.nomor_st || "-";
  const id = identitas(data);
  const pdf = "application/pdf";

  let kelompok = data.kelompok;
  if (opsi.kelompokMulai) {
    kelompok = data.kelompok.filter((k) => k.mulai === opsi.kelompokMulai);
    if (kelompok.length === 0) throw new GalatSpj("Kelompok tanggal tidak ditemukan (mungkin hari dibayar sudah berubah). Muat ulang halaman.", 400);
  }

  if (pilih.has("surat_tugas")) {
    const berkas = data.suratTugas?.file_path ? await muat(data.suratTugas.file_path) : null;
    if (berkas) unit.push({ jenis: "surat_tugas", nama: `Surat_Tugas_${amanNama(nomorSt)}.pdf`, bytes: berkas.bytes, contentType: berkas.contentType, kelompok: null });
    else dilewati.push(data.suratTugas ? "Surat Tugas -- file belum diunggah admin." : "Surat Tugas -- belum ada Surat Tugas untuk penugasan ini.");
  }

  const perluKelompok = URUTAN_JENIS.some((j) => j !== "surat_tugas" && pilih.has(j));
  if (perluKelompok && kelompok.length === 0) {
    dilewati.push("Kwitansi/Visum/Surat Pernyataan/Laporan/Dokumentasi -- belum ada hari kerja yang dibayar.");
  }

  for (const kel of kelompok) {
    const rn = rentangNama(kel);
    const tujuan = teksTujuan(data, kel.tanggal);
    if (pilih.has("kwitansi")) {
      const bytes = await buatPdfKwitansiSigap({
        nomorSt,
        tanggalSt: data.suratTugas?.tanggal_st ?? null,
        nominal: kel.nominal,
        untukPerjalananDinasPada: tujuan,
        tanggalKwitansi: kel.selesai,
        namaPenerima: data.akun.nama,
        labelId: id.label === "NIP" ? "Nip." : "NIK.",
        idPenerima: id.nilai,
      });
      unit.push({ jenis: "kwitansi", nama: `Kwitansi_${rn}.pdf`, bytes, contentType: pdf, kelompok: kel.mulai });
    }
    if (pilih.has("visum")) {
      const bytes = await buatPdfVisumSigap({
        nomorSt,
        namaPetugas: data.akun.nama,
        rencanaTujuan: tujuan,
        tempatKedudukan: data.akun.alamat_kecamatan ? judulKecamatan(data.akun.alamat_kecamatan) : null,
        tanggalBerangkat: kel.mulai,
        tanggalTibaTujuan: kel.mulai,
        tanggalBerangkatKembali: kel.selesai,
        tanggalTibaKembali: kel.selesai,
      });
      unit.push({ jenis: "visum", nama: `Visum_${rn}.pdf`, bytes, contentType: pdf, kelompok: kel.mulai });
    }
    if (pilih.has("surat_pernyataan")) {
      const bytes = await buatPdfSuratPernyataanSigap({
        nomorSt,
        namaPetugas: data.akun.nama,
        labelId: id.label,
        idPetugas: id.nilai,
        labelJabatan: data.label_jabatan,
        tanggalMulai: kel.mulai,
        tanggalSelesai: kel.selesai,
        tempatKedudukan: data.akun.alamat_kecamatan ? judulKecamatan(data.akun.alamat_kecamatan) : null,
      });
      unit.push({ jenis: "surat_pernyataan", nama: `Surat_Pernyataan_${rn}.pdf`, bytes, contentType: pdf, kelompok: kel.mulai });
    }

    for (const t of kel.tanggal) {
      const h = data.hari.find((x) => x.tanggal === t);
      if (pilih.has("laporan") && data.kegiatan.wajib_laporan) {
        if (h?.realisasi) {
          const bytes = await buatPdfLaporanSigap({
            kegiatanNama: data.kegiatan.nama,
            kegiatanKode: data.kegiatan.kode,
            nomorSt,
            namaPetugas: data.akun.nama,
            labelJabatan: data.label_jabatan,
            tanggal: t,
            satuan: data.kegiatan.satuan_realisasi,
            lokasi: h.realisasi.lokasi.map((l) => ({ kecamatan: l.kecamatan ?? null, nagari: l.nagari ?? null, jorong: l.jorong ?? null })),
            jumlahRealisasi: h.realisasi.jumlah_realisasi,
            kendala: h.realisasi.kendala,
            jumlahFoto: h.foto.length,
          });
          unit.push({ jenis: "laporan", nama: `Laporan_${t}.pdf`, bytes, contentType: pdf, kelompok: kel.mulai });
        } else dilewati.push(`Laporan ${t} -- isian laporan belum diisi.`);
      }
      if (pilih.has("dokumentasi")) {
        const foto: SigapFotoInput[] = [];
        for (const f of h?.foto ?? []) {
          const berkas = await muat(f.file_path);
          if (berkas) foto.push({ slot: f.slot, bytes: berkas.bytes, contentType: berkas.contentType === "image/png" ? "image/png" : "image/jpeg" });
        }
        if (foto.length > 0) {
          const bytes = await buatPdfDokumentasiSigap({
            kegiatanNama: data.kegiatan.nama,
            kegiatanKode: data.kegiatan.kode,
            kegiatanJenis: data.kegiatan.jenis,
            nomorSt,
            namaPetugas: data.akun.nama,
            peranLabel: data.label_jabatan,
            tanggal: t,
            lokasi: teksLokasiDokumentasi(h?.realisasi?.lokasi ?? []),
            foto,
          });
          unit.push({ jenis: "dokumentasi", nama: `Dokumentasi_${t}.pdf`, bytes, contentType: pdf, kelompok: kel.mulai });
        } else dilewati.push(`Dokumentasi ${t} -- belum ada foto.`);
      }
    }
  }
  return { unit, dilewati };
}

/** Sisipkan PDF (atau gambar JPEG/PNG, mis. ST hasil foto) ke dokumen gabungan. */
async function sisipkan(gabung: PDFDocument, bytes: Uint8Array): Promise<boolean> {
  try {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const hal = await gabung.copyPages(src, src.getPageIndices());
    hal.forEach((p) => gabung.addPage(p));
    return true;
  } catch {
    // bukan PDF -- coba sbg gambar.
  }
  const A4: [number, number] = [595.28, 841.89];
  for (const coba of [() => gabung.embedJpg(bytes), () => gabung.embedPng(bytes)]) {
    try {
      const img = await coba();
      const page = gabung.addPage(A4);
      const s = Math.min((A4[0] * 0.92) / img.width, (A4[1] * 0.92) / img.height, 1);
      page.drawImage(img, { x: (A4[0] - img.width * s) / 2, y: (A4[1] - img.height * s) / 2, width: img.width * s, height: img.height * s });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function gabungkanUnit(unit: { nama: string; bytes: Uint8Array }[], dilewati?: string[]): Promise<Uint8Array> {
  const gabung = await PDFDocument.create();
  for (const u of unit) {
    const ok = await sisipkan(gabung, u.bytes);
    if (!ok) dilewati?.push(`${u.nama} -- berkas tidak bisa dibaca sebagai PDF/gambar.`);
  }
  return gabung.save();
}

function zipUnit(unit: { nama: string; bytes: Uint8Array }[], dilewati: string[]): Uint8Array {
  const files = unit.map((u, i) => ({ nama: `${String(i + 1).padStart(2, "0")}_${u.nama}`, data: u.bytes }));
  if (dilewati.length > 0) {
    files.push({ nama: "_dokumen_dilewati.txt", data: new TextEncoder().encode("Dokumen berikut TIDAK disertakan karena datanya belum ada:\r\n\r\n" + dilewati.join("\r\n") + "\r\n") });
  }
  return buatZip(files);
}

function pemuatStorage(db: Db): PemuatBerkas {
  return async (path: string) => {
    const { data: blob, error } = await db.storage.from(BUCKET_SIGAP).download(path);
    if (error || !blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tipe = blob.type || (/\.png$/i.test(path) ? "image/png" : /\.pdf$/i.test(path) ? "application/pdf" : "image/jpeg");
    return { bytes, contentType: tipe };
  };
}

// ----------------------------------------------------------------------------------------------
/**
 * Buat PDF gabungan / ZIP SPJ sebuah penugasan.
 * Bila penugasan sudah dikunci & ada berkas beku: gabungan lengkap (semua jenis, semua kelompok)
 * memakai sigap_dokumen_final 'gabungan'; pilihan jenis parsial (semua kelompok) memakai berkas beku
 * per jenis. Pilihan satu kelompok tanggal dirakit dari data dgn acuan waktu kunci.
 */
export async function buatSpjPdf(
  db: Db,
  penugasanId: number,
  opsi: { jenis: JenisDok[]; kelompokMulai?: string; format: "gabungan" | "zip" }
): Promise<{ bytes: Uint8Array; namaFile: string; contentType: string; dilewati: string[] }> {
  const jenis = URUTAN_JENIS.filter((j) => opsi.jenis.includes(j));
  if (jenis.length === 0) throw new GalatSpj("Pilih minimal 1 jenis dokumen.", 400);
  const data = await dataSpj(db, penugasanId);
  const muat = pemuatStorage(db);

  const kelTerpilih = opsi.kelompokMulai ? data.kelompok.find((k) => k.mulai === opsi.kelompokMulai) : undefined;
  const dasarNama = `SPJ_${amanNama(data.kegiatan.kode || "SIGAP")}_${amanNama(data.akun.nama)}_${kelTerpilih ? rentangNama(kelTerpilih) : "semua"}`;
  const keluaran = async (unit: { nama: string; bytes: Uint8Array }[], dilewati: string[]) => {
    if (unit.length === 0) {
      throw new GalatSpj(`Belum ada dokumen yang bisa dibuat. ${dilewati.slice(0, 3).join(" ")}`.trim(), 404);
    }
    if (opsi.format === "zip") return { bytes: zipUnit(unit, dilewati), namaFile: `${dasarNama}.zip`, contentType: "application/zip", dilewati };
    return { bytes: await gabungkanUnit(unit, dilewati), namaFile: `${dasarNama}.pdf`, contentType: "application/pdf", dilewati };
  };

  // ---- Sudah dikunci: pakai berkas beku bila ada ----
  if (data.penugasan.dikunci_at && !opsi.kelompokMulai && data.final.length > 0) {
    const gab = data.final.find((f) => f.jenis === "gabungan");
    if (opsi.format === "gabungan" && jenis.length === URUTAN_JENIS.length && gab) {
      const berkas = await muat(gab.file_path);
      if (berkas) return { bytes: berkas.bytes, namaFile: `${dasarNama}_final.pdf`, contentType: "application/pdf", dilewati: [] };
    }
    const unit: { nama: string; bytes: Uint8Array }[] = [];
    const dilewati: string[] = [];
    let semuaAda = true;
    for (const j of jenis) {
      if (j === "surat_tugas") {
        const b = data.suratTugas?.file_path ? await muat(data.suratTugas.file_path) : null;
        if (b) unit.push({ nama: `Surat_Tugas_${amanNama(data.suratTugas?.nomor_st ?? "")}.pdf`, bytes: b.bytes });
        else dilewati.push("Surat Tugas -- file belum diunggah admin.");
        continue;
      }
      const f = data.final.find((x) => x.jenis === j);
      const b = f ? await muat(f.file_path) : null;
      if (b) unit.push({ nama: `${LABEL_JENIS[j].replace(/\s+/g, "_")}_final.pdf`, bytes: b.bytes });
      else semuaAda = false;
    }
    // Hanya dipakai bila SEMUA jenis terpilih (selain ST) punya berkas beku; kalau tidak, rakit dari data.
    if (semuaAda) return keluaran(unit, dilewati);
  }

  // ---- Rakit dari data ----
  const { unit, dilewati } = await rakitUnit(data, { jenis, kelompokMulai: opsi.kelompokMulai }, muat);
  return keluaran(unit, dilewati);
}

// ----------------------------------------------------------------------------------------------
/**
 * Dipanggil route admin saat aksi "kunci": rakit semua dokumen dari data (acuan = waktu kunci),
 * simpan PDF gabungan + per jenis ke sigap-files/spj-final/<penugasanId>/<jenis>.pdf (upsert),
 * lalu ganti baris sigap_dokumen_final milik penugasan itu.
 */
export async function bekukanSpj(db: Db, penugasanId: number, oleh: string) {
  const data = await dataSpj(db, penugasanId);
  const { unit, dilewati } = await rakitUnit(data, { jenis: [...URUTAN_JENIS] }, pemuatStorage(db));
  if (unit.length === 0) return { ok: false, pesan: "Tidak ada dokumen untuk dibekukan.", dilewati };

  const mulai = data.kelompok[0]?.mulai ?? null;
  const selesai = data.kelompok[data.kelompok.length - 1]?.selesai ?? null;
  const simpan = async (nama: string, bytes: Uint8Array) => {
    const path = `spj-final/${penugasanId}/${nama}.pdf`;
    const { error } = await db.storage.from(BUCKET_SIGAP).upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Gagal menyimpan ${nama}.pdf: ${error.message}`);
    return path;
  };

  const baris: { penugasan_id: number; jenis: string; tanggal_mulai: string | null; tanggal_selesai: string | null; nominal: number | null; file_path: string; difinalkan_oleh: string }[] = [];
  const ringkas: { jenis: string; file_path: string; dokumen: number }[] = [];

  const pathGab = await simpan("gabungan", await gabungkanUnit(unit, dilewati));
  baris.push({ penugasan_id: penugasanId, jenis: "gabungan", tanggal_mulai: mulai, tanggal_selesai: selesai, nominal: data.totalNominal, file_path: pathGab, difinalkan_oleh: oleh });
  ringkas.push({ jenis: "gabungan", file_path: pathGab, dokumen: unit.length });

  const usang: string[] = [];
  for (const j of JENIS_BEKU) {
    const u = unit.filter((x) => x.jenis === j);
    if (u.length === 0) {
      usang.push(`spj-final/${penugasanId}/${j}.pdf`);
      continue;
    }
    const path = await simpan(j, await gabungkanUnit(u, dilewati));
    baris.push({ penugasan_id: penugasanId, jenis: j, tanggal_mulai: mulai, tanggal_selesai: selesai, nominal: j === "kwitansi" ? data.totalNominal : null, file_path: path, difinalkan_oleh: oleh });
    ringkas.push({ jenis: j, file_path: path, dokumen: u.length });
  }
  // Berkas beku lama utk jenis yg sekarang kosong dibuang (abaikan galat bila memang tidak ada).
  if (usang.length) await db.storage.from(BUCKET_SIGAP).remove(usang).catch(() => null);

  const { error: errHapus } = await db.from("sigap_dokumen_final").delete().eq("penugasan_id", penugasanId);
  if (errHapus) throw new Error(`Gagal membersihkan dokumen final lama: ${errHapus.message}`);
  const { error: errIsi } = await db.from("sigap_dokumen_final").insert(baris);
  if (errIsi) throw new Error(`Gagal mencatat dokumen final: ${errIsi.message}`);

  return {
    ok: true,
    kelompok: data.kelompok.map((k) => ({ mulai: k.mulai, selesai: k.selesai, jumlah_hari: k.jumlah_hari, nominal: k.nominal })),
    nominal: data.totalNominal,
    berkas: ringkas,
    dilewati,
  };
}

/** Header respons unduhan (nama file ASCII + filename* UTF-8, daftar dilewati di X-Spj-Dilewati). */
export function headerBerkas(hasil: { bytes: Uint8Array; namaFile: string; contentType: string; dilewati: string[] }, disposisi: "attachment" | "inline" = "attachment"): Record<string, string> {
  const ascii = hasil.namaFile.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": hasil.contentType,
    "Content-Length": String(hasil.bytes.length),
    "Content-Disposition": `${disposisi}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(hasil.namaFile)}`,
    "X-Spj-Dilewati": encodeURIComponent(JSON.stringify(hasil.dilewati.slice(0, 50))),
    "Access-Control-Expose-Headers": "Content-Disposition, X-Spj-Dilewati",
    "Cache-Control": "no-store",
  };
}
