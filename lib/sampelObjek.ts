// lib/sampelObjek.ts  (logika murni; aman diimpor klien dan server)
//
// (8 Nov 2026, D1+D2) SAMPEL MODEL 2 DAN 3 -- daftar objek sampel dari pusat (bukan KK master). Ketua mencentang VARIABEL yang ada pada daftar sampel kegiatannya
// (profil); templat unggah, pembacaan baris, dan pencocokan wilayah ke master mengikuti profil itu. Keputusan Iqbal 8 Nov: satu tingkat wilayah per kegiatan (variabel
// wilayah terdalam yang dicentang), 5 kolom bebas bertulisan label, hasil per objek (didata, menolak, tidak ditemukan), tanpa jendela rilis, butir RAB diusulkan
// lalu dipilih manual.
//   Model 2: wajib minimal satu variabel wilayah. Model 3: boleh tanpa wilayah sama sekali (hanya beban per PPL dan relasi PML).
//   Bila Nama sampel tidak dipilih maka Jumlah wajib (satu baris mewakili sekian sampel). PPL dan PML berpasangan dan boleh kosong (alokasi dini).
// Isi berkas: katalog variabel, validasi profil, tingkat wilayah, pembacaan baris Excel, pencocokan wilayah, pencocokan petugas, ringkasan, templat.

import { cocokkanAlokasi, type BarisAlokasi, type HasilCocokAlokasi, type KandidatPetugas } from "@/lib/alokasiWilayah";
import { normNama, type GalatBaris } from "@/lib/sampelSls";

export const API_OBJEK_ADMIN = "/api/portal/pendataan/objek";
export const API_OBJEK = "/api/portal/objek";
export const MAKS_BARIS_OBJEK = 5000;
export const MAKS_JUMLAH_OBJEK = 100_000;
export const MAKS_LABEL_BEBAS = 40;
export const JUMLAH_KOLOM_BEBAS = 5;

export const TINGKAT_WILAYAH = ["kecamatan", "nagari", "sls", "sub_sls"] as const;
export type TingkatWilayah = (typeof TINGKAT_WILAYAH)[number];
export const LABEL_TINGKAT: Record<TingkatWilayah, string> = { kecamatan: "Kecamatan", nagari: "Nagari", sls: "Jorong/SLS", sub_sls: "Sub SLS" };
/** Panjang kode di tingkat itu pada master wilayah: kecamatan 7, nagari 10 (iddesa), SLS 14 (idsls), sub SLS 16 (idsubsls). */
export const PANJANG_KODE_TINGKAT: Record<TingkatWilayah, number> = { kecamatan: 7, nagari: 10, sls: 14, sub_sls: 16 };

export const KUNCI_BEBAS = ["bebas1", "bebas2", "bebas3", "bebas4", "bebas5"] as const;
export type KunciBebas = (typeof KUNCI_BEBAS)[number];
export type KunciVariabel = TingkatWilayah | "nks" | "nama_sampel" | "alamat" | "patokan" | "lat" | "lng" | "jumlah" | "ppl" | "pml" | "korwil" | "supervisor" | KunciBebas;
export type KelompokVariabel = "wilayah" | "identitas" | "lokasi" | "jumlah" | "petugas" | "bebas";

export type Variabel = { kunci: KunciVariabel; label: string; kelompok: KelompokVariabel; ket: string; alias: readonly string[] };

/** Katalog tetap (urutan = urutan kolom templat). Kolom bebas tidak punya alias: judulnya diambil dari label profil. */
export const KATALOG_VARIABEL: readonly Variabel[] = [
  { kunci: "kecamatan", label: "Kecamatan", kelompok: "wilayah", ket: "kode 7 digit atau nama", alias: ["kecamatan", "namakecamatan", "kodekecamatan", "kec", "kodekec"] },
  { kunci: "nagari", label: "Nagari", kelompok: "wilayah", ket: "kode 10 digit atau nama", alias: ["nagari", "namanagari", "kodenagari", "desa", "namadesa", "kodedesa", "kelurahan", "iddesa"] },
  { kunci: "sls", label: "Jorong/SLS", kelompok: "wilayah", ket: "kode 14 digit atau nama", alias: ["jorong", "sls", "namasls", "kodesls", "namajorong", "idsls", "dusun"] },
  { kunci: "sub_sls", label: "Sub SLS", kelompok: "wilayah", ket: "kode 16 digit atau nomor", alias: ["subsls", "kodesubsls", "idsubsls", "kodesub", "kodewilayah"] },
  { kunci: "nks", label: "NKS", kelompok: "identitas", ket: "penanda saja", alias: ["nks", "kodenks", "nomorkerangkasampel", "nomornks"] },
  { kunci: "nama_sampel", label: "Nama Sampel", kelompok: "identitas", ket: "satu baris = satu sampel", alias: ["namasampel", "sampel", "namaresponden", "responden", "nama", "namausaha", "namaobjek", "objek"] },
  { kunci: "alamat", label: "Alamat", kelompok: "lokasi", ket: "teks", alias: ["alamat", "alamatsampel", "alamatlengkap"] },
  { kunci: "patokan", label: "Patokan", kelompok: "lokasi", ket: "teks", alias: ["patokan", "ciriciri", "landmark", "petunjuk"] },
  { kunci: "lat", label: "Latitude", kelompok: "lokasi", ket: "bersama Longitude", alias: ["latitude", "lat", "lintang"] },
  { kunci: "lng", label: "Longitude", kelompok: "lokasi", ket: "bersama Latitude", alias: ["longitude", "lng", "long", "lon", "bujur"] },
  { kunci: "jumlah", label: "Jumlah", kelompok: "jumlah", ket: "wajib bila Nama Sampel tidak dipilih", alias: ["jumlah", "jumlahsampel", "banyaknya", "target", "targetsampel", "jmlsampel"] },
  { kunci: "ppl", label: "Nama PPL", kelompok: "petugas", ket: "berpasangan dengan PML", alias: ["namappl", "ppl", "petugaspencacah", "pencacah", "namapencacah"] },
  { kunci: "pml", label: "Nama PML", kelompok: "petugas", ket: "berpasangan dengan PPL", alias: ["namapml", "pml", "pengawas", "namapengawas"] },
  { kunci: "korwil", label: "Nama Korwil", kelompok: "petugas", ket: "perlu PPL dan PML", alias: ["namakorwil", "korwil", "koordinatorwilayah", "kortim", "namakortim"] },
  { kunci: "supervisor", label: "Nama Supervisor", kelompok: "petugas", ket: "perlu PPL dan PML", alias: ["namasupervisor", "supervisor", "spv", "namaspv"] },
];

const SEMUA_KUNCI = new Set<string>([...KATALOG_VARIABEL.map((v) => v.kunci), ...KUNCI_BEBAS]);
const adaKunci = (v: readonly string[], k: string) => v.includes(k);
const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim());

// ---------------------------------------------------------------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------------------------------------------------------------

export type ProfilSampel = {
  model: 2 | 3;
  /** kunci terpilih, tanpa duplikat */
  variabel: KunciVariabel[];
  /** label kolom bebas yang terpilih: { bebas1: "Jenis usaha" } */
  label_bebas: Partial<Record<KunciBebas, string>>;
};

/** Tingkat wilayah = variabel wilayah terdalam yang dicentang; null bila tidak ada variabel wilayah. */
export function tingkatPlot(variabel: readonly string[]): TingkatWilayah | null {
  let t: TingkatWilayah | null = null;
  for (const x of TINGKAT_WILAYAH) if (adaKunci(variabel, x)) t = x;
  return t;
}

/** Semua alasan profil tidak sah (kosong = sah). Aturan yang sama ditegakkan di fungsi basis data sigap_profil_simpan. */
export function validasiProfil(p: ProfilSampel): string[] {
  const g: string[] = [];
  if (p.model !== 2 && p.model !== 3) g.push("Model harus 2 atau 3.");
  const v = p.variabel;
  const tak = v.filter((k) => !SEMUA_KUNCI.has(k));
  if (tak.length > 0) g.push(`Variabel tidak dikenal: ${tak.join(", ")}.`);
  if (new Set(v).size !== v.length) g.push("Ada variabel yang dipilih dua kali.");
  if (p.model === 2 && !tingkatPlot(v)) g.push("Model 2 wajib memilih minimal satu variabel wilayah (Kecamatan, Nagari, Jorong/SLS, atau Sub SLS).");
  if (!adaKunci(v, "nama_sampel") && !adaKunci(v, "jumlah")) g.push("Pilih Nama Sampel (satu baris = satu sampel) atau Jumlah (satu baris mewakili beberapa sampel).");
  if (adaKunci(v, "ppl") !== adaKunci(v, "pml")) g.push("Nama PPL dan Nama PML dipilih berpasangan.");
  if ((adaKunci(v, "korwil") || adaKunci(v, "supervisor")) && !adaKunci(v, "ppl")) g.push("Nama Korwil/Supervisor hanya bisa dipilih bersama Nama PPL dan Nama PML.");
  if (adaKunci(v, "lat") !== adaKunci(v, "lng")) g.push("Latitude dan Longitude dipilih berpasangan.");
  const labelBaku = new Set(KATALOG_VARIABEL.map((x) => rapat(x.label)));
  const dipakai = new Set<string>();
  for (const b of KUNCI_BEBAS) {
    if (!adaKunci(v, b)) continue;
    const l = teks(p.label_bebas[b]);
    if (!l) g.push(`Kolom bebas ${b.slice(5)} dipilih tetapi labelnya kosong.`);
    else if (l.length > MAKS_LABEL_BEBAS) g.push(`Label kolom bebas ${b.slice(5)} lebih dari ${MAKS_LABEL_BEBAS} huruf.`);
    else if (labelBaku.has(rapat(l)) || dipakai.has(rapat(l))) g.push(`Label kolom bebas "${l}" sama dengan kolom lain.`);
    dipakai.add(rapat(l));
  }
  return g;
}

/** Profil dari masukan mentah (JSON server/klien) -> bentuk baku; null bila bentuknya tidak dikenal. Isi belum divalidasi (pakai validasiProfil). */
export function bacaProfil(mentah: unknown): ProfilSampel | null {
  if (!mentah || typeof mentah !== "object") return null;
  const m = mentah as Record<string, unknown>;
  const model = Number(m.model);
  if (model !== 2 && model !== 3) return null;
  if (!Array.isArray(m.variabel)) return null;
  const variabel: KunciVariabel[] = [];
  for (const x of m.variabel) if (typeof x === "string" && SEMUA_KUNCI.has(x) && !variabel.includes(x as KunciVariabel)) variabel.push(x as KunciVariabel);
  const label_bebas: Partial<Record<KunciBebas, string>> = {};
  const lb = m.label_bebas && typeof m.label_bebas === "object" ? (m.label_bebas as Record<string, unknown>) : {};
  for (const b of KUNCI_BEBAS) if (adaKunci(variabel, b) && typeof lb[b] === "string") label_bebas[b] = teks(lb[b]);
  // urutan baku katalog supaya templat dan simpanan stabil
  const urut = [...KATALOG_VARIABEL.map((x) => x.kunci), ...KUNCI_BEBAS];
  variabel.sort((a, b) => urut.indexOf(a) - urut.indexOf(b));
  return { model, variabel, label_bebas };
}

/** Judul kolom templat menurut profil (urutan katalog). Kolom bebas memakai label. */
export function kolomProfil(p: ProfilSampel): { kunci: KunciVariabel; judul: string }[] {
  const hasil: { kunci: KunciVariabel; judul: string }[] = [];
  for (const v of KATALOG_VARIABEL) if (adaKunci(p.variabel, v.kunci)) hasil.push({ kunci: v.kunci, judul: v.label });
  for (const b of KUNCI_BEBAS) if (adaKunci(p.variabel, b)) hasil.push({ kunci: b, judul: teks(p.label_bebas[b]) || `Kolom bebas ${b.slice(5)}` });
  return hasil;
}

export function ringkasProfil(p: ProfilSampel): string {
  const t = tingkatPlot(p.variabel);
  const bagian = [`Model ${p.model}`, t ? `tingkat wilayah ${LABEL_TINGKAT[t]}` : "tanpa wilayah", adaKunci(p.variabel, "nama_sampel") ? "satu baris = satu sampel" : "satu baris mewakili beberapa sampel"];
  return bagian.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan baris Excel
// ---------------------------------------------------------------------------------------------------------------------------------

export type BarisObjek = {
  wilayah: Partial<Record<TingkatWilayah, string>>;
  nama_sampel: string | null;
  jumlah: number;
  nks: string | null;
  alamat: string | null;
  patokan: string | null;
  lat: number | null;
  lng: number | null;
  bebas: Partial<Record<KunciBebas, string>>;
  ppl_nama: string;
  pml_nama: string;
  korwil_nama?: string;
  supervisor_nama?: string;
};

const BATAS_INDONESIA = { latMin: -11.5, latMaks: 6.5, lngMin: 94.5, lngMaks: 141.5 };
function bacaAngka(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Mencocokkan judul kolom berkas dengan variabel profil -> { kunci: judul asli di berkas }. */
export function petaKolomObjek(p: ProfilSampel, judul: readonly string[]): Partial<Record<KunciVariabel, string>> {
  const hasil: Partial<Record<KunciVariabel, string>> = {};
  const rapatJudul = judul.map((j) => ({ asli: String(j ?? ""), r: rapat(String(j ?? "").replace(/\([^)]*\)/g, "")) }));
  for (const v of KATALOG_VARIABEL) {
    if (!adaKunci(p.variabel, v.kunci)) continue;
    const t = rapatJudul.find((x) => x.r && (x.r === rapat(v.label) || v.alias.includes(x.r)));
    if (t) hasil[v.kunci] = t.asli;
  }
  for (const b of KUNCI_BEBAS) {
    if (!adaKunci(p.variabel, b)) continue;
    const l = rapat(teks(p.label_bebas[b]));
    const t = l ? rapatJudul.find((x) => x.r === l) : undefined;
    if (t) hasil[b] = t.asli;
  }
  return hasil;
}

export type HasilPeriksaObjek = { baris: BarisObjek[]; nomor: number[]; galat: GalatBaris[]; peringatan: GalatBaris[]; dilewati: number };

/** Baris hasil sheet_to_json -> baris objek bersih menurut profil. Nomor baris = nomor baris Excel (judul = baris 1). Galat = baris TIDAK dimasukkan. */
export function periksaBarisObjek(p: ProfilSampel, baris: readonly Record<string, unknown>[]): HasilPeriksaObjek {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  const hasil: BarisObjek[] = [];
  const nomor: number[] = [];
  const kosong = (pesan: string): HasilPeriksaObjek => ({ baris: hasil, nomor, galat: [{ baris: 0, pesan }], peringatan, dilewati: 0 });
  const sah = validasiProfil(p);
  if (sah.length > 0) return kosong(`Profil variabel belum sah: ${sah[0]}`);
  if (baris.length === 0) return kosong("Berkas tidak berisi baris sampel.");
  if (baris.length > MAKS_BARIS_OBJEK) return kosong(`Berkas memuat ${baris.length} baris; batas satu unggahan ${MAKS_BARIS_OBJEK}.`);
  const kolom = petaKolomObjek(p, Object.keys(baris[0]));
  const perlu = kolomProfil(p);
  const hilang = perlu.filter((k) => !kolom[k.kunci]);
  if (hilang.length > 0) return { baris: hasil, nomor, galat: [{ baris: 1, pesan: `Kolom tidak ditemukan: ${hilang.map((k) => k.judul).join(", ")}. Unduh templat untuk melihat format.` }], peringatan, dilewati: 0 };
  const ambil = (b: Record<string, unknown>, k: KunciVariabel) => (kolom[k] ? teks(b[kolom[k] as string]) : "");
  const tingkat = tingkatPlot(p.variabel);
  const pakaiNama = adaKunci(p.variabel, "nama_sampel");
  let dilewati = 0;
  baris.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    const masalah: string[] = [];
    const wilayah: Partial<Record<TingkatWilayah, string>> = {};
    for (const t of TINGKAT_WILAYAH) {
      if (!adaKunci(p.variabel, t)) continue;
      const nilai = ambil(b, t);
      if (nilai.length > 120) masalah.push(`${LABEL_TINGKAT[t]} lebih dari 120 huruf.`);
      else if (/e\+?\d+$/i.test(nilai.replace(/\s/g, "")) && /^\d/.test(nilai)) masalah.push(`${LABEL_TINGKAT[t]} "${nilai}" terbaca sebagai angka ilmiah. Ubah format kolom menjadi Teks, lalu isi ulang.`);
      else if (nilai) wilayah[t] = nilai;
    }
    if (tingkat && !wilayah[tingkat]) masalah.push(`${LABEL_TINGKAT[tingkat]} kosong (tingkat wilayah kegiatan ini).`);
    let nama: string | null = null;
    if (pakaiNama) {
      nama = ambil(b, "nama_sampel");
      if (!nama) masalah.push("Nama Sampel kosong.");
      else if (nama.length > 200) masalah.push("Nama Sampel lebih dari 200 huruf.");
    }
    let jumlah = 1;
    if (adaKunci(p.variabel, "jumlah")) {
      const j = ambil(b, "jumlah");
      if (j === "") {
        if (!pakaiNama) masalah.push("Jumlah kosong.");
      } else {
        const n = Number(j.replace(",", "."));
        if (!Number.isInteger(n) || n < 1 || n > MAKS_JUMLAH_OBJEK) masalah.push(`Jumlah "${j}" harus bilangan bulat 1-${MAKS_JUMLAH_OBJEK}.`);
        else jumlah = n;
      }
    }
    if (pakaiNama && jumlah > 1) peringatan.push({ baris: no, pesan: `Jumlah ${jumlah} pada baris yang bernama sampel; hasil pendataannya dicatat per baris, jumlah dianggap ${jumlah} sampel.` });
    let lat: number | null = null;
    let lng: number | null = null;
    if (adaKunci(p.variabel, "lat")) {
      const la = bacaAngka(ambil(b, "lat"));
      const lo = bacaAngka(ambil(b, "lng"));
      if (Number.isNaN(la) || Number.isNaN(lo)) masalah.push("Latitude/Longitude harus angka desimal.");
      else if ((la === null) !== (lo === null)) masalah.push("Latitude dan Longitude harus diisi berpasangan.");
      else if (la !== null && lo !== null) {
        if (la < -90 || la > 90 || lo < -180 || lo > 180) masalah.push("Koordinat di luar jangkauan (lintang -90..90, bujur -180..180).");
        else {
          if (la < BATAS_INDONESIA.latMin || la > BATAS_INDONESIA.latMaks || lo < BATAS_INDONESIA.lngMin || lo > BATAS_INDONESIA.lngMaks) peringatan.push({ baris: no, pesan: "Koordinat berada di luar wilayah Indonesia; periksa tertukarnya lintang dan bujur." });
          lat = la;
          lng = lo;
        }
      }
    }
    const bebas: Partial<Record<KunciBebas, string>> = {};
    for (const k of KUNCI_BEBAS) {
      if (!adaKunci(p.variabel, k)) continue;
      const v = ambil(b, k);
      if (v.length > 300) masalah.push(`${teks(p.label_bebas[k])} lebih dari 300 huruf.`);
      else if (v) bebas[k] = v;
    }
    const alamat = ambil(b, "alamat");
    const patokan = ambil(b, "patokan");
    const nks = ambil(b, "nks");
    if (alamat.length > 300 || patokan.length > 300) masalah.push("Alamat/Patokan lebih dari 300 huruf.");
    if (nks.length > 40) masalah.push("NKS lebih dari 40 huruf.");
    const ppl = ambil(b, "ppl");
    const pml = ambil(b, "pml");
    if ((ppl === "") !== (pml === "")) masalah.push(`Nama PPL dan Nama PML harus diisi berpasangan (${ppl === "" ? "PPL" : "PML"} kosong).`);
    const korwil = ambil(b, "korwil");
    const supervisor = ambil(b, "supervisor");
    if ([ppl, pml, korwil, supervisor].some((x) => x.length > 200)) masalah.push("Nama petugas lebih dari 200 huruf.");
    if (!ppl && (korwil || supervisor)) peringatan.push({ baris: no, pesan: "Nama Korwil/Supervisor diabaikan karena baris ini belum punya PPL dan PML." });
    if (masalah.length > 0) {
      galat.push({ baris: no, pesan: masalah.join(" ") });
      return;
    }
    nomor.push(no);
    hasil.push({
      wilayah, nama_sampel: nama, jumlah, nks: nks || null, alamat: alamat || null, patokan: patokan || null, lat, lng, bebas, ppl_nama: ppl, pml_nama: pml,
      ...(ppl && korwil ? { korwil_nama: korwil } : {}),
      ...(ppl && supervisor ? { supervisor_nama: supervisor } : {}),
    });
  });
  return { baris: hasil, nomor, galat, peringatan, dilewati };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pencocokan wilayah ke master (menerima kode ATAU nama; nama ganda ditandai, tidak ditebak)
// ---------------------------------------------------------------------------------------------------------------------------------

export type WilayahMasterLengkap = { idsubsls: string; kd_kec: string; iddesa: string; idsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string };

type EntriIndeks = { m: WilayahMasterLengkap; n: Record<TingkatWilayah, string> };
export type IndeksWilayah = EntriIndeks[];

const noSub = (s: string): string => {
  const t = normNama(s);
  return /^\d+$/.test(t) ? String(Number(t)) : t;
};

export function bangunIndeksWilayah(master: readonly WilayahMasterLengkap[]): IndeksWilayah {
  return master.map((m) => ({ m, n: { kecamatan: normNama(m.kecamatan), nagari: normNama(m.nagari), sls: normNama(m.sls), sub_sls: noSub(m.sub_sls) } }));
}

const kodeDi = (m: WilayahMasterLengkap, t: TingkatWilayah): string => (t === "kecamatan" ? m.kd_kec : t === "nagari" ? m.iddesa : t === "sls" ? m.idsls : m.idsubsls);
const bentukKode = (s: string): string => s.replace(/[\s'`]/g, "");
/** Nilai sel berupa kode tingkat itu (hanya angka, panjang tepat). */
const adalahKode = (t: TingkatWilayah, s: string): boolean => /^\d+$/.test(bentukKode(s)) && bentukKode(s).length === PANJANG_KODE_TINGKAT[t];

export type HasilWilayah = { ok: true; kode: string; contoh: WilayahMasterLengkap } | { ok: false; alasan: "tidak_ketemu" | "ambigu" | "kode_salah"; pesan: string };

function saring(kandidat: EntriIndeks[], t: TingkatWilayah, nilai: string): EntriIndeks[] {
  if (adalahKode(t, nilai)) {
    const k = bentukKode(nilai);
    return kandidat.filter((e) => kodeDi(e.m, t) === k);
  }
  const n = t === "sub_sls" ? noSub(nilai) : normNama(nilai);
  if (!n) return [];
  const persis = kandidat.filter((e) => e.n[t] === n);
  if (persis.length > 0) return persis;
  if (t === "sub_sls") return [];
  // jorong/nagari/kecamatan boleh ditulis sebagian ("BARINGIN" untuk "JORONG BARINGIN"); ganda = ambigu
  return kandidat.filter((e) => e.n[t].includes(n) || n.includes(e.n[t]));
}

/**
 * Mencocokkan nilai wilayah baris ke master pada tingkat `tingkat`. Tingkat di atasnya yang diisi dipakai menyaring (kode atau nama). Kode (angka dengan panjang tepat)
 * dicocokkan ke kode master; selain itu dicocokkan sebagai nama. Hasil harus tepat satu kode di tingkat itu.
 */
export function cocokkanWilayah(tingkat: TingkatWilayah, nilai: Partial<Record<TingkatWilayah, string>>, indeks: IndeksWilayah): HasilWilayah {
  const dalam = nilai[tingkat];
  if (!dalam) return { ok: false, alasan: "tidak_ketemu", pesan: `${LABEL_TINGKAT[tingkat]} kosong.` };
  if (/^\d+$/.test(bentukKode(dalam)) && bentukKode(dalam).length > 5 && bentukKode(dalam).length !== PANJANG_KODE_TINGKAT[tingkat]) {
    return { ok: false, alasan: "kode_salah", pesan: `Kode ${LABEL_TINGKAT[tingkat]} "${dalam}" harus ${PANJANG_KODE_TINGKAT[tingkat]} digit (kode ini ${bentukKode(dalam).length} digit).` };
  }
  let kandidat: EntriIndeks[] = indeks;
  for (const t of TINGKAT_WILAYAH) {
    const v = nilai[t];
    if (!v) continue;
    kandidat = saring(kandidat, t, v);
    if (kandidat.length === 0) {
      return { ok: false, alasan: "tidak_ketemu", pesan: `${LABEL_TINGKAT[t]} "${v}" tidak ditemukan di master wilayah${t !== tingkat ? " (atau tidak cocok dengan kolom lain pada baris ini)" : ""}.` };
    }
    if (t === tingkat) break;
  }
  const kode = new Map<string, WilayahMasterLengkap>();
  for (const e of kandidat) kode.set(kodeDi(e.m, tingkat), e.m);
  if (kode.size === 1) {
    const [k, m] = Array.from(kode)[0];
    return { ok: true, kode: k, contoh: m };
  }
  const contoh = Array.from(kode.values()).slice(0, 3).map((m) => `${m.kecamatan}/${m.nagari}${tingkat === "sls" || tingkat === "sub_sls" ? `/${m.sls}` : ""}`);
  return {
    ok: false,
    alasan: "ambigu",
    pesan: `${LABEL_TINGKAT[tingkat]} "${dalam}" cocok dengan ${kode.size} wilayah (${contoh.join("; ")}${kode.size > 3 ? "; ..." : ""}). Tambahkan kolom wilayah di atasnya atau pakai kode.`,
  };
}

export type HasilPeriksaWilayahObjek = { kode: (string | null)[]; galat: GalatBaris[]; peringatan: GalatBaris[] };

/** Mencocokkan seluruh baris. Tanpa tingkat (model 3 tanpa wilayah): semua kode null. Galat = baris tidak bisa disimpan. */
export function periksaWilayahObjek(tingkat: TingkatWilayah | null, baris: readonly BarisObjek[], nomor: readonly number[], master: readonly WilayahMasterLengkap[]): HasilPeriksaWilayahObjek {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  if (!tingkat) return { kode: baris.map(() => null), galat, peringatan };
  const indeks = bangunIndeksWilayah(master);
  const memo = new Map<string, HasilWilayah>();
  const kode = baris.map((b, i): string | null => {
    const kunci = TINGKAT_WILAYAH.map((t) => b.wilayah[t] ?? "").join("|");
    let h = memo.get(kunci);
    if (!h) {
      h = cocokkanWilayah(tingkat, b.wilayah, indeks);
      memo.set(kunci, h);
    }
    const no = nomor[i] ?? i + 2;
    if (!h.ok) {
      galat.push({ baris: no, pesan: h.pesan });
      return null;
    }
    // nama pada kolom wilayah di atasnya yang bertentangan dengan kode di tingkat terdalam sudah menjadi "tidak ketemu" lewat penyaringan; peringatan hanya bila kode dipakai
    if (adalahKode(tingkat, b.wilayah[tingkat] ?? "")) {
      const beda = TINGKAT_WILAYAH.filter((t) => t !== tingkat && b.wilayah[t] && !adalahKode(t, b.wilayah[t] as string) && TINGKAT_WILAYAH.indexOf(t) < TINGKAT_WILAYAH.indexOf(tingkat)).filter((t) => normNama(b.wilayah[t] as string) !== normNama(t === "kecamatan" ? h.contoh.kecamatan : t === "nagari" ? h.contoh.nagari : h.contoh.sls));
      if (beda.length > 0) peringatan.push({ baris: no, pesan: `Nama ${beda.map((t) => LABEL_TINGKAT[t]).join("/")} pada berkas berbeda dari master untuk kode ${h.kode}. Kode yang dipakai.` });
    }
    return h.kode;
  });
  return { kode, galat, peringatan };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Petugas dan tim (memakai ulang mesin alokasi: nama PPL/PML/korwil/supervisor dicocokkan sama persis)
// ---------------------------------------------------------------------------------------------------------------------------------

export type BarisObjekCocok = BarisObjek & { kode_wilayah: string | null; ppl_akun_id: number | null; pml_akun_id: number | null };

export function cocokkanPetugasObjek(
  baris: readonly BarisObjek[], kode: readonly (string | null)[], nomor: readonly number[], kand: KandidatPetugas, sumber: "akun" | "penugasan", namaAkun: ReadonlyMap<number, string>,
): { final: BarisObjekCocok[]; hasil: HasilCocokAlokasi } {
  const semu: BarisAlokasi[] = baris.map((b, i) => ({
    idsubsls: kode[i] ?? String(i).padStart(16, "0"),
    nks: b.nama_sampel ?? b.nks,
    target: null,
    ppl_nama: b.ppl_nama,
    pml_nama: b.pml_nama,
    ...(b.korwil_nama ? { korwil_nama: b.korwil_nama } : {}),
    ...(b.supervisor_nama ? { supervisor_nama: b.supervisor_nama } : {}),
  }));
  const hasil = cocokkanAlokasi(semu, nomor, kand, sumber, namaAkun);
  const final = baris.map((b, i): BarisObjekCocok => ({ ...b, kode_wilayah: kode[i] ?? null, ppl_akun_id: hasil.final[i].ppl_akun_id, pml_akun_id: hasil.final[i].pml_akun_id }));
  return { final, hasil };
}

/** Bentuk JSON untuk fungsi basis data sigap_objek_impor. */
export function bentukObjekJson(baris: readonly BarisObjekCocok[], tingkat: TingkatWilayah | null): Record<string, unknown>[] {
  return baris.map((b) => {
    const atribut: Record<string, unknown> = {};
    if (b.nks) atribut.nks = b.nks;
    if (b.alamat) atribut.alamat = b.alamat;
    if (b.patokan) atribut.patokan = b.patokan;
    if (b.lat !== null && b.lng !== null) {
      atribut.lat = b.lat;
      atribut.lng = b.lng;
    }
    for (const k of KUNCI_BEBAS) if (b.bebas[k]) atribut[k] = b.bebas[k];
    return {
      kode_wilayah: b.kode_wilayah,
      idsubsls: tingkat === "sub_sls" ? b.kode_wilayah : null,
      nama_sampel: b.nama_sampel,
      jumlah: b.jumlah,
      ppl_akun_id: b.ppl_akun_id,
      pml_akun_id: b.pml_akun_id,
      atribut,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ringkasan dan peringatan
// ---------------------------------------------------------------------------------------------------------------------------------

export type RekapObjek = { objek: number; sampel: number; wilayah: number; ppl: number; pml: number; tanpa_petugas: number };

export function rekapObjek(baris: readonly Pick<BarisObjekCocok, "kode_wilayah" | "jumlah" | "ppl_akun_id" | "pml_akun_id">[]): RekapObjek {
  return {
    objek: baris.length,
    sampel: baris.reduce((s, b) => s + b.jumlah, 0),
    wilayah: new Set(baris.map((b) => b.kode_wilayah).filter((x): x is string => !!x)).size,
    ppl: new Set(baris.map((b) => b.ppl_akun_id).filter((x): x is number => x != null)).size,
    pml: new Set(baris.map((b) => b.pml_akun_id).filter((x): x is number => x != null)).size,
    tanpa_petugas: baris.filter((b) => b.ppl_akun_id == null).length,
  };
}

/** Peringatan (tidak menolak): sebagian tanpa petugas, PPL di bawah >1 PML, nama sampel kembar di wilayah yang sama, beban PPL timpang. */
export function periksaObjek(baris: readonly BarisObjekCocok[], namaAkun: ReadonlyMap<number, string>): string[] {
  const out: string[] = [];
  const tanpa = baris.filter((b) => b.ppl_akun_id == null).length;
  if (tanpa > 0 && tanpa < baris.length) out.push(`${tanpa} dari ${baris.length} baris belum punya PPL/PML.`);
  const nama = (id: number) => namaAkun.get(id) ?? `akun ${id}`;
  const perPpl = new Map<number, { pml: Set<number>; sampel: number }>();
  for (const b of baris) {
    if (b.ppl_akun_id == null || b.pml_akun_id == null) continue;
    const p = perPpl.get(b.ppl_akun_id) ?? { pml: new Set<number>(), sampel: 0 };
    p.pml.add(b.pml_akun_id);
    p.sampel += b.jumlah;
    perPpl.set(b.ppl_akun_id, p);
  }
  const pindah = Array.from(perPpl).filter(([, p]) => p.pml.size > 1);
  if (pindah.length > 0) out.push(`${pindah.length} PPL tercatat di bawah lebih dari satu PML: ${pindah.slice(0, 5).map(([id]) => nama(id)).join(", ")}${pindah.length > 5 ? ", ..." : ""}.`);
  const kembar = new Map<string, number>();
  for (const b of baris) if (b.nama_sampel) kembar.set(`${b.kode_wilayah ?? ""}|${normNama(b.nama_sampel)}`, (kembar.get(`${b.kode_wilayah ?? ""}|${normNama(b.nama_sampel)}`) ?? 0) + 1);
  const n = Array.from(kembar.values()).filter((x) => x > 1).length;
  if (n > 0) out.push(`${n} nama sampel muncul lebih dari sekali pada wilayah yang sama; periksa apakah ini sampel ganda.`);
  if (perPpl.size >= 3) {
    const beban = Array.from(perPpl.values()).map((p) => p.sampel);
    const rata = beban.reduce((s, x) => s + x, 0) / beban.length;
    const timpang = Array.from(perPpl).filter(([, p]) => p.sampel > rata * 2 || p.sampel < rata / 2);
    if (timpang.length > 0) out.push(`Beban ${timpang.length} PPL jauh dari rata-rata ${Math.round(rata)} sampel: ${timpang.slice(0, 5).map(([id, p]) => `${nama(id)} (${p.sampel})`).join(", ")}${timpang.length > 5 ? ", ..." : ""}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Hasil per objek
// ---------------------------------------------------------------------------------------------------------------------------------

export const HASIL_OBJEK = ["didata", "menolak", "tidak_ditemukan"] as const;
export type HasilObjek = (typeof HASIL_OBJEK)[number];
export const LABEL_HASIL_OBJEK: Record<HasilObjek, string> = { didata: "Berhasil didata", menolak: "Menolak", tidak_ditemukan: "Tidak ditemukan" };

export function bacaHasilObjek(s: unknown): HasilObjek | null {
  const r = rapat(typeof s === "string" ? s : "");
  if (["didata", "berhasildidata", "selesai", "ok"].includes(r)) return "didata";
  if (["menolak", "tolak", "ditolak"].includes(r)) return "menolak";
  if (["tidakditemukan", "tdkditemukan", "takditemukan", "tidakada"].includes(r)) return "tidak_ditemukan";
  return null;
}

/**
 * Hasil yang boleh dicatat pada satu objek. Baris bernama sampel (jumlah 1): salah satu dari tiga hasil. Baris berjumlah (tanpa nama): hasil `didata` memuat
 * `jumlah_didata` 1..jumlah (sebagian didata); `menolak` dan `tidak_ditemukan` berlaku untuk sisa baris dan tanpa jumlah.
 */
export function periksaCatatHasil(objek: { jumlah: number; nama_sampel: string | null }, hasil: unknown, jumlahDidata: unknown): { ok: true; hasil: HasilObjek; jumlah_didata: number | null } | { ok: false; pesan: string } {
  const h = bacaHasilObjek(hasil);
  if (!h) return { ok: false, pesan: "Hasil tidak sah (didata, menolak, atau tidak ditemukan)." };
  const berjumlah = objek.nama_sampel == null && objek.jumlah > 1;
  if (!berjumlah) return { ok: true, hasil: h, jumlah_didata: h === "didata" ? objek.jumlah : null };
  if (h !== "didata") return { ok: true, hasil: h, jumlah_didata: null };
  const n = Number(jumlahDidata);
  if (!Number.isInteger(n) || n < 1 || n > objek.jumlah) return { ok: false, pesan: `Jumlah didata harus bilangan bulat 1-${objek.jumlah}.` };
  return { ok: true, hasil: h, jumlah_didata: n };
}

export type RekapHasilObjek = { objek: number; sampel: number; didata: number; menolak: number; tidak_ditemukan: number; belum: number; sampel_didata: number };

/** Rekap hasil: `didata/menolak/tidak_ditemukan/belum` dihitung per objek; `sampel_didata` menjumlah jumlah_didata. */
export function rekapHasilObjek(baris: readonly { jumlah: number; hasil: HasilObjek | null; jumlah_didata: number | null }[]): RekapHasilObjek {
  const r: RekapHasilObjek = { objek: baris.length, sampel: 0, didata: 0, menolak: 0, tidak_ditemukan: 0, belum: 0, sampel_didata: 0 };
  for (const b of baris) {
    r.sampel += b.jumlah;
    if (!b.hasil) r.belum++;
    else r[b.hasil]++;
    if (b.hasil === "didata") r.sampel_didata += b.jumlah_didata ?? b.jumlah;
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Templat
// ---------------------------------------------------------------------------------------------------------------------------------

const CONTOH: Partial<Record<KunciVariabel, [string, string]>> = {
  kecamatan: ["KUBUNG", "KUBUNG"],
  nagari: ["GANTUANG CIRI", "GANTUANG CIRI"],
  sls: ["JORONG BARINGIN", "JORONG BARINGIN"],
  sub_sls: ["1303110005000101", "1303110005000102"],
  nks: ["0001A", "0001A"],
  nama_sampel: ["Nama sampel 1", "Nama sampel 2"],
  alamat: ["Alamat sampel", ""],
  patokan: ["Dekat masjid", ""],
  lat: ["-0.9500000", ""],
  lng: ["100.5000000", ""],
  jumlah: ["10", "8"],
  ppl: ["Nama PPL (nama akun)", "Nama PPL (nama akun)"],
  pml: ["Nama PML (nama akun)", "Nama PML (nama akun)"],
  korwil: ["Nama Korwil (boleh kosong)", ""],
  supervisor: ["Nama Supervisor (boleh kosong)", ""],
};

/** Isi templat Excel (judul kolom + dua baris contoh) untuk `aoa_to_sheet`, dibentuk dari variabel terpilih. */
export function templatObjek(p: ProfilSampel): string[][] {
  const kol = kolomProfil(p);
  return [kol.map((k) => k.judul), kol.map((k) => CONTOH[k.kunci]?.[0] ?? "isi"), kol.map((k) => CONTOH[k.kunci]?.[1] ?? "")];
}

export function petunjukTemplatObjek(p: ProfilSampel): string[] {
  const t = tingkatPlot(p.variabel);
  const h: string[] = [];
  h.push(p.variabel.includes("nama_sampel") ? "Satu baris = satu sampel." : "Satu baris mewakili beberapa sampel; kolom Jumlah menyatakan banyaknya.");
  if (t) h.push(`Tingkat wilayah kegiatan ini: ${LABEL_TINGKAT[t]}. Kolom wilayah boleh berisi kode (${PANJANG_KODE_TINGKAT[t]} digit untuk ${LABEL_TINGKAT[t]}, ditulis sebagai TEKS) atau nama. Bila nama sama ada di beberapa tempat, isi juga kolom wilayah di atasnya agar tidak ambigu.`);
  else h.push("Kegiatan ini tidak memakai wilayah; yang dicatat hanya beban per PPL dan relasi PML.");
  if (p.variabel.includes("ppl")) h.push("Nama PPL dan Nama PML boleh dikosongkan BERPASANGAN (alokasi dini); isi keduanya bila petugas sudah ada. Nama harus sama dengan nama akun SIGAP (gelar di belakang koma boleh dihilangkan).");
  h.push("Baris contoh pada lembar Templat harus dihapus sebelum diunggah. Unggah ulang MENGGANTIKAN daftar sampel aktif (riwayat tetap tercatat).");
  return h;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Bentuk data antarmuka (server -> klien)
// ---------------------------------------------------------------------------------------------------------------------------------

export type ProfilTersimpan = ProfilSampel & { level: TingkatWilayah | null };

export type RiwayatObjek = { id: number; nama_berkas: string | null; diunggah_at: string; oleh: string | null; jumlah: number; jumlah_sampel: number; dengan_petugas: number; aktif: boolean };

export type RingkasPpl = { ppl_id: number; ppl_nama: string; pml_nama: string | null; objek: number; sampel: number; didata: number; menolak: number; tidak_ditemukan: number; belum: number; sampel_didata: number };

export type DataObjekAdmin = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  boleh_kelola: boolean;
  /** false = tabel belum ada (migrasi 20261108a belum dijalankan) */
  siap: boolean;
  /** 1 = belum memilih model 2/3 (alokasi per sub SLS dan KK master) */
  model: 1 | 2 | 3;
  profil: ProfilTersimpan | null;
  alokasi_model1_aktif: boolean;
  rekap: RekapObjek;
  hasil: RekapHasilObjek;
  ringkas_ppl: RingkasPpl[];
  tanpa_petugas: number;
  riwayat: RiwayatObjek[];
  petugas: { ppl: number; pml: number };
};

export type ObjekSaya = {
  id: number;
  urut: number;
  kode_wilayah: string | null;
  /** kecamatan / nagari / jorong / sub SLS sesuai tingkat profil */
  wilayah: string;
  nama_sampel: string | null;
  jumlah: number;
  atribut: Record<string, string | number>;
  ppl_id: number | null;
  ppl_nama: string | null;
  pml_nama: string | null;
  hasil: HasilObjek | null;
  jumlah_didata: number | null;
  hasil_at: string | null;
};

export type DataObjekSaya = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  peran: "ppl" | "pml";
  saya: { id: number; nama: string };
  profil: ProfilTersimpan;
  /** judul kolom atribut yang ditampilkan (alamat, patokan, kolom bebas) */
  kolom_atribut: { kunci: string; judul: string }[];
  objek: ObjekSaya[];
  rekap: RekapHasilObjek;
};
