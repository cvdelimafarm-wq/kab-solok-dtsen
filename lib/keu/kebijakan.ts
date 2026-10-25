// lib/keu/kebijakan.ts
//
// (25 Okt 2026, tahap 28) Lembar kebijakan manajemen tim: templat susunan tim (strata S1-S9) dan kebijakan anggaran sebagai DATA,
// bukan kode. Satu lembar = satu versi tahunan, disepakati pada rapat awal tahun, disahkan paralel oleh setiap ketua tim aktif + PPK + KPA,
// lalu terkunci. Perubahan membuat versi baru; versi lama menjadi arsip. Rancangan: "Skema Lengkap V1" bagian 5-7.
//
// Berkas ini MURNI (tanpa akses basis data): angka predefined (dari Excel pematangan; belum sah), pemeriksa isi, keterangan yang dibangkitkan dari angka,
// dan penentu tombol. Pemeriksa isi punya kembaran di basis data (keu_kebijakan_periksa, berkas 20261025zd) dengan pesan yang SAMA PERSIS;
// kesamaannya dijaga tes kebijakan.test.ts dan 50_uji_kebijakan.sql. Yang memutuskan tetap basis data.

export const JABATAN = [
  { k: "ketua", nama: "Ketua" },
  { k: "wakil", nama: "Wakil" },
  { k: "pj_pengolahan", nama: "PJ pengolahan" },
  { k: "pj_kualitas", nama: "PJ kualitas data" },
  { k: "pj_lapangan", nama: "PJ manajemen lapangan (kortim wilayah)" },
  { k: "pj_admin", nama: "PJ administrasi" },
  { k: "pj_logistik", nama: "PJ logistik" },
  { k: "pj_sdm", nama: "PJ rekrutmen/SDM mitra" },
  { k: "inda", nama: "Inda (instruktur daerah)" },
  { k: "innas", nama: "Innas (instruktur nasional)" },
] as const;
export type KodeJabatan = (typeof JABATAN)[number]["k"];
export const KODE_JABATAN: readonly KodeJabatan[] = JABATAN.map((j) => j.k);
export const namaJabatan = (k: string): string => JABATAN.find((j) => j.k === k)?.nama ?? k;

export const KODE_STRATA = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"] as const;
export type KodeStrata = (typeof KODE_STRATA)[number];

export type Strata = {
  k: KodeStrata;
  dari: number;
  /** null = tanpa batas atas (hanya S9). */
  sampai: number | null;
  /** Jumlah jabatan maksimal yang boleh dipegang satu orang. */
  maks_jabatan: number;
  /** Batas persen petugas baru (null = tidak dibatasi). */
  persen_baru: number | null;
  /** true bila tim kecil boleh menjadi sasaran pengembangan kompetensi pegawai atau mitra baru. */
  pengembangan: boolean;
};

export type JenisParam = "angka" | "persen" | "rujukan" | "dokumen" | "yatidak";
export type Param = {
  k: string;
  nama: string;
  grup: string;
  jenis: JenisParam;
  satuan?: string;
  /** "maks" (bawaan): kebijakan tidak boleh melebihi aturan. "min": kebijakan tidak boleh di bawah aturan. */
  arah?: "maks" | "min";
  /** Batas aturan (peraturan atau juknis pusat); null = tanpa batas angka. */
  aturan?: number | boolean | null;
  /** Nilai kebijakan kantor (null = tanpa batas angka). */
  kebijakan?: number | boolean | null;
  /** Untuk jenis persen: kode parameter angka yang menjadi acuan. */
  acuan?: string;
  /** Persen ditambah biaya riil (at cost), dibuktikan bukti pengeluaran. */
  riil?: boolean;
  /** Untuk jenis rujukan: nama tabel rujukan; berkas = nama berkas yang sudah diunggah (null = belum). */
  rujukan?: string;
  berkas?: string | null;
  /** Untuk jenis dokumen: rujukan teks (mis. "diatur di SPKL"). */
  teks?: string;
  dasar: string;
  ket: string;
};

export type Kompetensi = {
  nilai_pelatihan_min: number;
  nilai_seleksi_min: number;
  /** Mulai jumlah petugas ini tim dianggap ketat. */
  ambang_ketat: number;
  validasi_desktop: boolean;
};

export type IsiKebijakan = {
  strata: Strata[];
  minimal: Record<KodeStrata, Record<KodeJabatan, number>>;
  rangkap: Record<KodeStrata, KodeJabatan[]>;
  kompetensi: Kompetensi;
  param: Param[];
};

// ---------------------------------------------------------------------------------------------------------------------------------------
// Angka predefined (Excel pematangan + putaran konfirmasi). Belum sah sampai lembar disahkan.
// ---------------------------------------------------------------------------------------------------------------------------------------
const URUT_MINIMAL: readonly KodeJabatan[] = ["ketua", "wakil", "pj_pengolahan", "pj_kualitas", "pj_lapangan", "pj_admin", "pj_logistik", "pj_sdm"];
const MINIMAL_PREDEFINED: Record<KodeStrata, number[]> = {
  S1: [1, 0, 0, 0, 0, 0, 0, 0],
  S2: [1, 1, 1, 0, 0, 0, 0, 0],
  S3: [1, 1, 1, 1, 0, 1, 0, 0],
  S4: [1, 1, 1, 2, 1, 1, 0, 0],
  S5: [1, 1, 1, 2, 2, 2, 0, 0],
  S6: [1, 2, 1, 3, 2, 2, 1, 0],
  S7: [1, 2, 2, 3, 5, 3, 1, 1],
  S8: [1, 3, 3, 3, 8, 4, 2, 2],
  S9: [1, 4, 3, 4, 12, 6, 3, 3],
};

const SEMUA: readonly KodeJabatan[] = KODE_JABATAN;
const tanpa = (...x: KodeJabatan[]): KodeJabatan[] => SEMUA.filter((k) => !x.includes(k));
const RANGKAP_PREDEFINED: Record<KodeStrata, KodeJabatan[]> = {
  S1: [...SEMUA],
  S2: tanpa("wakil"),
  S3: tanpa("wakil", "pj_pengolahan"),
  S4: ["ketua", "pj_kualitas", "pj_lapangan", "pj_logistik", "pj_sdm", "inda"],
  S5: ["ketua", "pj_logistik", "pj_sdm", "inda"],
  S6: ["ketua", "pj_sdm", "inda"],
  S7: ["ketua", "inda"],
  S8: ["ketua"],
  S9: ["ketua"],
};

const STRATA_PREDEFINED: Strata[] = [
  { k: "S1", dari: 1, sampai: 4, maks_jabatan: 5, persen_baru: null, pengembangan: true },
  { k: "S2", dari: 5, sampai: 10, maks_jabatan: 4, persen_baru: null, pengembangan: true },
  { k: "S3", dari: 11, sampai: 19, maks_jabatan: 3, persen_baru: null, pengembangan: true },
  { k: "S4", dari: 20, sampai: 40, maks_jabatan: 3, persen_baru: 20, pengembangan: false },
  { k: "S5", dari: 41, sampai: 60, maks_jabatan: 2, persen_baru: 20, pengembangan: false },
  { k: "S6", dari: 61, sampai: 100, maks_jabatan: 2, persen_baru: 15, pengembangan: false },
  { k: "S7", dari: 101, sampai: 200, maks_jabatan: 2, persen_baru: 10, pengembangan: false },
  { k: "S8", dari: 201, sampai: 400, maks_jabatan: 1, persen_baru: 10, pengembangan: false },
  { k: "S9", dari: 401, sampai: null, maks_jabatan: 1, persen_baru: 5, pengembangan: false },
];

const p = (x: Param): Param => x;
const PARAM_PREDEFINED: Param[] = [
  p({ k: "hari_konsultasi", nama: "Hari tugas konsultasi", grup: "Konsultasi dan perjalanan", jenis: "angka", satuan: "hari", aturan: 2, kebijakan: 2, dasar: "", ket: "" }),
  p({ k: "peserta_konsultasi", nama: "Jumlah peserta konsultasi", grup: "Konsultasi dan perjalanan", jenis: "angka", satuan: "orang", aturan: 3, kebijakan: 3, dasar: "", ket: "" }),
  p({ k: "penginapan", nama: "Penginapan", grup: "Konsultasi dan perjalanan", jenis: "rujukan", rujukan: "SBM penginapan (provinsi dan golongan)", berkas: null, dasar: "", ket: "Mengacu SBM; tabel rujukan menunggu berkas." }),
  p({ k: "maks_malam", nama: "Maksimal malam penginapan", grup: "Konsultasi dan perjalanan", jenis: "angka", satuan: "malam", aturan: 1, kebijakan: 1, dasar: "", ket: "" }),
  p({ k: "uang_harian", nama: "Uang harian", grup: "Konsultasi dan perjalanan", jenis: "angka", satuan: "Rp per hari", aturan: 380000, kebijakan: 380000, dasar: "", ket: "" }),
  p({ k: "transport", nama: "Transport", grup: "Konsultasi dan perjalanan", jenis: "rujukan", rujukan: "Matriks SK transport", berkas: null, dasar: "", ket: "Mengacu matriks SK transport; tabel rujukan menunggu berkas." }),
  p({ k: "translok_kurang_8", nama: "Translok kurang dari 8 jam", grup: "Translok", jenis: "angka", satuan: "Rp", aturan: 170000, kebijakan: 170000, dasar: "", ket: "" }),
  p({ k: "translok_lebih_8", nama: "Translok lebih dari 8 jam", grup: "Translok", jenis: "persen", acuan: "uang_harian", riil: true, satuan: "% uang harian", aturan: 60, kebijakan: 60, dasar: "", ket: "Ditambah transportasi at cost (biaya riil, dibuktikan bukti pengeluaran)." }),
  p({ k: "maks_hari_translok", nama: "Maksimal hari translok", grup: "Translok", jenis: "angka", satuan: "hari", aturan: null, kebijakan: null, dasar: "", ket: "Tidak ada batas." }),
  p({ k: "jarak_translok", nama: "Jarak minimal translok", grup: "Translok", jenis: "angka", satuan: "km", arah: "min", aturan: 5, kebijakan: 5, dasar: "", ket: "Lebih dari 5 km." }),
  p({ k: "paket_fullday", nama: "Paket fullday dan fullboard", grup: "Pelatihan", jenis: "rujukan", rujukan: "SBM paket fullday dan fullboard", berkas: null, dasar: "", ket: "Mengacu SBM; tabel rujukan menunggu berkas." }),
  p({ k: "maks_oh", nama: "Maksimal OH pelatihan", grup: "Pelatihan", jenis: "dokumen", teks: "Tidak diatur kabupaten; ikut surat atau juknis pusat.", dasar: "", ket: "Hanya rujukan; tidak dihitung otomatis." }),
  p({ k: "hotel_luar_kota", nama: "Hotel luar kota", grup: "Pelatihan", jenis: "yatidak", aturan: true, kebijakan: true, dasar: "", ket: "Bendera kebijakan: bila ya, pelatihan di hotel luar kota memakai akun 524119." }),
  p({ k: "maks_peserta_kelas", nama: "Maksimal peserta per kelas", grup: "Pelatihan", jenis: "angka", satuan: "orang", aturan: 30, kebijakan: 30, dasar: "", ket: "" }),
  p({ k: "tarif_honor_mitra", nama: "Tarif honor mitra", grup: "Honor", jenis: "dokumen", teks: "Diatur di SPKL.", dasar: "", ket: "Hanya rujukan; tidak dihitung otomatis." }),
  p({ k: "batas_honor_mitra", nama: "Batas honor mitra per bulan", grup: "Honor", jenis: "angka", satuan: "Rp per bulan", aturan: 4500000, kebijakan: 4500000, dasar: "", ket: "Di luar translok." }),
  p({ k: "batas_honor_organik", nama: "Batas honor organik", grup: "Honor", jenis: "dokumen", teks: "Diatur di SPKL.", dasar: "", ket: "Hanya rujukan; tidak dihitung otomatis." }),
  p({ k: "pulsa_peserta", nama: "Pulsa peserta", grup: "Lain-lain", jenis: "angka", satuan: "Rp", aturan: 100000, kebijakan: 100000, dasar: "", ket: "" }),
  p({ k: "pulsa_fasih", nama: "Pulsa FASIH", grup: "Lain-lain", jenis: "angka", satuan: "Rp per orang per bulan", aturan: 100000, kebijakan: 100000, dasar: "", ket: "" }),
  p({ k: "konsumsi_rapat", nama: "Konsumsi rapat", grup: "Lain-lain", jenis: "angka", satuan: "Rp", aturan: 40000, kebijakan: 40000, dasar: "", ket: "" }),
  p({ k: "batas_spj", nama: "Batas waktu SPJ", grup: "Lain-lain", jenis: "angka", satuan: "hari kerja", aturan: 5, kebijakan: 5, dasar: "", ket: "" }),
  p({ k: "hari_cair_maks", nama: "Batas hari pencairan setelah kegiatan", grup: "Lain-lain", jenis: "angka", satuan: "hari (H+)", aturan: 5, kebijakan: 5, dasar: "", ket: "Pencairan dijadwalkan paling lambat H+ sekian dari hari terakhir pelaksanaan kegiatan; dipakai untuk saran jadwal cair di RAB. Tanpa batas awal." }),
];

/**
 * Parameter OPSIONAL: tidak wajib ada (lembar yang sudah disahkan sebelum parameter ini dibuat tetap sah), tetapi bila ada diperiksa sama seperti yang lain.
 * Pemakai hilir memakai nilai bawaan bila tidak ada.
 */
export const KODE_PARAM_OPSIONAL: readonly string[] = ["hari_cair_maks"];

/** Kode parameter yang wajib ada pada setiap lembar (urutan = urutan tampil). */
export const KODE_PARAM: readonly string[] = PARAM_PREDEFINED.map((x) => x.k).filter((k) => !KODE_PARAM_OPSIONAL.includes(k));

/** Isi predefined (salinan baru setiap dipanggil). Belum sah: dikirim ke basis data sebagai draf versi 1. */
export function isiPredefined(): IsiKebijakan {
  const minimal = {} as IsiKebijakan["minimal"];
  for (const s of KODE_STRATA) {
    const baris = {} as Record<KodeJabatan, number>;
    for (const j of KODE_JABATAN) baris[j] = 0;
    URUT_MINIMAL.forEach((j, i) => { baris[j] = MINIMAL_PREDEFINED[s][i]; });
    minimal[s] = baris;
  }
  const rangkap = {} as IsiKebijakan["rangkap"];
  for (const s of KODE_STRATA) rangkap[s] = [...RANGKAP_PREDEFINED[s]];
  return {
    strata: STRATA_PREDEFINED.map((s) => ({ ...s })),
    minimal,
    rangkap,
    kompetensi: { nilai_pelatihan_min: 70, nilai_seleksi_min: 70, ambang_ketat: 20, validasi_desktop: true },
    param: PARAM_PREDEFINED.map((x) => ({ ...x })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Pemeriksa isi. Pesan galat HARUS sama persis dengan keu_kebijakan_periksa di basis data.
// ---------------------------------------------------------------------------------------------------------------------------------------
const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const adalahAngka = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const bulat = (x: unknown, min: number, maks: number): boolean => adalahAngka(x) && Number.isInteger(x) && x >= min && x <= maks;

export type HasilPeriksa = { galat: string[]; peringatan: string[] };

export function periksaIsi(isi: unknown): HasilPeriksa {
  const galat: string[] = [];
  const peringatan: string[] = [];
  if (!adalahObjek(isi)) return { galat: ["Isi lembar harus berupa objek"], peringatan };
  const a = isi as Partial<Record<string, unknown>>;

  // strata
  const strata = Array.isArray(a.strata) ? (a.strata as unknown[]) : [];
  const sama = strata.length === KODE_STRATA.length && strata.every((s, i) => adalahObjek(s) && s.k === KODE_STRATA[i]);
  if (!sama) galat.push("Strata harus tepat S1 sampai S9 berurutan");
  else {
    const st = strata as Record<string, unknown>[];
    st.forEach((s, i) => {
      const k = String(s.k);
      if (i === 0) { if (s.dari !== 1) galat.push("Rentang S1 harus mulai dari 1"); }
      else if (!adalahAngka(s.dari) || !adalahAngka(st[i - 1].sampai) || s.dari !== (st[i - 1].sampai as number) + 1) galat.push(`Rentang ${k} tidak menyambung dengan strata sebelumnya`);
      if (i === st.length - 1) { if (s.sampai !== null) galat.push(`Rentang ${k} harus terbuka (tanpa batas atas)`); }
      else if (!adalahAngka(s.sampai) || !adalahAngka(s.dari) || s.sampai < s.dari) galat.push(`Rentang ${k} tidak valid`);
      if (!bulat(s.maks_jabatan, 1, 10)) galat.push(`Maksimal jabatan per orang ${k} harus bilangan bulat 1 sampai 10`);
      if (s.persen_baru !== null && !(adalahAngka(s.persen_baru) && s.persen_baru >= 0 && s.persen_baru <= 100)) galat.push(`Persen petugas baru ${k} harus 0 sampai 100`);
    });
  }

  // minimal dan rangkap
  const minimal = adalahObjek(a.minimal) ? a.minimal : {};
  const rangkap = adalahObjek(a.rangkap) ? a.rangkap : {};
  for (const s of KODE_STRATA) {
    const m = adalahObjek(minimal[s]) ? (minimal[s] as Record<string, unknown>) : {};
    for (const j of KODE_JABATAN) if (!bulat(m[j], 0, 1000)) galat.push(`Minimal ${namaJabatan(j)} pada ${s} harus bilangan bulat 0 atau lebih`);
    if (bulat(m.ketua, 0, 1000) && (m.ketua as number) < 1) galat.push(`Ketua pada ${s} minimal 1`);
    const r = Array.isArray(rangkap[s]) ? (rangkap[s] as unknown[]) : null;
    if (r === null) galat.push(`Rangkap ${s} harus berupa daftar jabatan`);
    else for (const x of r) if (!KODE_JABATAN.includes(x as KodeJabatan)) galat.push(`Rangkap ${s}: jabatan ${String(x)} tidak dikenal`);
  }

  // kompetensi
  const kp = adalahObjek(a.kompetensi) ? a.kompetensi : {};
  for (const [kol, nama] of [["nilai_pelatihan_min", "nilai pelatihan minimal"], ["nilai_seleksi_min", "nilai seleksi minimal"]] as const) {
    if (!(adalahAngka(kp[kol]) && (kp[kol] as number) >= 0 && (kp[kol] as number) <= 100)) galat.push(`Kompetensi: ${nama} harus 0 sampai 100`);
  }
  if (!bulat(kp.ambang_ketat, 1, 100000)) galat.push("Kompetensi: ambang ketat harus bilangan bulat 1 atau lebih");

  // parameter anggaran
  const param = Array.isArray(a.param) ? (a.param as unknown[]) : [];
  const lihat = new Map<string, Record<string, unknown>>();
  for (const x of param) {
    if (!adalahObjek(x) || typeof x.k !== "string") { galat.push("Parameter tanpa kode"); continue; }
    if (lihat.has(x.k)) galat.push(`Parameter ${x.k} dobel`);
    else lihat.set(x.k, x);
  }
  for (const k of KODE_PARAM) if (!lihat.has(k)) galat.push(`Parameter ${k} belum ada`);
  for (const [k, x] of lihat) {
    if (!KODE_PARAM.includes(k) && !KODE_PARAM_OPSIONAL.includes(k)) continue;
    const jenis = x.jenis;
    if (jenis === "angka" || jenis === "persen") {
      const n = x.aturan, b = x.kebijakan;
      if ((n !== null && !adalahAngka(n)) || (b !== null && !adalahAngka(b))) { galat.push(`Parameter ${k}: nilai harus angka`); continue; }
      if (jenis === "persen") {
        for (const v of [n, b]) if (v !== null && ((v as number) < 0 || (v as number) > 100)) { galat.push(`Parameter ${k}: persen harus 0 sampai 100`); break; }
        const ac = typeof x.acuan === "string" ? lihat.get(x.acuan) : undefined;
        if (!ac || ac.jenis !== "angka") galat.push(`Parameter ${k}: acuan harus parameter angka`);
      }
      const arah = x.arah === "min" ? "min" : "maks";
      if (arah === "maks") {
        if (n !== null && b === null) galat.push(`Parameter ${k}: nilai kebijakan wajib diisi`);
        else if (n !== null && b !== null && (b as number) > (n as number)) galat.push(`Parameter ${k}: nilai kebijakan lebih longgar dari aturan`);
      } else {
        if (n !== null && b === null) galat.push(`Parameter ${k}: nilai kebijakan wajib diisi`);
        else if (n !== null && b !== null && (b as number) < (n as number)) galat.push(`Parameter ${k}: nilai kebijakan lebih longgar dari aturan`);
      }
    } else if (jenis === "yatidak") {
      if (typeof x.aturan !== "boolean" || typeof x.kebijakan !== "boolean") galat.push(`Parameter ${k}: nilai harus ya atau tidak`);
      else if (x.aturan === false && x.kebijakan === true) galat.push(`Parameter ${k}: nilai kebijakan lebih longgar dari aturan`);
    } else if (jenis === "rujukan" || jenis === "dokumen") {
      /* tidak dihitung otomatis */
    } else galat.push(`Parameter ${k}: jenis tidak dikenal`);
  }

  const hc = lihat.get("hari_cair_maks");
  if (hc && hc.jenis === "angka") {
    for (const v of [hc.aturan, hc.kebijakan]) if (adalahAngka(v) && !bulat(v, 0, 60)) { galat.push("Parameter hari_cair_maks: harus bilangan bulat 0 sampai 60"); break; }
  }

  // peringatan (tidak memblokir; hanya TS, untuk layar)
  let tanpaDasar = 0;
  for (const x of param) {
    if (!adalahObjek(x)) continue;
    if (x.jenis === "rujukan" && !x.berkas) peringatan.push(`${String(x.nama ?? x.k)}: tabel rujukan belum diunggah`);
    if ((x.jenis === "angka" || x.jenis === "persen") && x.aturan !== null && x.aturan !== undefined && !String(x.dasar ?? "").trim()) tanpaDasar += 1;
  }
  if (tanpaDasar > 0) peringatan.push(`${tanpaDasar} parameter belum mencantumkan dasar aturan (pasal atau juknis)`);
  return { galat, peringatan };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Keterangan yang dibangkitkan dari angka (tidak ditulis tangan)
// ---------------------------------------------------------------------------------------------------------------------------------------
export function rentangStrata(s: Strata): string {
  return s.sampai === null ? `di atas ${s.dari - 1} petugas` : `${s.dari}–${s.sampai} petugas`;
}

/** Strata untuk jumlah petugas tertentu; null bila isi tidak lengkap atau jumlah < 1. */
export function strataUntuk(isi: IsiKebijakan, jumlah: number): Strata | null {
  if (!Number.isFinite(jumlah) || jumlah < 1) return null;
  return isi.strata.find((s) => jumlah >= s.dari && (s.sampai === null || jumlah <= s.sampai)) ?? null;
}

export function ketMinimal(isi: IsiKebijakan, k: KodeStrata): string {
  const m = isi.minimal[k];
  const butir = KODE_JABATAN.filter((j) => (m?.[j] ?? 0) > 0).map((j) => `${m[j]} ${namaJabatan(j)}`);
  return butir.length ? `Minimal ${butir.join(", ")}.` : "Tidak ada jabatan wajib.";
}

export function ketStrata(isi: IsiKebijakan, k: KodeStrata): string[] {
  const s = isi.strata.find((x) => x.k === k);
  if (!s) return [];
  const out = [`${k}: ${rentangStrata(s)}.`, ketMinimal(isi, k)];
  out.push(`Satu orang paling banyak memegang ${s.maks_jabatan} jabatan.`);
  const r = isi.rangkap[k] ?? [];
  out.push(r.length === KODE_JABATAN.length ? "Semua jabatan boleh dirangkap." : r.length ? `Boleh dirangkap: ${r.map(namaJabatan).join(", ")}.` : "Tidak ada jabatan yang boleh dirangkap.");
  out.push(s.pengembangan ? "Boleh menjadi sasaran pengembangan kompetensi pegawai atau mitra baru." : "Tidak boleh menjadi tempat uji coba pegawai atau mitra baru.");
  if (s.persen_baru !== null) out.push(`Petugas baru paling banyak ${s.persen_baru}% dari tim.`);
  return out;
}

/** Nilai rupiah/angka untuk tampilan. */
export function labelNilai(x: Param, nilai: number | boolean | null | undefined): string {
  if (x.jenis === "yatidak") return nilai ? "Ya" : "Tidak";
  if (nilai === null || nilai === undefined) return "Tanpa batas";
  const n = Number(nilai);
  const angka = new Intl.NumberFormat("id-ID").format(n);
  const sat = x.satuan ?? "";
  if (x.jenis === "persen") return `${angka}%`;
  if (/^Rp/.test(sat)) return `Rp${angka}${sat.length > 2 ? sat.slice(2) : ""}`;
  return sat ? `${angka} ${sat}` : angka;
}

/** Nilai kebijakan yang berlaku untuk persen: persen dari parameter acuan (kebijakan). Null bila tidak dapat dihitung. */
export function nilaiPersen(isi: IsiKebijakan, kode: string): number | null {
  const x = isi.param.find((q) => q.k === kode);
  if (!x || x.jenis !== "persen" || !adalahAngka(x.kebijakan)) return null;
  const ac = isi.param.find((q) => q.k === x.acuan);
  if (!ac || ac.jenis !== "angka" || !adalahAngka(ac.kebijakan)) return null;
  return Math.round((ac.kebijakan * x.kebijakan) / 100);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Baris, status, dan hak (untuk layar; yang memutuskan tetap basis data)
// ---------------------------------------------------------------------------------------------------------------------------------------
export type StatusLembar = "draf" | "menunggu" | "berlaku" | "arsip" | "dibatalkan";

export type BarisLembar = {
  id: number;
  tahun: number;
  ver: number;
  status: StatusLembar;
  isi: IsiKebijakan;
  predefined: boolean;
  tanggal_rapat: string | null;
  nomor_notulen: string;
  tujuan: string;
  alasan_revisi: string;
  catatan_kembali: string;
  kembali_oleh: string | null;
  kembali_at: string | null;
  dibuat_oleh: number | null;
  diajukan_oleh: number | null;
  diajukan_at: string | null;
  berlaku_at: string | null;
  arsip_at: string | null;
  dibuat_at: string;
  diubah_at: string;
};

export type PeranPengesah = "KETUA" | "PPK" | "KPA";
export type BarisPengesah = { lembar_id: number; peran_kode: PeranPengesah; akun_id: number; akun_nama: string | null; aktif: boolean; setuju_at: string | null; catatan: string };
export type RiwayatLembar = { id: number; lembar_id: number; aksi: string; dari: string | null; ke: string; ver: number; oleh_nama: string | null; catatan: string; waktu: string };

export type HakKebijakan = { susun: boolean; ketua: boolean; ppk: boolean; kpa: boolean; akun: number | null };
export const HAK_KOSONG: HakKebijakan = { susun: false, ketua: false, ppk: false, kpa: false, akun: null };

export function labelStatus(s: StatusLembar | string): { teks: string; nada: "hijau" | "kuning" | "abu" | "biru" | "merah" } {
  switch (s) {
    case "draf": return { teks: "Draf (belum sah)", nada: "kuning" };
    case "menunggu": return { teks: "Menunggu pengesahan", nada: "biru" };
    case "berlaku": return { teks: "Berlaku", nada: "hijau" };
    case "arsip": return { teks: "Arsip", nada: "abu" };
    case "dibatalkan": return { teks: "Dibatalkan", nada: "merah" };
    default: return { teks: String(s), nada: "abu" };
  }
}

export const labelPeran = (r: string): string => (r === "KETUA" ? "Ketua tim" : r === "KPA" ? "Kepala (KPA)" : r === "PPK" ? "PPK" : r);

export type RingkasPengesahan = {
  /** Sudah memenuhi syarat berlaku: semua ketua tim, minimal satu PPK, minimal satu KPA. */
  lengkap: boolean;
  /** Butir yang masih ditunggu, dalam kalimat. */
  menunggu: string[];
  setuju: number;
  total: number;
};

/** Syarat berlaku: SEMUA akun ketua tim dalam daftar; cukup SATU akun pemegang PPK; cukup SATU akun pemegang KPA. */
export function ringkasPengesahan(daftar: BarisPengesah[]): RingkasPengesahan {
  const aktif = daftar.filter((x) => x.aktif);
  const menunggu: string[] = [];
  const ketua = aktif.filter((x) => x.peran_kode === "KETUA");
  const belumKetua = ketua.filter((x) => !x.setuju_at);
  if (ketua.length === 0) menunggu.push("Belum ada ketua tim aktif dalam daftar pengesah");
  for (const x of belumKetua) menunggu.push(`Ketua tim ${x.akun_nama ?? `akun ${x.akun_id}`}`);
  for (const peran of ["PPK", "KPA"] as const) {
    const g = aktif.filter((x) => x.peran_kode === peran);
    if (g.length === 0) menunggu.push(`Belum ada ${labelPeran(peran)} dalam daftar pengesah`);
    else if (!g.some((x) => x.setuju_at)) menunggu.push(g.length === 1 ? `${labelPeran(peran)} ${g[0].akun_nama ?? `akun ${g[0].akun_id}`}` : `${labelPeran(peran)} (salah satu dari ${g.length} akun)`);
  }
  return { lengkap: menunggu.length === 0, menunggu, setuju: aktif.filter((x) => x.setuju_at).length, total: aktif.length };
}

/** Menggabungkan butir "masih menunggu" menjadi satu kalimat tanpa titik ganda (nama bergelar sering berakhir titik). */
export function kalimatMenunggu(menunggu: string[]): string {
  return menunggu.join("; ").replace(/\.+\s*$/, "");
}

export type AksiLembar = "simpan" | "ajukan" | "setuju" | "kembalikan" | "tarik" | "batal" | "revisi";

/** Aksi yang ditawarkan di layar bagi akun ini. */
export function aksiTersedia(l: Pick<BarisLembar, "status" | "diajukan_oleh">, hak: HakKebijakan, pengesah: BarisPengesah[]): AksiLembar[] {
  const out: AksiLembar[] = [];
  const akun = hak.akun;
  const baris = akun === null ? [] : pengesah.filter((x) => x.aktif && x.akun_id === akun);
  const milikSaya = baris.length > 0;
  const sudahSetuju = milikSaya && baris.every((x) => !!x.setuju_at);
  const adaSetuju = pengesah.some((x) => x.aktif && x.setuju_at);
  if (l.status === "draf" && hak.susun) out.push("simpan", "ajukan", "batal");
  if (l.status === "menunggu") {
    if (milikSaya && !sudahSetuju) out.push("setuju");
    if (milikSaya) out.push("kembalikan");
    if (hak.susun && !adaSetuju) out.push("tarik");
  }
  if (l.status === "berlaku" && hak.susun) out.push("revisi");
  return out;
}

/** Ringkasan satu baris untuk daftar versi. */
export function judulVersi(l: Pick<BarisLembar, "ver" | "tahun" | "predefined" | "status">): string {
  return `Lembar kebijakan ${l.tahun} · versi ${l.ver}${l.predefined && l.status !== "berlaku" ? " (angka awal)" : ""}`;
}

/** Hitung cepat: berapa jabatan wajib dan total minimal pada strata. */
export function totalMinimal(isi: IsiKebijakan, k: KodeStrata): number {
  return KODE_JABATAN.reduce((n, j) => n + (isi.minimal[k]?.[j] ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Navigasi: kalimat pemeriksaan -> id kartu/baris yang bersangkutan (untuk tautan di kartu samping)
// ---------------------------------------------------------------------------------------------------------------------------------------
export const ID_BAGIAN = { pengesahan: "kb-pengesahan", susunan: "kb-susunan", rangkap: "kb-rangkap", kompetensi: "kb-kompetensi", anggaran: "kb-anggaran", riwayat: "kb-riwayat" } as const;

/** id elemen yang dituju kalimat galat/peringatan; null bila tidak ada tujuan yang jelas. */
export function tujuanGalat(teks: string): string | null {
  const t = String(teks || "");
  const par = /^Parameter ([a-z0-9_]+)/.exec(t);
  if (par) return `kb-par-${par[1]}`;
  if (/^Rangkap /.test(t)) return ID_BAGIAN.rangkap;
  if (/^Kompetensi:/.test(t)) return ID_BAGIAN.kompetensi;
  if (/^(Strata|Rentang|Maksimal jabatan|Persen petugas baru|Minimal|Ketua pada)/.test(t)) return ID_BAGIAN.susunan;
  if (/tabel rujukan belum diunggah|dasar aturan/.test(t)) return ID_BAGIAN.anggaran;
  if (/rapat|notulen|tujuan mutu/i.test(t)) return ID_BAGIAN.pengesahan;
  return null;
}

/** Bentuk kanonik (kunci terurut) supaya dua isi yang sama dapat dibandingkan walau urutan kunci berbeda (jsonb menata ulang kunci). */
export function kanonik(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(kanonik).join(",")}]`;
  if (adalahObjek(x)) return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${kanonik(x[k])}`).join(",")}}`;
  return JSON.stringify(x === undefined ? null : x);
}

/** Lembar default yang dibuka: bagi penyusun, draf/menunggu yang sedang berjalan; selain itu yang berlaku; selain itu yang terbaru bukan batal. */
export function pilihLembar(versi: { id: number; ver: number; status: string }[], penyusun: boolean): number | null {
  const urut = [...versi].filter((v) => v.status !== "dibatalkan").sort((a, b) => b.ver - a.ver);
  if (penyusun) { const t = urut.find((v) => v.status === "draf" || v.status === "menunggu"); if (t) return t.id; }
  return (urut.find((v) => v.status === "berlaku") ?? urut[0])?.id ?? null;
}
