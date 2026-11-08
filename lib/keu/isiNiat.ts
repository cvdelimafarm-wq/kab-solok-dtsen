// lib/keu/isiNiat.ts
//
// (7 Nov 2026, tahap 4d rancangan "Kebutuhan, neraca RO, siklus revisi") Mengisi kolom Menjadi kertas kerja dari rencana tindakan (niat) per butir.
// MURNI (tanpa React dan basis data). Hanya mengusulkan perubahan volume pada baris POK semula; penulisan lewat keu_tulis (keu_kk_baris) dilakukan
// komponen KartuIsiNiat, sehingga hak dan aturan basis data (jadwal terbuka, kewenangan, usulan belum diajukan) tetap berlaku.
//
// Aturan:
//   Lepas   (butir Lebih)  : Menjadi = volume terkecil yang masih memenuhi (jumlah semula - jumlah lepas); dana yang benar-benar dilepas <= rencana.
//   Tambal  (butir Kurang) : Menjadi = volume + bilangan bulat satuan yang dananya <= jumlah rencana; dana yang ditambahkan <= rencana.
//   Tambahan                : sama dengan Tambal (dananya dari luar RO, sehingga pagu RO naik; pemeriksaan R-xx dan jenis revisi yang menilai).
//   Tunda dan Biarkan       : tidak mengubah apa pun.
// Baris yang sudah disentuh (Menjadi berbeda dari Semula), sudah punya pasangan, berharga nol, atau bukan baris POK semula dilewati beserta alasannya,
// sehingga menjalankan ulang tidak menimpa suntingan tangan dan tidak menggandakan perubahan.
// Pembulatan ke satuan utuh meninggalkan sisa kecil; sisa itu dilaporkan (selisihKeseimbangan) agar ditutup lewat geseran atau Dana penggenap.

import { kelompokAkun, n, type BarisKk } from "./kk";
import { butuhJumlah, LABEL_NIAT, type BarisRencana, type Niat } from "./niat";

export type LangkahIsi = {
  barisId: number;
  kunci: string;
  uraian: string;
  niat: Niat;
  /** jumlah yang dimaksud rencana */
  rencana: number;
  volSemula: number;
  volBaru: number;
  harga: number;
  /** perubahan dana pada baris (negatif = dilepas, positif = ditambah) */
  perubahan: number;
  /** selisih antara perubahan nyata dan rencana (karena pembulatan satuan) */
  sisaPembulatan: number;
  /** teks untuk kolom catatan baris bila kosong */
  catatan: string;
};

export type LewatiIsi = { kunci: string; uraian: string; niat: Niat; alasan: string };

export type HasilIsi = {
  langkah: LangkahIsi[];
  dilewati: LewatiIsi[];
  /** jumlah dana yang dilepas (positif) dan ditambahkan oleh seluruh langkah */
  dilepas: number;
  ditambah: number;
  /** ditambah - dilepas; nol berarti pagu RO tetap */
  selisihKeseimbangan: number;
};

const bulat = (x: number): number => Math.round(x);
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;

/** Alasan baris tidak dapat diisi dari niat, atau null bila boleh. */
export function alasanTidakBisa(b: BarisKk | undefined): string | null {
  if (!b) return "Baris belum ada di kertas kerja (muat baris POK dulu).";
  if (b.detail_id === null) return "Bukan baris POK semula.";
  if (b.pindah_ke !== null && b.pindah_ke !== undefined) return "Baris sudah dipasangkan (ganti akun atau redaksi).";
  if (n(b.vol_menjadi) !== n(b.vol_semula) || n(b.harga_menjadi) !== n(b.harga_semula)) return "Sudah diubah di kertas kerja; tidak ditimpa.";
  if (n(b.harga_semula) <= 0) return "Harga satuan nol; jumlah tidak dapat dibagi per satuan.";
  return null;
}

/** Langkah untuk satu butir berniat, atau alasan dilewati. */
export function langkahDariNiat(r: BarisRencana, b: BarisKk): LangkahIsi | string {
  const harga = n(b.harga_semula);
  const vol = n(b.vol_semula);
  const jumlah = n(b.jumlah_semula);
  const rencana = Math.max(0, bulat(r.jumlah));
  if (r.niat === "lepas") {
    const sisaDana = Math.max(jumlah - rencana, 0);
    const volBaru = Math.max(0, Math.ceil(sisaDana / harga - 1e-9));
    const jumlahBaru = bulat(volBaru * harga);
    const perubahan = jumlahBaru - jumlah;
    if (perubahan === 0) return "Jumlah yang dilepas kurang dari satu satuan.";
    return { barisId: b.id, kunci: r.kunci, uraian: r.uraian, niat: r.niat, rencana, volSemula: vol, volBaru, harga, perubahan, sisaPembulatan: perubahan + rencana, catatan: `Dari rencana tindakan: ${LABEL_NIAT.lepas} ${rp(-perubahan)}` };
  }
  if (r.niat === "tambal" || r.niat === "tambahan") {
    const satuan = Math.floor(rencana / harga + 1e-9);
    if (satuan < 1) return "Jumlah yang ditambah kurang dari satu satuan.";
    const volBaru = vol + satuan;
    const perubahan = bulat(volBaru * harga) - jumlah;
    return { barisId: b.id, kunci: r.kunci, uraian: r.uraian, niat: r.niat, rencana, volSemula: vol, volBaru, harga, perubahan, sisaPembulatan: perubahan - rencana, catatan: `Dari rencana tindakan: ${LABEL_NIAT[r.niat]} ${rp(perubahan)}` };
  }
  return "Tidak ada perubahan untuk pilihan ini.";
}

/**
 * Susun langkah pengisian untuk seluruh rencana RO terhadap baris kertas kerja RO itu. Butir Biarkan dan Tunda tidak dimasukkan sama sekali
 * (bukan langkah dan bukan yang dilewati). Baris dicocokkan lewat pok_kunci.
 */
export function isiDariNiat(rencana: readonly BarisRencana[], baris: readonly BarisKk[]): HasilIsi {
  const peta = new Map<string, BarisKk>();
  for (const b of baris) if (b.pok_kunci !== null && b.detail_id !== null && !b.penggenap && !peta.has(b.pok_kunci)) peta.set(b.pok_kunci, b);
  const langkah: LangkahIsi[] = [];
  const dilewati: LewatiIsi[] = [];
  for (const r of rencana) {
    if (!butuhJumlah(r.niat) || r.jumlah <= 0) continue;
    const b = peta.get(r.kunci);
    const alasan = alasanTidakBisa(b);
    if (alasan !== null || !b) { dilewati.push({ kunci: r.kunci, uraian: r.uraian, niat: r.niat, alasan: alasan ?? "Baris tidak ditemukan." }); continue; }
    const l = langkahDariNiat(r, b);
    if (typeof l === "string") dilewati.push({ kunci: r.kunci, uraian: r.uraian, niat: r.niat, alasan: l });
    else langkah.push(l);
  }
  let dilepas = 0, ditambah = 0;
  for (const l of langkah) { if (l.perubahan < 0) dilepas += -l.perubahan; else ditambah += l.perubahan; }
  return { langkah, dilewati, dilepas, ditambah, selisihKeseimbangan: ditambah - dilepas };
}

/** Kalimat ringkas hasil pengisian untuk ditampilkan sebelum dan sesudah tombol ditekan. */
export function kalimatIsi(h: HasilIsi): string {
  if (h.langkah.length === 0) return h.dilewati.length > 0 ? `Tidak ada baris yang dapat diisi; ${h.dilewati.length} dilewati.` : "Tidak ada rencana tindakan yang perlu diisi ke kertas kerja.";
  const dasar = `${h.langkah.length} baris akan diubah: dilepas ${rp(h.dilepas)}, ditambah ${rp(h.ditambah)}.`;
  if (h.selisihKeseimbangan === 0) return `${dasar} Seimbang: pagu RO tetap.`;
  if (h.selisihKeseimbangan > 0) return `${dasar} Menjadi lebih besar ${rp(h.selisihKeseimbangan)} dari Semula; tutup dengan geseran dari butir lain atau kurangi tambahan.`;
  return `${dasar} Menjadi lebih kecil ${rp(-h.selisihKeseimbangan)} dari Semula; sisa itu dapat disalurkan lewat geseran atau Dana penggenap.`;
}

/** Isi tulis untuk satu langkah: volume baru dan, bila catatan baris masih kosong, keterangan asal perubahan. */
export function isiTulisLangkah(l: LangkahIsi, catatanSekarang: string | null | undefined): Record<string, unknown> {
  const isi: Record<string, unknown> = { vol_menjadi: l.volBaru };
  if (!catatanSekarang || catatanSekarang.trim() === "") isi.catatan = l.catatan;
  return isi;
}

// ---------------------------------------------------------------- geseran (siapa membiayai siapa)
export type RencanaGeseran = { donorId: number; penerimaId: number; jumlah: number; catatan: string };
export type HasilGeseran = { geseran: RencanaGeseran[]; /** dana dilepas yang tidak punya penerima sekelompok, dan dana ditambah yang tidak punya donor */ tanpaPenerima: number; tanpaDonor: number };

/**
 * Pasangkan donor (baris yang dilepas) dengan penerima (baris yang ditambah) di dalam kelompok belanja yang sama (51, 524, 52L, 53; aturan D-08),
 * dari yang terbesar, sebesar yang sama-sama tersedia. Hasilnya catatan geseran; angka sebenarnya tetap di baris kertas kerja.
 * Sisa yang tidak berpasangan dilaporkan, tidak dipaksakan.
 */
export function pasangkanGeseran(langkah: readonly LangkahIsi[], baris: readonly BarisKk[]): HasilGeseran {
  const akunDari = new Map(baris.map((b) => [b.id, b.akun_menjadi] as const));
  type Sisi = { id: number; sisa: number };
  const donor = new Map<string, Sisi[]>(), terima = new Map<string, Sisi[]>();
  let tanpaKelompok = { donor: 0, terima: 0 };
  for (const l of langkah) {
    const k = kelompokAkun(akunDari.get(l.barisId));
    const jumlah = Math.abs(l.perubahan);
    if (jumlah === 0) continue;
    if (k === null) { if (l.perubahan < 0) tanpaKelompok.donor += jumlah; else tanpaKelompok.terima += jumlah; continue; }
    const peta = l.perubahan < 0 ? donor : terima;
    const daftar = peta.get(k) ?? [];
    daftar.push({ id: l.barisId, sisa: jumlah });
    peta.set(k, daftar);
  }
  const geseran: RencanaGeseran[] = [];
  const kelompok = new Set([...donor.keys(), ...terima.keys()]);
  let tanpaPenerima = tanpaKelompok.donor, tanpaDonor = tanpaKelompok.terima;
  for (const k of [...kelompok].sort()) {
    const d = (donor.get(k) ?? []).sort((a, b) => b.sisa - a.sisa || a.id - b.id);
    const t = (terima.get(k) ?? []).sort((a, b) => b.sisa - a.sisa || a.id - b.id);
    let i = 0, j = 0;
    while (i < d.length && j < t.length) {
      const jumlah = Math.min(d[i].sisa, t[j].sisa);
      if (jumlah > 0) geseran.push({ donorId: d[i].id, penerimaId: t[j].id, jumlah, catatan: "Dari rencana tindakan" });
      d[i].sisa -= jumlah; t[j].sisa -= jumlah;
      if (d[i].sisa === 0) i++;
      if (t[j].sisa === 0) j++;
    }
    for (; i < d.length; i++) tanpaPenerima += d[i].sisa;
    for (; j < t.length; j++) tanpaDonor += t[j].sisa;
  }
  return { geseran, tanpaPenerima, tanpaDonor };
}

/** Isi tulis satu geseran untuk keu_kk_geseran (insert). */
export const isiTulisGeseran = (jadwal: number, g: RencanaGeseran): Record<string, unknown> => ({ jadwal_id: jadwal, donor_id: g.donorId, penerima_id: g.penerimaId, jumlah: g.jumlah, catatan: g.catatan });
