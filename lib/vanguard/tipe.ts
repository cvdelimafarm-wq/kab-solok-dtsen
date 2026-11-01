// lib/vanguard/tipe.ts  (tipe murni, tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V1: tipe data kasus dan hasil engine. Kasus disimpan sebagai JSON di lib/vanguard/kasus/ (dipisah dari mesin);
// kode kasus STABIL: huruf level + nomor urut dua digit (mis. E07). Kode dibekukan mulai V1 karena dipakai rekaman percobaan; kasus baru
// ditambah di belakang tiap level dan kode tidak pernah dipakai ulang.

export type Blok = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "VI" | "VII";
export type Level = "A" | "B" | "C" | "D" | "E" | "G" | "H";

/** Isian petugas: id sel -> nilai rupiah (bulat). Sel kosong tidak ada di peta. */
export type Nilai = Record<string, number>;

export type Jebakan = { k: string; m: string };
export type Alternatif = { k: string; v: number; m: string };
export type BarisUsaha = { no?: string | number; uraian?: string; kat?: string; jenis?: string };

/** Kutipan Blok IV yang ditampilkan di atas isian (baca saja). Bentuknya mengikuti prototipe; UI V2 yang mengetikkannya lebih rinci. */
export type KutipanIv = { t?: number; rows?: Record<string, unknown>[]; iv1?: Record<string, unknown>[]; iv2?: Record<string, unknown>[]; sum?: [string, string][] };

/** Bagian kasus yang BOLEH dikirim ke perangkat petugas pada mode uji: bahan soal saja (cerita, kutipan Blok IV, tata letak). */
export type KasusPublik = {
  kode: string;
  level: Level;
  judul: string;
  cerita: string;
  info?: string[];
  iv?: KutipanIv;
  meta?: { A?: BarisUsaha[]; B?: BarisUsaha[] };
  blok: Blok[];
  lengkap?: boolean;
  bebas?: boolean;
  nama?: string;
};

/** Bagian RAHASIA: kunci, jebakan, petunjuk, pembahasan. Hanya server yang memegangnya; ke perangkat petugas hanya pada latihan (lewat /api/sigap/vanguard/kasus). */
export type KasusRahasia = {
  /** Kunci: id sel -> nilai benar. Sel yang tidak tercantum harus kosong. */
  kunci: Nilai;
  jebakan: Jebakan[];
  alternatif: Alternatif[];
  /** Pesan untuk kasus yang semua kotaknya harus kosong. */
  nol?: string;
  petunjuk: string[];
  langkah: string[];
  pembahasan: string;
  rujukan: string;
};

/**
 * ditangguhkan: alasan (teks) bila kasus DITANGGUHKAN. Kasus ditangguhkan tetap tersimpan di berkas levelnya (kode tidak hilang) tetapi TIDAK ditampilkan, tidak masuk publik.json,
 * tidak ikut bintang/nilai/hasil final, dan tidak ikut hitungan dasbor, sampai alasannya dikonfirmasi lalu bidang ini dihapus.
 */
export type Kasus = KasusPublik & KasusRahasia & { ditangguhkan?: string };

export type JenisKesalahan =
  | "konversi_seminggu"
  | "konversi_sebulan"
  | "salah_letak"
  | "harus_kosong"
  | "belum_diisi"
  | "jebakan"
  | "alternatif"
  | "angka_meleset"
  | "kontrol_vii"
  | "diskrepansi";

export type Tingkat = "fatal" | "berat" | "ringan";

export type BarisNilai = { k: string; e: number; u: number; ok: boolean };
export type Koreksi = { k: string | null; m: string; jenis: JenisKesalahan; tingkat: Tingkat; dari?: string };
export type HasilEvaluasi = { ok: boolean; rows: BarisNilai[]; fb: Koreksi[] };

export type RincianKontrol = [string, number][];
export type Kontrol = {
  e: RincianKontrol; e1: number; e2a: RincianKontrol; e2: number;
  h: RincianKontrol; h1: number; h2: number;
  r1k2: number; r1k4: number; bK2: number; bK4: number;
};
export type HasilHitung = {
  co: Record<string, number>;
  ctl: Kontrol;
  vals: { selVI: number; selVII: number; disk: number; r1k2: number; r1k4: number };
};

export type PeriksaEngine = { ok: boolean; info?: boolean; t: string; jenis?: JenisKesalahan; tingkat?: Tingkat };
