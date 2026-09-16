// lib/konsistensiFieldMapKP.ts
//
// Pemetaan nama field aturan konsistensi VSEN26.KP (rule_expr, disalin dari
// aplikasi desktop client, kuesioner='KP' di Supabase kp_konsistensi_rules)
// -> cara mengambil nilainya dari tabel DBF hasil entri (tabel t3..t12,
// m1/m1b/m1c/mrt1/mrt2/mrt3).
//
// Beda dgn VSEN26.M (yg field rule_expr-nya "R..." tapi kolom DBF-nya
// "M..." -- lihat konsistensiFieldMap.ts), utk VSEN26.KP SEBAGIAN BESAR
// nama field rule_expr SAMA PERSIS dgn nama kolom DBF asli (dikonfirmasi
// dari 15 file DBF ekspor asli yg diunggah PPL 2026-09-16, dibaca langsung
// pakai paket 'dbffile' -- BUKAN dugaan dari dokumentasi kuesioner).
//
// Field rule_expr KP terbagi 3 golongan, masing² caranya beda:
//
// 1) FIELD BARIS-KOMODITAS "R{n}K{c}" (mis. "R188K2") -- n = NOURUTKOMO
//    (nomor urut komoditas 1-347), c = nomor KOLOM di database (BUKAN nomor
//    kolom cetak di kertas kuesioner -- itu beda lagi, cuma dipakai di teks
//    narasi lib/anomalyChecks.ts). Dikonfirmasi dari kode KP-01/KP-23/KP-24
//    yg SUDAH diuji thd data riil: utk n 1-225, K{c} = KOLOM{c} APA ADANYA
//    (K1=KOLOM1, K2=KOLOM2, dst). Tabel asal ditentukan dari rentang n:
//      1-186   -> t3 (Komoditi Makanan RT, TIDAK ada breakdown per ART)
//      187-225 -> t4 (Komoditi Makanan ART -- BISA ada >1 baris per NOURUTKOMO
//                 per rumah tangga, satu per anggota RT yg mengonsumsi --
//                 dikonfirmasi: NKS 00050|NURT 8|NOURUTKOMO 187 py 2 baris)
//      226-347 -> t5 (Komoditi Non Makanan, TIDAK ada breakdown per ART)
//    Field ini diberi nilai LEWAT KONTEKS EVALUASI (bukan lewat peta statis
//    di sini) -- lihat lib/runKonsistensiPipelineKP.ts, buildKpFlatRow():
//      - Level RT / SUM(...) / rujukan lintas-baris (subtotal): nilai yg
//        dipakai adalah HASIL PENJUMLAHAN semua baris t3/t4/t5 milik rumah
//        tangga itu yg NOURUTKOMO=n, kolom KOLOM{c} (utk t3/t5 yg cuma py 1
//        baris per NOURUTKOMO per RT, hasilnya sama saja dgn nilai baris itu
//        sendiri).
//      - Level ART/ARTB5A/ARTB5B dgn SATU nomor baris (mayoritas, 626/632
//        aturan level ART): dievaluasi PER BARIS MENTAH t3/t4/t5 (bukan
//        hasil jumlah) -- supaya kasus "banyak beli terisi tapi nilai beli
//        kosong" terdeteksi per baris entri, bukan tertutupi penjumlahan.
//      - 6 aturan level ART yg justru merujuk BANYAK nomor baris sekaligus
//        (pola subtotal, mis. rule 2220 R187K2 = SUM(R188K2..R219K2)) --
//        DIPERLAKUKAN seperti level RT (evaluasi sekali per rumah tangga
//        pakai nilai hasil jumlah), karena baris "header" R187 sendiri pun
//        py banyak entri ART yg perlu dijumlahkan dulu.
//
// 2) FIELD PREFIX "KOR_" (rujuk ke data VSEN26.M rumah tangga yg sama, mis.
//    "KOR_R1501") -- setelah prefix dibuang, dipetakan PAKAI ULANG peta
//    resmi VSEN26.M (KONSISTENSI_FIELD_MAP dari konsistensiFieldMap.ts, yg
//    sudah menangani swap R->M & bbrp kasus penamaan tak umum spt "R1104_H"
//    -> "M1104H"), dicari di baris gabungan mrt1+mrt2+mrt3 rumah tangga yg
//    SAMA (dicocokkan lewat NKS+NURT).
//
// 3) FIELD LAIN (header Blok I-III per dokumen -- R101*, R110, R201-R203,
//    R301-R305, R401, Catatan -- dan field rekap Blok IV.3/V/VI/VII --
//    B43*, B5*, B6*, B7*, JmlkomoditasN) -- KEBANYAKAN nama field rule_expr
//    SAMA PERSIS dgn nama kolom DBF (identity match, case-insensitive).
//    Sejumlah KECIL butuh alias eksplisit (KP_FIELD_ALIASES di bawah) --
//    baik krn beda prefix "M" (mis. "MB431K3" -> kolom asli "B431K3" di t6,
//    "MB5BK2" JUSTRU kolom aslinya MEMANG "MB5BK2" di t8 -- makanya dicoba
//    dulu APA ADANYA sebelum dicoba dibuang huruf "M"-nya), maupun beda
//    penamaan total (mis. "Jmlkomoditas2" -> kolom asli "JMLHAL2" di t9).

import type { DbfRow } from './dbfParser';
import type { Tables } from './anomalyChecks';
import { KONSISTENSI_FIELD_MAP } from './konsistensiFieldMap';

// -----------------------------------------------------------------------
// 1) Resolusi field baris-komoditas "R{n}K{c}"
// -----------------------------------------------------------------------

export const ROW_FIELD_RE = /^R(\d+)K(\d+[A-Z]?)$/;

export type KomoditasTable = 't3' | 't4' | 't5';

/** Tabel asal berdasarkan rentang NOURUTKOMO. */
export function komoditasTableForRow(n: number): KomoditasTable | null {
  if (n >= 1 && n <= 186) return 't3';
  if (n >= 187 && n <= 225) return 't4';
  if (n >= 226 && n <= 347) return 't5';
  return null;
}

/** true kalau nomor baris ini BISA py >1 entri per NOURUTKOMO per RT (per ART). */
export function isArtLevelRow(n: number): boolean {
  return n >= 187 && n <= 225;
}

// -----------------------------------------------------------------------
// 3) Alias eksplisit utk field non-baris yg penamaannya tak mengikuti
//    pola identity langsung (dikonfirmasi manual thd 15 file DBF asli).
// -----------------------------------------------------------------------

const KP_FIELD_ALIASES: Record<string, string> = {
  // Blok IV.3 (rekap B43) -- "Jmlkomoditas{n}" (rule_expr) -> "JMLHAL{n}" (t9)
  JMLKOMODITAS2: 'JMLHAL2',
  JMLKOMODITAS4: 'JMLHAL4',
  JMLKOMODITAS6: 'JMLHAL6',
  JMLKOMODITAS8: 'JMLHAL8',
  JMLKOMODITAS10: 'JMLHAL10',
  JMLKOMODITAS12: 'JMLHAL12',
  JMLKOMODITAS32: 'JMLHAL32',
  JMLKOMODITAS33: 'JMLHAL33',
  JMLKOMODITAS34: 'JMLHAL34',
  JMLKOMODITAS35: 'JMLHAL35',
  JMLKOMODITAS36: 'JMLHAL36',
  JMLKOMODITAS37: 'JMLHAL37',
  JMLKOMODITAS38: 'JMLHAL38',
  // "Jmlkomoditas14" dipakai dlm SUM(...) di rule 23 -- tidak ada kolom
  // JMLHAL14 di t9 (lompat dari JMLHAL12 ke JMLHAL32), sengaja TIDAK
  // dialiaskan -- dibiarkan tidak terpetakan (lihat unsupported-rules-kp).
};

// -----------------------------------------------------------------------
// Tabel real KP (RT-level: t6,t7,t8,t9,t10,t11,t12) & KOR (M) -- dibangun
// dari kolom DBF asli yg terekam sesi build ini. Dipakai buildKpColumnSet()
// di lib/runKonsistensiPipelineKP.ts utk validasi identity-match.
// -----------------------------------------------------------------------

export const KP_TABLE_KEYS_RT_HEADER: (keyof Tables)[] = ['t6', 't7', 't8', 't9', 't10', 't11', 't12'];
export const KP_TABLE_KEYS_KOR: (keyof Tables)[] = ['m1', 'm1b', 'm1c', 'mrt1', 'mrt2', 'mrt3'];

/**
 * Resolusi field non-baris (bukan "R{n}K{c}") ke {tabel, kolom} nyata.
 * `kpColumns` = union nama kolom (UPPERCASE) semua tabel t6..t12 yg ADA di
 * upload ini; `korColumns` = union nama kolom (UPPERCASE) semua tabel
 * m1/m1b/m1c/mrt1/mrt2/mrt3 yg ADA di upload ini.
 */
export function resolveKpStaticField(
  fUpper: string,
  kpColumns: Set<string>,
  korColumns: Set<string>
): { ok: true; korField?: string; kpColumn?: string } | { ok: false; reason: string } {
  if (fUpper.startsWith('KOR_')) {
    const rest = fUpper.slice(4);
    // Pakai ulang peta resmi VSEN26.M (menangani swap R->M & kasus khusus).
    const mapped = KONSISTENSI_FIELD_MAP[rest] ?? KONSISTENSI_FIELD_MAP[rest.replace(/^R/, 'M')];
    if (mapped && korColumns.has(mapped.toUpperCase())) {
      return { ok: true, korField: mapped };
    }
    // fallback: coba cocokkan langsung (tanpa lewat peta M) kalau2 memang
    // sama persis nama kolomnya.
    if (korColumns.has(rest)) return { ok: true, korField: rest };
    return { ok: false, reason: `KOR_ field tidak ada di tabel M/KOR: ${rest}` };
  }

  // Alias eksplisit dicoba duluan.
  const alias = KP_FIELD_ALIASES[fUpper];
  if (alias && kpColumns.has(alias)) return { ok: true, kpColumn: alias };

  // Identity match langsung.
  if (kpColumns.has(fUpper)) return { ok: true, kpColumn: fUpper };

  // Fallback: buang huruf "M" di depan (mis. "MB431K3" -> "B431K3",
  // "MB5AK5" -> "B5AK5") -- TAPI dicoba SETELAH identity match, supaya
  // kolom yg justru MEMANG berprefix "M" di database asli (mis. t8.MB5BK2)
  // tidak salah dipetakan.
  if (fUpper.startsWith('M') && fUpper.length > 1) {
    const stripped = fUpper.slice(1);
    if (kpColumns.has(stripped)) return { ok: true, kpColumn: stripped };
  }

  // Field header umum (R101*, R110, R201-R305, R401, Catatan, dll) kadang
  // juga langsung tersedia di tabel KOR (jarang, tp dijaga2).
  if (korColumns.has(fUpper)) return { ok: true, korField: fUpper };

  return { ok: false, reason: `field tidak terdaftar di tabel KP: ${fUpper}` };
}

export type DbfRowLike = Record<string, unknown>;
