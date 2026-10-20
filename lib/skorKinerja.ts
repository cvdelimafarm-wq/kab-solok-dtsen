// lib/skorKinerja.ts  (murni: tanpa database, tanpa jaringan)
//
// (15 Okt 2026) Skor kinerja harian Transport Lokal PPL -- keputusan M. Iqbal Hadi (lihat Project: rancangan-skor-kinerja-harian-target-harian).
// Poin hari = 5 x KK terdampak + 1 x KK tidak terdampak + 1 poin per km jarak. Target minimal 60 poin/hari = 1 O-K (mulai 20 Okt 2026; sebelumnya 45).
// (20 Okt 2026, keputusan user) Mulai 20 Okt 2026: target 45 -> 60 poin (poin jarak tetap 1 per km; sempat diusulkan 1 per 5 km tetapi dibatalkan user).
// TIDAK berlaku mundur: hari sebelum 20 Okt tetap memakai target lama (45 poin). Aturan dipilih per tanggal lewat RIWAYAT_ATURAN / aturanUntukTanggal; hutang dibawa dalam satuan O-K
// (pecahan hari) supaya bisa dibawa melewati pergantian aturan.
//
// Aturan agregat (realisasi):
//  - Tanpa toleransi. Kekurangan poin hari ini menjadi HUTANG; poin hari-hari berikutnya menutup hutang LEBIH DULU
//    (hutang kumulatif sampai akhir periode; sisa hutang di akhir periode tidak dibayar).
//  - Kinerja di atas 100% pada satu hari tidak menambah pembayaran (kelebihan tidak disimpan).
//  - Sampai tanggal 14 Okt 2026: hari kerja LENGKAP dihitung penuh (1 O-K). Mulai 15 Okt 2026: sesuai bobot poin.
//  - Hari yang TIDAK lengkap (laporan/foto) tidak dikredit dan tidak membuat hutang (syarat hari lengkap tetap berlaku;
//    dapat dilengkapi lewat izin susulan).
//  - Pecahan O-K dibulatkan KE BAWAH. Tidak ada rupiah di sini.
//
// Nilai yang BELUM diputuskan user dipasang sebagai asumsi eksplisit di ATURAN_POIN (mudah diganti satu tempat):
//  - poin KK "tidak ditemukan" = 0; - batas poin jarak = 15 poin/hari (usul; 0 = tanpa batas tidak didukung, isi angka besar; = 15 km pada 1 poin/km).

export type AturanPoin = {
  poinTerdampak: number;
  poinTidakTerdampak: number;
  poinTidakDitemukan: number;
  poinPerKm: number;
  /** Batas poin jarak per hari (asumsi usul; belum diputuskan user). */
  maksPoinJarak: number;
  /** Target minimal poin per hari = 1 O-K. */
  targetHarian: number;
  /** Tanggal mulai aturan bobot (WIB). Sebelumnya: hari lengkap = 1 O-K penuh. */
  mulaiBobot: string;
};

/** Aturan lama: berlaku 15-19 Okt 2026 (target 45 poin, 1 poin per km). Dipertahankan untuk hari-hari yang sudah berlalu. */
export const ATURAN_POIN_V1: AturanPoin = {
  poinTerdampak: 5,
  poinTidakTerdampak: 1,
  poinTidakDitemukan: 0,
  poinPerKm: 1,
  maksPoinJarak: 15,
  targetHarian: 45,
  mulaiBobot: "2026-10-15",
};

/** Aturan berlaku sekarang: mulai 20 Okt 2026 (target 60 poin, 1 poin per km tetap). */
export const ATURAN_POIN: AturanPoin = {
  poinTerdampak: 5,
  poinTidakTerdampak: 1,
  poinTidakDitemukan: 0,
  poinPerKm: 1, // tetap 1 poin per km
  maksPoinJarak: 15,
  targetHarian: 60,
  mulaiBobot: "2026-10-20",
};

/** Daftar aturan menurut tanggal mulai (naik). Tanggal sebelum aturan pertama = aturan "lama" (hari lengkap = 1 O-K penuh). */
export const RIWAYAT_ATURAN: AturanPoin[] = [ATURAN_POIN_V1, ATURAN_POIN];

/** Tanggal pertama penilaian bobot poin (15 Okt 2026); sebelumnya hari lengkap dihitung penuh. */
export const MULAI_BOBOT_AWAL = RIWAYAT_ATURAN[0].mulaiBobot;

/** Aturan yang berlaku pada suatu tanggal (WIB, YYYY-MM-DD); null = sebelum penilaian bobot (hari lengkap = 1 O-K penuh). */
export function aturanUntukTanggal(tanggal: string, riwayat: AturanPoin[] = RIWAYAT_ATURAN): AturanPoin | null {
  let hasil: AturanPoin | null = null;
  for (const a of riwayat) if (tanggal >= a.mulaiBobot) hasil = a;
  return hasil;
}

export type MasukanHari = { terdampak: number; tidak_terdampak: number; tidak_ditemukan: number; km: number };

export type PoinHari = {
  poin_terdampak: number;
  poin_tidak_terdampak: number;
  poin_tidak_ditemukan: number;
  poin_jarak: number;
  total: number;
  target: number;
  /** Persentase terhadap target, dibulatkan; boleh > 100 (hanya tampilan). */
  persen: number;
  /** Kekurangan poin terhadap target (0 bila tercapai). */
  kurang: number;
};

const bulat2 = (x: number): number => Math.round(x * 100) / 100;
const tak_negatif = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

/** Poin satu hari dari hasil pendataan dan jarak rute (km). Poin jarak hanya bila minimal 1 KK didata hari itu. */
export function hitungPoinHari(m: MasukanHari, a: AturanPoin = ATURAN_POIN): PoinHari {
  const t = Math.floor(tak_negatif(m.terdampak));
  const n = Math.floor(tak_negatif(m.tidak_terdampak));
  const d = Math.floor(tak_negatif(m.tidak_ditemukan));
  const km = tak_negatif(m.km);
  const adaKk = t + n + d > 0;
  const poinT = t * a.poinTerdampak;
  const poinN = n * a.poinTidakTerdampak;
  const poinD = d * a.poinTidakDitemukan;
  const poinJ = adaKk ? Math.min(bulat2(km * a.poinPerKm), a.maksPoinJarak) : 0;
  const total = bulat2(poinT + poinN + poinD + poinJ);
  return {
    poin_terdampak: poinT,
    poin_tidak_terdampak: poinN,
    poin_tidak_ditemukan: poinD,
    poin_jarak: poinJ,
    total,
    target: a.targetHarian,
    persen: Math.round((total / a.targetHarian) * 100),
    kurang: bulat2(Math.max(0, a.targetHarian - total)),
  };
}

export type HariSkor = MasukanHari & {
  /** YYYY-MM-DD (WIB) hari kerja. */
  tanggal: string;
  /** Laporan + foto lengkap (aturan lama "hari lengkap"). */
  lengkap: boolean;
};

export type RincianHari = {
  tanggal: string;
  lengkap: boolean;
  /** "lama" = aturan sebelum 15 Okt (1 O-K penuh); "bobot" = aturan poin. */
  aturan: "lama" | "bobot";
  poin: number;
  /** Poin yang dipakai menutup hutang hari sebelumnya. */
  untuk_hutang: number;
  /** Poin yang dikreditkan untuk hari ini sendiri (maksimal target). */
  kredit_hari: number;
  /** Poin yang melampaui target dan tidak disimpan. */
  hangus: number;
  /** Hutang berjalan sesudah hari ini diproses, dalam poin menurut aturan hari ini. */
  hutang_sesudah: number;
  /** Hutang berjalan sesudah hari ini diproses, dalam O-K (pecahan hari; tidak bergantung pada aturan). */
  hutang_sesudah_ok: number;
};

export type Realisasi = {
  rincian: RincianHari[];
  /** O-K dari aturan lama (sampai 14 Okt): jumlah hari lengkap. */
  ok_lama: number;
  /** O-K dari aturan bobot (mulai 15 Okt), pecahan, dua desimal. */
  ok_bobot: number;
  /** Total terkumpul, pecahan, dua desimal. */
  ok_terkumpul: number;
  /** Total yang dibayar: dibulatkan ke bawah. */
  ok_dibayar: number;
  /** Jumlah hari kerja yang dihitung (lengkap). */
  hari_dihitung: number;
  /** Hutang poin yang belum tertutup. */
  hutang_poin: number;
  hutang_ok: number;
};

const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/**
 * Realisasi agregat dari seluruh hari kerja (urutan tanggal diurutkan di sini). Tiap hari memakai aturan yang berlaku pada tanggalnya
 * (RIWAYAT_ATURAN). Hutang dihitung dalam O-K (pecahan hari) agar tetap benar saat target berganti; dengan satu aturan hasilnya sama dengan hitungan poin biasa.
 */
export function hitungRealisasi(hari: HariSkor[], riwayat: AturanPoin[] = RIWAYAT_ATURAN): Realisasi {
  const urut = [...hari].sort((x, y) => (x.tanggal < y.tanggal ? -1 : x.tanggal > y.tanggal ? 1 : 0));
  let hutangOk = 0;
  let okLama = 0;
  let okBobot = 0;
  let hariDihitung = 0;
  let targetTerakhir = riwayat[riwayat.length - 1].targetHarian;
  const rincian: RincianHari[] = [];

  for (const h of urut) {
    const a = aturanUntukTanggal(h.tanggal, riwayat);
    const bobot = a !== null;
    const aturan = a ?? riwayat[0];
    const target = aturan.targetHarian;
    targetTerakhir = target;
    const p = hitungPoinHari(h, aturan).total;
    const dasar = { tanggal: h.tanggal, aturan: (bobot ? "bobot" : "lama") as RincianHari["aturan"], poin: p };
    if (!h.lengkap) {
      rincian.push({ ...dasar, lengkap: false, untuk_hutang: 0, kredit_hari: 0, hangus: 0, hutang_sesudah: bulat2(hutangOk * target), hutang_sesudah_ok: r6(hutangOk) });
      continue;
    }
    hariDihitung += 1;
    if (!bobot) {
      okLama += 1;
      rincian.push({ ...dasar, lengkap: true, untuk_hutang: 0, kredit_hari: target, hangus: 0, hutang_sesudah: bulat2(hutangOk * target), hutang_sesudah_ok: r6(hutangOk) });
      continue;
    }
    const pOk = p / target;
    const untukHutang = Math.min(hutangOk, pOk);
    const sisa = pOk - untukHutang;
    const kredit = Math.min(sisa, 1);
    const hangus = sisa - kredit;
    hutangOk = r6(hutangOk - untukHutang + (1 - kredit));
    okBobot = r6(okBobot + untukHutang + kredit);
    rincian.push({
      ...dasar,
      lengkap: true,
      untuk_hutang: bulat2(untukHutang * target),
      kredit_hari: bulat2(kredit * target),
      hangus: bulat2(hangus * target),
      hutang_sesudah: bulat2(hutangOk * target),
      hutang_sesudah_ok: hutangOk,
    });
  }

  const terkumpul = bulat2(okLama + okBobot);
  return {
    rincian,
    ok_lama: okLama,
    ok_bobot: bulat2(okBobot),
    ok_terkumpul: terkumpul,
    ok_dibayar: Math.floor(terkumpul + 1e-9),
    hari_dihitung: hariDihitung,
    hutang_poin: bulat2(hutangOk * targetTerakhir),
    hutang_ok: bulat2(hutangOk),
  };
}

/** Angka gaya Indonesia: koma desimal, tanpa nol berlebih (38 -> "38", 6,84 -> "6,84"). */
export function formatAngka(x: number, maksDesimal = 2): string {
  const v = Math.round(x * 10 ** maksDesimal) / 10 ** maksDesimal;
  return v.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: maksDesimal });
}

/** Teks nilai mutlak x / y, mis. "42 / 60". */
export const teksXY = (x: number, y: number, maksDesimal = 2): string => `${formatAngka(x, maksDesimal)} / ${formatAngka(y, maksDesimal)}`;

/** Persentase bulat (boleh > 100), "84%". */
export const teksPersen = (x: number, y: number): string => `${y > 0 ? Math.round((x / y) * 100) : 0}%`;

// ---------------------------------------------------------------- bentuk jawaban API capaian (/api/portal/pendataan/capaian)

/** Cara jarak hari itu dihitung: jalan (OSRM), perkiraan (garis lurus x 1,3), tanpa_rumah / tanpa_titik (jarak belum bisa dihitung), tidak_ada (belum ada KK didata). */
export type JarakMetode = "jalan" | "perkiraan" | "tanpa_rumah" | "tanpa_titik" | "tidak_ada";

export type CapaianHari = PoinHari & {
  tanggal: string;
  terdampak: number;
  tidak_terdampak: number;
  tidak_ditemukan: number;
  km: number;
  metode: JarakMetode;
};

export type DataCapaian =
  | { ada: false }
  | {
      ada: true;
      sekarang: string;
      kegiatan: string;
      hari_ini: CapaianHari;
      realisasi: Realisasi;
      /** Hutang poin dari hari-hari sebelum hari ini (ditutup lebih dulu oleh poin hari ini). */
      hutang_sebelumnya: number;
      /** Aturan bobot sudah berlaku pada hari ini? (mulai 15 Okt 2026) */
      bobot_berlaku: boolean;
      aturan: Pick<AturanPoin, "poinTerdampak" | "poinTidakTerdampak" | "poinPerKm" | "maksPoinJarak" | "targetHarian" | "mulaiBobot">;
    };
