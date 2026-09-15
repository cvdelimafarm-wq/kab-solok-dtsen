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
};

export type Thresholds = {
  garam?: number;
  tiketPesawat?: number;
  hotel?: number;
  transportasiDarat?: number;
  zscoreNonMakanan?: number;
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
    return (
      `Ditemukan ketidaksesuaian pada isian Banyaknya/Nilai Total. Banyaknya Total tercatat ${numRef(fmtN(d.banyakTotal), 'KOLOM5')}, ` +
      `seharusnya ${numRef(fmtN(d.banyakHitung), 'KOLOM1+KOLOM3')} (Banyak Beli + Banyak Nonbeli). Nilai Total tercatat ${numRef(fmtRp(d.nilaiTotal), 'KOLOM6')}, ` +
      `seharusnya ${numRef(fmtRp(d.nilaiHitung), 'KOLOM2+KOLOM4')} (Nilai Beli + Nilai Nonbeli). Mohon periksa kembali isian Blok IV.1 dan perbaiki jika memang keliru.`
    );
  }
  if (kode === 'KP-24') {
    return (
      `Kode Sumber Perolehan tercatat ${numRef(String(d.sumberPerolehan), 'KOLOM7')} (0=Non Pembelian, 1=Online, 2=Offline, 3=Online & Offline), ` +
      `namun isian kolom Beli/Nonbeli tidak konsisten dengan kode tersebut (Banyak Beli: ${numRef(fmtN(d.banyakBeli), 'KOLOM1')}, ` +
      `Banyak Nonbeli: ${numRef(fmtN(d.banyakNonbeli), 'KOLOM3')}). Mohon periksa kembali kesesuaian sumber perolehan dengan kolom yang terisi.`
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
    return `Tercatat pengeluaran untuk tiket pesawat sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, di luar kewajaran umum. Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  if (kode === 'KP-18') {
    return `Tercatat pengeluaran untuk hotel/penginapan sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, di luar kewajaran umum. Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  if (kode === 'KP-19') {
    return (
      `Nilai kategori Bumbu-bumbuan (${numRef(fmtRp(d.bumbuBumbuan), 'B432R11K5')}) tercatat lebih besar dari kategori Padi-padian ` +
      `(${numRef(fmtRp(d.padiPadian), 'B432R1K5')}) — secara umum ini tidak wajar karena bumbu-bumbuan biasanya bernilai jauh lebih kecil. ` +
      `Mohon periksa kembali isian kedua kategori tersebut.`
    );
  }
  if (kode === 'KP-20') {
    return `Konsumsi garam tercatat senilai ${numRef(fmtRp(extra.nilai), 'KOLOM6')} per minggu, di luar kewajaran umum berdasarkan data riil tahun lalu. Mohon periksa kembali kebenaran isian dan satuannya.`;
  }
  if (kode === 'KP-21') {
    return `Tercatat pengeluaran untuk transportasi darat sebesar ${numRef(fmtRp(extra.nilai), 'KOLOM6')} dalam setahun terakhir, melebihi ambang Rp100 juta. Mohon periksa kembali kebenaran isian dan satuan nilainya.`;
  }
  return typeof extra.keterangan === 'string' ? extra.keterangan : '';
}

// 17 rincian "...lainnya, sebutkan" yang dipetakan ke NOURUTKOMO + tabel asalnya
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
  { n: 124, nama: 'Kacang lainnya (sebutkan)', kategori: 'G. Kacang-kacangan', table: 3 },
  { n: 128, nama: 'Hasil lain dari kacang-kacangan (sebutkan)', kategori: 'G. Kacang-kacangan', table: 3 },
  { n: 153, nama: 'Buah-buahan lainnya (sebutkan)', kategori: 'H. Buah-buahan', table: 3 },
  { n: 158, nama: 'Minyak dan kelapa lainnya (sebutkan)', kategori: 'I. Minyak dan Kelapa', table: 3 },
  { n: 166, nama: 'Bahan minuman lainnya (sebutkan)', kategori: 'J. Bahan Minuman', table: 3 },
  { n: 186, nama: 'Lainnya, bahan makanan (sebutkan)', kategori: 'L. Bahan Makanan Lainnya', table: 3 },
  { n: 211, nama: 'Makanan jadi lainnya (sebutkan)', kategori: 'M. Makanan dan Minuman Jadi', table: 4 },
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

  const thresholds = Object.assign(
    {
      garam: 3500, // Kolom6, dihitung dari data riil tahun lalu (mean+3SD ~3428, dibulatkan)
      tiketPesawat: 15000000, // ⚠ sampel tahun lalu cuma 2 kasus, ini angka kebijakan
      hotel: 5000000, // ⚠ sampel tahun lalu cuma 2 kasus, ini angka kebijakan
      transportasiDarat: 100000000, // literal dari pesan asli tahun lalu (longgar; lihat catatan)
      zscoreNonMakanan: 3, // dipakai KP-02: tandai jika di luar mean ± N*SD per NOURUTKOMO
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
        detail: { banyakTotal, banyakHitung, nilaiTotal, nilaiHitung },
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
        detail: { banyakTotal, banyakHitung, nilaiTotal, nilaiHitung },
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
        detail: { sumberPerolehan: sumber, banyakBeli, banyakNonbeli },
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
  for (const row of t5) {
    if (row.NOURUTKOMO === 299 && nz(row.KOLOM6) > thresholds.tiketPesawat) {
      push('KP-17', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk tiket pesawat',
        nilai: row.KOLOM6,
      });
    }
  }

  // ---------- KP-18: hotel/penginapan (No.302, tabel 5) ----------
  for (const row of t5) {
    if (row.NOURUTKOMO === 302 && nz(row.KOLOM6) > thresholds.hotel) {
      push('KP-18', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk hotel sebesar itu',
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
      });
    }
  }

  // ---------- KP-21: transportasi darat (No.298, tabel 5) ----------
  for (const row of t5) {
    if (row.NOURUTKOMO === 298 && nz(row.KOLOM6) > thresholds.transportasiDarat) {
      push('KP-21', 'C. Kewajaran Nilai', row, {
        keterangan: 'Cek kembali apakah sudah benar pengeluaran untuk transportasi darat >100juta',
        nilai: row.KOLOM6,
      });
    }
  }

  return findings;
}

export { runAllChecks, KOMODITAS_LAINNYA };
