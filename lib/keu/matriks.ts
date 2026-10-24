// lib/keu/matriks.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK, papan 1 -- logika murni MATRIKS per KRO: pohon RO > Komponen > Akun > Item, kolom Semula | Menjadi |
// Perubahan | Ketersediaan, pencarian, filter nilai, dan urut per kolom, seleksi massal, rumus sederhana pada kolom Menjadi (mis. =18*2),
// serta saran tingkat pergeseran dan jenis revisi (papan 3). Data dari view keu_v_kk_baris; aturan sebenarnya ditegakkan basis data.

import { n, type BarisKk } from "./kk";

// ---------------------------------------------------------------- baris matriks
export type Ketersediaan = { nomor: string | null; booked: number; real: number };
export type BarisMx = BarisKk & { nomor: string | null; booked: number; real: number; kurang: number };

/** Gabungkan baris kertas kerja dengan realisasi per detail_id (Booked = lock_pagu, Realisasi = real_sd) dan kekurangan R-06 per baris. */
export function gabungKetersediaan(baris: BarisKk[], per: Map<number, Ketersediaan>, kurangPer: Map<number, number>): BarisMx[] {
  return baris.map((b) => {
    const k = b.detail_id === null ? undefined : per.get(b.detail_id);
    return { ...b, nomor: k?.nomor ?? null, booked: k?.booked ?? 0, real: k?.real ?? 0, kurang: kurangPer.get(b.id) ?? 0 };
  });
}

// ---------------------------------------------------------------- kolom
export type IdKolom = "kode" | "uraian" | "vS" | "sat" | "hS" | "jS" | "vM" | "satM" | "hM" | "jM" | "d" | "pem" | "bk" | "rl" | "cek";
export type Kolom = { id: IdKolom; label: string; angka: boolean; kelompok: "id" | "semula" | "menjadi" | "ubah" | "sedia" };

export const KOLOM: readonly Kolom[] = [
  { id: "kode", label: "Kode", angka: false, kelompok: "id" },
  { id: "uraian", label: "Uraian", angka: false, kelompok: "id" },
  { id: "vS", label: "Vol", angka: true, kelompok: "semula" },
  { id: "sat", label: "Sat", angka: false, kelompok: "semula" },
  { id: "hS", label: "Harga", angka: true, kelompok: "semula" },
  { id: "jS", label: "Jumlah", angka: true, kelompok: "semula" },
  { id: "vM", label: "Vol", angka: true, kelompok: "menjadi" },
  { id: "satM", label: "Sat", angka: false, kelompok: "menjadi" },
  { id: "hM", label: "Harga", angka: true, kelompok: "menjadi" },
  { id: "jM", label: "Jumlah", angka: true, kelompok: "menjadi" },
  { id: "d", label: "Selisih", angka: true, kelompok: "ubah" },
  { id: "pem", label: "Pemicu", angka: false, kelompok: "ubah" },
  { id: "bk", label: "Booked", angka: true, kelompok: "sedia" },
  { id: "rl", label: "Realisasi", angka: true, kelompok: "sedia" },
  { id: "cek", label: "Cek", angka: false, kelompok: "sedia" },
];

const adaSemula = (b: BarisMx): boolean => b.detail_id !== null;

/** Nilai satu sel sebagai teks (untuk pencarian dan filter) atau angka (untuk urut). */
export function nilaiSel(b: BarisMx, k: IdKolom): string | number {
  switch (k) {
    case "kode": return b.nomor ?? (b.penggenap ? "penggenap" : b.baru ? "baru" : "");
    case "uraian": return b.uraian_menjadi ?? b.uraian_semula ?? "";
    case "vS": return adaSemula(b) ? n(b.vol_semula) : 0;
    case "sat": return adaSemula(b) ? (b.sat_semula ?? "") : "";
    case "hS": return adaSemula(b) ? n(b.harga_semula) : 0;
    case "jS": return adaSemula(b) ? n(b.jumlah_semula) : 0;
    case "vM": return n(b.vol_menjadi);
    case "satM": return b.sat_menjadi ?? "";
    case "hM": return n(b.harga_menjadi);
    case "jM": return n(b.jumlah_menjadi);
    case "d": return n(b.selisih);
    case "pem": return b.pemicu ?? "";
    case "bk": return b.booked;
    case "rl": return b.real;
    case "cek": return b.kurang > 0 ? "Kurang" : "";
  }
}

export type SaringKolom = { q: string; pilih: string[] };
export type Saring = Partial<Record<IdKolom, SaringKolom>>;
export type Urut = { kolom: IdKolom; arah: "naik" | "turun" } | null;

const teks = (v: string | number): string => String(v).toLowerCase();

/** Satu baris lolos bila memenuhi semua pencarian (mengandung) dan filter nilai (salah satu dari pilihan) tiap kolom. */
export function lolosSaring(b: BarisMx, s: Saring): boolean {
  for (const [id, f] of Object.entries(s) as [IdKolom, SaringKolom][]) {
    if (!f) continue;
    const v = nilaiSel(b, id);
    if (f.q.trim() && !teks(v).includes(f.q.trim().toLowerCase())) return false;
    if (f.pilih.length > 0 && !f.pilih.includes(String(v))) return false;
  }
  return true;
}

export const adaSaring = (s: Saring): boolean => Object.values(s).some((f) => f && (f.q.trim() !== "" || f.pilih.length > 0));

/** Nilai berbeda pada satu kolom, untuk daftar filter (terurut, kosong ditampilkan sebagai "(kosong)" oleh pemanggil). */
export function nilaiBeda(baris: BarisMx[], k: IdKolom): string[] {
  const kol = KOLOM.find((x) => x.id === k)!;
  const set = new Set(baris.map((b) => String(nilaiSel(b, k))));
  const l = [...set];
  return kol.angka ? l.sort((a, b) => Number(a) - Number(b)) : l.sort((a, b) => a.localeCompare(b, "id"));
}

export function bandingkan(a: BarisMx, b: BarisMx, u: NonNullable<Urut>): number {
  const x = nilaiSel(a, u.kolom), y = nilaiSel(b, u.kolom);
  const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "id");
  return u.arah === "naik" ? c : -c;
}

/** Siklus urut satu kolom: tanpa urut, naik, turun, lalu kembali. */
export function putarUrut(sekarang: Urut, k: IdKolom): Urut {
  if (!sekarang || sekarang.kolom !== k) return { kolom: k, arah: "naik" };
  return sekarang.arah === "naik" ? { kolom: k, arah: "turun" } : null;
}

// ---------------------------------------------------------------- pohon
export type Simpul = {
  jenis: "ro" | "komp" | "akun"; kunci: string; label: string; ro: string; komponen: string | null; akun: string | null;
  semula: number; menjadi: number; selisih: number; booked: number; real: number; item: BarisMx[]; anak: Simpul[];
};

const jumlahkan = (items: BarisMx[]) => ({
  semula: items.reduce((s, b) => s + n(b.jumlah_semula), 0), menjadi: items.reduce((s, b) => s + n(b.jumlah_menjadi), 0),
  booked: items.reduce((s, b) => s + b.booked, 0), real: items.reduce((s, b) => s + b.real, 0),
});

/** RO (urut kode) > Komponen > Akun (menurut akun "Menjadi") > Item (urut `urut`, lalu id). Jumlah tiap simpul dari SEMUA barisnya. */
export function bangunPohon(baris: BarisMx[]): Simpul[] {
  const urutBaris = [...baris].sort((a, b) => a.ro_kode.localeCompare(b.ro_kode) || a.komponen_kode.localeCompare(b.komponen_kode) || a.akun_menjadi.localeCompare(b.akun_menjadi) || n(a.urut) - n(b.urut) || a.id - b.id);
  const ros: Simpul[] = [];
  const buat = (jenis: Simpul["jenis"], kunci: string, label: string, ro: string, komponen: string | null, akun: string | null): Simpul =>
    ({ jenis, kunci, label, ro, komponen, akun, semula: 0, menjadi: 0, selisih: 0, booked: 0, real: 0, item: [], anak: [] });
  for (const b of urutBaris) {
    let r = ros.find((x) => x.ro === b.ro_kode);
    if (!r) { r = buat("ro", b.ro_kode, b.ro_kode, b.ro_kode, null, null); ros.push(r); }
    let k = r.anak.find((x) => x.komponen === b.komponen_kode);
    if (!k) { k = buat("komp", `${b.ro_kode}|${b.komponen_kode}`, b.komponen_kode, b.ro_kode, b.komponen_kode, null); r.anak.push(k); }
    let a = k.anak.find((x) => x.akun === b.akun_menjadi);
    if (!a) { a = buat("akun", `${b.ro_kode}|${b.komponen_kode}|${b.akun_menjadi}`, b.akun_menjadi, b.ro_kode, b.komponen_kode, b.akun_menjadi); k.anak.push(a); }
    a.item.push(b);
  }
  const isi = (s: Simpul): BarisMx[] => (s.jenis === "akun" ? s.item : s.anak.flatMap(isi));
  const hitung = (s: Simpul) => { s.anak.forEach(hitung); const j = jumlahkan(isi(s)); Object.assign(s, j, { selisih: j.menjadi - j.semula }); };
  ros.forEach(hitung);
  return ros;
}

export type BarisTampil =
  | { tipe: "ro" | "komp" | "akun"; simpul: Simpul; kedalaman: number; tutup: boolean }
  | { tipe: "item"; b: BarisMx; kedalaman: number };

/** Daftar baris yang tampil: simpul tanpa item lolos disembunyikan bila ada saring; simpul tertutup menyembunyikan isinya; item diurut dalam akunnya. */
export function ratakan(pohon: Simpul[], tutup: ReadonlySet<string>, s: Saring, u: Urut, hanya: ReadonlySet<number> | null = null): BarisTampil[] {
  const aktif = adaSaring(s) || hanya !== null;
  const lolos = (b: BarisMx) => (hanya === null || hanya.has(b.id)) && lolosSaring(b, s);
  const hasil: BarisTampil[] = [];
  const lolosAnak = (x: Simpul): BarisMx[] => (x.jenis === "akun" ? x.item.filter(lolos) : x.anak.flatMap(lolosAnak));
  const jalan = (x: Simpul, dalam: number) => {
    if (aktif && lolosAnak(x).length === 0) return;
    const t = tutup.has(x.kunci);
    hasil.push({ tipe: x.jenis, simpul: x, kedalaman: dalam, tutup: t });
    if (t) return;
    if (x.jenis === "akun") {
      const l = x.item.filter(lolos);
      if (u) l.sort((a, b) => bandingkan(a, b, u));
      for (const b of l) hasil.push({ tipe: "item", b, kedalaman: dalam + 1 });
    } else x.anak.forEach((a) => jalan(a, dalam + 1));
  };
  pohon.forEach((r) => jalan(r, 0));
  return hasil;
}

/** Kunci simpul tingkat RO (untuk "Ciutkan sampai RO") atau semua simpul (kosongkan penutupan = Buka semua). */
export const kunciRo = (pohon: Simpul[]): string[] => pohon.map((x) => x.kunci);

/** Id baris di bawah satu simpul yang tampil (lolos saring); dipakai kotak centang RO dan akun. */
export function idDalam(x: Simpul, s: Saring): number[] {
  const l = (y: Simpul): BarisMx[] => (y.jenis === "akun" ? y.item.filter((b) => lolosSaring(b, s)) : y.anak.flatMap(l));
  return l(x).map((b) => b.id);
}

export type KeadaanPilih = "kosong" | "sebagian" | "penuh";
export function keadaanPilih(ids: number[], pilih: ReadonlySet<number>): KeadaanPilih {
  if (ids.length === 0) return "kosong";
  const k = ids.filter((i) => pilih.has(i)).length;
  return k === 0 ? "kosong" : k === ids.length ? "penuh" : "sebagian";
}

export function ubahPilih(pilih: ReadonlySet<number>, ids: number[], nyala: boolean): Set<number> {
  const baru = new Set(pilih);
  for (const i of ids) { if (nyala) baru.add(i); else baru.delete(i); }
  return baru;
}

// ---------------------------------------------------------------- aksi massal: apa yang boleh untuk pilihan ini
export type AksiMassal = { ganti: boolean; batalPindah: boolean; tambahDiAkun: { ro: string; komponen: string; akun: string } | null; selesai: boolean; bukaKembali: boolean; tampilRab: boolean };

/** Aksi yang masuk akal menurut baris yang dipilih. Hak dan aturan sebenarnya tetap ditegakkan basis data. */
export function aksiMassal(dipilih: BarisMx[]): AksiMassal {
  const satu = dipilih.length === 1 ? dipilih[0] : null;
  const akunSama = dipilih.length > 0 && dipilih.every((b) => b.ro_kode === dipilih[0].ro_kode && b.komponen_kode === dipilih[0].komponen_kode && b.akun_menjadi === dipilih[0].akun_menjadi);
  const adaRab = dipilih.some((b) => b.rab_item_id !== null);
  return {
    ganti: !!satu && satu.detail_id !== null && satu.pindah_ke === null && n(satu.vol_menjadi) > 0,
    batalPindah: dipilih.length > 0 && dipilih.every((b) => b.pindah_dari !== null),
    tambahDiAkun: akunSama ? { ro: dipilih[0].ro_kode, komponen: dipilih[0].komponen_kode, akun: dipilih[0].akun_menjadi } : null,
    selesai: adaRab, bukaKembali: adaRab, tampilRab: adaRab,
  };
}

// ---------------------------------------------------------------- rumus sederhana pada kolom Menjadi
/** Hitung ekspresi aritmetika sederhana: angka (titik/koma desimal), + - * / dan kurung; diawali "=" boleh. null bila bukan ekspresi sah. Tanpa eval. */
export function hitungRumus(teksMasuk: string): number | null {
  let s = (teksMasuk ?? "").trim().replace(/\s+/g, "");
  if (s.startsWith("=")) s = s.slice(1);
  if (s === "" || !/^[0-9.,+\-*/()]+$/.test(s)) return null;
  // "1.000.000" atau "1.250,5": titik ribuan bila pola 3 digit, koma desimal
  s = s.replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?/g, (m) => m.replace(/\./g, "").replace(",", ".")).replace(/,/g, ".");
  let i = 0;
  const peek = () => s[i];
  const angka = (): number | null => {
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const faktor = (): number | null => {
    if (peek() === "-") { i++; const v = faktor(); return v === null ? null : -v; }
    if (peek() === "(") { i++; const v = jumlah(); if (v === null || peek() !== ")") return null; i++; return v; }
    return angka();
  };
  const suku = (): number | null => {
    let v = faktor();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = s[i++]; const w = faktor();
      if (w === null) return null;
      if (op === "/" && w === 0) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const jumlah = (): number | null => {
    let v = suku();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = s[i++]; const w = suku();
      if (w === null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const hasil = jumlah();
  if (hasil === null || i !== s.length || !Number.isFinite(hasil)) return null;
  return Math.round(hasil * 1e6) / 1e6;
}

// ---------------------------------------------------------------- saran tingkat pergeseran dan jenis revisi (papan 3)
export type RingkasRoKk = { ro_kode: string; kro: string | null; selisih: number | string };
export type SaranJenis = {
  tingkat: 0 | 1 | 2 | 3 | 4 | 5; tingkatNama: string; jenis: "pok" | "dipa_djpb" | "dipa_dja" | null; jenisNama: string; alasan: string[];
};

export const TINGKAT_NAMA = ["Tidak ada pergeseran", "Dalam satu RO", "Antar-RO dalam satu KRO", "Antar-KRO dalam satu Kegiatan", "Antar-Kegiatan", "Antar-Program atau pagu Satker berubah"] as const;
export const JENIS_NAMA: Record<string, string> = { pok: "Revisi POK (wewenang KPA)", dipa_djpb: "Revisi DIPA jalur DJPb (Kanwil)", dipa_dja: "Revisi DIPA jalur DJA" };

const kegiatanDari = (ro: string) => ro.slice(0, 4);
const kroDari = (r: RingkasRoKk) => r.kro ?? r.ro_kode.slice(0, 8);

/**
 * Tingkat tertinggi yang tersentuh, dari selisih tiap RO seluruh jadwal (keu_v_kk_ringkas) dan pergeseran antar jenis belanja pada baris KRO ini.
 * Kegiatan diambil dari 4 angka pertama kode RO; program tidak tersedia pada data sehingga antar-program tidak dapat dibedakan dari antar-kegiatan
 * kecuali pagu Satker berubah (jalur DJA). Ini SARAN: operator tetap memilih.
 */
export function sarankanJenis(ringkas: RingkasRoKk[], baris: BarisKk[]): SaranJenis {
  const alasan: string[] = [];
  const sel = (r: RingkasRoKk) => n(r.selisih);
  const per = <K extends string>(kunci: (r: RingkasRoKk) => K) => { const m = new Map<K, number>(); for (const r of ringkas) m.set(kunci(r), (m.get(kunci(r)) ?? 0) + sel(r)); return m; };
  const satker = ringkas.reduce((s, r) => s + sel(r), 0);
  const adaUbah = baris.some((b) => b.pemicu !== null);
  const roBerubah = ringkas.filter((r) => sel(r) !== 0);
  const kroBerubah = [...per(kroDari)].filter(([, v]) => v !== 0);
  const kegBerubah = [...per((r) => kegiatanDari(r.ro_kode))].filter(([, v]) => v !== 0);
  let tingkat: SaranJenis["tingkat"] = adaUbah ? 1 : 0;
  if (roBerubah.length > 0) { tingkat = 2; alasan.push(`Pagu ${roBerubah.length} RO berubah; dana berpindah antar-RO.`); }
  if (kroBerubah.length > 0) { tingkat = 3; alasan.push(`Pagu KRO ${kroBerubah.map(([k]) => k).join(", ")} berubah; dana melintasi KRO.`); }
  if (kegBerubah.length > 0) { tingkat = 4; alasan.push(`Pagu Kegiatan ${kegBerubah.map(([k]) => k).join(", ")} berubah.`); }
  if (satker !== 0) { tingkat = 5; alasan.push("Pagu Satker berubah; wajib Revisi DIPA jalur DJA."); }
  const jenisAkun = new Map<string, number>();
  for (const b of baris) { const j = (b.akun_menjadi ?? "").slice(0, 2); jenisAkun.set(j, (jenisAkun.get(j) ?? 0) + n(b.selisih)); }
  const lintasJenis = [...jenisAkun.values()].filter((v) => v !== 0).length > 1;
  if (lintasJenis) alasan.push("Dana melintasi jenis belanja (dua digit pertama akun berbeda); naik ke jalur DJPb.");
  let jenis: SaranJenis["jenis"] = tingkat === 0 ? null : "pok";
  if (tingkat >= 3 || lintasJenis) jenis = "dipa_djpb";
  if (tingkat === 5) jenis = "dipa_dja";
  if (jenis === "pok" && alasan.length === 0) alasan.push(tingkat === 1 ? "Perubahan hanya di dalam RO." : "Tidak ada perubahan.");
  if (tingkat === 0) alasan.push("Belum ada perubahan pada kolom Menjadi.");
  return { tingkat, tingkatNama: TINGKAT_NAMA[tingkat], jenis, jenisNama: jenis ? JENIS_NAMA[jenis] : "Belum ada perubahan", alasan };
}

// ---------------------------------------------------------------- KPI
export type KpiMx = { semula: number; menjadi: number; selisih: number; nItem: number; nBerRab: number; pctRab: number | null; booked: number; real: number };
export function kpiMatriks(baris: BarisMx[]): KpiMx {
  const item = baris.filter((b) => b.detail_id !== null);
  const semula = baris.reduce((s, b) => s + n(b.jumlah_semula), 0), menjadi = baris.reduce((s, b) => s + n(b.jumlah_menjadi), 0);
  const nBerRab = item.filter((b) => b.rab_item_id !== null).length;
  return {
    semula, menjadi, selisih: menjadi - semula, nItem: item.length, nBerRab, pctRab: item.length ? Math.round((nBerRab / item.length) * 100) : null,
    booked: baris.reduce((s, b) => s + b.booked, 0), real: baris.reduce((s, b) => s + b.real, 0),
  };
}

/** RO yang termasuk satu KRO (4 angka . 3 huruf . 3 karakter). */
export const roDalamKro = (semuaRo: string[], kro: string): string[] => semuaRo.filter((r) => r.slice(0, 8) === kro).sort();
export const kroDariRo = (ro: string): string | null => (/^\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}$/.test(ro) ? ro.slice(0, 8) : null);

// ---------------------------------------------------------------- kembali ke semula
export type LangkahKembali = { batalGeseran: number[]; hapus: number[]; reset: { id: number; vol: number; harga: number }[] };

/**
 * Rencana mengembalikan kertas kerja KRO ke kondisi Semula tanpa menghapus baris resmi: (1) batalkan geseran aktif yang menyentuh baris-baris ini
 * (penghapusan ditolak selama masih di geseran aktif), (2) hapus baris buatan (tanpa detail_id; pasangan lebih dulu, terbaru dulu, supaya volume
 * sumber dikembalikan basis data), (3) setel volume dan harga baris resmi ke nilai Semula bila masih berbeda.
 */
export function rencanaKembali(baris: BarisKk[], geseran: { id: number; donor_id: number; penerima_id: number; batal: boolean }[]): LangkahKembali {
  const ids = new Set(baris.map((b) => b.id));
  const batalGeseran = geseran.filter((g) => !g.batal && (ids.has(g.donor_id) || ids.has(g.penerima_id))).map((g) => g.id);
  const buatan = baris.filter((b) => b.detail_id === null);
  const hapus = [...buatan.filter((b) => b.pindah_dari !== null), ...buatan.filter((b) => b.pindah_dari === null)].sort((a, b) => {
    const pa = a.pindah_dari !== null ? 0 : 1, pb = b.pindah_dari !== null ? 0 : 1;
    return pa !== pb ? pa - pb : b.id - a.id;
  }).map((b) => b.id);
  const reset: LangkahKembali["reset"] = [];
  for (const b of baris.filter((x) => x.detail_id !== null)) {
    const kembaliDariPasangan = buatan.filter((p) => p.pindah_dari === b.id).reduce((s, p) => s + n(p.vol_menjadi), 0);
    const vol = n(b.vol_menjadi) + kembaliDariPasangan;
    if (vol !== n(b.vol_semula) || n(b.harga_menjadi) !== n(b.harga_semula)) reset.push({ id: b.id, vol: n(b.vol_semula), harga: n(b.harga_semula) });
  }
  return { batalGeseran, hapus, reset };
}

// ---------------------------------------------------------------- buku selisih per item (kebutuhan RAB yang belum terdanai)
export type ItemKecukupan = { ro_kode: string; item_id: number; akun_kode: string; kelompok: string; selesai: boolean; jumlah_rab: number | string; jumlah_pok: number | string };
export type PrioritasMaster = { kode: string; nama: string; urut: number | string };
export type BarisBuku = { itemId: number; ro: string; uraian: string; akun: string; kelompok: string; rab: number; pok: number; kurang: number; prioritas: string | null; prioritasNama: string | null; selesai: boolean };

/** Item RAB yang jumlah RAB-nya melebihi POK Menjadi; urut prioritas (kecil = didahulukan didanai; tanpa prioritas paling akhir), lalu kekurangan terbesar. */
export function bukuSelisihItem(item: ItemKecukupan[], baris: BarisKk[], prioritas: PrioritasMaster[]): BarisBuku[] {
  const urutP = new Map(prioritas.map((p) => [p.kode, { urut: n(p.urut), nama: p.nama }]));
  const per = new Map<number, BarisBuku>();
  for (const x of item) {
    const id = Number(x.item_id);
    const b = baris.find((y) => y.rab_item_id === id);
    const cur = per.get(id);
    const rab = (cur?.rab ?? 0) + n(x.jumlah_rab), pok = (cur?.pok ?? 0) + n(x.jumlah_pok);
    const kode = b?.prioritas_kode ?? null;
    per.set(id, {
      itemId: id, ro: x.ro_kode, uraian: b?.uraian_menjadi ?? b?.uraian_semula ?? `Item RAB #${id}`, akun: x.akun_kode, kelompok: x.kelompok, rab, pok, kurang: Math.max(0, rab - pok),
      prioritas: kode, prioritasNama: kode ? (urutP.get(kode)?.nama ?? null) : null, selesai: x.selesai,
    });
  }
  const u = (p: string | null) => (p === null ? Number.MAX_SAFE_INTEGER : (urutP.get(p)?.urut ?? Number.MAX_SAFE_INTEGER - 1));
  return [...per.values()].filter((x) => x.kurang > 0).sort((a, b) => u(a.prioritas) - u(b.prioritas) || b.kurang - a.kurang || a.itemId - b.itemId);
}
