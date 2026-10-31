// lib/sigapAnomali.ts
//
// (31 Okt 2026) Lingkar anomali petugas -- logika MURNI (tanpa React/DB): pemetaan kolom berkas, pencocokan nama petugas ke akun, kunci anti-ganda, validasi tindak lanjut.
// Alur: admin mengunggah Excel template SIGAP -> `petaBarisAnomali` -> API mencocokkan nama (`cocokkanNama`) -> temuan otomatis ditugaskan ke petugas (status "menunggu") atau masuk
// antrean "perlu dicocokkan" -> petugas mengonfirmasi (`validasiKonfirmasi`). Keputusan Iqbal 31 Okt: isi template cukup ID anggota, kode temuan, id sampel, periode + kolom bebas;
// nama ambigu/tidak ketemu masuk antrean pencocokan (tidak ditebak). Tes: lib/__tests__/sigapAnomali.test.ts.

export const KOLOM_TEMPLAT_ANOMALI = ["ID Anggota", "Kode Temuan", "ID Sampel", "Periode", "Keterangan"] as const;

export type Medan = "id_anggota" | "kode" | "id_sampel" | "periode" | "keterangan";
const ALIAS: Record<Medan, string[]> = {
  id_anggota: ["idanggota", "anggota", "idpetugas", "petugas", "namapetugas", "namaanggota", "idmitra", "mitra", "akun", "idakun", "nama"],
  kode: ["kodetemuan", "kodeanomali", "kode", "anomali", "temuan", "kodeerror", "error"],
  id_sampel: ["idsampel", "sampel", "idrt", "nurt", "nks", "idsls", "idresponden"],
  periode: ["periode", "bulan", "triwulan", "tahap", "tanggal"],
  keterangan: ["keterangan", "uraian", "catatan", "deskripsi", "pesan"],
};
const LABEL: Record<Medan, string> = { id_anggota: "ID Anggota", kode: "Kode Temuan", id_sampel: "ID Sampel", periode: "Periode", keterangan: "Keterangan" };
const WAJIB: Medan[] = ["id_anggota", "kode"];

const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").trim());

export type PetaKolom = Partial<Record<Medan, string>>;
/** Mencocokkan judul kolom berkas dengan kolom baku (huruf besar/kecil dan tanda baca diabaikan). Kolom lain menjadi "rincian". */
export function petaKolomAnomali(judul: readonly string[]): PetaKolom {
  const hasil: PetaKolom = {};
  for (const j of judul) {
    const r = rapat(String(j ?? ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS) as Medan[]) {
      if (!hasil[m] && ALIAS[m].includes(r)) {
        hasil[m] = String(j);
        break;
      }
    }
  }
  return hasil;
}

export type BarisAnomali = {
  id_anggota: string;
  kode: string;
  id_sampel: string | null;
  periode: string | null;
  keterangan: string | null;
  rincian: Record<string, string>;
};
export type GalatBaris = { baris: number; pesan: string };
export type HasilPetaAnomali = { baris: BarisAnomali[]; galat: GalatBaris[]; dilewati: number; kolom: PetaKolom; kolomRincian: string[] };

export const MAKS_BARIS_ANOMALI = 2000;

/** Baris hasil sheet_to_json -> baris siap kirim. Nomor baris pada galat = nomor baris Excel (judul = baris 1). Baris kosong dilewati. */
export function petaBarisAnomali(masuk: readonly Record<string, unknown>[], periodeBawaan?: string): HasilPetaAnomali {
  const kosong: HasilPetaAnomali = { baris: [], galat: [], dilewati: 0, kolom: {}, kolomRincian: [] };
  if (masuk.length === 0) return { ...kosong, galat: [{ baris: 0, pesan: "Berkas tidak berisi baris temuan." }] };
  if (masuk.length > MAKS_BARIS_ANOMALI) return { ...kosong, galat: [{ baris: 0, pesan: `Terlalu banyak baris (maksimal ${MAKS_BARIS_ANOMALI} per impor). Pecah berkasnya.` }] };
  const judul = Object.keys(masuk[0]);
  const kolom = petaKolomAnomali(judul);
  const hilang = WAJIB.filter((m) => !kolom[m]);
  if (hilang.length > 0) return { ...kosong, kolom, galat: [{ baris: 1, pesan: `Kolom tidak ditemukan: ${hilang.map((m) => LABEL[m]).join(", ")}. Unduh templat untuk melihat format.` }] };
  const dipakai = new Set(Object.values(kolom));
  const kolomRincian = judul.filter((j) => !dipakai.has(j) && rapat(j) !== "");
  const ambil = (b: Record<string, unknown>, m: Medan) => (kolom[m] ? teks(b[kolom[m] as string]) : "");

  const baris: BarisAnomali[] = [];
  const galat: GalatBaris[] = [];
  let dilewati = 0;
  masuk.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    const id = ambil(b, "id_anggota");
    const kode = ambil(b, "kode").toUpperCase().replace(/\s+/g, "");
    if (!id) return void galat.push({ baris: no, pesan: "ID Anggota kosong." });
    if (!kode) return void galat.push({ baris: no, pesan: "Kode Temuan kosong." });
    if (kode.length > 40) return void galat.push({ baris: no, pesan: "Kode Temuan terlalu panjang (maks 40 karakter)." });
    if (id.length > 120) return void galat.push({ baris: no, pesan: "ID Anggota terlalu panjang." });
    const rincian: Record<string, string> = {};
    for (const j of kolomRincian) {
      const v = teks(b[j]);
      if (v !== "") rincian[j] = v.slice(0, 300);
    }
    baris.push({
      id_anggota: id,
      kode,
      id_sampel: ambil(b, "id_sampel").slice(0, 60) || null,
      periode: (ambil(b, "periode") || periodeBawaan || "").slice(0, 40) || null,
      keterangan: ambil(b, "keterangan").slice(0, 500) || null,
      rincian,
    });
  });
  return { baris, galat, dilewati, kolom, kolomRincian };
}

/** Isi templat Excel (judul + dua contoh) untuk `aoa_to_sheet`. */
export function templatAnomali(): string[][] {
  return [
    [...KOLOM_TEMPLAT_ANOMALI],
    ["Nama Petugas Contoh (atau ID akun)", "KP-02", "NKS 1234 / RT 05", "2026-09", "Nilai konsumsi jauh di atas RT lain"],
    ["Nama Petugas Contoh", "M-01", "ART 2 NKS 1234", "2026-09", ""],
  ];
}

// ----------------------------------------------------------------------------------------------
// Pencocokan nama petugas -> akun
// ----------------------------------------------------------------------------------------------
const GELAR_PANJANG = new Set(["st", "sst", "se", "si", "sp", "sh", "sos", "sag", "skm", "spd", "sktr", "stat", "tr", "md", "amd", "mm", "msi", "mt", "mpd", "ssi", "me", "mkes", "kom", "ak", "stp", "mkom", "mak", "mh", "mba", "phd"]);
const GELAR_TITIK = new Set([...GELAR_PANJANG, "s", "e", "t", "m", "a", "d", "pd", "ked", "kes", "ant", "ag"]);
const GELAR_DEPAN = new Set(["dr", "drs", "dra", "ir", "hj", "h", "prof"]);

/** Nama dinormalkan untuk pencocokan: huruf kecil, tanpa aksen/tanda baca, gelar (setelah koma, bertitik di akhir, atau di depan) dibuang, spasi tunggal. */
export function normNama(s: string): string {
  let dasar = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const koma = dasar.indexOf(",");
  if (koma > 0 && dasar.slice(0, koma).trim() !== "") dasar = dasar.slice(0, koma); // "Nama, S.E." -> gelar belakang mengikuti koma
  const tok = dasar.replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).filter(Boolean);
  const gelarBertitik = (t: string) => t.includes(".") && t.split(".").filter(Boolean).every((p) => GELAR_TITIK.has(p));
  while (tok.length > 1 && (gelarBertitik(tok[tok.length - 1]) || GELAR_PANJANG.has(tok[tok.length - 1]))) tok.pop();
  while (tok.length > 1 && GELAR_DEPAN.has(tok[0].replace(/\./g, ""))) tok.shift();
  return tok.map((t) => t.replace(/\./g, "")).filter(Boolean).join(" ").trim();
}

export type Kandidat = { id: number; nama: string };
export type HasilCocok =
  | { status: "cocok"; akunId: number; cara: "id" | "alias" | "nama" }
  | { status: "ambigu"; kandidat: number[] }
  | { status: "tidak"; saran: number[] };

const JAKARTA_TOKEN = (n: string) => new Set(n.split(" ").filter((t) => t.length > 1));

/** Kemiripan token (0..1): irisan / gabungan. */
export function kemiripan(a: string, b: string): number {
  const A = JAKARTA_TOKEN(a);
  const B = JAKARTA_TOKEN(b);
  if (A.size === 0 || B.size === 0) return 0;
  let i = 0;
  for (const t of A) if (B.has(t)) i++;
  return i / (A.size + B.size - i);
}

/**
 * Mencocokkan `masuk` (nama atau ID akun di berkas) dengan daftar akun. Urutan: ID akun (angka) -> alias tersimpan -> nama persis (dinormalkan).
 * Satu kecocokan = cocok; lebih dari satu = ambigu (admin memilih); nol = tidak (disertai saran nama mirip, maksimal 5).
 */
export function cocokkanNama(masuk: string, akun: readonly Kandidat[], alias?: ReadonlyMap<string, number>): HasilCocok {
  const mentah = masuk.trim();
  if (/^\d{1,12}$/.test(mentah)) {
    const id = Number(mentah);
    if (akun.some((a) => a.id === id)) return { status: "cocok", akunId: id, cara: "id" };
  }
  const n = normNama(mentah);
  if (n === "") return { status: "tidak", saran: [] };
  const a = alias?.get(n);
  if (a !== undefined && akun.some((x) => x.id === a)) return { status: "cocok", akunId: a, cara: "alias" };
  const sama = akun.filter((x) => normNama(x.nama) === n);
  if (sama.length === 1) return { status: "cocok", akunId: sama[0].id, cara: "nama" };
  if (sama.length > 1) return { status: "ambigu", kandidat: sama.map((x) => x.id) };
  const saran = akun
    .map((x) => ({ id: x.id, s: kemiripan(n, normNama(x.nama)) }))
    .filter((x) => x.s >= 0.5)
    .sort((p, q) => q.s - p.s || p.id - q.id)
    .slice(0, 5)
    .map((x) => x.id);
  return { status: "tidak", saran };
}

/** Kunci anti-ganda satu temuan: kegiatan|nama dinormalkan|kode|id sampel|periode. */
export function kunciTemuan(kegiatanId: number, nama: string, kode: string, idSampel: string | null, periode: string | null): string {
  return [kegiatanId, normNama(nama) || nama.trim().toLowerCase(), kode, (idSampel ?? "").trim().toLowerCase(), (periode ?? "").trim().toLowerCase()].join("|").slice(0, 400);
}

// ----------------------------------------------------------------------------------------------
// Tindak lanjut petugas
// ----------------------------------------------------------------------------------------------
export const PENYEBAB = [
  { kode: "salah_catat", label: "Salah catat / salah ketik" },
  { kode: "salah_paham", label: "Salah memahami definisi atau petunjuk" },
  { kode: "kondisi_benar", label: "Isian sudah benar sesuai kondisi responden" },
  { kode: "lupa_konfirmasi", label: "Tidak sempat mengonfirmasi ke responden" },
  { kode: "lainnya", label: "Lainnya (jelaskan di catatan)" },
] as const;
export type KodePenyebab = (typeof PENYEBAB)[number]["kode"];

export function validasiKonfirmasi(x: unknown): { ok: true; data: { penyebab: KodePenyebab; catatan: string | null } } | { ok: false; error: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const p = String(o.penyebab ?? "");
  if (!PENYEBAB.some((q) => q.kode === p)) return { ok: false, error: "Pilih penyebab temuan." };
  const catatan = String(o.catatan ?? "").replace(/\s+/g, " ").trim();
  if (catatan.length > 500) return { ok: false, error: "Catatan maksimal 500 karakter." };
  if (p === "lainnya" && catatan.length < 5) return { ok: false, error: "Jelaskan penyebabnya pada catatan (minimal 5 karakter)." };
  return { ok: true, data: { penyebab: p as KodePenyebab, catatan: catatan || null } };
}

export const labelPenyebab = (kode: string | null): string => PENYEBAB.find((p) => p.kode === kode)?.label ?? "";

export type StatusTemuan = "perlu_cocok" | "menunggu" | "dikonfirmasi";
export const LABEL_STATUS: Record<StatusTemuan, string> = { perlu_cocok: "Perlu dicocokkan", menunggu: "Menunggu konfirmasi", dikonfirmasi: "Dikonfirmasi" };

/** PML dari pemetaan sampel: PML yang paling sering tercatat untuk PPL tersebut (null bila tidak ada). */
export function pmlTerbanyak(baris: readonly { ppl_akun_id: number | null; pml_akun_id: number | null }[], pplId: number): number | null {
  const hitung = new Map<number, number>();
  for (const b of baris) if (b.ppl_akun_id === pplId && b.pml_akun_id) hitung.set(b.pml_akun_id, (hitung.get(b.pml_akun_id) ?? 0) + 1);
  let terbaik: number | null = null;
  let maks = 0;
  for (const [id, n] of hitung) if (n > maks || (n === maks && terbaik !== null && id < terbaik)) [terbaik, maks] = [id, n];
  return terbaik;
}

export type RingkasTemuan = { total: number; perlu_cocok: number; menunggu: number; dikonfirmasi: number };
export function ringkasTemuan(t: readonly { status: string }[]): RingkasTemuan {
  const r = { total: t.length, perlu_cocok: 0, menunggu: 0, dikonfirmasi: 0 };
  for (const x of t) if (x.status === "perlu_cocok" || x.status === "menunggu" || x.status === "dikonfirmasi") r[x.status]++;
  return r;
}

/** Pemeriksaan ulang baris kiriman klien di server (jangan percaya klien): kembalikan baris bersih atau pesan galat. */
export function bersihkanBarisAnomali(x: unknown): { ok: true; baris: BarisAnomali[] } | { ok: false; error: string } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, error: "Tidak ada baris temuan." };
  if (x.length > MAKS_BARIS_ANOMALI) return { ok: false, error: `Terlalu banyak baris (maksimal ${MAKS_BARIS_ANOMALI}).` };
  const baris: BarisAnomali[] = [];
  for (let i = 0; i < x.length; i++) {
    const o = (x[i] ?? {}) as Record<string, unknown>;
    const id = teks(o.id_anggota);
    const kode = teks(o.kode).toUpperCase().replace(/\s+/g, "");
    if (!id || id.length > 120) return { ok: false, error: `Baris ${i + 1}: ID Anggota kosong atau terlalu panjang.` };
    if (!kode || kode.length > 40) return { ok: false, error: `Baris ${i + 1}: Kode Temuan kosong atau terlalu panjang.` };
    const rincian: Record<string, string> = {};
    const r = (o.rincian ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(r).slice(0, 30)) {
      const v = teks(r[k]);
      if (v !== "") rincian[k.slice(0, 60)] = v.slice(0, 300);
    }
    baris.push({ id_anggota: id, kode, id_sampel: teks(o.id_sampel).slice(0, 60) || null, periode: teks(o.periode).slice(0, 40) || null, keterangan: teks(o.keterangan).slice(0, 500) || null, rincian });
  }
  return { ok: true, baris };
}
