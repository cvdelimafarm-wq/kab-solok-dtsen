// lib/sigapLengkapiMandiri.ts
//
// (8 Nov 2026) Petugas translok melengkapi sendiri KEKURANGAN pada hari kerja yang sudah lewat (tanggal merah) tanpa menunggu izin susulan,
// dan mengembalikan tanggal merah yang tidak sengaja dilepas. Murni (tanpa React/DB) supaya mudah diuji.
//
// Aturan (permintaan user, 8 Nov 2026):
//  - Hari lampau yang masih berupa hari kerja dan BELUM lengkap boleh dilengkapi petugas: laporan diketik manual, foto diunggah manual.
//  - Hanya MENAMBAH: laporan yang sudah ada dan foto yang sudah terunggah tidak bisa diubah / dihapus lewat jalur ini (jejak tetap utuh).
//  - Foto yang kurang paling banyak MAKS_FOTO_KURANG_MANDIRI; lebih dari itu tetap lewat izin susulan atasan/admin.
//  - Hari yang sudah lengkap, SPJ yang sudah dikunci, kegiatan arsip, dan blokir translok tidak terpengaruh (dijaga di cekAksesIsian).
//  - Tanggal yang dilepas petugas sendiri ("melepas hari terlewat") boleh dikembalikan selama riwayat terakhirnya adalah pelepasan itu.

/** Foto yang boleh kurang agar hari lampau masih bisa dilengkapi sendiri. Ubah angka ini bila kebijakan berubah. */
export const MAKS_FOTO_KURANG_MANDIRI = 2;

/** Teks `oleh` pada sigap_hari_kerja_riwayat; dipakai penulis dan pembaca supaya selalu cocok. */
export const olehMelepas = (nama: string): string => `petugas:${nama} (melepas hari terlewat)`;
export const olehMengembalikan = (nama: string): string => `petugas:${nama} (mengembalikan hari terlewat)`;

export type KekuranganHari = { laporanKurang: boolean; fotoKurang: number };

/** Kekurangan sebuah hari menurut aturan isian kegiatan. `dianggap` = laporan dianggap selesai dari hasil lembar. */
export function hitungKekurangan(
  adaLaporan: boolean,
  dianggap: boolean,
  jumlahFoto: number,
  aturan: { wajib_laporan: boolean; jumlah_foto: number }
): KekuranganHari {
  return {
    laporanKurang: aturan.wajib_laporan && !adaLaporan && !dianggap,
    fotoKurang: Math.max(0, aturan.jumlah_foto - jumlahFoto),
  };
}

export type PutusanLengkapi = { boleh: true } | { boleh: false; alasan: "lengkap" | "foto_terlalu_kurang" };

/** Boleh dilengkapi sendiri? Hanya menilai kekurangan; pemeriksaan penugasan/kunci/arsip/hari kerja dilakukan pemanggil. */
export function bolehLengkapiMandiri(k: KekuranganHari): PutusanLengkapi {
  if (!k.laporanKurang && k.fotoKurang === 0) return { boleh: false, alasan: "lengkap" };
  if (k.fotoKurang > MAKS_FOTO_KURANG_MANDIRI) return { boleh: false, alasan: "foto_terlalu_kurang" };
  return { boleh: true };
}

export const PESAN_FOTO_TERLALU_KURANG = `Foto yang kurang lebih dari ${MAKS_FOTO_KURANG_MANDIRI}. Tanggal ini tidak bisa dilengkapi sendiri; ajukan susulan ke atasan atau hubungi admin anggaran.`;

export type BarisRiwayat = { tanggal: string; aksi: string; oleh: string | null; id: number };

/**
 * Tanggal yang boleh DIKEMBALIKAN petugas: riwayat terakhir tanggal itu adalah "hapus" oleh petugas yang sama (melepas hari terlewat),
 * tanggalnya sudah lewat, dan sekarang bukan hari kerja. Riwayat boleh tidak berurutan; urutan ditentukan `id` terbesar.
 */
export function tanggalDapatDipulihkan(riwayat: BarisRiwayat[], nama: string, hariIni: string, sekarangHariKerja: Set<string>): string[] {
  const terakhir = new Map<string, BarisRiwayat>();
  for (const r of riwayat) {
    const a = terakhir.get(r.tanggal);
    if (!a || r.id > a.id) terakhir.set(r.tanggal, r);
  }
  const hasil: string[] = [];
  for (const [t, r] of terakhir) {
    if (t < hariIni && !sekarangHariKerja.has(t) && r.aksi === "hapus" && r.oleh === olehMelepas(nama)) hasil.push(t);
  }
  return hasil.sort();
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Laporan manual hari terlewat untuk kegiatan Pascabencana (permintaan user, 8 Nov 2026): per SLS yang dikunjungi pada tanggal itu, petugas mengisi
// jumlah ditemukan terdampak, ditemukan tidak terdampak, dan tidak ditemukan. Disimpan di sigap_realisasi.lokasi (JSON, tanpa SQL baru);
// jumlah_realisasi = ketiganya dijumlahkan (unit yang dikunjungi), supaya poin kinerja dan translok tetap membaca satu angka.
// ---------------------------------------------------------------------------------------------------------------------------------

export const MAKS_SLS_LAPORAN = 10;
export const MAKS_ANGKA_SLS = 500;

/** Kegiatan yang memakai form rincian SLS saat melengkapi laporan terlewat. */
export const pakaiFormSls = (kodeKegiatan: string): boolean => kodeKegiatan.startsWith("pascabencana");

export type RincianSls = { kecamatan: string; nagari: string; jorong: string; terdampak: number; tidak_terdampak: number; tidak_ditemukan: number };
export const kunciSls = (x: { kecamatan: string; nagari: string; jorong: string }): string => `${x.kecamatan}|${x.nagari}|${x.jorong}`;

const bulatTaknegatif = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAKS_ANGKA_SLS ? v : null);

/** Memeriksa rincian dari klien terhadap master SLS (kunci kecamatan|nagari|jorong). Mengembalikan baris bersih dan jumlah total, atau pesan galat. */
export function susunLaporanSls(mentah: unknown, master: Set<string>): { error: string } | { rincian: RincianSls[]; jumlah: number } {
  if (!Array.isArray(mentah) || mentah.length === 0) return { error: "Pilih minimal 1 SLS yang dikunjungi pada tanggal ini." };
  if (mentah.length > MAKS_SLS_LAPORAN) return { error: `Maksimal ${MAKS_SLS_LAPORAN} SLS per laporan.` };
  const lihat = new Set<string>();
  const rincian: RincianSls[] = [];
  for (const m of mentah as Record<string, unknown>[]) {
    const kec = typeof m?.kecamatan === "string" ? m.kecamatan : "";
    const nag = typeof m?.nagari === "string" ? m.nagari : "";
    const jor = typeof m?.jorong === "string" ? m.jorong : "";
    const kunci = kunciSls({ kecamatan: kec, nagari: nag, jorong: jor });
    if (!kec || !nag || !jor || !master.has(kunci)) return { error: "SLS yang dipilih tidak dikenal. Pilih dari daftar." };
    if (lihat.has(kunci)) return { error: `SLS ${jor} (${nag}) dipilih dua kali.` };
    lihat.add(kunci);
    const a = bulatTaknegatif(m.terdampak);
    const b = bulatTaknegatif(m.tidak_terdampak);
    const c = bulatTaknegatif(m.tidak_ditemukan);
    if (a === null || b === null || c === null) return { error: `Angka SLS ${jor} harus bilangan bulat 0 sampai ${MAKS_ANGKA_SLS}.` };
    rincian.push({ kecamatan: kec, nagari: nag, jorong: jor, terdampak: a, tidak_terdampak: b, tidak_ditemukan: c });
  }
  const jumlah = rincian.reduce((n, r) => n + r.terdampak + r.tidak_terdampak + r.tidak_ditemukan, 0);
  if (jumlah > MAKS_ANGKA_SLS) return { error: `Jumlah seluruhnya melebihi ${MAKS_ANGKA_SLS}. Periksa kembali angkanya.` };
  return { rincian, jumlah };
}

/** Tanda pada tiap SLS di sigap_realisasi.lokasi: laporan ini diisi manual untuk melengkapi hari terlewat dan TIDAK dihitung sebagai poin kinerja. */
export const SUMBER_LAPORAN_MANUAL = "manual_susulan";
