// lib/keu/master.ts
//
// (24 Okt 2026, tahap 14) Master data (papan 14 mockup): logika murni untuk akun belanja, satuan baku, kelompok, parameter kecukupan, waktu, skor RAB,
// kewenangan, dokumen kelengkapan, dan riwayat perubahan. Hak mengubah ditegakkan basis data (pemicu keu_jaga: master = Admin/PPK,
// bobot = PPK, akses = Admin); di sini hanya validasi isian dan penyusunan tampilan. Tanpa React/DB.

import { kelompokAkun } from "./kk";

const num = (v: number | string | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// ---------------------------------------------------------------- akun belanja
export type AkunMaster = { kode: string; nama: string; kelompok_kode: string; pola_kode: string; aktif: boolean };
export const POLA_BAWAAN: Record<string, string> = { "51": "PEG", "524": "PDN", "53": "MDL", "52L": "BRG" };
export const NAMA_KELOMPOK_PENDEK: Record<string, string> = { "": "Semua", "51": "51xxxx pegawai", "524": "524xxx perjalanan", "52L": "52xxxx lain", "53": "53xxxx modal" };
export const ATURAN_KELOMPOK: Record<string, string> = {
  "51": "Bukan sumber pergeseran biasa (R-07)",
  "524": "Hanya dengan 524xxx pada Revisi POK",
  "52L": "Hanya dengan 52xxxx lain pada Revisi POK",
  "53": "Perubahan jenis belanja naik ke Revisi DIPA",
};

/** Akun baru: 6 angka berawalan 51, 52, atau 53, belum ada, nama minimal 4 huruf. Kelompok dan pola awal ditentukan dari kode. */
export function periksaAkunBaru(kode: string, nama: string, ada: string[]): string[] {
  const g: string[] = [];
  const k = kode.trim();
  if (!/^5[123]\d{4}$/.test(k)) g.push("Kode akun harus 6 angka dan diawali 51, 52, atau 53.");
  else if (ada.includes(k)) g.push("Kode akun itu sudah ada.");
  if (nama.trim().length < 4) g.push("Nama akun minimal 4 huruf.");
  return g;
}
export function argsAkunBaru(kode: string, nama: string): Record<string, unknown> {
  const k = kode.trim(), kel = kelompokAkun(k) ?? "52L";
  return { kode: k, nama: nama.trim(), kelompok_kode: kel, pola_kode: POLA_BAWAAN[kel] ?? "BRG", aktif: true };
}

export type PakaiAkun = Map<string, { n: number; nilai: number }>;
/** Jumlah item dan nilai POK berlaku per kode akun (simpul akun POK -> kode, detail -> simpul akun). */
export function pakaiAkun(simpulAkun: { id: number; kode: string }[], detail: { akun_node_id: number; jumlah: number | string }[]): PakaiAkun {
  const kode = new Map(simpulAkun.map((s) => [Number(s.id), s.kode]));
  const hasil: PakaiAkun = new Map();
  for (const d of detail) {
    const k = kode.get(Number(d.akun_node_id));
    if (!k) continue;
    const a = hasil.get(k) ?? { n: 0, nilai: 0 }; hasil.set(k, a);
    a.n += 1; a.nilai += num(d.jumlah);
  }
  return hasil;
}

export type RingkasKelompok = { kode: string; nama: string; nAkun: number; nilai: number; aturan: string };
export function ringkasKelompok(kelompok: { kode: string; nama: string }[], akun: AkunMaster[], pakai: PakaiAkun): RingkasKelompok[] {
  return kelompok.map((k) => {
    const ak = akun.filter((a) => a.kelompok_kode === k.kode);
    return { kode: k.kode, nama: k.nama, nAkun: ak.length, nilai: ak.reduce((s, a) => s + (pakai.get(a.kode)?.nilai ?? 0), 0), aturan: ATURAN_KELOMPOK[k.kode] ?? "" };
  });
}

// ---------------------------------------------------------------- satuan
export type SatuanMaster = { kode: string; arti: string; pasti: boolean; urut: number; aktif: boolean };
export type AliasSatuan = { alias: string; satuan_kode: string };
const normSatuan = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** Jumlah baris POK per kode baku (penulisan di POK dipetakan lewat alias; penulisan yang sama dengan kode baku dihitung langsung). */
export function pakaiSatuan(satuanDetail: (string | null)[], satuan: SatuanMaster[], alias: AliasSatuan[]): Map<string, number> {
  const peta = new Map<string, string>();
  for (const s of satuan) peta.set(normSatuan(s.kode), s.kode);
  for (const a of alias) peta.set(normSatuan(a.alias), a.satuan_kode);
  const hasil = new Map<string, number>();
  for (const s of satuanDetail) {
    const k = peta.get(normSatuan(s));
    if (k) hasil.set(k, (hasil.get(k) ?? 0) + 1);
  }
  return hasil;
}
export function aliasPerSatuan(alias: AliasSatuan[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const a of alias) m.set(a.satuan_kode, [...(m.get(a.satuan_kode) ?? []), a.alias]);
  return m;
}
export function periksaSatuanBaru(kode: string, arti: string, ada: string[]): string[] {
  const g: string[] = [];
  const k = normSatuan(kode);
  if (!/^[A-Z0-9/]{1,10}$/.test(k)) g.push("Kode satuan 1 sampai 10 karakter (huruf besar, angka, atau garis miring).");
  else if (ada.map(normSatuan).includes(k)) g.push("Kode satuan itu sudah ada.");
  if (arti.trim().length < 3) g.push("Arti satuan minimal 3 huruf.");
  return g;
}
export const teksSatuanRagu = (s: SatuanMaster[]): string => {
  const n = s.filter((x) => !x.pasti).length;
  return n ? `${n} arti perlu dikonfirmasi` : "semua arti sudah dikonfirmasi";
};

// ---------------------------------------------------------------- parameter kecukupan dan waktu
export type ParamKecukupan = { faktor: string; toleransi: string };
const angkaKoma = (t: string): number | null => {
  const s = t.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
/** Faktor kebutuhan: lebih dari 0,5 dan paling besar 1,0 (1,0 = RAB dianggap sama dengan kebutuhan riil). */
export function periksaFaktor(t: string): { nilai: number | null; galat: string[] } {
  const x = angkaKoma(t);
  if (x === null || x < 0.5 || x > 1) return { nilai: null, galat: ["Faktor kebutuhan harus antara 0,5 dan 1,0."] };
  return { nilai: x, galat: [] };
}
/** Toleransi Cukup diisi dalam persen (0 sampai 50) dan disimpan sebagai pecahan (5 -> 0,05). */
export function periksaToleransi(t: string): { nilai: number | null; galat: string[] } {
  const x = angkaKoma(t.replace("%", ""));
  if (x === null || x < 0 || x > 50) return { nilai: null, galat: ["Toleransi harus antara 0 dan 50 persen."] };
  return { nilai: Math.round(x * 100) / 10000, galat: [] };
}
export const persenDariPecahan = (v: number): string => String(Math.round(v * 10000) / 100).replace(".", ",");
export const komaDariAngka = (v: number): string => String(v).replace(".", ",");

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-12-27" -> "27 Desember 2026" (tanpa zona waktu). */
export function teksTanggal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
export function periksaTanggal(iso: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return ["Tanggal tidak sah."];
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? [] : ["Tanggal tidak sah."];
}
export type WaktuMaster = { kode: string; nama: string; nilai: string; nilai_tanggal: string | null; ket: string; urut: number };
/** Pengaturan waktu bertanggal (tenggat) dapat diedit lewat tanggal; yang lain hanya teks. */
export const waktuBertanggal = (w: WaktuMaster): boolean => w.nilai_tanggal !== null;
export function argsWaktu(w: WaktuMaster, nilaiBaru: string): Record<string, unknown> {
  return waktuBertanggal(w) ? { nilai_tanggal: nilaiBaru, nilai: teksTanggal(nilaiBaru) } : { nilai: nilaiBaru.trim() };
}
export function periksaWaktu(w: WaktuMaster, nilaiBaru: string): string[] {
  if (waktuBertanggal(w)) return periksaTanggal(nilaiBaru);
  return nilaiBaru.trim().length < 3 ? ["Isi minimal 3 karakter."] : [];
}

// ---------------------------------------------------------------- skor RAB
export type Bobot = { penarikan: number; volume: number; cakupan: number; disiplin: number };
export type Ambang = { baik: number; cukup: number };
export type SkorRow = { id: number; bobot_penarikan: number; bobot_volume: number; bobot_cakupan: number; bobot_disiplin: number; ambang_baik: number; ambang_cukup: number };
export const bobotDariRow = (r: SkorRow): Bobot => ({ penarikan: num(r.bobot_penarikan), volume: num(r.bobot_volume), cakupan: num(r.bobot_cakupan), disiplin: num(r.bobot_disiplin) });
export const ambangDariRow = (r: SkorRow): Ambang => ({ baik: num(r.ambang_baik), cukup: num(r.ambang_cukup) });
const bulatNol100 = (v: number) => Number.isInteger(v) && v >= 0 && v <= 100;
export function periksaSkor(b: Bobot, a: Ambang): string[] {
  const g: string[] = [];
  for (const [k, v] of Object.entries(b)) if (!bulatNol100(v)) g.push(`Bobot ${k} harus bilangan bulat 0 sampai 100.`);
  if (b.penarikan + b.volume + b.cakupan + b.disiplin <= 0) g.push("Total bobot tidak boleh 0.");
  if (!bulatNol100(a.baik) || !bulatNol100(a.cukup)) g.push("Ambang harus bilangan bulat 0 sampai 100.");
  else if (a.cukup > a.baik) g.push("Ambang Cukup tidak boleh lebih tinggi dari ambang Baik.");
  return g;
}
export const totalBobot = (b: Bobot): number => b.penarikan + b.volume + b.cakupan + b.disiplin;
export const teksTotalBobot = (b: Bobot, boleh: boolean): string => {
  const t = totalBobot(b);
  return `Total bobot ${t}${t === 100 ? "" : " (dinormalkan menjadi 100 saat menghitung)"}. ${boleh ? "PPK dapat mengubah." : 'Hanya PPK yang mengubah bobot dan ambang (kewenangan "Mengubah bobot skor RAB").'}`;
};
export function argsSkor(b: Bobot, a: Ambang): Record<string, unknown> {
  return { bobot_penarikan: b.penarikan, bobot_volume: b.volume, bobot_cakupan: b.cakupan, bobot_disiplin: b.disiplin, ambang_baik: a.baik, ambang_cukup: a.cukup };
}


export type SkorRo = { ro_kode: string; n_penarikan: number | string | null; n_volume: number | string | null; n_cakupan: number | string | null; n_disiplin: number | string | null };
export type HasilSkor = { ro_kode: string; penarikan: number | null; volume: number | null; cakupan: number | null; disiplin: number | null; skor: number | null; label: string };
const nul = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Skor satu RO menurut bobot dan ambang (sama dengan view keu_v_skor_ro): komponen yang tak dapat dinilai (null) tidak ikut menimbang. */
export function hitungSkor(r: SkorRo, b: Bobot, a: Ambang): HasilSkor {
  const k = { penarikan: nul(r.n_penarikan), volume: nul(r.n_volume), cakupan: nul(r.n_cakupan), disiplin: nul(r.n_disiplin) };
  let num = 0, den = 0;
  for (const j of ["penarikan", "volume", "cakupan", "disiplin"] as const) { const v = k[j]; if (v !== null) { num += v * b[j]; den += b[j]; } }
  const skor = den === 0 ? null : Math.round((num / den) * 10) / 10;
  const label = skor === null ? "-" : skor >= a.baik ? "Baik" : skor >= a.cukup ? "Cukup" : "Perlu pembinaan";
  return { ro_kode: r.ro_kode, ...k, skor, label };
}
/** Tiga RO tertinggi dan tiga terendah (yang punya skor), untuk pratinjau bobot. */
export function pratinjauSkor(rows: SkorRo[], b: Bobot, a: Ambang): { tertinggi: HasilSkor[]; terendah: HasilSkor[] } {
  const h = rows.map((r) => hitungSkor(r, b, a)).filter((x) => x.skor !== null).sort((x, y) => (y.skor as number) - (x.skor as number) || x.ro_kode.localeCompare(y.ro_kode));
  const tertinggi = h.slice(0, 3);
  const terendah = h.length > 3 ? h.slice(-3) : [];
  return { tertinggi, terendah };
}

// ---------------------------------------------------------------- kewenangan
export type Kewenangan = { kode: string; nama: string; ket: string; pemberi_kode: string | null; urut: number; aktif: boolean };
export type KewenanganPeran = { kewenangan_kode: string; peran_kode: string; perlu_pemberian: boolean; ket: string | null };
export type PeranMaster = { kode: string; nama: string; ket: string; lingkup: string; urut: number; aktif: boolean };
export type BarisKewenangan = { kode: string; nama: string; ket: string; sel: { peran: string; ada: boolean; perluPemberian: boolean }[] };
export const NAMA_PERAN_PENDEK: Record<string, string> = { ADMIN: "Admin App", KPA: "KPA", PPK: "PPK", KETUA: "Ketua tim", ADMINRO: "Admin RO", BEND: "Bendahara", TU: "TU", PBJ: "PBJ", RENC: "Renc." };
/** Matriks tindakan x peran (urutan peran menurut master). */
export function susunKewenangan(kew: Kewenangan[], kp: KewenanganPeran[], peran: PeranMaster[]): { peran: PeranMaster[]; baris: BarisKewenangan[] } {
  const p = [...peran].filter((x) => x.aktif).sort((a, b) => a.urut - b.urut);
  const baris = [...kew].filter((k) => k.aktif).sort((a, b) => a.urut - b.urut).map((k) => ({
    kode: k.kode, nama: k.nama, ket: k.ket,
    sel: p.map((x) => { const r = kp.find((y) => y.kewenangan_kode === k.kode && y.peran_kode === x.kode); return { peran: x.kode, ada: !!r, perluPemberian: !!r?.perlu_pemberian }; }),
  }));
  return { peran: p, baris };
}

// ---------------------------------------------------------------- dokumen kelengkapan
export type DokMaster = { id: number; sumber: string; kode: string; seksi_urut: number | null; seksi_huruf: string | null; seksi_judul: string | null; no: number | null; uraian: string; pihak: string[] | null; ket: string | null; gen: boolean; aktif: boolean };
export type KelompokDok = { kunci: string; sumber: string; kode: string; judul: string; n: number; nGen: number };
export function kelompokDokumen(dok: DokMaster[], pola: { kode: string; nama: string }[]): KelompokDok[] {
  const per = new Map<string, KelompokDok>();
  for (const d of dok) {
    const kunci = `${d.sumber}:${d.kode}`;
    const g = per.get(kunci) ?? { kunci, sumber: d.sumber, kode: d.kode, judul: d.sumber === "pola" ? `Pola umum: ${pola.find((p) => p.kode === d.kode)?.nama ?? d.kode}` : `Lembar ${d.kode}`, n: 0, nGen: 0 };
    per.set(kunci, g); g.n += 1; if (d.gen) g.nGen += 1;
  }
  return [...per.values()].sort((a, b) => (a.sumber === b.sumber ? a.kode.localeCompare(b.kode) : a.sumber === "pola" ? -1 : 1));
}
export const dokumenKelompok = (dok: DokMaster[], kunci: string): DokMaster[] =>
  dok.filter((d) => `${d.sumber}:${d.kode}` === kunci).sort((a, b) => num(a.seksi_urut) - num(b.seksi_urut) || num(a.no) - num(b.no) || a.id - b.id);

// ---------------------------------------------------------------- riwayat
export type RiwayatRow = { id: number; waktu: string; aksi: string; detail: { tabel?: string; lama?: Record<string, unknown>; baru?: Record<string, unknown> } | null; oleh_nama: string | null };
const NAMA_TABEL: Record<string, string> = {
  keu_master_akun: "akun", keu_master_satuan: "satuan", keu_master_satuan_alias: "alias satuan", keu_master_param: "parameter", keu_master_waktu: "waktu", keu_master_skor: "skor RAB",
  keu_master_prioritas: "prioritas", keu_master_kelompok: "kelompok", keu_master_dok: "dokumen", keu_master_pola_dok: "pola dokumen", keu_master_kewenangan: "kewenangan",
  keu_master_kewenangan_peran: "kewenangan-peran", keu_master_peran: "peran", keu_master_jalur: "jalur", keu_master_profil_penarikan: "profil penarikan", keu_struktur_level: "level struktur",
};
const KOLOM: Record<string, string> = { aktif: "aktif", pola_kode: "pola", nama: "nama", arti: "arti", pasti: "arti pasti", nilai: "nilai", nilai_tanggal: "tanggal", gen: "dapat dibuat SIGAP", tampil: "tampil", ket: "keterangan", warna: "warna", urut: "urutan" };
/** Kolom pencatat otomatis pemicu basis data; bukan perubahan yang dibuat pengguna. */
const KOLOM_TEKNIS = new Set(["id", "diubah_oleh", "diubah_at", "dibuat_at"]);
const teksNilai = (v: unknown): string => (v === null || v === undefined ? "kosong" : typeof v === "boolean" ? (v ? "ya" : "tidak") : String(v));
export function ringkasRiwayat(r: RiwayatRow): string {
  const tabel = r.detail?.tabel ?? r.aksi.replace(/^keu\./, "").replace(/\.(insert|update)$/, "");
  const nama = NAMA_TABEL[tabel] ?? tabel;
  if (r.aksi.endsWith(".insert")) { const b = r.detail?.baru ?? {}; return `menambah ${nama} ${teksNilai(b.kode ?? b.alias ?? b.nama ?? b.id)}`; }
  const baru = r.detail?.baru ?? {}, lama = r.detail?.lama ?? {};
  const bagian = Object.keys(baru).filter((k) => !KOLOM_TEKNIS.has(k)).map((k) => `${KOLOM[k] ?? k} ${teksNilai(lama[k])} menjadi ${teksNilai(baru[k])}`);
  return `mengubah ${nama}${bagian.length ? `: ${bagian.join("; ")}` : ""}`;
}

// ---------------------------------------------------------------- bagian halaman
export const BAGIAN_MASTER = [
  { kode: "akun", nama: "Akun belanja", grup: 1 },
  { kode: "struktur", nama: "Struktur anggaran", grup: 2 },
  { kode: "satuan", nama: "Satuan", grup: 2 },
  { kode: "kelompok", nama: "Kelompok dan prioritas", grup: 2 },
  { kode: "waktu", nama: "Waktu", grup: 2 },
  { kode: "skor", nama: "Skor RAB", grup: 2 },
  { kode: "kew", nama: "Kewenangan", grup: 2 },
  { kode: "pola", nama: "Dokumen kelengkapan", grup: 3 },
  { kode: "lain", nama: "Tim, peran, status", grup: 3 },
] as const;
export type KodeBagianMaster = (typeof BAGIAN_MASTER)[number]["kode"];
export const GRUP_MASTER: Record<number, string> = { 1: "1. Master akun", 2: "2. Master anggaran", 3: "3. Master lainnya" };
export const bagianMasterSah = (v: string | null): KodeBagianMaster => (BAGIAN_MASTER.find((b) => b.kode === v)?.kode ?? "akun");
