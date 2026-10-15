// lib/skorKinerja.ts  (murni: tanpa database, tanpa jaringan)
//
// (15 Okt 2026) Skor kinerja harian Transport Lokal PPL -- keputusan M. Iqbal Hadi (lihat Project: rancangan-skor-kinerja-harian-target-harian).
// Poin hari = 5 x KK terdampak + 1 x KK tidak terdampak + 1 x km jarak. Target minimal 45 poin/hari = 1 O-K.
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
//  - poin KK "tidak ditemukan" = 0; - batas poin jarak = 15 poin/hari (usul; 0 = tanpa batas tidak didukung, isi angka besar).

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

export const ATURAN_POIN: AturanPoin = {
  poinTerdampak: 5,
  poinTidakTerdampak: 1,
  poinTidakDitemukan: 0,
  poinPerKm: 1,
  maksPoinJarak: 15,
  targetHarian: 45,
  mulaiBobot: "2026-10-15",
};

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
  /** Hutang berjalan sesudah hari ini diproses. */
  hutang_sesudah: number;
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

/** Realisasi agregat dari seluruh hari kerja (urutan tanggal diurutkan di sini). */
export function hitungRealisasi(hari: HariSkor[], a: AturanPoin = ATURAN_POIN): Realisasi {
  const urut = [...hari].sort((x, y) => (x.tanggal < y.tanggal ? -1 : x.tanggal > y.tanggal ? 1 : 0));
  let hutang = 0;
  let okLama = 0;
  let poinBobot = 0;
  let hariDihitung = 0;
  const rincian: RincianHari[] = [];

  for (const h of urut) {
    const bobot = h.tanggal >= a.mulaiBobot;
    const p = hitungPoinHari(h, a).total;
    if (!h.lengkap) {
      rincian.push({ tanggal: h.tanggal, lengkap: false, aturan: bobot ? "bobot" : "lama", poin: p, untuk_hutang: 0, kredit_hari: 0, hangus: 0, hutang_sesudah: bulat2(hutang) });
      continue;
    }
    hariDihitung += 1;
    if (!bobot) {
      okLama += 1;
      rincian.push({ tanggal: h.tanggal, lengkap: true, aturan: "lama", poin: p, untuk_hutang: 0, kredit_hari: a.targetHarian, hangus: 0, hutang_sesudah: bulat2(hutang) });
      continue;
    }
    const untukHutang = Math.min(hutang, p);
    hutang = bulat2(hutang - untukHutang);
    const sisa = bulat2(p - untukHutang);
    const kredit = Math.min(sisa, a.targetHarian);
    const hangus = bulat2(sisa - kredit);
    hutang = bulat2(hutang + (a.targetHarian - kredit));
    poinBobot = bulat2(poinBobot + untukHutang + kredit);
    rincian.push({ tanggal: h.tanggal, lengkap: true, aturan: "bobot", poin: p, untuk_hutang: bulat2(untukHutang), kredit_hari: bulat2(kredit), hangus, hutang_sesudah: hutang });
  }

  const okBobot = bulat2(poinBobot / a.targetHarian);
  const terkumpul = bulat2(okLama + okBobot);
  return {
    rincian,
    ok_lama: okLama,
    ok_bobot: okBobot,
    ok_terkumpul: terkumpul,
    ok_dibayar: Math.floor(terkumpul + 1e-9),
    hari_dihitung: hariDihitung,
    hutang_poin: hutang,
    hutang_ok: bulat2(hutang / a.targetHarian),
  };
}

/** Angka gaya Indonesia: koma desimal, tanpa nol berlebih (38 -> "38", 6,84 -> "6,84"). */
export function formatAngka(x: number, maksDesimal = 2): string {
  const v = Math.round(x * 10 ** maksDesimal) / 10 ** maksDesimal;
  return v.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: maksDesimal });
}

/** Teks nilai mutlak x / y, mis. "38 / 45". */
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
