// lib/perencanaanGsbpm.ts
//
// (11 Okt 2026) Perencanaan kegiatan berbasis GSBPM per RO anggaran -- UJI COBA, permintaan user:
// "alurnya ada anggaran (RO) >> identifikasi kegiatan utama >> identifikasi seluruh GSBPM yang ready di satker kabupaten",
// hasil identifikasi menjadi acuan perencanaan & pengelolaan setiap tahap dan dapat diduplikasi (ganti nama kegiatan, mata anggaran).
// Rancangan: dokumen project claude/rancangan-identifikasi-gsbpm-ro.md.
//
// Tahap uji coba pertama = HIERARKI saja (RO -> kegiatan utama -> 6 tahap GSBPM). Data disimpan di browser
// (localStorage), belum ke database, supaya aturan bisa dicoba dan diubah tanpa migrasi. Logika murni (tanpa DOM/DB)
// agar mudah diuji (lib/__tests__/perencanaanGsbpm.test.ts).

import type { Alokasi, DetailPok } from "./perencanaanPok";

export type KodeTahap = "perencanaan" | "pelatihan" | "pendataan" | "pengolahan" | "analisis" | "evaluasi";

export type DefinisiTahap = {
  kode: KodeTahap;
  no: number;
  nama: string;
  /** Rujukan fase/sub-proses GSBPM 5.1. "Manajemen" = lintas fase (bukan fase GSBPM). */
  gsbpm: string;
  uraian: string;
  /** Wajib = tidak bisa dimatikan. */
  wajib: boolean;
  /** Dipakai secara bawaan saat kegiatan baru dibuat. */
  bawaan: boolean;
  /** Keterangan kapan tahap ini dipakai (untuk tahap opsional). */
  kapan?: string;
  /** Hal yang akan diidentifikasi pada tahap ini (form menyusul). */
  identifikasi: string[];
};

// (11 Okt 2026) 6 tahap disetujui user (menggantikan 5 tahap desain 10 Okt; "Penyelesaian" dilebur ke status paket).
export const TAHAP_GSBPM: DefinisiTahap[] = [
  {
    kode: "perencanaan",
    no: 1,
    nama: "Perencanaan & anggaran",
    gsbpm: "Manajemen",
    uraian: "Tautan anggaran, RAB, revisi POK, KAK, SK tim, rekrutmen & kontrak mitra, pengadaan.",
    wajib: true,
    bawaan: true,
    identifikasi: ["Tautan Sub Komponen / detail POK", "RAB & revisi POK", "KAK & Form Permintaan", "SK tim (permintaan ke Perencanaan)", "Rekrutmen & kontrak mitra", "Pengadaan barang/jasa"],
  },
  {
    kode: "pelatihan",
    no: 2,
    nama: "Pelatihan petugas",
    gsbpm: "4.2",
    uraian: "Persiapan pengumpulan data: pelatihan petugas pencacah, pengawas, dan pengolah.",
    wajib: false,
    bawaan: true,
    kapan: "Bila ada pelatihan petugas di satker ini",
    identifikasi: ["Jenis: daring / luring / hybrid", "Lokasi: dalam kota (kantor/hotel) / luar kota (hotel)", "Peserta: mitra / organik / keduanya", "Jenis paket meeting (bila hotel)", "Honor instruktur, bahan & ATK, pulsa, narasumber", "Volume: peserta, kelas, hari, JP"],
  },
  {
    kode: "pendataan",
    no: 3,
    nama: "Pendataan",
    gsbpm: "4.1 · 4.3 · 4.4",
    uraian: "Updating/listing, pencacahan sampel, pengawasan, dan finalisasi pengumpulan.",
    wajib: false,
    bawaan: true,
    kapan: "Wajib untuk survei/sensus",
    identifikasi: ["Sub-kegiatan: updating/listing, pencacahan (per survei bila terintegrasi)", "Per peran (pencacah, pengawas, pengolah): status, honor & target", "Transport lokal (< 8 / > 8 jam), pulsa, perjadin supervisi", "Honor camat/kades/penunjuk jalan", "Mode CAPI / PAPI"],
  },
  {
    kode: "pengolahan",
    no: 4,
    nama: "Pengolahan",
    gsbpm: "5.3 · 5.4",
    uraian: "Pemeriksaan, validasi, edit, dan entri data (bila bukan CAPI).",
    wajib: false,
    bawaan: false,
    kapan: "Bila ada pengolahan di satker (mis. PAPI)",
    identifikasi: ["Peran pengolah & honor", "Target dokumen", "Pulsa"],
  },
  {
    kode: "analisis",
    no: 5,
    nama: "Analisis & diseminasi",
    gsbpm: "6 · 7",
    uraian: "Konsultasi & validasi angka, penyusunan publikasi/laporan, rilis, layanan data.",
    wajib: false,
    bawaan: true,
    kapan: "Wajib bila output RO berupa publikasi/laporan",
    identifikasi: ["Konsultasi ke BPS Provinsi", "Rapat internal / FGD dengan OPD", "Penyusunan publikasi/laporan (tim, cetak)", "Diseminasi / rilis", "Layanan konsultasi data"],
  },
  {
    kode: "evaluasi",
    no: 6,
    nama: "Evaluasi",
    gsbpm: "8",
    uraian: "Rapat evaluasi, umpan balik petugas, penilaian mitra, rencana perbaikan.",
    wajib: true,
    bawaan: true,
    identifikasi: ["Rapat evaluasi (konsumsi)", "Umpan balik petugas", "Penilaian mitra", "Rencana perbaikan"],
  },
];

export const KODE_TAHAP: KodeTahap[] = TAHAP_GSBPM.map((t) => t.kode);

export function definisiTahap(kode: string): DefinisiTahap | null {
  return TAHAP_GSBPM.find((t) => t.kode === kode) ?? null;
}

export type IsianTahap = {
  dipakai: boolean;
  /** Jawaban identifikasi (lib/perencanaanIdentifikasi.ts); null = belum diidentifikasi. */
  jawaban: Record<string, unknown> | null;
  diubah: string | null;
  /** (11 Okt 2026) Nama pengisi terakhir identifikasi (admin/pengelola kegiatan/ketua tim). */
  oleh?: string | null;
};

export type Ro = {
  id: string;
  /** Kode RO tanpa program, mis. "2906.BMA.006". */
  kode: string;
  nama: string;
  /** Kode program, mis. "054.01.GG". */
  program: string;
  tahun: number;
};

export type KegiatanUtama = {
  id: string;
  roId: string;
  nama: string;
  mulai: string | null;
  selesai: string | null;
  /** Tautan anggaran tingkat Sub Komponen, mis. "052.A" (11 Okt, versi awal). Sejak tautan diambil dari baris POK (DataUji.alokasi),
   *  isian manual ini tidak ditampilkan lagi di form; tetap dibaca agar data lama tidak rusak. */
  subKomponen: string[];
  tahap: Record<KodeTahap, IsianTahap>;
  /** Kegiatan asal bila hasil duplikat. */
  asalId: string | null;
  dibuat: string;
};

/** (11 Okt 2026) + pok (baris detail POK per RO) & alokasi (baris POK x kegiatan + rencana bayar). Lihat lib/perencanaanPok.ts. */
export type DataUji = { versi: 1; ro: Ro[]; kegiatan: KegiatanUtama[]; pok: DetailPok[]; alokasi: Alokasi[] };

export const KUNCI_SIMPAN = "sigap_uji_perencanaan_v1";

export function tahapAwal(): Record<KodeTahap, IsianTahap> {
  const out = {} as Record<KodeTahap, IsianTahap>;
  for (const t of TAHAP_GSBPM) out[t.kode] = { dipakai: t.wajib || t.bawaan, jawaban: null, diubah: null };
  return out;
}

const RE_RO = /^\d{4}\.[A-Z]{3}\.\d{3}$/;
const RE_TGL = /^\d{4}-\d{2}-\d{2}$/;

/** Rapikan kode RO yang diketik: huruf besar, buang spasi, buang awalan program bila ikut tertulis. */
export function rapikanKodeRo(s: string): string {
  const x = s.trim().toUpperCase().replace(/\s+/g, "");
  const m = /(\d{4}\.[A-Z]{3}\.\d{3})$/.exec(x);
  return m ? m[1] : x;
}

export function periksaRo(input: { kode: string; nama: string }, daftar: Ro[], kecualiId?: string): string | null {
  const kode = rapikanKodeRo(input.kode);
  if (!RE_RO.test(kode)) return "Kode RO harus berbentuk 9999.AAA.999, mis. 2906.BMA.006.";
  if (!input.nama.trim()) return "Nama RO wajib diisi.";
  if (daftar.some((r) => r.kode === kode && r.id !== kecualiId)) return `RO ${kode} sudah ada.`;
  return null;
}

/** Pisahkan isian Sub Komponen (dipisah koma/titik koma/baris baru), rapikan, buang duplikat. */
export function pisahSubKomponen(s: string): string[] {
  const out: string[] = [];
  for (const b of s.split(/[,;\n]/)) {
    const x = b.trim().toUpperCase().replace(/\s+/g, "");
    if (x && !out.includes(x)) out.push(x.slice(0, 40));
  }
  return out;
}

export function periksaKegiatan(input: { nama: string; mulai: string | null; selesai: string | null }): string | null {
  if (!input.nama.trim()) return "Nama kegiatan wajib diisi.";
  if (input.nama.trim().length > 160) return "Nama kegiatan terlalu panjang (maks. 160 karakter).";
  if (input.mulai && !RE_TGL.test(input.mulai)) return "Tanggal mulai tidak valid.";
  if (input.selesai && !RE_TGL.test(input.selesai)) return "Tanggal selesai tidak valid.";
  if (input.mulai && input.selesai && input.selesai < input.mulai) return "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  return null;
}

export function buatKegiatan(
  input: { roId: string; nama: string; mulai?: string | null; selesai?: string | null; subKomponen?: string[] },
  id: string,
  sekarang: string
): KegiatanUtama {
  return {
    id,
    roId: input.roId,
    nama: input.nama.trim(),
    mulai: input.mulai || null,
    selesai: input.selesai || null,
    subKomponen: input.subKomponen ?? [],
    tahap: tahapAwal(),
    asalId: null,
    dibuat: sekarang,
  };
}

/** Duplikat: salin tahap yang dipakai + jawaban identifikasi; nama, periode, tautan anggaran (dan RO bila pindah) diganti. */
export function duplikatKegiatan(
  asal: KegiatanUtama,
  ubah: { nama: string; mulai?: string | null; selesai?: string | null; subKomponen?: string[]; roId?: string },
  id: string,
  sekarang: string
): KegiatanUtama {
  const tahap = {} as Record<KodeTahap, IsianTahap>;
  for (const k of KODE_TAHAP) {
    const t = asal.tahap[k] ?? { dipakai: false, jawaban: null, diubah: null };
    tahap[k] = { dipakai: t.dipakai, jawaban: t.jawaban ? JSON.parse(JSON.stringify(t.jawaban)) : null, diubah: t.jawaban ? sekarang : null };
  }
  return {
    id,
    roId: ubah.roId ?? asal.roId,
    nama: ubah.nama.trim(),
    mulai: ubah.mulai || null,
    selesai: ubah.selesai || null,
    subKomponen: ubah.subKomponen ?? [],
    tahap,
    asalId: asal.id,
    dibuat: sekarang,
  };
}

/** Nyalakan/matikan tahap. Tahap wajib tidak bisa dimatikan (dikembalikan apa adanya). */
export function aturTahapDipakai(k: KegiatanUtama, kode: KodeTahap, dipakai: boolean, sekarang: string): KegiatanUtama {
  const def = definisiTahap(kode);
  if (!def) return k;
  if (def.wajib && !dipakai) return k;
  return { ...k, tahap: { ...k.tahap, [kode]: { ...k.tahap[kode], dipakai, diubah: sekarang } } };
}

export type StatusTahap = "tidak_dipakai" | "belum" | "sudah";

export function statusTahap(t: IsianTahap | undefined): StatusTahap {
  if (!t || !t.dipakai) return "tidak_dipakai";
  return t.jawaban ? "sudah" : "belum";
}

export function ringkasKegiatan(k: KegiatanUtama): { dipakai: number; teridentifikasi: number; tautanAnggaran: boolean } {
  let dipakai = 0;
  let teridentifikasi = 0;
  for (const kode of KODE_TAHAP) {
    const s = statusTahap(k.tahap[kode]);
    if (s !== "tidak_dipakai") dipakai++;
    if (s === "sudah") teridentifikasi++;
  }
  return { dipakai, teridentifikasi, tautanAnggaran: k.subKomponen.length > 0 };
}

/** Contoh awal (dari arahan user 11 Okt 2026). Periode & tautan Sub Komponen sengaja kosong: diisi user. */
export function dataContoh(sekarang = "2026-10-11T00:00:00.000Z"): DataUji {
  const ro: Ro = { id: "ro-contoh-2906bma006", kode: "2906.BMA.006", nama: "Publikasi/Laporan Survei Sosial Ekonomi Nasional", program: "054.01.GG", tahun: 2026 };
  const nama = [
    "Susenas Maret terintegrasi Seruti Triwulan I 2026",
    "Seruti Triwulan II 2026",
    "Susenas September terintegrasi Seruti Triwulan III 2026",
    "Seruti Triwulan IV 2026",
  ];
  return {
    versi: 1,
    ro: [ro],
    kegiatan: nama.map((n, i) => buatKegiatan({ roId: ro.id, nama: n }, `keg-contoh-${i + 1}`, sekarang)),
    pok: [],
    alokasi: [],
  };
}

function apakahObjek(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Baca isi penyimpanan; rusak/tidak ada -> contoh awal. Tahap yang hilang dilengkapi bawaan. */
export function bacaData(raw: string | null): DataUji {
  if (!raw) return dataContoh();
  try {
    const d = JSON.parse(raw) as unknown;
    if (!apakahObjek(d) || d.versi !== 1 || !Array.isArray(d.ro) || !Array.isArray(d.kegiatan)) return dataContoh();
    const ro = (d.ro as unknown[]).filter((r): r is Ro => apakahObjek(r) && typeof r.id === "string" && typeof r.kode === "string" && typeof r.nama === "string");
    const idRo = new Set(ro.map((r) => r.id));
    const kegiatan = (d.kegiatan as unknown[])
      .filter((k): k is KegiatanUtama => apakahObjek(k) && typeof k.id === "string" && typeof k.roId === "string" && idRo.has(k.roId as string) && typeof k.nama === "string")
      .map((k) => {
        const awal = tahapAwal();
        const tahap = apakahObjek(k.tahap) ? (k.tahap as Record<string, IsianTahap>) : {};
        for (const kode of KODE_TAHAP) if (apakahObjek(tahap[kode])) awal[kode] = { ...awal[kode], ...tahap[kode] };
        for (const t of TAHAP_GSBPM) if (t.wajib) awal[t.kode].dipakai = true;
        return { ...k, subKomponen: Array.isArray(k.subKomponen) ? k.subKomponen.filter((s) => typeof s === "string") : [], tahap: awal };
      });
    const angka = (x: unknown) => typeof x === "number" && Number.isFinite(x);
    const pok = (Array.isArray(d.pok) ? (d.pok as unknown[]) : []).filter(
      (p): p is DetailPok => apakahObjek(p) && typeof p.id === "string" && typeof p.roId === "string" && idRo.has(p.roId as string) && typeof p.akun === "string" && typeof p.uraian === "string" && angka(p.jumlah)
    );
    const idPok = new Set(pok.map((p) => p.id));
    const idKeg = new Set(kegiatan.map((k) => k.id));
    const alokasi = (Array.isArray(d.alokasi) ? (d.alokasi as unknown[]) : [])
      .filter(
        (a): a is Alokasi =>
          apakahObjek(a) && typeof a.id === "string" && idPok.has(a.detailId as string) && idKeg.has(a.kegiatanId as string) && angka(a.nilai)
      )
      .map((a) => ({ ...a, rencana: Array.isArray(a.rencana) ? a.rencana.filter((r) => apakahObjek(r) && typeof r.bulan === "string" && angka(r.nilai)) : [] }));
    return {
      versi: 1,
      ro: ro.map((r) => ({ ...r, program: typeof r.program === "string" ? r.program : "", tahun: typeof r.tahun === "number" ? r.tahun : 2026 })),
      kegiatan,
      pok,
      alokasi,
    };
  } catch {
    return dataContoh();
  }
}

export function idAcak(awalan: string): string {
  return `${awalan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
