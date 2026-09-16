// lib/anomalyChecks.ts
//
// Implementasi 37 pengecekan anomali VSEN26.KP, dijalankan langsung di
// Node.js (dalam Route Handler) terhadap hasil parse file DBF dari
// aplikasi desktop entri Susenas — BUKAN lewat SQL PANTAU.
import type { DbfRow } from './dbfParser';

export type Finding = {
  id: number;
  kode_anomali: string;
  kelompok: string;
  nks: string | number | null;
  nurt: string | number | null;
  nourutkomo: number | null;
  nama_krt: string | null;
  keterangan?: string;
  narasi?: string;
  namaLainnya?: string | null;
  banyak?: number | null;
  nilai?: number | null;
  rincian?: string;
  kategori?: string;
  detail?: Record<string, unknown>;
};

export type Tables = {
  t3: DbfRow[]; // Komoditi Makanan RT (bahan makanan mentah, No.1-186)
  t4: DbfRow[]; // Komoditi Makanan ART (makanan/minuman jadi & rokok, No.187-225)
  t5: DbfRow[]; // Komoditi Non Makanan (No.226-347)
  t9: DbfRow[]; // Rekap RT Blok IV.3.2-3
  m1?: DbfRow[]; // VSEN26.M — Data KOR ART (file "1_1...", identitas & Blok 4-13 per ART)
  m1c?: DbfRow[]; // VSEN26.M — Data KOR ART (file "1_3...", Blok 11 biaya pendidikan M1112-M1118 per ART)
  mrt1?: DbfRow[]; // VSEN26.M — Data KOR RT (file "2_1...", Blok 14-15 per RT: M1401-M1508)
  mrt2?: DbfRow[]; // VSEN26.M — Data KOR RT (file "2_2...", Blok 15-17 per RT: M1509-M1703)
};

export type Thresholds = {
  garam?: number;
  tiketPesawatMin?: number;
  tiketPesawatMax?: number;
  hotelMin?: number;
  hotelMax?: number;
  transportasiDarat?: number;
  transportasiLautMin?: number;
  transportasiLautMax?: number;
  zscoreNonMakanan?: number;
  // ---------- VSEN26.M ----------
  uangSaku?: number; // M-35 (SUDAH TIDAK DIPAKAI — M-35 diganti logikanya, field ini disisakan demi kompatibilitas versi lama)
  biayaTransport?: number; // (tidak dipakai lagi — M-36 dihapus)
  biayaBukuLKS?: number; // (tidak dipakai lagi — M-37 dihapus)
  biayaBukuATK?: number; // (tidak dipakai lagi — M-38 dihapus)
  sppMaks?: number; // (tidak dipakai lagi — M-39 dihapus)
  olahragaLama?: number; // M-44, dalam menit
};
//
//   Tabel 3  (Komoditi Makanan RT / bahan makanan mentah, No.1-186):
//     KOLOM1=Banyak Beli, KOLOM2=Nilai Beli, KOLOM3=Banyak Nonbeli,
//     KOLOM4=Nilai Nonbeli, KOLOM5=Banyak Total, KOLOM6=Nilai Total,
//     KOLOM8=teks "lainnya", KOLOM9=satuan
//
//   Tabel 4  (Komoditi Makanan ART / makanan-minuman jadi & rokok, No.187-225):
//     KOLOM1=Sumber Perolehan, KOLOM2=Banyak Beli, KOLOM3=Nilai Beli,
//     KOLOM4=Banyak Nonbeli, KOLOM5=Nilai Nonbeli, KOLOM6=Banyak Total,
//     KOLOM7=Nilai Total, KOLOM8=teks "lainnya", KOLOM9=satuan
//
//   Tabel 5  (Komoditi Non Makanan, No.226-347):
//     KOLOM5=Sebulan Terakhir, KOLOM6=Setahun Terakhir,
//     KOLOM7=Banyaknya/kuantitas, KOLOM8=teks "lainnya",
//     KOLOM10..KOLOM14=OOP kesehatan sub a/b/c/d/e
//
//   Tabel 9  (Rekap RT Blok IV.3.2-3): B432R{n}K{3,4,5}, dst.
//
// Ambang batas yang memakai angka tetap (bukan hasil hitung dinamis)
// ditandai jelas di komentar masing-masing — SESUAIKAN dengan kebijakan
// QC Anda sendiri, angka di sini cuma titik awal berbasis data riil
// 150 RT Kabupaten Solok tahun lalu.

// ---------- util ----------

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdev(arr: number[], m?: number): number {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const variance = arr.reduce((a, b) => a + (b - mu) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
function nz(v: number | null | undefined): number {
  return v === null || v === undefined ? 0 : v;
}
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}
function fmtN(n: unknown): string {
  if (n === null || n === undefined || typeof n !== 'number') return '-';
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}
function fmtRp(n: unknown): string {
  if (n === null || n === undefined || typeof n !== 'number') return '-';
  return 'Rp' + n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

/**
 * Bangun narasi lengkap (kalimat, bukan cuma label pendek) per temuan,
 * dengan angka sungguhan disisipkan — mengikuti format contoh laporan
 * anomali tahun lalu (mis. "Ditemukan konsumsi melebihi batas maksimum.
 * Total konsumsi tercatat 300, sedangkan batas maksimum ... 200.").
 * `extra` = objek yang sama yang dikirim ke push() (keterangan, detail,
 * banyak, nilai, namaLainnya, rincian).
 */
function numRef(formatted: string, kolomRef: string): string {
  // Angka ditandai **...** (nanti ditebalkan di frontend), diikuti nama
  // kolom/field sumbernya dalam kurung supaya PPL tahu persis rujukannya.
  return `**${formatted}** (${kolomRef})`;
}

function buildNarasi(kode: string, extra: Record<string, any>): string {
  const d = (extra.detail ?? {}) as Record<string, any>;
  const base = kode.split('.')[0];

  if (kode === 'KP-01' || kode === 'KP-23') {
    // PENTING: nomor kolom di sini mengacu ke KOLOM CETAK di kuesioner fisik
    // (Kolom 5=Banyak Beli, 6=Nilai Beli, 7=Banyak Nonbeli, 8=Nilai Nonbeli,
    // 9=Banyak Total, 10=Nilai Total) — BUKAN nama field database (KOLOM1-6),
    // supaya PPL bisa langsung cocokkan ke kertas kuesioner tanpa bingung.
    return (
      `Ditemukan ketidaksesuaian pada isian Banyaknya/Nilai Total. Banyaknya Total tercatat ${numRef(fmtN(d.banyakTotal), 'Kolom 9')}, ` +
      `seharusnya ${numRef(fmtN(d.banyakHitung), 'Kolom 5 + Kolom 7')} (Banyak Beli + Banyak Nonbeli). Nilai Total tercatat ${numRef(fmtRp(d.nilaiTotal), 'Kolom 10')}, ` +
      `seharusnya ${numRef(fmtRp(d.nilaiHitung), 'Kolom 6 + Kolom 8')} (Nilai Beli + Nilai Nonbeli). Mohon periksa kembali isian Blok IV.1 dan perbaiki jika memang keliru.`
    );
  }
  if (kode === 'KP-24') {
    return (
      `Kode Sumber Perolehan tercatat ${numRef(String(d.sumberPerolehan), 'Kolom 4')} (0=Non Pembelian, 1=Online, 2=Offline, 3=Online & Offline), ` +
      `namun isian kolom Beli/Nonbeli tidak konsisten dengan kode tersebut (Banyak Beli: ${numRef(fmtN(d.banyakBeli), 'Kolom 5')}, ` +
      `Banyak Nonbeli: ${numRef(fmtN(d.banyakNonbeli), 'Kolom 7')}). Mohon periksa kembali kesesuaian sumber perolehan dengan kolom yang terisi.`
    );
  }
  if (kode === 'KP-02') {
    const bagian: string[] = [];
    if (d.kolom5 != null) bagian.push(`Sebulan Terakhir tercatat ${numRef(fmtRp(d.kolom5), 'KOLOM5')}`);
    if (d.kolom6 != null) bagian.push(`Setahun Terakhir tercatat ${numRef(fmtRp(d.kolom6), 'KOLOM6')}`);
    return (
      `Nilai pengeluaran untuk rincian No.${extra.nourutkomo} ${bagian.join(' dan ')} — berada di luar rentang wajar ` +
      `dibanding sebaran rumah tangga lain untuk rincian yang sama. Mohon periksa kembali kebenaran isian dan satuannya.`
    );
  }
  if (kode === 'KP-03' || kode === 'KP-04') {
    const jenis = kode === 'KP-03' ? 'bukan makanan' : 'makanan';
    return (
      `Ditemukan potensi duplikasi data — total pengeluaran ${jenis} rumah tangga ini (${numRef(fmtRp(d.nilaiTotal), 'Total KOLOM6')}) persis sama ` +
      `dengan rumah tangga lain di NKS yang sama. Mohon periksa kembali apakah ini kebetulan sama, atau ada kesalahan ` +
      `penyalinan data antar dokumen. Jika sudah sesuai kondisi lapangan, beri keterangan di Blok Catatan.`
    );
  }
  if (kode === 'KP-07' || kode === 'KP-08' || kode === 'KP-09') {
    const label = kode === 'KP-07' ? 'total (makanan + bukan makanan)' : kode === 'KP-08' ? 'bukan makanan' : 'makanan';
    const minVal = kode === 'KP-07' ? 31 : kode === 'KP-08' ? 19 : 13;
    const blok = kode === 'KP-09' ? 'Blok IV.1' : kode === 'KP-08' ? 'Blok IV.2' : 'Blok IV.1 dan IV.2';
    return (
      `Jumlah komoditas ${label} yang terisi cuma ${numRef(String(d.jmlKomoditas), 'jumlah No.Urut Komoditas unik')} rincian, di bawah standar minimum (${minVal} rincian). ` +
      `Mohon periksa kembali kelengkapan isian ${blok}.`
    );
  }
  if (kode === 'KP-10') {
    const sub = extra.keterangan && String(extra.keterangan).includes('3a') ? 'a' : 'c';
    const nilaiSub = sub === 'a' ? d.oopA : d.oopC;
    const kolomSub = sub === 'a' ? 'KOLOM10' : 'KOLOM12';
    return (
      `Biaya out-of-pocket (dibayar tunai) sub-rincian ${sub} tercatat ${numRef(fmtRp(nilaiSub), kolomSub)}, tidak wajar dibandingkan nilai ` +
      `total pelayanan kesehatan yang tercatat (${numRef(fmtRp(d.kolom6Total), 'KOLOM6')}). Mohon periksa kembali kebenaran isian biaya.`
    );
  }
  if (base === 'KP-11') {
    return (
      `Ditemukan isian komoditas "Lainnya" dengan teks "${extra.namaLainnya}" (KOLOM8) pada rincian ${extra.rincian}. Mohon periksa ` +
      `apakah ini benar-benar komoditas lain, atau seharusnya dimasukkan ke kode komoditas standar yang sudah tersedia.`
    );
  }
  if (kode === 'KP-12' || kode === 'KP-13') {
    const komoditas = kode === 'KP-12' ? 'minuman keras' : 'daging babi';
    return (
      `Tercatat konsumsi ${komoditas} sebanyak ${numRef(fmtN(extra.banyak), 'KOLOM5')} dengan nilai ${numRef(fmtRp(extra.nilai), 'KOLOM6')}. Komoditas ini ` +
      `sensitif, mohon konfirmasi kebenaran isian ke petugas lapangan/responden.`
    );
  }
  if (kode === 'KP-14' || kode === 'KP-16') {
    const komoditas = kode === 'KP-14' ? 'gas kota' : 'biogas';
    return `Tercatat pengeluaran untuk ${komoditas} sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM5')}, padahal fasilitas ini jarang tersedia di banyak wilayah. Mohon periksa kembali kebenaran isian.`;
  }
  if (kode === 'KP-17') {
    return `Tercatat pengeluaran untuk tiket pesawat sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, di luar rentang wajar (kurang dari Rp1 juta atau lebih dari Rp10 juta). Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  if (kode === 'KP-18') {
    return `Tercatat pengeluaran untuk hotel/penginapan sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, di luar rentang wajar (kurang dari Rp150 ribu atau lebih dari Rp10 juta). Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  if (kode === 'KP-22') {
    return `Tercatat pengeluaran untuk transportasi laut sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, di luar rentang wajar (kurang dari Rp100 ribu atau lebih dari Rp500 ribu). Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  if (kode === 'KP-19') {
    return (
      `Nilai kategori Bumbu-bumbuan (${numRef(fmtRp(d.bumbuBumbuan), 'B432R11K5')}) tercatat lebih besar dari kategori Padi-padian ` +
      `(${numRef(fmtRp(d.padiPadian), 'B432R1K5')}) — secara umum ini tidak wajar karena bumbu-bumbuan biasanya bernilai jauh lebih kecil. ` +
      `Mohon periksa kembali isian kedua kategori tersebut.`
    );
  }
  if (kode === 'KP-20') {
    return `Konsumsi garam tercatat senilai ${numRef(fmtRp(extra.nilai), 'KOLOM6')} per minggu, di luar kewajaran umum berdasarkan data riil tahun lalu (ambang Rp5.000). Mohon periksa kembali kebenaran isian dan satuannya.`;
  }
  if (kode === 'KP-21') {
    return `Tercatat pengeluaran untuk transportasi darat sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, melebihi ambang Rp10 juta. Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  return typeof extra.keterangan === 'string' ? extra.keterangan : '';
}

// 18 rincian "...lainnya, sebutkan" yang dipetakan ke NOURUTKOMO + tabel asalnya.
// Nomor-nomor ini DIVERIFIKASI ULANG terhadap data anomali riil tahun lalu
// (folder KP.rar) — 2 nomor sebelumnya SALAH (153→138, 211→218; kemungkinan
// salah baca posisi kolom di form cetak) dan 1 rincian (sayur-sayuran, No.120)
// TIDAK ADA sama sekali di daftar sebelumnya, sekarang ditambahkan.
const KOMODITAS_LAINNYA = [
  { n: 7, nama: 'Padi-padian lainnya (sebutkan)', kategori: 'A. Padi-padian', table: 3 },
  { n: 15, nama: 'Umbi-umbian lainnya (sebutkan)', kategori: 'B. Umbi-umbian', table: 3 },
  { n: 41, nama: 'Ikan segar/basah lainnya (sebutkan)', kategori: 'C.1 Ikan segar/basah', table: 3 },
  { n: 47, nama: 'Udang dan hewan air lainnya yang segar (sebutkan)', kategori: 'C.2 Udang/hewan air segar', table: 3 },
  { n: 57, nama: 'Ikan diawetkan lainnya (sebutkan)', kategori: 'C.3 Ikan diawetkan', table: 3 },
  { n: 60, nama: 'Udang dan hewan air lainnya yang diawetkan (sebutkan)', kategori: 'C.4 Udang/hewan air diawetkan', table: 3 },
  { n: 68, nama: 'Daging segar lainnya (sebutkan)', kategori: 'D.1 Daging segar', table: 3 },
  { n: 71, nama: 'Daging lainnya diawetkan, selain sapi & ayam (sebutkan)', kategori: 'D.2 Daging diawetkan', table: 3 },
  { n: 84, nama: 'Hasil lain dari susu (sebutkan)', kategori: 'E. Telur dan Susu', table: 3 },
  { n: 120, nama: 'Sayur-sayuran lainnya (sebutkan)', kategori: 'F. Sayur-sayuran', table: 3 },
  { n: 124, nama: 'Kacang lainnya (sebutkan)', kategori: 'G. Kacang-kacangan', table: 3 },
  { n: 128, nama: 'Hasil lain dari kacang-kacangan (sebutkan)', kategori: 'G. Kacang-kacangan', table: 3 },
  { n: 138, nama: 'Buah-buahan lainnya (sebutkan)', kategori: 'H. Buah-buahan', table: 3 },
  { n: 158, nama: 'Minyak dan kelapa lainnya (sebutkan)', kategori: 'I. Minyak dan Kelapa', table: 3 },
  { n: 166, nama: 'Bahan minuman lainnya (sebutkan)', kategori: 'J. Bahan Minuman', table: 3 },
  { n: 186, nama: 'Lainnya, bahan makanan (sebutkan)', kategori: 'L. Bahan Makanan Lainnya', table: 3 },
  { n: 218, nama: 'Makanan jadi lainnya (sebutkan)', kategori: 'M. Makanan dan Minuman Jadi', table: 4 },
  { n: 225, nama: 'Rokok dan tembakau lainnya (sebutkan)', kategori: 'N. Rokok dan Tembakau', table: 4 },
];

/**
 * Jalankan seluruh 37 pengecekan anomali.
 * @param {Object} tables - { t3: rows[], t4: rows[], t5: rows[], t9: rows[] }
 * @param {Object} [opts] - ambang batas yang bisa dioverride
 * @returns {Array<Object>} daftar temuan (findings)
 */
function runAllChecks(tables: Tables, opts: Thresholds = {}): Finding[] {
  // Dicast ke `any[]` sengaja — nilai kolom numerik dari dbffile sudah berupa
  // number asli (bukan string), tapi type DbfRow yang longgar (union dgn
  // string) bikin banyak friksi TS di bawah tanpa manfaat nyata di sini.
  const t3 = (tables.t3 || []) as any[];
  const t4 = (tables.t4 || []) as any[];
  const t5 = (tables.t5 || []) as any[];
  const t9 = (tables.t9 || []) as any[];
  const m1 = (tables.m1 || []) as any[];
  const m1c = (tables.m1c || []) as any[];
  const mrt1 = (tables.mrt1 || []) as any[];
  const mrt2 = (tables.mrt2 || []) as any[];

  const thresholds = Object.assign(
    {
      garam: 5000, // Kolom6 per minggu — dikonfirmasi dari data anomali riil tahun lalu (file "24. Konsumsi garam di atas 5000 rupiah")
      tiketPesawatMin: 1000000, // dari data riil tahun lalu (file 19): rentang wajar Rp1jt - Rp10jt per tahun
      tiketPesawatMax: 10000000,
      hotelMin: 150000, // dari data riil tahun lalu (file 22): rentang wajar Rp150rb - Rp10jt per tahun
      hotelMax: 10000000,
      transportasiDarat: 10000000, // dari data riil tahun lalu (file 21): ambang Rp10jt, BUKAN Rp100jt seperti sebelumnya
      transportasiLautMin: 100000, // dari data riil tahun lalu (file 20): rentang wajar Rp100rb - Rp500rb per tahun
      transportasiLautMax: 500000,
      zscoreNonMakanan: 3, // dipakai KP-02: tandai jika di luar mean ± N*SD per NOURUTKOMO
      olahragaLama: 300, // M-44, menit — dikoreksi dari 997 (default lama)
    },
    opts
  );

  const findings: Finding[] = [];
  let idCounter = 1;
  function push(kode: string, kelompok: string, row: any, extra: Record<string, unknown>) {
    // buildNarasi butuh nourutkomo/nks/nurt juga (bukan cuma field2 di `extra`)
    // — digabung dulu di sini supaya template narasi (mis. KP-02) bisa pakai
    // ${extra.nourutkomo} dengan benar, bukan selalu undefined.
    const konteks = { nourutkomo: row.NOURUTKOMO, nks: row.NKS, nurt: row.NURT, ...extra };
    findings.push(
      Object.assign(
        {
          id: idCounter++,
          kode_anomali: kode,
          kelompok,
          nks: row.NKS,
          nurt: row.NURT,
          nourutkomo: row.NOURUTKOMO,
          nama_krt: row.NAMAKRT || null,
        },
        extra,
        { narasi: buildNarasi(kode, konteks) }
      )
    );
  }

  // ---------- KP-01: konsistensi Banyak/Nilai Total (tabel 4, ART) ----------
  // Struktur tabel4 SAMA seperti tabel3 (Banyak Beli=K1, Nilai Beli=K2, Banyak Nonbeli=K3,
  // Nilai Nonbeli=K4, Banyak Total=K5, Nilai Total=K6), K7=Sumber Perolehan di ujung.
  // (dikoreksi setelah uji terhadap data riil — bukan K1=SumberPerolehan seperti dugaan awal)
  // Toleransi 0.01 (bukan exact match) — contoh data tahun lalu (Error_2, tabel3) banyak
  // menghasilkan false-positive murni akibat pembulatan pecahan hasil konversi satuan.
  const TOL = 0.01;
  for (const row of t4) {
    const banyakTotal = nz(row.KOLOM5);
    const banyakHitung = nz(row.KOLOM1) + nz(row.KOLOM3);
    const nilaiTotal = nz(row.KOLOM6);
    const nilaiHitung = nz(row.KOLOM2) + nz(row.KOLOM4);
    if (Math.abs(banyakTotal - banyakHitung) > TOL || Math.abs(nilaiTotal - nilaiHitung) > TOL) {
      push('KP-01', 'A. Konsistensi Perhitungan', row, {
        keterangan: 'Jumlah di Kolom 9 tidak sesuai.',
        detail: { banyakTotal, banyakHitung, nilaiTotal, nilaiHitung, satuan: row.KOLOM9, nomorUrutArt: row.R401 },
      });
    }
  }

  // ---------- KP-23: konsistensi Banyak/Nilai Total (tabel 3, bahan makanan mentah) ----------
  // Versi KP-01 utk tabel 3 (RT, tanpa kolom Sumber Perolehan) — ditambahkan setelah
  // membandingkan dgn contoh laporan anomali tahun lalu (Error_2: Inkonsistensi Isian
  // Bahan Makanan), yang ternyata cek serupa TAPI utk tabel bahan makanan mentah,
  // bukan cuma tabel 4 (ART) seperti KP-01.
  for (const row of t3) {
    const banyakTotal = nz(row.KOLOM5);
    const banyakHitung = nz(row.KOLOM1) + nz(row.KOLOM3);
    const nilaiTotal = nz(row.KOLOM6);
    const nilaiHitung = nz(row.KOLOM2) + nz(row.KOLOM4);
    if (Math.abs(banyakTotal - banyakHitung) > TOL || Math.abs(nilaiTotal - nilaiHitung) > TOL) {
      push('KP-23', 'A. Konsistensi Perhitungan', row, {
        keterangan: 'Jumlah di Kolom 9 tidak sesuai.',
        detail: { banyakTotal, banyakHitung, nilaiTotal, nilaiHitung, satuan: row.KOLOM9 },
      });
    }
  }

  // ---------- KP-24: konsistensi Sumber Perolehan vs kolom Beli/Nonbeli (tabel 4, makanan jadi) ----------
  // Ditambahkan berdasarkan contoh laporan anomali tahun lalu (Error_7: Inkonsistensi
  // Isian makanan jadi). Sumber Perolehan (KOLOM7): 0=Non Pembelian, 1=Online,
  // 2=Offline, 3=Online & Offline.
  // ⚠ Kasus sumber=1/2/3 (baris "else if" di bawah) adalah PERLUASAN LOGIS dari pola
  // yang teramati di data tahun lalu (yang cuma berisi contoh sumber=0) — belum
  // terverifikasi langsung dgn contoh data sumber=1/2/3, tapi mengikuti logika yang sama.
  for (const row of t4) {
    const sumber = row.KOLOM7;
    if (sumber === null || sumber === undefined) continue;
    const banyakBeli = nz(row.KOLOM1);
    const banyakNonbeli = nz(row.KOLOM3);
    let pesan: string | null = null;
    if (sumber === 0) {
      if (banyakNonbeli === 0) pesan = 'Kolom 4 berisi kode 0 tetapi kolom produksi sendiri/pemberian tidak terisi.';
      else if (banyakBeli > 0) pesan = 'Kolom 4 berisi kode 0 tetapi kolom pembelian terisi.';
    } else if (sumber === 1 || sumber === 2 || sumber === 3) {
      if (banyakBeli === 0) pesan = `Kolom 4 berisi kode ${sumber} tetapi kolom pembelian tidak terisi.`;
    }
    if (pesan) {
      push('KP-24', 'A. Konsistensi Perhitungan', row, {
        keterangan: pesan,
        detail: { sumberPerolehan: sumber, banyakBeli, banyakNonbeli, nomorUrutArt: row.R401 },
      });
    }
  }

  // ---------- KP-02: kewajaran nilai Blok IV.2 (tabel 5), ambang dinamis per NOURUTKOMO ----------
  {
    const byKomo = new Map();
    for (const row of t5) {
      const n = row.NOURUTKOMO;
      if (n === null || n === undefined) continue;
      if (!byKomo.has(n)) byKomo.set(n, { k5: [], k6: [] });
      if (row.KOLOM5) byKomo.get(n).k5.push(row.KOLOM5);
      if (row.KOLOM6) byKomo.get(n).k6.push(row.KOLOM6);
    }
    const stats = new Map();
    for (const [n, v] of byKomo) {
      const s: { k5?: [number, number]; k6?: [number, number] } = {};
      if (v.k5.length >= 5) {
        const m5 = mean(v.k5), sd5 = stdev(v.k5, m5);
        s.k5 = [Math.max(0, m5 - thresholds.zscoreNonMakanan * sd5), m5 + thresholds.zscoreNonMakanan * sd5];
      }
      if (v.k6.length >= 5) {
        const m6 = mean(v.k6), sd6 = stdev(v.k6, m6);
        s.k6 = [Math.max(0, m6 - thresholds.zscoreNonMakanan * sd6), m6 + thresholds.zscoreNonMakanan * sd6];
      }
      stats.set(n, s);
    }
    for (const row of t5) {
      const s = stats.get(row.NOURUTKOMO);
      if (!s) continue;
      let bad = null;
      if (row.KOLOM5 && s.k5 && (row.KOLOM5 < s.k5[0] || row.KOLOM5 > s.k5[1])) bad = 'Kolom 4';
      if (row.KOLOM6 && s.k6 && (row.KOLOM6 < s.k6[0] || row.KOLOM6 > s.k6[1])) bad = bad ? bad + ' & Kolom 5' : 'Kolom 5';
      if (bad) {
        push('KP-02', 'A. Konsistensi Perhitungan', row, {
          keterangan: `${bad} pengeluaran tidak wajar.`,
          detail: { kolom5: row.KOLOM5, kolom6: row.KOLOM6, batasHitung: s },
        });
      }
    }
  }

  // ---------- KP-03: duplikasi pengeluaran bukan-makanan antar RT (1 NKS) ----------
  {
    const sumByRT = new Map(); // key `${NKS}|${NURT}` -> total
    for (const row of t5) {
      const key = `${row.NKS}|${row.NURT}`;
      sumByRT.set(key, (sumByRT.get(key) || 0) + nz(row.KOLOM6));
    }
    const byNksValue = new Map(); // key `${NKS}|${value}` -> [nurt...]
    for (const [key, val] of sumByRT) {
      const [nks] = key.split('|');
      const k2 = `${nks}|${val}`;
      if (!byNksValue.has(k2)) byNksValue.set(k2, []);
      byNksValue.get(k2).push(key);
    }
    for (const [k2, keys] of byNksValue) {
      if (keys.length > 1 && k2.split('|')[1] !== '0') {
        for (const key of keys) {
          const [nks, nurt] = key.split('|');
          push('KP-03', 'B. Duplikasi Data', { NKS: nks, NURT: nurt, NOURUTKOMO: null }, {
            keterangan:
              'Pengeluaran Bukan Makanan Duplikat, Cek Kembali Isian Blok 4.1. Jika sudah sesuai kondisi lapangan, beri keterangan di Blok Catatan',
            detail: { nilaiTotal: sumByRT.get(key), rtLainDgnNilaiSama: keys.filter((x: string) => x !== key) },
          });
        }
      }
    }
  }

  // ---------- KP-04: duplikasi pengeluaran makanan mentah antar RT (1 NKS) ----------
  {
    const sumByRT = new Map();
    for (const row of t3) {
      const key = `${row.NKS}|${row.NURT}`;
      sumByRT.set(key, (sumByRT.get(key) || 0) + nz(row.KOLOM6));
    }
    const byNksValue = new Map();
    for (const [key, val] of sumByRT) {
      const [nks] = key.split('|');
      const k2 = `${nks}|${val}`;
      if (!byNksValue.has(k2)) byNksValue.set(k2, []);
      byNksValue.get(k2).push(key);
    }
    for (const [k2, keys] of byNksValue) {
      if (keys.length > 1 && k2.split('|')[1] !== '0') {
        for (const key of keys) {
          const [nks, nurt] = key.split('|');
          push('KP-04', 'B. Duplikasi Data', { NKS: nks, NURT: nurt, NOURUTKOMO: null }, {
            keterangan:
              'Pengeluaran Makanan Duplikat, Cek Kembali Isian Blok 4.1. Jika sudah sesuai kondisi lapangan, beri keterangan di Blok Catatan',
            detail: { nilaiTotal: sumByRT.get(key), rtLainDgnNilaiSama: keys.filter((x: string) => x !== key) },
          });
        }
      }
    }
  }

  // ---------- KP-05 / KP-06: kalori — TIDAK DIJALANKAN (perlu tabel referensi DKBM) ----------
  // Sengaja dikosongkan. Kalau Anda punya tabel konversi kalori per NOURUTKOMO,
  // tambahkan implementasinya di sini (join KOLOM5 tabel3 x kalori/satuan, dibagi R301).

  // ---------- KP-07/08/09: kelengkapan jumlah komoditas ----------
  {
    const komoByRT_all = new Map();
    const komoByRT_food = new Map();
    const komoByRT_nonfood = new Map();
    for (const row of t3) {
      const key = `${row.NKS}|${row.NURT}`;
      if (!komoByRT_all.has(key)) komoByRT_all.set(key, new Set());
      if (!komoByRT_food.has(key)) komoByRT_food.set(key, new Set());
      komoByRT_all.get(key).add(row.NOURUTKOMO);
      komoByRT_food.get(key).add(row.NOURUTKOMO);
    }
    for (const row of t5) {
      const key = `${row.NKS}|${row.NURT}`;
      if (!komoByRT_all.has(key)) komoByRT_all.set(key, new Set());
      if (!komoByRT_nonfood.has(key)) komoByRT_nonfood.set(key, new Set());
      komoByRT_all.get(key).add(row.NOURUTKOMO);
      komoByRT_nonfood.get(key).add(row.NOURUTKOMO);
    }
    for (const [key, set] of komoByRT_all) {
      const [nks, nurt] = key.split('|');
      if (set.size < 31) {
        push('KP-07', 'D. Kelengkapan Isian', { NKS: nks, NURT: nurt, NOURUTKOMO: null }, {
          keterangan: 'Konsumsi Total Komoditas Kurang Dari 31',
          detail: { jmlKomoditas: set.size },
        });
      }
    }
    for (const [key, set] of komoByRT_nonfood) {
      const [nks, nurt] = key.split('|');
      if (set.size < 19) {
        push('KP-08', 'D. Kelengkapan Isian', { NKS: nks, NURT: nurt, NOURUTKOMO: null }, {
          keterangan: 'Konsumsi Komoditas Bukan Makanan Kurang Dari 19.',
          detail: { jmlKomoditas: set.size },
        });
      }
    }
    for (const [key, set] of komoByRT_food) {
      const [nks, nurt] = key.split('|');
      if (set.size < 13) {
        push('KP-09', 'D. Kelengkapan Isian', { NKS: nks, NURT: nurt, NOURUTKOMO: null }, {
          keterangan: 'Konsumsi Komoditas Makanan Kurang Dari 13.',
          detail: { jmlKomoditas: set.size },
        });
      }
    }
  }

  // ---------- KP-10: kewajaran OOP kesehatan (NOURUTKOMO 276-291) ----------
  for (const row of t5) {
    if (row.NOURUTKOMO === null || row.NOURUTKOMO < 276 || row.NOURUTKOMO > 291) continue;
    const total = nz(row.KOLOM6);
    const oopA = row.KOLOM10;
    const oopC = row.KOLOM12;
    let bad = null;
    if (oopA && oopA > 0 && !(oopA >= 0 && oopA <= total)) bad = '3a';
    if (oopC && oopC > 0 && !(oopC >= 0 && oopC <= total)) bad = bad ? bad + ' & 3c' : '3c';
    if (bad) {
      push('KP-10', 'C. Kewajaran Nilai', row, {
        keterangan: `Periksa Kewajaran OOP Kolom ${bad}.`,
        detail: { kolom6Total: total, oopA, oopC },
      });
    }
  }

  // ---------- KP-11.xxx: 17 rincian "...lainnya, sebutkan" ----------
  for (const item of KOMODITAS_LAINNYA) {
    const src = item.table === 3 ? t3 : t4;
    const kolomBanyak = 'KOLOM5';
    const kolomNilai = 'KOLOM6';
    for (const row of src) {
      if (row.NOURUTKOMO !== item.n) continue;
      if (isBlank(row.KOLOM8)) continue;
      push(`KP-11.${String(item.n).padStart(3, '0')}`, 'E. Verifikasi Substansi Komoditas', row, {
        keterangan: 'Cek kembali apakah sudah benar yang dikonsumsi adalah komoditas lainnya',
        namaLainnya: row.KOLOM8,
        banyak: row[kolomBanyak],
        nilai: row[kolomNilai],
        rincian: item.nama,
        kategori: item.kategori,
        // Kolom rincian lengkap (Beli/Nonbeli/Satuan/ART) — supaya PPL bisa
        // lihat gambaran utuh, bukan cuma Banyak/Nilai Total. Sesuai contoh
        // laporan anomali tahun lalu yang menampilkan semua kolom ini.
        detail: {
          banyakBeli: row.KOLOM1,
          nilaiBeli: row.KOLOM2,
          banyakNonbeli: row.KOLOM3,
          nilaiNonbeli: row.KOLOM4,
          satuan: row.KOLOM9,
          ...(item.table === 4 ? { nomorUrutArt: row.R401 } : {}),
        },
      });
    }
  }

  // ---------- KP-12: minuman keras (No.219, tabel 4) ----------
  for (const row of t4) {
    if (row.NOURUTKOMO === 219 && (nz(row.KOLOM5) > 0 || nz(row.KOLOM6) > 0)) {
      push('KP-12', 'E. Verifikasi Substansi Komoditas', row, {
        keterangan: 'Cek kembali apakah sudah benar yang dikonsumsi adalah minuman keras',
        banyak: row.KOLOM5,
        nilai: row.KOLOM6,
        detail: { satuan: row.KOLOM9, nomorUrutArt: row.R401 },
      });
    }
  }

  // ---------- KP-13: daging babi (No.65, tabel 3) ----------
  for (const row of t3) {
    if (row.NOURUTKOMO === 65 && (nz(row.KOLOM5) > 0 || nz(row.KOLOM6) > 0)) {
      push('KP-13', 'E. Verifikasi Substansi Komoditas', row, {
        keterangan: 'Cek kembali apakah sudah benar yang dikonsumsi adalah daging babi',
        banyak: row.KOLOM5,
        nilai: row.KOLOM6,
        detail: { satuan: row.KOLOM9 },
      });
    }
  }

  // ---------- KP-14: gas kota (No.254/255, tabel 5) ----------
  for (const row of t5) {
    if ((row.NOURUTKOMO === 254 || row.NOURUTKOMO === 255) && nz(row.KOLOM5) > 0) {
      push('KP-14', 'E. Verifikasi Substansi Komoditas', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk gas kota',
        banyak: row.KOLOM7,
        nilai: row.KOLOM5,
      });
    }
  }

  // ---------- KP-15: penguasaan bangunan lainnya — BELUM TERIDENTIFIKASI, tidak dijalankan ----------

  // ---------- KP-16: biogas (No.260, tabel 5) ----------
  for (const row of t5) {
    if (row.NOURUTKOMO === 260 && nz(row.KOLOM5) > 0) {
      push('KP-16', 'E. Verifikasi Substansi Komoditas', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk biogas',
        nilai: row.KOLOM5,
      });
    }
  }

  // ---------- KP-17: tiket pesawat (No.299, tabel 5) ----------
  // Rentang wajar, BUKAN cuma batas atas — dikoreksi berdasarkan data riil
  // tahun lalu (sebelumnya cuma cek >Rp15jt, ternyata juga ada kasus "terlalu
  // kecil" yang perlu dicek, mis. salah satuan/salah ketik).
  for (const row of t5) {
    if (
      row.NOURUTKOMO === 299 &&
      nz(row.KOLOM6) > 0 &&
      (nz(row.KOLOM6) < thresholds.tiketPesawatMin || nz(row.KOLOM6) > thresholds.tiketPesawatMax)
    ) {
      push('KP-17', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk tiket pesawat',
        nilai: row.KOLOM6,
      });
    }
  }

  // ---------- KP-18: hotel/penginapan (No.302, tabel 5) ----------
  for (const row of t5) {
    if (
      row.NOURUTKOMO === 302 &&
      nz(row.KOLOM6) > 0 &&
      (nz(row.KOLOM6) < thresholds.hotelMin || nz(row.KOLOM6) >= thresholds.hotelMax)
    ) {
      push('KP-18', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk hotel sebesar itu',
        nilai: row.KOLOM6,
      });
    }
  }

  // ---------- KP-22: transportasi laut (No.300, tabel 5) ----------
  // Pengecekan BARU, ditambahkan berdasarkan data anomali riil tahun lalu
  // (belum ada di sistem sebelumnya).
  for (const row of t5) {
    if (
      row.NOURUTKOMO === 300 &&
      nz(row.KOLOM6) > 0 &&
      (nz(row.KOLOM6) < thresholds.transportasiLautMin || nz(row.KOLOM6) > thresholds.transportasiLautMax)
    ) {
      push('KP-22', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk transportasi laut',
        nilai: row.KOLOM6,
      });
    }
  }

  // ---------- KP-19: bumbu-bumbuan > padi-padian (tabel 9, rekap RT) ----------
  for (const row of t9) {
    const bumbu = nz(row.B432R11K5);
    const padi = nz(row.B432R1K5);
    if (bumbu > padi) {
      push('KP-19', 'C. Kewajaran Nilai', { NKS: row.NKS, NURT: row.NURT, NOURUTKOMO: null }, {
        keterangan: 'Cek kembali jumlah bumbu-bumbuan lebih besar dari padi padian?',
        detail: { bumbuBumbuan: bumbu, padiPadian: padi },
      });
    }
  }

  // ---------- KP-20: garam (No.168, tabel 3) ----------
  for (const row of t3) {
    if (row.NOURUTKOMO === 168 && nz(row.KOLOM6) > thresholds.garam) {
      push('KP-20', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar konsumsi garam dengan nilai ... per minggu?',
        banyak: row.KOLOM5,
        nilai: row.KOLOM6,
        detail: { satuan: row.KOLOM9 },
      });
    }
  }

  // ---------- KP-21: transportasi darat (No.298, tabel 5) ----------
  // Ambang dikoreksi ke Rp10 juta (sebelumnya keliru Rp100 juta — 10x terlalu longgar).
  for (const row of t5) {
    if (row.NOURUTKOMO === 298 && nz(row.KOLOM6) >= thresholds.transportasiDarat) {
      push('KP-21', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk transportasi darat >Rp10 juta',
        nilai: row.KOLOM6,
      });
    }
  }

  // ==========================================================================
  // VSEN26.M — pengecekan ART (tabel m1 = file "1_1...Data KOR ART")
  // Dibangun dari analisis 62 file contoh anomali tahun lalu (MODUL.rar) +
  // 7 usulan awal. Field & nilai pemicu diverifikasi dari data riil (bukan
  // dugaan kosong), TAPI beberapa kondisi multi-kode (SD/SMP/SMA, jenis
  // sekolah) diturunkan dari POLA nilai contoh yang konsisten di tiap file,
  // BUKAN dari buku pedoman kode resmi (saya tidak punya aksesnya) — ditandai
  // "⚠ verifikasi" di komentar. Numbering "M-N" mengikuti nomor file aslinya
  // supaya gampang ditelusuri balik.
  // ==========================================================================
  interface MSimpleCheck {
    kode: string;
    cond: (r: any) => boolean;
    keterangan: string;
    fields: string[]; // field yg direkam di detail (nama field asli, huruf besar)
  }

  const currentYear = new Date().getFullYear();

  // Tanggal acuan pendataan utk cek M-USIA-VS-TGL-LAHIR — Susenas September 2026,
  // dikonfirmasi Anda 16/9: pakai tanggal tetap 7 September 2026, BUKAN tanggal
  // hari ini (new Date()) supaya hasilnya konsisten tidak berubah-ubah tiap upload.
  const TANGGAL_ACUAN_PENDATAAN = new Date(2026, 8, 7); // bulan 0-indexed: 8 = September

  // Hitung umur (tahun, dibulatkan ke bawah) dari tanggal lahir sampai tanggal acuan.
  function hitungUmurSampai(tgl: unknown, bln: unknown, thn: unknown, acuan: Date): number | null {
    const d = Number(tgl), m = Number(bln), y = Number(thn);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y) || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) {
      return null;
    }
    const lahir = new Date(y, m - 1, d);
    let umur = acuan.getFullYear() - lahir.getFullYear();
    const belumUlangTahun =
      acuan.getMonth() < lahir.getMonth() ||
      (acuan.getMonth() === lahir.getMonth() && acuan.getDate() < lahir.getDate());
    if (belumUlangTahun) umur--;
    return umur;
  }

  const M_CHECKS: MSimpleCheck[] = [
    { kode: 'M-01', fields: ['M404', 'M407'], keterangan: 'Apakah benar umur kurang dari 18 tahun tetapi statusnya kawin atau cerai mati atau cerai hidup?',
      cond: r => nz(r.M407) < 18 && nz(r.M404) > 1 },
    { kode: 'M-02', fields: ['M501'], keterangan: 'Apakah benar tidak memiliki NIK?',
      cond: r => isBlank(r.M502CHAR) },
    { kode: 'M-03', fields: ['M503', 'M504', 'M506'], keterangan: 'Apakah benar sedang atau pernah bersekolah di sekolah luar biasa atau memiliki ijazah sekolah luar biasa?',
      // Dikoreksi setelah baca kuesioner asli: kode 25 di M506 = "Tidak punya ijazah", BUKAN SLB.
      // SLB sebenarnya 3 kode terpisah per jenjang: 02=SDLB, 07=SMPLB, 12=SMLB (di M504 ATAU M506).
      cond: r => [2, 7, 12].includes(nz(r.M504)) || [2, 7, 12].includes(nz(r.M506)) },
    { kode: 'M-04', fields: ['M503', 'M504', 'M506', 'M508'], keterangan: 'Apakah benar sedang atau pernah bersekolah di MAK atau memiliki ijazah MAK?',
      cond: r => nz(r.M504) === 16 || nz(r.M506) === 16 }, // dikonfirmasi dari kuesioner: kode 16 = MAK
    { kode: 'M-05', fields: ['M503', 'M504'], keterangan: 'Konfirmasi apakah benar domisili di lokus pendataan tetapi sedang berkuliah?',
      cond: r => nz(r.M503) === 2 && nz(r.M504) === 21 },
    { kode: 'M-06', fields: ['M407'], keterangan: 'Apakah usia 10-64 tahun memang tidak ada kegiatan seminggu yang lalu?',
      cond: r => nz(r.M407) >= 10 && nz(r.M407) <= 64 && String(r.M605_X ?? '').trim().toUpperCase() === 'X' },
    { kode: 'M-07', fields: [], keterangan: 'Cek kembali apakah ART memang menggunakan kendaraan bermotor umum rute tertentu?',
      cond: r => nz(r.M608) === 3 },
    { kode: 'M-08', fields: [], keterangan: 'Apakah pakaian layak memang hanya tiga setel atau kurang?',
      cond: r => nz(r.M701) === 5 },
    { kode: 'M-09', fields: ['M503'], keterangan: 'Apakah ART sedang bersekolah atau tidak bersekolah lagi tetapi tidak bisa membaca dan menulis?',
      cond: r => nz(r.M503) === 2 && nz(r.M1004) === 5 },
    { kode: 'M-10', fields: ['M503'], keterangan: 'Apakah benar ART yang sedang bersekolah tetapi tidak membaca buku pelajaran sekolah?',
      cond: r => nz(r.M503) === 2 && nz(r.M1008) === 5 },
    { kode: 'M-11', fields: ['M407'], keterangan: 'Apakah benar umur ART 1 tahun lebih tetapi r703 kode lainnya?',
      cond: r => nz(r.M407) >= 1 && nz(r.M703) === 5 },
    { kode: 'M-12', fields: ['M407'], keterangan: 'Apakah benar umur ART 1 tahun lebih tetapi r706 kode lainnya?',
      cond: r => nz(r.M407) >= 1 && nz(r.M706) === 5 },
    { kode: 'M-16', fields: ['M403', 'M404', 'M407'], keterangan: 'Apakah benar ART umur sekolah tetapi tidak atau belum bersekolah?',
      cond: r => nz(r.M403) === 3 && nz(r.M503) === 1 && nz(r.M407) >= 7 && nz(r.M407) <= 18 }, // ⚠ verifikasi rentang usia sekolah
    { kode: 'M-17', fields: ['M403', 'M404', 'M407'], keterangan: 'Apakah benar ART umur 8 sampai 10 tahun tetapi tahun ajaran sebelumnya mengikuti prasekolah?',
      cond: r => nz(r.M403) === 3 && nz(r.M509) === 1 && nz(r.M407) >= 8 && nz(r.M407) <= 10 },
    { kode: 'M-18', fields: [], keterangan: 'Apakah alasan tidak menggunakan kendaraan bermotor umum rute tertentu memang kode lainnya? Kelima pilihan di atas sudah cukup luas, pastikan memang tidak bisa dimasukkan ke kode 1-5.',
      cond: r => nz(r.M610) === 6 }, // field dikoreksi dari M609 -> M610 (bergeser)
    { kode: 'M-19', fields: [], keterangan: 'Apakah Balita memang ditinggal sendiri atau dititipkan ke kode 9 lainnya? Ini ke siapa? Harusnya kode 1-8 sudah cukup luas.',
      cond: r => nz(r.M806) === 9 },
    { kode: 'M-20', fields: [], keterangan: 'Apakah memang ART umur kurang dari 5 tahun tetapi sudah bisa baca tulis kalimat sederhana?',
      cond: r => nz(r.M407) < 5 && nz(r.M1004) === 1 }, // dikoreksi: usia <5 (bukan =5)
    { kode: 'M-21', fields: ['M407', 'M806'], keterangan: 'Apakah ART memang pernah ditinggal sendiri lebih dari 1 jam? Pastikan bahwa balita benar-benar ditinggal >1 jam tanpa didampingi siapapun.',
      cond: r => nz(r.M808) === 1 },
    { kode: 'M-24', fields: [], keterangan: 'Apakah benar Menu MBG Lainnya? Ini apa menunya?',
      cond: r => String(r.M1104J ?? '').trim().toUpperCase() === 'J' }, // field dikoreksi dari M1109J -> M1104J (bergeser)
    { kode: 'M-27', fields: [], keterangan: 'Apakah benar alasan tidak/kurang mengonsumsi makanan pokok dan protein karena tidak tersedia di pasar?',
      cond: r => nz(r.M706) === 2 },
    { kode: 'M-30', fields: [], keterangan: 'Apakah benar anak sedih atau tertekan berlebihan setiap hari?',
      cond: r => nz(r.M828) === 1 },
    { kode: 'M-31', fields: [], keterangan: 'Apakah benar anak menendang, menggigit, atau memukul lebih banyak atau jauh lebih banyak?',
      cond: r => nz(r.M829) === 4 || nz(r.M829) === 5 },
    { kode: 'M-32', fields: [], keterangan: 'Apakah memang tidak ada kebersamaan sama sekali (Blok IX.4-11)?',
      cond: r => ['M904_X', 'M905_X', 'M906_X', 'M907_X', 'M908_X', 'M909_X', 'M910_X', 'M911_X']
        .every(f => String(r[f] ?? '').trim().toUpperCase() === 'X') },
    { kode: 'M-34', fields: [], keterangan: 'Apakah benar mengunjungi TBM? Cek apakah di daerah ada TBM',
      cond: r => nz(r.M1013) === 1 },
    { kode: 'M-35', fields: [], keterangan: 'Apakah benar ada MBG tapi uang saku malah bertambah?',
      cond: r => nz(r.M1110) === 3 }, // dikoreksi total: field M1115->M1110, logika uangSaku>ambang -> M1110===3
    { kode: 'M-43', fields: [], keterangan: 'Apakah benar melakukan olahraga kurang dari 10 menit?',
      cond: r => nz(r.M1204) > 0 && nz(r.M1204) < 10 },
    { kode: 'M-44', fields: [], keterangan: `Apakah sudah ditulis di catatan jumlah menit olahraga yang sesuai dengan jawaban responden (≥${thresholds.olahragaLama} menit)?`,
      cond: r => nz(r.M1204) >= thresholds.olahragaLama! }, // ambang dikoreksi dari 997 -> 300 (bisa diubah via Kelola Anomali)
    { kode: 'M-45', fields: [], keterangan: 'Apakah benar tujuan olahraga adalah kode 6 (lainnya)? Kode lainnya - olahraga apa?',
      cond: r => nz(r.M1205) === 6 },
    { kode: 'M-46', fields: ['M407', 'M503'], keterangan: 'Apakah benar tujuan olahraga adalah pendidikan tetapi sedang tidak bersekolah?',
      cond: r => nz(r.M503) !== 2 && nz(r.M1205) === 4 }, // dikoreksi: M503!==2 ("bukan sedang bersekolah") — sebelumnya cuma cek ===3, kelewat kode 1
    { kode: 'M-48', fields: [], keterangan: 'Apakah benar bahasa yang paling sering digunakan di rumah dan/atau pergaulan menggunakan bahasa asing?',
      cond: r => nz(r.M1212) === 3 && nz(r.M1213) === 3 },
    // ---------- tambahan dari 7 usulan awal, belum tercakup di 62 file ----------
    { kode: 'M-NIK-FORMAT', fields: ['M502CHAR'], keterangan: 'NIK tidak sesuai format (kurang dari 16 digit)',
      cond: r => !isBlank(r.M502CHAR) && String(r.M502CHAR).trim().length < 16 && String(r.M502CHAR).trim() !== '9998' },
    { kode: 'M-TAHUN-LAHIR', fields: ['M406C'], keterangan: 'Tahun lahir tidak sesuai format / belum ada perkiraan tahun lahir. Tanyakan perkiraan tahun lahir',
      cond: r => nz(r.M406C) > currentYear },
    // ---------- tambahan dari USULAN_TAMBAHAN_ANOMALI.xlsx (klarifikasi Anda 16/9) ----------
    // M406A/M406B/M406C diasumsikan Tanggal/Bulan/Tahun lahir (urutan field belum
    // dikonfirmasi eksplisit — kalau ternyata terbalik A/B, dampaknya cuma beda
    // beberapa hari di sekitar ulang tahun, bukan salah tahun).
    { kode: 'M-USIA-VS-TGL-LAHIR', fields: ['M407', 'M406A', 'M406B', 'M406C'],
      keterangan: 'Apakah umur (M407) sudah sesuai dengan tanggal lahir (M406a+M406b+M406c), dihitung terhadap tanggal pendataan acuan 7 September 2026 dengan pembulatan ke bawah?',
      cond: r => {
        const umurHitung = hitungUmurSampai(r.M406A, r.M406B, r.M406C, TANGGAL_ACUAN_PENDATAAN);
        return umurHitung !== null && umurHitung !== nz(r.M407);
      } },
    { kode: 'M-71', fields: ['M407', 'M503', 'M504'], keterangan: 'Apakah benar umur 18 tahun ke atas tapi masih bersekolah (M503=2) di jenjang kode di bawah 18 (M504<18)?',
      cond: r => nz(r.M407) > 18 && nz(r.M503) === 2 && nz(r.M504) < 18 },
    { kode: 'M-68', fields: ['M407', 'M503', 'M504'], keterangan: 'Apakah benar umur 13-15 tahun tapi masih bersekolah (M503=2) di jenjang kode 13-16 (M504)?',
      cond: r => nz(r.M407) >= 13 && nz(r.M407) <= 15 && nz(r.M503) === 2 && nz(r.M504) >= 13 && nz(r.M504) <= 16 },
    { kode: 'M-66', fields: ['M407', 'M503', 'M504'], keterangan: 'Apakah benar umur kurang dari 6 tahun tapi sudah bersekolah (M503=2) di jenjang SD (M504=3)?',
      cond: r => nz(r.M407) < 6 && nz(r.M503) === 2 && nz(r.M504) === 3 },
    { kode: 'M-65', fields: ['M407', 'M508'], keterangan: 'Apakah benar umur lebih dari 7 tahun tapi M508 masih terisi (>0)?',
      cond: r => nz(r.M407) > 7 && nz(r.M508) > 0 },
    { kode: 'M-49', fields: ['M1208'], keterangan: 'Apakah benar M1208 (mengunjungi tempat/peninggalan bersejarah/cagar budaya) diisi kode 2 (secara tidak langsung)? Catatan: yang dimaksud "tidak langsung" adalah mengunjungi secara virtual (live streaming/virtual tour) melalui aplikasi/website/media sosial resmi pengelola — mis. Candi Borobudur di borobudurvirtual.id, museumnasional.iheritage-virtual.id. Tidak termasuk menonton video yang diupload perseorangan.',
      cond: r => nz(r.M1208) === 2 },
    { kode: 'M-50', fields: ['M1215'], keterangan: 'Apakah benar M1215 bidang organisasi diisi kode 10 (lainnya)? Bidang organisasi apa?',
      cond: r => nz(r.M1215) === 10 },
    { kode: 'M-51', fields: ['M1216'], keterangan: 'Apakah benar M1216 alasan utama mengikuti organisasi diisi kode 6 (lainnya)? Alasannya apa?',
      cond: r => nz(r.M1216) === 6 },
  ];

  for (const chk of M_CHECKS) {
    for (const row of m1) {
      if (chk.cond(row)) {
        const detail: Record<string, unknown> = {};
        for (const f of chk.fields) detail[f] = row[f];
        push(chk.kode, 'F. Konsistensi Data ART (VSEN26.M)', row, { keterangan: chk.keterangan, detail: Object.keys(detail).length ? detail : undefined });
      }
    }
  }

  // ---------- Blok XI biaya pendidikan (M1112-M1118) — tabel TERPISAH "1_3" ----------
  // Field-field ini TIDAK ADA di tabel m1 ("1_1") — sempat salah taruh di sana
  // sebelumnya (jadi tidak pernah aktif). Dikoreksi setelah cek struktur DBF
  // asli: field M401/M503 JUGA ada di tabel "1_3" ini, jadi tidak perlu
  // gabung-tabel dgn m1.
  // ---------- M-EDU-CHECKS: DIHAPUS sepenuhnya (M-36,37,38,39,41,42) ----------
  // Atas permintaan Anda (koreksi 16/9 kedua) — field-field di tabel m1c (1_3)
  // ini dianggap tidak reliable/tidak sesuai kebutuhan, jadi pengecekannya
  // dihapus total (bukan cuma dinonaktifkan). Tabel m1c sendiri masih
  // tersedia di infrastruktur (kalau nanti ada kebutuhan lain memakainya).

  // ---------- M-NIK-DUPLIKAT: NIK sama dipakai >1 ART dalam 1 keluarga ----------
  {
    const byNik = new Map<string, any[]>();
    for (const row of m1) {
      const nik = String(row.M502CHAR ?? '').trim();
      if (!nik || nik === '9998') continue;
      const key = `${row.NKS}|${row.NURT}|${nik}`;
      if (!byNik.has(key)) byNik.set(key, []);
      byNik.get(key)!.push(row);
    }
    for (const rows of byNik.values()) {
      if (rows.length > 1) {
        for (const row of rows) {
          push('M-NIK-DUPLIKAT', 'F. Konsistensi Data ART (VSEN26.M)', row, {
            keterangan: `NIK duplikat — dipakai ${rows.length} ART dalam 1 keluarga.`,
            detail: { M502CHAR: row.M502CHAR, jmlDuplikat: rows.length },
          });
        }
      }
    }
  }

  // ---------- M-INFORMAN: pemberi info bukan KRT (M401) dan umurnya <17 ----------
  {
    const households = new Map<string, any[]>();
    for (const row of m1) {
      const key = `${row.NKS}|${row.NURT}`;
      if (!households.has(key)) households.set(key, []);
      households.get(key)!.push(row);
    }
    for (const rows of households.values()) {
      const informanNo = rows[0]?.M409;
      if (informanNo == null) continue;

      const informanRow = rows.find(r => nz(r.M401) === nz(informanNo));

      // M-INFORMAN-INVALID: nomor ART pemberi informasi (M409) TIDAK COCOK
      // dengan ART manapun yg tercatat di rumah tangga ini (M401) — berarti
      // salah ketik/menunjuk ART yang tidak ada. Ini yg dimaksud usulan awal
      // "M409=M401, apa iya?" — dikonfirmasi maknanya: bukan dicek per-baris
      // (selalu benar utk baris informan sendiri, jadi bukan anomali kalau
      // dicek begitu), tapi dicek per-RUMAH TANGGA: apakah ADA baris yg cocok.
      if (!informanRow) {
        push('M-INFORMAN-INVALID', 'F. Konsistensi Data ART (VSEN26.M)', rows[0], {
          keterangan: `Nomor urut ART pemberi informasi (M409=${informanNo}) tidak cocok dengan ART manapun di rumah tangga ini — mohon dicek ulang.`,
          detail: { nomorUrutInforman: informanNo },
        });
        continue;
      }

      if (nz(informanNo) <= 1) continue; // informan = KRT (ART#1), tidak perlu dicek umur
      if (nz(informanRow.M407) < 17) {
        push('M-INFORMAN', 'F. Konsistensi Data ART (VSEN26.M)', informanRow, {
          keterangan: 'Nomor urut pemberi informasi bukan KRT dan berumur kurang dari 17 tahun — mohon dicek ulang.',
          detail: { nomorUrutInforman: informanNo, umurInforman: informanRow.M407 },
        });
      }
    }
  }

  // ==========================================================================
  // VSEN26.M — pengecekan RT (tabel mrt1 = file "2_1...", mrt2 = file "2_2...")
  // Satu baris = satu rumah tangga (bukan per-ART), jadi identitas temuan
  // pakai NAMAKRT & NURT saja (NOURUTKOMO tidak relevan, dikosongkan).
  // ==========================================================================
  interface MRtCheck {
    kode: string;
    cond: (r: any) => boolean;
    keterangan: string;
    fields: string[];
  }
  const MRT1_CHECKS: MRtCheck[] = [
    { kode: 'M-56', fields: ['M1501_LAIN'], keterangan: 'Apakah benar M1501 status kepemilikan rumah kode 5 (lainnya)?', cond: r => nz(r.M1501) === 5 },
    { kode: 'M-57', fields: ['M1502A_LAI'], keterangan: 'Apakah benar M1502a cara memperoleh rumah kode 4 (lainnya)?', cond: r => nz(r.M1502A) === 4 },
    { kode: 'M-58', fields: ['M1502B_LAI'], keterangan: 'Apakah benar M1502b cara membeli rumah kode 4 (lainnya)?', cond: r => nz(r.M1502B) === 4 },
    { kode: 'M-59', fields: [], keterangan: 'Apakah benar M1504 sumber penerangan utama listrik non-PLN atau bukan listrik?', cond: r => nz(r.M1504) === 3 || nz(r.M1504) === 4 },
    { kode: 'M-60', fields: [], keterangan: 'Apakah benar M1505a jumlah meteran listrik lebih dari dua?', cond: r => nz(r.M1505A) > 2 },
    { kode: 'M-55', fields: ['M1405'], keterangan: 'Apakah benar M1405 cara pengambilan keputusan diisi kode 4 (lainnya)?', cond: r => nz(r.M1405) === 4 },
    // M-52/M-53: Rincian 1402 (upacara adat/tradisi setahun terakhir) — tiap sub-rincian
    // (A. Kelahiran ... G. Lainnya) punya 2 field terpisah di DBF: _1 = Menyelenggarakan
    // (1=Ya,2=Tidak), _2 = Menghadiri (3=Ya,4=Tidak) — dikonfirmasi dari foto kuesioner
    // asli yang Anda kirim 16/9. "menyelenggarakan dan/atau menghadiri" = OR salah satu Ya.
    { kode: 'M-52', fields: ['M1402F_1', 'M1402F_2'], keterangan: 'Konfirmasi menyelenggarakan dan/atau menghadiri upacara tradisi panen (Rincian 1402.F) dalam setahun terakhir?',
      cond: r => nz(r.M1402F_1) === 1 || nz(r.M1402F_2) === 3 },
    { kode: 'M-53', fields: ['M1402G_1', 'M1402G_2'], keterangan: 'Konfirmasi menyelenggarakan atau menghadiri upacara tradisi lainnya (Rincian 1402.G) dalam setahun terakhir? Upacara/tradisi apa?',
      cond: r => nz(r.M1402G_1) === 1 || nz(r.M1402G_2) === 3 },
    // Rincian 1415.B: "Trotoar di wilayah tempat tinggal sudah digunakan
    // sepenuhnya utk pejalan kaki..." (1=Setuju, 5=Tidak Setuju, 7=Tidak
    // relevan). NKS 50262/50334 dikecualikan sesuai permintaan.
    { kode: 'M-TROTOAR', fields: ['M1415B'], keterangan: 'Apakah benar di wilayah tinggal responden ada trotoar?',
      cond: r => !isBlank(r.M1415B) && nz(r.M1415B) !== 7 && !['50262', '50334'].includes(String(r.NKS ?? '').trim()) },
  ];
  const MRT2_CHECKS: MRtCheck[] = [
    { kode: 'M-61', fields: ['M1602_LAIN'], keterangan: 'Cek kembali apakah benar M1602h sumber informasi perubahan iklim dari lainnya?',
      // Dikoreksi setelah baca kuesioner asli: huruf H = "Lainnya" (G = "Seminar/Sosialisasi/Penyuluhan",
      // pilihan berbeda). File contoh tahun lalu salah label/bergeser satu huruf.
      cond: r => String(r.M1602H ?? '').trim().toUpperCase() === 'H' },
    { kode: 'M-62', fields: ['M1701B_GLA'], keterangan: 'Cek kembali apakah benar bantuan PKH (M1701) digunakan untuk lainnya?', cond: r => String(r.M1701B_G ?? '').trim().toUpperCase() === 'G' },
    { kode: 'M-63', fields: [], keterangan: 'Apakah memang salah satu ART tidak punya alat komunikasi (HP) untuk persiapan bencana?', cond: r => nz(r.M1611C2) === 5 },
  ];
  for (const row of mrt1) {
    for (const chk of MRT1_CHECKS) {
      if (chk.cond(row)) {
        const detail: Record<string, unknown> = {};
        for (const f of chk.fields) detail[f] = row[f];
        push(chk.kode, 'G. Kondisi Perumahan (VSEN26.M)', { NKS: row.NKS, NURT: row.NURT, NOURUTKOMO: null, NAMAKRT: row.NAMAKRT }, {
          keterangan: chk.keterangan,
          detail: Object.keys(detail).length ? detail : undefined,
        });
      }
    }
  }
  for (const row of mrt2) {
    for (const chk of MRT2_CHECKS) {
      if (chk.cond(row)) {
        const detail: Record<string, unknown> = {};
        for (const f of chk.fields) detail[f] = row[f];
        push(chk.kode, 'H. Bencana & Bansos (VSEN26.M)', { NKS: row.NKS, NURT: row.NURT, NOURUTKOMO: null, NAMAKRT: row.NAMAKRT }, {
          keterangan: chk.keterangan,
          detail: Object.keys(detail).length ? detail : undefined,
        });
      }
    }
  }

  // ---------- M-BANSOS-BUMIL: cross-table, ART (m1) + RT (mrt2) ----------
  // Nomor rincian dikoreksi dari usulan awal "M1702B_D" -> "M1701B_D" (bergeser
  // satu blok, dikonfirmasi lewat data riil tahun lalu — lihat MRT2 field list).
  {
    const mrt2ByHousehold = new Map<string, any>();
    for (const row of mrt2) mrt2ByHousehold.set(`${row.NKS}|${row.NURT}`, row);
    for (const row of m1) {
      const rt = mrt2ByHousehold.get(`${row.NKS}|${row.NURT}`);
      if (!rt) continue;
      if (nz(row.M405) === 2 && nz(row.M605) === 5 && String(rt.M1701B_D ?? '').trim().toUpperCase() === 'D') {
        push('M-BANSOS-BUMIL', 'H. Bencana & Bansos (VSEN26.M)', row, {
          keterangan: 'Tidak ada ART hamil di rumah tangga ini, tetapi M1701B_D=D (bansos utk ibu hamil) — mohon dicek ulang.',
          detail: { M405: row.M405, M605: row.M605, M1701B_D: rt.M1701B_D },
        });
      }
    }
  }

  return findings;
}

export { runAllChecks, KOMODITAS_LAINNYA };
