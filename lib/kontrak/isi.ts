// lib/kontrak/isi.ts
//
// (6 Okt 2026) Pengisian otomatis data kontrak -- permintaan user: "upayakan semaksimalnya bisa diisi
// otomatis agar tidak banyak klik, user hanya verifikasi dan edit jika perlu".
//
// Sumber nilai (urut prioritas, yg terakhir menang):
//   1. Master per tahun (pejabat PPK & Pejabat Pengadaan, DIPA, alamat, kota TTD, KPPN, dll)
//   2. Penyedia terpilih (nama, NPWP, alamat, pimpinan, rekening, ...)
//   3. Isian paket (nama kegiatan, nomor urut, tanggal mulai, durasi, MAK, item & harga)
//   4. Hitungan otomatis (nomor surat dari pola, jadwal hari kerja mundur dari tanggal mulai,
//      total, terbilang, hari, tanggal terbilang)
//   5. Timpa manual dari pengguna (per tag) -- selalu menang.
// Pola nomor & jadwal diturunkan dari file mail merge user (paket ke-59 TA 2025).
// File ini dipakai di server (unduh) DAN di browser (pratinjau langsung), jadi tanpa impor server.

export type Master = Record<string, string>;
export type Penyedia = {
  id?: number;
  nama: string;
  npwp?: string;
  alamat?: string;
  kota?: string;
  label_pimpinan?: string;
  nama_pimpinan?: string;
  nik?: string;
  nomor_rekening?: string;
  bank?: string;
  nama_rekening?: string;
  bidang?: string;
};
export type ItemIsian = {
  no?: string;
  uraian: string;
  volume: number | string;
  satuan: string;
  keterangan?: string;
  spesifikasi?: string;
  harga_survei?: (number | string | null)[]; // index 0..2 = survei 1..3
  harga_hps?: number | string | null;
  harga_penawaran?: number | string | null;
  harga_nego?: number | string | null;
};
export type Isian = {
  tahun: number;
  nomor_urut: number | string;
  Nama_Kegiatan_Pengadaan?: string;
  tanggal_mulai?: string; // ISO yyyy-mm-dd
  durasi_hari?: number | string;
  pembanding?: string[]; // nama survei 2 & 3 (survei 1 = penyedia terpilih)
  libur?: string[]; // tanggal libur tambahan (ISO) -- dilewati saat hitung hari kerja
  items?: ItemIsian[];
  [k: string]: unknown;
};

// ---------------------------------------------------------------- utilitas tanggal & angka

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const BELASAN = ["sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];

function ratusan(n: number): string {
  if (n === 0) return "";
  if (n < 10) return SATUAN[n];
  if (n < 20) return BELASAN[n - 10];
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh${n % 10 ? " " + SATUAN[n % 10] : ""}`;
  const r = Math.floor(n / 100);
  return `${r === 1 ? "seratus" : SATUAN[r] + " ratus"}${n % 100 ? " " + ratusan(n % 100) : ""}`;
}

/** 4625000 -> "empat juta enam ratus dua puluh lima ribu" (huruf kecil, tanpa "rupiah"). */
export function terbilang(nilai: number): string {
  let n = Math.round(Math.abs(nilai));
  if (n === 0) return "nol";
  const out: string[] = [];
  for (const [b, l] of [
    [1e12, "triliun"],
    [1e9, "miliar"],
    [1e6, "juta"],
    [1e3, "ribu"],
  ] as [number, string][]) {
    const j = Math.floor(n / b);
    if (j) out.push(b === 1e3 && j === 1 ? "seribu" : `${ratusan(j)} ${l}`);
    n %= b;
  }
  if (n) out.push(ratusan(n));
  return out.join(" ");
}

const kapital = (s: string) => s.replace(/(^|\s)\S/g, (m) => m.toUpperCase());
const pad2 = (n: number) => String(n).padStart(2, "0");

export function keTanggal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function keIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function tglIndo(iso: string): string {
  const d = keTanggal(iso);
  return `${pad2(d.getUTCDate())} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function hariIndo(iso: string): string {
  return HARI[keTanggal(iso).getUTCDay()];
}
/** "Empat Belas bulan Juli tahun dua ribu dua puluh lima" */
export function tglTerbilang(iso: string): string {
  const d = keTanggal(iso);
  return `${kapital(terbilang(d.getUTCDate()))} bulan ${BULAN[d.getUTCMonth()]} tahun ${terbilang(d.getUTCFullYear())}`;
}
/** Mundur `n` hari kerja (Senin-Jumat, lewati libur) dari tanggal ISO. */
export function mundurHariKerja(iso: string, n: number, libur: string[] = []): string {
  const d = keTanggal(iso);
  let sisa = n;
  while (sisa > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const h = d.getUTCDay();
    if (h !== 0 && h !== 6 && !libur.includes(keIso(d))) sisa--;
  }
  return keIso(d);
}
export function tambahHari(iso: string, n: number): string {
  const d = keTanggal(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return keIso(d);
}

/** "185.000" / "185000" / 185000 -> 185000 */
export function angka(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d,-]/g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
export const rp = (n: number) => Math.round(n).toLocaleString("id-ID").replace(/,/g, ".");

// ---------------------------------------------------------------- definisi dokumen & jadwal

/** Jadwal: hari kerja sebelum tanggal mulai kerja (0 = hari mulai, "selesai" = tanggal selesai). */
export const JADWAL: { kunci: string; label: string; mundur: number | "selesai" }[] = [
  { kunci: "form", label: "Form permintaan & spesifikasi teknis", mundur: 9 },
  { kunci: "hps", label: "Penetapan HPS", mundur: 8 },
  { kunci: "permintaan", label: "Surat permintaan & undangan pengadaan", mundur: 7 },
  { kunci: "penawaran", label: "Penawaran, evaluasi & klarifikasi/negosiasi", mundur: 6 },
  { kunci: "hasil", label: "BA hasil & laporan hasil pengadaan", mundur: 5 },
  { kunci: "sppbj", label: "SPPBJ", mundur: 4 },
  { kunci: "spk", label: "SPK", mundur: 1 },
  { kunci: "spmk", label: "SPMK / mulai kerja", mundur: 0 },
  { kunci: "selesai", label: "Selesai: BAPP, BAST, BAP, kuitansi, permohonan bayar", mundur: "selesai" },
];

/** Pola nomor; n = nomor urut paket, Y = tahun. */
export const POLA_NOMOR: Record<string, string> = {
  Nomor_Form: "{n}/PPK-BPSKAB/SOLOK/FP/{Y}",
  Nomor_Penetapan_HPS: "{n}/PPK-BPSKAB/SOLOK/OE/{Y}",
  Nomor_Surat_Permintaan_Pengadaan: "{n}/PPK-BPSKAB/SOLOK/{Y}",
  Nomor_Surat_Undangan_Pengadaan: "{n}/1/09/PPBJ-BPSKAB/SOLOK/S/{Y}",
  Nomor_BA_Evaluasi: "{n}/3/01/PPBJ-BPSKAB/SOLOK/{Y}",
  Nomor_BA_Evaluasi_Adm: "{n}/4/01/PPBJ-BPSKAB/SOLOK/{Y}",
  Nomor_BA_Klarifikasi_Teknis: "{n}/5/01/PPBJ-BPSKAB/SOLOK/{Y}",
  Nomor_BA_Hasil_Pengadaan: "{n}/6/01/PPBJ-BPSKAB/SOLOK/{Y}",
  Nomor_laporan_hasil_Pengadaan: "{n}/7/01/PPBJ-BPSKAB/SOLOK/{Y}",
  Nomor_SPPBJ: "{n}/PPK-BPSKAB/SOLOK/SPPBJ/{Y}",
  Nomor_SPK: "{n}/PPK-BPSKAB/SOLOK/K/{Y}",
  Nomor_SPMK: "{n}/PPK-BPSKAB/SOLOK/SPMK/{Y}",
  Nomor_BAPP: "{n}/PPK-BPSKAB/SOLOK/BAPP/{Y}",
  Nomor_BAST: "{n}/PPK-BPSKAB/SOLOK/BAST/{Y}",
  Nomor_BAST_KPA: "{n}/PPK-BPSKAB/SOLOK/BAST-KPA/{Y}",
  Nomor_BAP: "{n}/PPK-BPSKAB/SOLOK/BAP/{Y}",
};

/** Isian master per tahun (ditampilkan di halaman Master). */
export const FIELD_MASTER: { k: string; label: string; contoh?: string }[] = [
  { k: "Nama_PPK", label: "Nama PPK" },
  { k: "NIP_PPK", label: "NIP PPK" },
  { k: "No_SK_PPK", label: "Nomor SK PPK" },
  { k: "Tgl_SK_PPK", label: "Tanggal SK PPK", contoh: "2 Januari 2026" },
  { k: "Label_PPK", label: "Jabatan PPK (label)", contoh: "PPK BPS Kabupaten Solok Tahun Anggaran 2026" },
  { k: "Nama_Pejabat_Pengadaan", label: "Nama Pejabat Pengadaan" },
  { k: "NIP_Pejabat", label: "NIP Pejabat Pengadaan" },
  { k: "No_SK_PP", label: "Nomor SK Pejabat Pengadaan" },
  { k: "Tgl_SK_PP", label: "Tanggal SK Pejabat Pengadaan" },
  { k: "Label_Pejabat_Pengadaan", label: "Jabatan Pejabat Pengadaan (label)" },
  { k: "DIPA", label: "Kalimat DIPA", contoh: "Satuan Kerja BPS Kabupaten Solok Tahun Anggaran 2026 Nomor : DIPA-054.01.2.019979/2026 tanggal ..." },
  { k: "Alamat", label: "Alamat kantor" },
  { k: "Kota_TTD", label: "Kota tanda tangan" },
  { k: "KPPN", label: "KPPN" },
  { k: "Jenis_Kontrak", label: "Jenis kontrak (bawaan)" },
  { k: "Cara_Pembayaran", label: "Cara pembayaran (bawaan)" },
  { k: "Denda", label: "Dasar denda (bawaan)" },
  { k: "Jenis_Pekerjaan", label: "Jenis pekerjaan (bawaan)" },
];

/** Isian MAK/anggaran per paket. */
export const FIELD_MAK: { k: string; label: string }[] = [
  { k: "Program", label: "Program" },
  { k: "Kode_Kegiatan", label: "Kegiatan" },
  { k: "Output", label: "Output (KRO/RO)" },
  { k: "Komponen", label: "Komponen" },
  { k: "Akun", label: "Akun" },
  { k: "Item", label: "Item / detil" },
  { k: "Mata_Anggaran", label: "Mata anggaran (kode lengkap)" },
  { k: "Nilai_Pagu_Anggaran_Rp", label: "Nilai pagu (Rp)" },
  { k: "ID_RUP", label: "ID RUP" },
];

/** Dokumen yg dihasilkan: tag nomor/tanggal/hari/terbilang & jadwalnya (utk tabel verifikasi). */
export const DOK_TANGGAL: { label: string; nomor?: string; tanggal?: string; hari?: string; terbilang?: string; jadwal: string }[] = [
  { label: "Form permintaan", nomor: "Nomor_Form", tanggal: "Tanggal_Form", jadwal: "form" },
  { label: "Spesifikasi teknis", tanggal: "Tanggal_Penetapan_Spesifikasi_Teknis", jadwal: "form" },
  { label: "Penetapan HPS", nomor: "Nomor_Penetapan_HPS", tanggal: "Tanggal_Penetapan_HPS", hari: "Hari_HPS", terbilang: "Tanggal_Terbilang_HPS", jadwal: "hps" },
  { label: "Surat permintaan pengadaan", nomor: "Nomor_Surat_Permintaan_Pengadaan", tanggal: "Tanggal_Surat_Permintaan_Pengadaan", jadwal: "permintaan" },
  { label: "Surat undangan pengadaan", nomor: "Nomor_Surat_Undangan_Pengadaan", tanggal: "Tanggal_Surat_Undangan_Pengadaan", jadwal: "permintaan" },
  { label: "Surat penawaran (penyedia)", nomor: "Nomor_Surat_Penawaran", tanggal: "Tanggal_Surat_Penawaran", jadwal: "penawaran" },
  { label: "BA pembukaan penawaran", nomor: "Nomor_BA_Evaluasi", tanggal: "Tanggal_BA_Evaluasi", hari: "Hari_BA_Evaluasi", terbilang: "Tanggal_terbilang_BA_Evaluasi", jadwal: "penawaran" },
  { label: "BA evaluasi penawaran", nomor: "Nomor_BA_Evaluasi_Adm", tanggal: "Tanggal_BA_Evaluasi_Adm", jadwal: "penawaran" },
  { label: "BA klarifikasi & negosiasi", nomor: "Nomor_BA_Klarifikasi_Teknis", tanggal: "Tanggal_BA_Klarifikasi_Teknis", jadwal: "penawaran" },
  { label: "BA hasil pengadaan", nomor: "Nomor_BA_Hasil_Pengadaan", tanggal: "Tanggal_BA_Hasil_Pengadaan", hari: "Hari_BA_Hasil_Pengadaan", terbilang: "Tanggal_Terbilang_BA_Hasil_Pengadaan", jadwal: "hasil" },
  { label: "Laporan hasil pengadaan", nomor: "Nomor_laporan_hasil_Pengadaan", tanggal: "tanggal_laporan_hasil_Pengadaan", jadwal: "hasil" },
  { label: "SPPBJ", nomor: "Nomor_SPPBJ", tanggal: "Tanggal_SPPBJ", jadwal: "sppbj" },
  { label: "SPK", nomor: "Nomor_SPK", tanggal: "Tanggal_SPK", jadwal: "spk" },
  { label: "SPMK / mulai kerja", nomor: "Nomor_SPMK", tanggal: "Tanggal_SPMK", jadwal: "spmk" },
  { label: "Batas akhir pekerjaan", tanggal: "Tanggal_Batas_Akhir_Pekerjaan", jadwal: "selesai" },
  { label: "BA pemeriksaan pekerjaan", nomor: "Nomor_BAPP", tanggal: "Tanggal_BAPP", hari: "Hari_BAPP", terbilang: "Tanggal_Terbilang_BAPP", jadwal: "selesai" },
  { label: "BAST hasil pekerjaan", nomor: "Nomor_BAST", tanggal: "Tanggal_BAST", hari: "Hari_BAST", terbilang: "Tanggal_Terbilang_BAST", jadwal: "selesai" },
  { label: "BAST ke KPA", nomor: "Nomor_BAST_KPA", hari: "Hari_BAST_KPA", terbilang: "Tanggal_Terbilang_BAST_KPA", jadwal: "selesai" },
  { label: "BA pemeriksaan administrasi", nomor: "Nomor_BA_Pemeriksaan_Administrasi", hari: "Hari_BA_Pemeriksaan_Administrasi", terbilang: "Tanggal_Terbilang_BA_Pemeriksaan_Administrasi", jadwal: "selesai" },
  { label: "BA pembayaran & kuitansi", nomor: "Nomor_BAP", tanggal: "Tanggal_Kuitansi_dan_BAP", hari: "Hari_BAP", terbilang: "Tanggal_Kuitansi_dan_BAP_Terbilang", jadwal: "selesai" },
  { label: "Nomor kuitansi", nomor: "Nomor_Kuitansi", jadwal: "selesai" },
  { label: "Permohonan pembayaran (penyedia)", nomor: "Permohonan_Pembayaran", tanggal: "tgl_Permohonan_Pembayaran", jadwal: "selesai" },
];

/** 21 dokumen hasil pecahan (urut bookmark DOK_xx di template). */
export const DAFTAR_DOKUMEN: { kode: string; nama: string }[] = [
  "Surat Pesanan",
  "BA Penetapan HPS dan Kertas Kerja HPS",
  "Penetapan Rancangan Kontrak",
  "Dokumen Pemilihan",
  "Surat Permintaan Pengadaan",
  "Surat Undangan Pengadaan",
  "Surat Penawaran Harga",
  "Pakta Integritas",
  "BA Pembukaan Dokumen Penawaran",
  "BA Evaluasi Penawaran",
  "BA Klarifikasi dan Negosiasi Harga",
  "BA Hasil Pengadaan Langsung",
  "SPPBJ",
  "SPK",
  "Ringkasan Kontrak",
  "BA Pemeriksaan Pekerjaan",
  "BAST Hasil Pekerjaan",
  "BAST ke KPA",
  "BA Pembayaran",
  "Kuitansi",
  "Surat Permohonan Pembayaran",
].map((nama, i) => ({ kode: `DOK_${pad2(i + 1)}`, nama: `${pad2(i + 1)} ${nama}` }));

// ---------------------------------------------------------------- hitung

export type HasilHitung = {
  nilai: Record<string, string>; // nilai akhir per tag (sudah termasuk timpa)
  otomatis: Record<string, string>; // nilai sebelum timpa (utk tombol "kembalikan otomatis")
  items: Record<string, string>[];
  survei3: boolean;
  jadwal: Record<string, string>; // kunci jadwal -> ISO
  peringatan: string[];
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function hitung(master: Master, penyedia: Penyedia | null, isian: Isian, timpa: Record<string, string> = {}): HasilHitung {
  const Y = String(isian.tahun);
  const n = str(isian.nomor_urut);
  const v: Record<string, string> = {};
  const peringatan: string[] = [];

  // 1. master
  for (const f of FIELD_MASTER) v[f.k] = str(master[f.k]);
  v.Label_PPK ||= `PPK BPS Kabupaten Solok Tahun Anggaran ${Y}`;
  v.Label_Pejabat_Pengadaan ||= `Pejabat Pengadaan BPS Kabupaten Solok Tahun Anggaran ${Y}`;
  v.Jenis_Kontrak ||= "Lumpsum";
  v.Cara_Pembayaran ||= "Pembayaran sekaligus";
  v.Denda ||= "nilai pekerjaan";
  v.Jenis_Pekerjaan ||= "Jasa lainnya";
  v.Kota_TTD ||= "Kayu Aro";
  v.KPPN ||= "Solok";
  v.Tahun_Anggaran = Y;
  v.Sub_Direktorat_Bagian = v.Label_PPK;

  // 2. penyedia
  const p = penyedia;
  v.Nama_Penyedia = str(p?.nama);
  v.No_NPWP = str(p?.npwp);
  v.Alamat_Penyedia = str(p?.alamat);
  v.Kota_Penyedia = str(p?.kota);
  v.Label_Pimpinan_Penyedia = str(p?.label_pimpinan) || "Direktur";
  v.Nama_Pimpinan_Penyedia = str(p?.nama_pimpinan);
  v.NIK_Penyedia = str(p?.nik);
  v.Nomor_Rekening = str(p?.nomor_rekening);
  v.Bank = str(p?.bank);
  v.Nama_Pada_Rekening = str(p?.nama_rekening) || str(p?.nama);
  v.Bidang_Pekerjaan = str(p?.bidang);

  // 3. isian paket (semua kunci string bertag langsung dipakai)
  for (const [k, x] of Object.entries(isian)) if (/^[A-Z]/.test(k) && (typeof x === "string" || typeof x === "number")) v[k] = String(x);
  v.Uraian_Pengadaan ||= v.Nama_Kegiatan_Pengadaan ?? "";
  v.ID_RUP ||= "-";

  // 4a. nomor surat
  for (const [k, pola] of Object.entries(POLA_NOMOR)) if (!v[k]) v[k] = n ? pola.replace("{n}", n).replace("{Y}", Y) : "";

  // 4b. jadwal
  const jadwal: Record<string, string> = {};
  const mulai = str(isian.tanggal_mulai);
  const durasi = Math.max(1, Math.round(angka(isian.durasi_hari) || 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(mulai)) {
    const selesai = tambahHari(mulai, durasi - 1);
    for (const j of JADWAL) jadwal[j.kunci] = j.mundur === "selesai" ? selesai : mundurHariKerja(mulai, j.mundur, isian.libur ?? []);
    for (const d of DOK_TANGGAL) {
      const iso = jadwal[d.jadwal];
      if (d.tanggal) v[d.tanggal] = tglIndo(iso);
      if (d.hari) v[d.hari] = hariIndo(iso);
      if (d.terbilang) v[d.terbilang] = tglTerbilang(iso);
    }
    v.Tanggal_Mulai_Kerja = tglIndo(mulai);
    v.Tanggal_BAST_KPA = tglIndo(selesai);
    v.Jangka_Waktu_Hari = `${pad2(durasi)} (${terbilang(durasi)})`;
    // akhir pekan pada tanggal penting
    for (const k of ["spmk", "selesai"]) {
      const h = keTanggal(jadwal[k]).getUTCDay();
      if (h === 0 || h === 6) peringatan.push(`Tanggal ${k === "spmk" ? "mulai kerja" : "selesai"} jatuh pada ${HARI[h]}.`);
    }
  } else peringatan.push("Tanggal mulai kerja belum diisi -- semua tanggal dokumen masih kosong.");
  // Nomor kuitansi & penawaran/permohonan bayar: dari penyedia/pengguna (bukan pola)
  v.Nomor_Kuitansi ||= "";
  v.Nomor_Surat_Penawaran ||= "";
  v.Permohonan_Pembayaran ||= "";

  // 4c. item & nilai
  const pembanding = (isian.pembanding ?? []).filter((x) => x && x.trim());
  const survei3 = pembanding.length >= 2;
  const namaSurvei = [v.Nama_Penyedia, pembanding[0] ?? "", pembanding[1] ?? ""];
  const tot = { hps: 0, penawaran: 0, nego: 0, s: [0, 0, 0] };
  const items = (isian.items ?? []).map((it, i) => {
    const vol = angka(it.volume);
    const hs = [0, 1, 2].map((k) => angka(it.harga_survei?.[k]));
    const hps = it.harga_hps !== undefined && it.harga_hps !== null && it.harga_hps !== "" ? angka(it.harga_hps) : Math.max(...hs);
    const pen = it.harga_penawaran !== undefined && it.harga_penawaran !== null && it.harga_penawaran !== "" ? angka(it.harga_penawaran) : hps;
    const neg = it.harga_nego !== undefined && it.harga_nego !== null && it.harga_nego !== "" ? angka(it.harga_nego) : pen;
    tot.hps += vol * hps;
    tot.penawaran += vol * pen;
    tot.nego += vol * neg;
    hs.forEach((h, k) => (tot.s[k] += vol * h));
    if (pen > hps) peringatan.push(`Item ${i + 1}: harga penawaran di atas HPS.`);
    if (neg > pen) peringatan.push(`Item ${i + 1}: harga nego di atas penawaran.`);
    return {
      no: str(it.no) || ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][i] || String(i + 1),
      uraian: str(it.uraian),
      volume: String(vol),
      satuan: str(it.satuan),
      keterangan: str(it.keterangan),
      spesifikasi: str(it.spesifikasi),
      harga_hps: rp(hps),
      jumlah_hps: rp(vol * hps),
      harga_penawaran: rp(pen),
      jumlah_penawaran: rp(vol * pen),
      harga_nego: rp(neg),
      jumlah_nego: rp(vol * neg),
      harga_survei_1: rp(hs[0]),
      jumlah_survei_1: rp(vol * hs[0]),
      harga_survei_2: rp(hs[1]),
      jumlah_survei_2: rp(vol * hs[1]),
      harga_survei_3: rp(hs[2]),
      jumlah_survei_3: rp(vol * hs[2]),
    };
  });
  if (!items.length) peringatan.push("Belum ada item pekerjaan.");
  v.Nilai_HPS = rp(tot.hps);
  v.Nilai_HPS_Terbilang = terbilang(tot.hps);
  v.Nilai_Penawaran = rp(tot.penawaran);
  v.Nilai_Penawaran_Terbilang = terbilang(tot.penawaran);
  v.Nilai_Nego = rp(tot.nego);
  v.Nilai_Terbilang_Nego = terbilang(tot.nego);
  v.Selisih_Harga_Nego = rp(tot.penawaran - tot.nego);
  namaSurvei.forEach((nm, k) => {
    v[`Nama_Survei_${k + 1}`] = nm;
    v[`Total_Survei_${k + 1}`] = rp(tot.s[k]);
  });
  const pagu = angka(v.Nilai_Pagu_Anggaran_Rp);
  if (pagu && tot.hps > pagu) peringatan.push("Nilai HPS melebihi pagu anggaran.");
  if (!penyedia) peringatan.push("Penyedia belum dipilih.");
  if (!pembanding.length) peringatan.push("Belum ada penyedia pembanding (survei harga butuh 2–3 penyedia).");

  // 5. timpa manual
  const otomatis = { ...v };
  for (const [k, x] of Object.entries(timpa)) if (x !== undefined && x !== null) v[k] = String(x);
  return { nilai: v, otomatis, items, survei3, jadwal, peringatan };
}
