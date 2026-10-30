// lib/sampelSls.ts  (logika murni; aman diimpor klien dan server)
//
// (30 Okt 2026) ALOKASI SAMPEL PER SLS -- strategi "sampel_sls" (Sakernas TW IV, Seruti TW IV, IMK): tiap PPL mendapat 1-2 SLS, tiap SLS 10 sampel utama,
// sampel cadangan (pengganti) opsional. Alokasi dimasukkan admin lewat templat Excel (format mengikuti unggahan FASIH) di tab 1 · Persiapan Kelola Pendataan.
//
// Kolom templat (judul kolom tidak membedakan huruf besar/kecil dan tanda baca):
//   Kode Wilayah | Nama Responden | Nama Anggota Ruta Lain (opsional) | Status Sampel (Utama/Cadangan) | Latitude | Longitude | Nama PPL | Nama PML
// Satu baris = satu sampel. SLS = 14 digit pertama kode wilayah (kode 16 digit memuat Sub SLS di dua digit terakhir). PPL/PML dikenali dari NAMA dan dicocokkan ke
// petugas yang sudah ditugaskan pada kegiatan itu (pencocokan dilakukan di server; fungsi di sini murni dan dipakai bersama untuk pratinjau dan ujian).
//
// Isi berkas: tipe, pembacaan baris Excel, pencocokan nama, pemeriksaan alokasi, pengelompokan (admin/PPL/PML), aturan penggantian sampel, dan templat.

export const API_SAMPEL_ADMIN = "/api/portal/pendataan/sampel";
export const API_SAMPEL = "/api/portal/sampel";
export const MAKS_BARIS_SAMPEL = 5000;
/** Panjang kode SLS (14 digit): provinsi 2, kabupaten 2, kecamatan 3, desa 3, SLS 4. */
export const PANJANG_KODE_SLS = 14;

export type StatusSampel = "utama" | "cadangan";
export const LABEL_STATUS: Record<StatusSampel, string> = { utama: "Sampel utama", cadangan: "Cadangan" };

/** Satu baris templat yang sudah dibersihkan (belum dicocokkan ke akun). */
export type BarisSampel = {
  kode_wilayah: string;
  kode_sls: string;
  nama_responden: string;
  anggota_lain: string | null;
  status: StatusSampel;
  lat: number | null;
  lng: number | null;
  ppl_nama: string;
  pml_nama: string;
};
export type BarisSampelCocok = BarisSampel & { ppl_akun_id: number; pml_akun_id: number };

/** Satu sampel seperti dibaca dari basis data. */
export type SampelRow = BarisSampelCocok & {
  id: number;
  urut: number;
  /** hanya pada baris CADANGAN: id sampel utama yang digantikannya */
  menggantikan_id: number | null;
  alasan: string | null;
  diganti_at: string | null;
  diganti_oleh: string | null;
};

export type KonfigSampel = { target_per_sls: number; maks_sls_per_ppl: number; boleh_ganti: boolean };
export const KONFIG_SAMPEL_AWAL: KonfigSampel = { target_per_sls: 10, maks_sls_per_ppl: 2, boleh_ganti: true };

const bulat = (v: unknown, min: number, maks: number, awal: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= maks ? n : awal;
};
/** Pengaturan dari JSON tak tepercaya; nilai rusak diganti bawaan. */
export function bacaKonfigSampel(mentah: unknown): KonfigSampel {
  const r = (typeof mentah === "object" && mentah !== null ? mentah : {}) as Record<string, unknown>;
  return {
    target_per_sls: bulat(r.target_per_sls, 1, 100, KONFIG_SAMPEL_AWAL.target_per_sls),
    maks_sls_per_ppl: bulat(r.maks_sls_per_ppl, 1, 50, KONFIG_SAMPEL_AWAL.maks_sls_per_ppl),
    boleh_ganti: typeof r.boleh_ganti === "boolean" ? r.boleh_ganti : KONFIG_SAMPEL_AWAL.boleh_ganti,
  };
}

export type GalatBaris = { baris: number; pesan: string };

// ---------------------------------------------------------------------------------------------------------------------------------
// Kolom dan pembacaan baris Excel
// ---------------------------------------------------------------------------------------------------------------------------------

export const KOLOM_TEMPLAT_SAMPEL = ["Kode Wilayah", "Nama Responden", "Nama Anggota Ruta Lain", "Status Sampel", "Latitude", "Longitude", "Nama PPL", "Nama PML"] as const;

type Medan = "kode" | "responden" | "anggota" | "status" | "lat" | "lng" | "ppl" | "pml";
const ALIAS: Record<Medan, string[]> = {
  kode: ["kodewilayah", "kode", "kodesls", "kodesubsls", "idsubsls", "kodewil", "kodebs"],
  responden: ["namaresponden", "responden", "namakrt", "namakk", "namakepalakeluarga", "nama", "namausaha", "namaperusahaan"],
  anggota: ["namaanggotarutalain", "anggotarutalain", "anggotalain", "anggotaruta", "anggotarutalainnya", "namaanggotalain"],
  status: ["statussampel", "status", "jenissampel", "jenis", "keterangansampel"],
  lat: ["latitude", "lat", "koordinatlat", "koordinatlatitude", "garislintang"],
  lng: ["longitude", "long", "lng", "lon", "koordinatlong", "koordinatlng", "koordinatlongitude", "garisbujur"],
  ppl: ["namappl", "ppl", "petugaspencacah", "pencacah", "namapencacah"],
  pml: ["namapml", "pml", "pengawas", "namapengawas"],
};
const WAJIB: Medan[] = ["kode", "responden", "status", "ppl", "pml"];
const LABEL: Record<Medan, string> = { kode: "Kode Wilayah", responden: "Nama Responden", anggota: "Nama Anggota Ruta Lain", status: "Status Sampel", lat: "Latitude", lng: "Longitude", ppl: "Nama PPL", pml: "Nama PML" };

const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim());

/** Mencocokkan judul kolom berkas dengan kolom baku -> judul asli di berkas. */
export function petaKolomSampel(judul: readonly string[]): Partial<Record<Medan, string>> {
  const hasil: Partial<Record<Medan, string>> = {};
  for (const j of judul) {
    const r = rapat(String(j ?? "").replace(/\([^)]*\)/g, "")); // keterangan dalam kurung, mis. "(opsional)", diabaikan
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

/** "Utama", "sampel utama", "U" -> utama; "Cadangan", "pengganti", "C" -> cadangan; selain itu null. */
export function bacaStatusSampel(s: string): StatusSampel | null {
  const r = rapat(s);
  if (["utama", "sampelutama", "u", "1", "inti", "sampel"].includes(r)) return "utama";
  if (["cadangan", "sampelcadangan", "c", "2", "pengganti", "sampelpengganti", "cad"].includes(r)) return "cadangan";
  return null;
}

/** Kode wilayah dari sel Excel: hanya angka, 10-16 digit. Mengembalikan kode atau pesan galat. */
export function bacaKodeWilayah(sel: string): { ok: true; kode: string } | { ok: false; pesan: string } {
  const s = sel.trim().replace(/[\s'`]/g, "");
  if (!s) return { ok: false, pesan: "Kode Wilayah kosong." };
  if (/e\+?\d+$/i.test(s) || /^\d+[.,]\d+$/.test(s)) return { ok: false, pesan: `Kode Wilayah "${sel}" terbaca sebagai angka ilmiah/desimal. Ubah format kolom menjadi Teks, lalu isi ulang.` };
  if (!/^\d{10,16}$/.test(s)) return { ok: false, pesan: `Kode Wilayah "${sel}" harus berupa 10-16 digit angka.` };
  return { ok: true, kode: s };
}

export const kodeSls = (kodeWilayah: string): string => kodeWilayah.slice(0, PANJANG_KODE_SLS);

const BATAS_INDONESIA = { latMin: -11.5, latMaks: 6.5, lngMin: 94.5, lngMaks: 141.5 };
function bacaAngka(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** `nomor[i]` = nomor baris Excel dari `baris[i]` (judul kolom = baris 1). */
export type HasilPeriksaBaris = { baris: BarisSampel[]; nomor: number[]; galat: GalatBaris[]; peringatan: GalatBaris[]; dilewati: number };

/**
 * Baris hasil sheet_to_json (objek berkunci judul kolom) -> baris sampel bersih. Baris yang seluruh selnya kosong dilewati.
 * Nomor baris pada galat = nomor baris di Excel (judul kolom = baris 1). Galat = baris TIDAK dimasukkan; peringatan = tetap masuk.
 */
export function periksaBarisSampel(baris: readonly Record<string, unknown>[]): HasilPeriksaBaris {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  const hasil: BarisSampel[] = [];
  const nomor: number[] = [];
  if (baris.length === 0) return { baris: hasil, nomor, galat: [{ baris: 0, pesan: "Berkas tidak berisi baris sampel." }], peringatan, dilewati: 0 };
  if (baris.length > MAKS_BARIS_SAMPEL) return { baris: hasil, nomor, galat: [{ baris: 0, pesan: `Berkas memuat ${baris.length} baris; batas satu unggahan ${MAKS_BARIS_SAMPEL}.` }], peringatan, dilewati: 0 };
  const kolom = petaKolomSampel(Object.keys(baris[0]));
  const hilang = WAJIB.filter((m) => !kolom[m]);
  if (hilang.length > 0) return { baris: hasil, nomor, galat: [{ baris: 1, pesan: `Kolom tidak ditemukan: ${hilang.map((m) => LABEL[m]).join(", ")}. Unduh templat untuk melihat format.` }], peringatan, dilewati: 0 };

  const ambil = (b: Record<string, unknown>, m: Medan) => (kolom[m] ? teks(b[kolom[m] as string]) : "");
  const sudah = new Map<string, number>();
  let dilewati = 0;
  baris.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    const masalah: string[] = [];
    const kode = bacaKodeWilayah(ambil(b, "kode"));
    if (!kode.ok) masalah.push(kode.pesan);
    const responden = ambil(b, "responden");
    if (!responden) masalah.push("Nama Responden kosong.");
    else if (responden.length > 200) masalah.push("Nama Responden lebih dari 200 huruf.");
    const status = bacaStatusSampel(ambil(b, "status"));
    if (!status) masalah.push(`Status Sampel "${ambil(b, "status")}" tidak dikenal (isi Utama atau Cadangan).`);
    const ppl = ambil(b, "ppl");
    const pml = ambil(b, "pml");
    if (!ppl) masalah.push("Nama PPL kosong.");
    if (!pml) masalah.push("Nama PML kosong.");
    const anggota = ambil(b, "anggota");
    if (anggota.length > 500) masalah.push("Nama Anggota Ruta Lain lebih dari 500 huruf.");

    let lat: number | null = null;
    let lng: number | null = null;
    const la = bacaAngka(ambil(b, "lat"));
    const lo = bacaAngka(ambil(b, "lng"));
    if (Number.isNaN(la) || Number.isNaN(lo)) peringatan.push({ baris: no, pesan: "Koordinat bukan angka; koordinat baris ini diabaikan." });
    else if ((la === null) !== (lo === null)) peringatan.push({ baris: no, pesan: "Hanya salah satu dari Latitude/Longitude yang terisi; koordinat baris ini diabaikan." });
    else if (la !== null && lo !== null) {
      if (la < BATAS_INDONESIA.latMin || la > BATAS_INDONESIA.latMaks || lo < BATAS_INDONESIA.lngMin || lo > BATAS_INDONESIA.lngMaks) {
        peringatan.push({ baris: no, pesan: `Koordinat ${la}, ${lo} di luar wilayah Indonesia (kolom Latitude/Longitude tertukar?); koordinat baris ini diabaikan.` });
      } else {
        lat = la;
        lng = lo;
      }
    }

    if (masalah.length > 0 || !kode.ok || !status) {
      galat.push({ baris: no, pesan: masalah.join(" ") });
      return;
    }
    const kunci = `${kode.kode}|${normNama(responden)}|${status}`;
    const pertama = sudah.get(kunci);
    if (pertama !== undefined) peringatan.push({ baris: no, pesan: `Sama dengan baris ${pertama} (kode wilayah, nama responden, dan status sama).` });
    else sudah.set(kunci, no);
    nomor.push(no);
    hasil.push({ kode_wilayah: kode.kode, kode_sls: kodeSls(kode.kode), nama_responden: responden, anggota_lain: anggota || null, status, lat, lng, ppl_nama: ppl, pml_nama: pml });
  });
  return { baris: hasil, nomor, galat, peringatan, dilewati };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pencocokan nama petugas
// ---------------------------------------------------------------------------------------------------------------------------------

/** Nama untuk dibandingkan: huruf kecil, tanpa gelar di belakang koma, tanpa tanda baca, spasi tunggal. */
export function normNama(nama: string): string {
  const sebelumKoma = nama.includes(",") && nama.split(",")[0].trim() !== "" ? nama.split(",")[0] : nama;
  return sebelumKoma
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Kandidat = { id: number; nama: string };
export type HasilCocok = { ok: true; id: number; nama: string; mirip: boolean } | { ok: false; alasan: "tidak_ada" | "ganda"; pesan: string };

/**
 * Nama di Excel -> satu akun. Urutan: (1) sama persis setelah dinormalkan; (2) kata-kata nama yang lebih pendek seluruhnya ada pada nama yang lebih panjang
 * (minimal dua kata) dan hanya cocok dengan SATU akun. Lebih dari satu akun = ganda (admin harus memperjelas nama).
 */
export function cocokkanNama(nama: string, kandidat: readonly Kandidat[]): HasilCocok {
  const q = normNama(nama);
  if (!q) return { ok: false, alasan: "tidak_ada", pesan: "Nama kosong." };
  const persis = kandidat.filter((k) => normNama(k.nama) === q);
  const idPersis = Array.from(new Set(persis.map((k) => k.id)));
  if (idPersis.length === 1) return { ok: true, id: idPersis[0], nama: persis[0].nama, mirip: false };
  if (idPersis.length > 1) return { ok: false, alasan: "ganda", pesan: `Nama "${nama}" cocok dengan ${idPersis.length} petugas.` };
  const kataQ = q.split(" ");
  const mirip = kandidat.filter((k) => {
    const kataK = normNama(k.nama).split(" ");
    const [pendek, panjang] = kataQ.length <= kataK.length ? [kataQ, kataK] : [kataK, kataQ];
    return pendek.length >= 2 && pendek.every((t) => panjang.includes(t));
  });
  const idMirip = Array.from(new Set(mirip.map((k) => k.id)));
  if (idMirip.length === 1) return { ok: true, id: idMirip[0], nama: mirip[0].nama, mirip: true };
  if (idMirip.length > 1) return { ok: false, alasan: "ganda", pesan: `Nama "${nama}" cocok dengan ${idMirip.length} petugas.` };
  return { ok: false, alasan: "tidak_ada", pesan: `Nama "${nama}" tidak ditemukan.` };
}

export type Pemetaan = { peran: "ppl" | "pml"; nama_excel: string; nama_akun: string | null; akun_id: number | null; mirip: boolean; pesan: string | null; baris: number };
export type HasilCocokPetugas = { cocok: BarisSampelCocok[]; galat: GalatBaris[]; pemetaan: Pemetaan[] };

/**
 * Mencocokkan nama PPL dan PML tiap baris ke akun. `ppl` dan `pml` = petugas yang SUDAH ditugaskan pada kegiatan itu dengan peran tersebut.
 * Nomor baris = nomor baris Excel; `nomor` (opsional) memetakan indeks baris ke nomor Excel asalnya bila ada baris yang sudah tersaring.
 */
export function cocokkanPetugasSampel(baris: readonly BarisSampel[], ppl: readonly Kandidat[], pml: readonly Kandidat[], nomor?: readonly number[]): HasilCocokPetugas {
  const galat: GalatBaris[] = [];
  const cocok: BarisSampelCocok[] = [];
  const memo = new Map<string, HasilCocok>();
  const pemetaan = new Map<string, Pemetaan>();
  const cari = (peran: "ppl" | "pml", nama: string, no: number): HasilCocok => {
    const kunci = `${peran}|${normNama(nama)}`;
    let h = memo.get(kunci);
    if (!h) {
      h = cocokkanNama(nama, peran === "ppl" ? ppl : pml);
      if (!h.ok && h.alasan === "tidak_ada") h = { ...h, pesan: `Nama ${peran.toUpperCase()} "${nama}" belum ditugaskan sebagai ${peran.toUpperCase()} pada kegiatan ini (atau ejaannya berbeda).` };
      memo.set(kunci, h);
      pemetaan.set(kunci, { peran, nama_excel: nama, nama_akun: h.ok ? h.nama : null, akun_id: h.ok ? h.id : null, mirip: h.ok ? h.mirip : false, pesan: h.ok ? null : h.pesan, baris: no });
    }
    return h;
  };
  baris.forEach((b, i) => {
    const no = nomor?.[i] ?? i + 2;
    const p = cari("ppl", b.ppl_nama, no);
    const m = cari("pml", b.pml_nama, no);
    if (!p.ok || !m.ok) {
      galat.push({ baris: no, pesan: [!p.ok ? p.pesan : "", !m.ok ? m.pesan : ""].filter(Boolean).join(" ") });
      return;
    }
    cocok.push({ ...b, ppl_akun_id: p.id, pml_akun_id: m.id });
  });
  const urutan = Array.from(pemetaan.values()).sort((a, b) => (a.peran === b.peran ? a.nama_excel.localeCompare(b.nama_excel) : a.peran === "ppl" ? -1 : 1));
  return { cocok, galat, pemetaan: urutan };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pemeriksaan alokasi (peringatan; tidak menolak)
// ---------------------------------------------------------------------------------------------------------------------------------

type BarisAlokasi = Pick<BarisSampelCocok, "kode_sls" | "status" | "ppl_akun_id" | "pml_akun_id" | "ppl_nama" | "pml_nama">;

/** Peringatan alokasi menurut pengaturan: SLS tanpa sampel utama / jumlah utama tidak sesuai target, SLS dipegang >1 PPL, PPL > maks SLS, PPL berpindah PML. */
export function periksaAlokasi(baris: readonly BarisAlokasi[], konfig: KonfigSampel): string[] {
  const out: string[] = [];
  const sls = new Map<string, { utama: number; cadangan: number; ppl: Set<number>; pplNama: Set<string> }>();
  const perPpl = new Map<number, { nama: string; sls: Set<string>; pml: Set<number> }>();
  for (const b of baris) {
    const s = sls.get(b.kode_sls) ?? { utama: 0, cadangan: 0, ppl: new Set<number>(), pplNama: new Set<string>() };
    if (b.status === "utama") s.utama++;
    else s.cadangan++;
    s.ppl.add(b.ppl_akun_id);
    s.pplNama.add(b.ppl_nama);
    sls.set(b.kode_sls, s);
    const p = perPpl.get(b.ppl_akun_id) ?? { nama: b.ppl_nama, sls: new Set<string>(), pml: new Set<number>() };
    p.sls.add(b.kode_sls);
    p.pml.add(b.pml_akun_id);
    perPpl.set(b.ppl_akun_id, p);
  }
  const bukanTarget = Array.from(sls).filter(([, s]) => s.utama !== konfig.target_per_sls);
  if (bukanTarget.length > 0) {
    const contoh = bukanTarget.slice(0, 5).map(([k, s]) => `${k} (${s.utama})`).join(", ");
    out.push(`${bukanTarget.length} SLS tidak berisi tepat ${konfig.target_per_sls} sampel utama: ${contoh}${bukanTarget.length > 5 ? ", ..." : ""}.`);
  }
  const banyak = Array.from(sls).filter(([, s]) => s.ppl.size > 1);
  if (banyak.length > 0) out.push(`${banyak.length} SLS dipegang lebih dari satu PPL: ${banyak.slice(0, 5).map(([k, s]) => `${k} (${Array.from(s.pplNama).join(" & ")})`).join(", ")}${banyak.length > 5 ? ", ..." : ""}.`);
  const lebih = Array.from(perPpl.values()).filter((p) => p.sls.size > konfig.maks_sls_per_ppl);
  if (lebih.length > 0) out.push(`${lebih.length} PPL memegang lebih dari ${konfig.maks_sls_per_ppl} SLS: ${lebih.slice(0, 5).map((p) => `${p.nama} (${p.sls.size})`).join(", ")}${lebih.length > 5 ? ", ..." : ""}.`);
  const pindah = Array.from(perPpl.values()).filter((p) => p.pml.size > 1);
  if (pindah.length > 0) out.push(`${pindah.length} PPL tercatat di bawah lebih dari satu PML: ${pindah.slice(0, 5).map((p) => p.nama).join(", ")}${pindah.length > 5 ? ", ..." : ""}.`);
  const tanpaCadangan = Array.from(sls).filter(([, s]) => s.cadangan === 0).length;
  if (tanpaCadangan > 0 && tanpaCadangan < sls.size) out.push(`${tanpaCadangan} dari ${sls.size} SLS tidak punya sampel cadangan.`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pengelompokan dan rekap
// ---------------------------------------------------------------------------------------------------------------------------------

export type SampelTampil = SampelRow & {
  /** utama yang sudah diganti: baris cadangan penggantinya */
  pengganti: SampelRow | null;
  /** cadangan yang sudah dipakai: baris utama yang digantikannya */
  menggantikan: SampelRow | null;
};
export type GrupSls = {
  kode_sls: string;
  ppl_akun_id: number;
  ppl_nama: string;
  pml_akun_id: number;
  pml_nama: string;
  utama: SampelTampil[];
  cadangan: SampelTampil[];
  diganti: number;
  cadangan_tersisa: number;
};
export type GrupPpl = { ppl_akun_id: number; ppl_nama: string; pml_akun_id: number; pml_nama: string; sls: GrupSls[]; utama: number; cadangan: number; diganti: number; cadangan_tersisa: number };
export type RekapSampel = { sls: number; ppl: number; pml: number; utama: number; cadangan: number; diganti: number; cadangan_tersisa: number; berkoordinat: number };

const urutKode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sampel -> kelompok per SLS (baris dengan PPL yang sama dalam satu SLS dikelompokkan; urut kode SLS lalu urutan berkas). */
export function kelompokSls(rows: readonly SampelRow[]): GrupSls[] {
  const peta = new Map<number, SampelRow>(rows.map((r) => [r.id, r]));
  const penggantiDari = new Map<number, SampelRow>();
  for (const r of rows) if (r.status === "cadangan" && r.menggantikan_id != null) penggantiDari.set(r.menggantikan_id, r);
  const grup = new Map<string, GrupSls>();
  const urut = [...rows].sort((a, b) => a.urut - b.urut || a.id - b.id);
  for (const r of urut) {
    const kunci = `${r.kode_sls}|${r.ppl_akun_id}`;
    let g = grup.get(kunci);
    if (!g) {
      g = { kode_sls: r.kode_sls, ppl_akun_id: r.ppl_akun_id, ppl_nama: r.ppl_nama, pml_akun_id: r.pml_akun_id, pml_nama: r.pml_nama, utama: [], cadangan: [], diganti: 0, cadangan_tersisa: 0 };
      grup.set(kunci, g);
    }
    const t: SampelTampil = { ...r, pengganti: penggantiDari.get(r.id) ?? null, menggantikan: r.menggantikan_id != null ? peta.get(r.menggantikan_id) ?? null : null };
    if (r.status === "utama") {
      g.utama.push(t);
      if (t.pengganti) g.diganti++;
    } else {
      g.cadangan.push(t);
      if (!r.menggantikan_id) g.cadangan_tersisa++;
    }
  }
  return Array.from(grup.values()).sort((a, b) => urutKode(a.kode_sls, b.kode_sls) || a.ppl_nama.localeCompare(b.ppl_nama));
}

/** Kelompok SLS -> kelompok per PPL (urut nama PPL). */
export function kelompokPpl(rows: readonly SampelRow[]): GrupPpl[] {
  const peta = new Map<number, GrupPpl>();
  for (const g of kelompokSls(rows)) {
    const p = peta.get(g.ppl_akun_id) ?? { ppl_akun_id: g.ppl_akun_id, ppl_nama: g.ppl_nama, pml_akun_id: g.pml_akun_id, pml_nama: g.pml_nama, sls: [], utama: 0, cadangan: 0, diganti: 0, cadangan_tersisa: 0 };
    p.sls.push(g);
    p.utama += g.utama.length;
    p.cadangan += g.cadangan.length;
    p.diganti += g.diganti;
    p.cadangan_tersisa += g.cadangan_tersisa;
    peta.set(g.ppl_akun_id, p);
  }
  return Array.from(peta.values()).sort((a, b) => a.ppl_nama.localeCompare(b.ppl_nama));
}

export function rekapSampel(rows: readonly SampelRow[]): RekapSampel {
  const utama = rows.filter((r) => r.status === "utama").length;
  const cadangan = rows.filter((r) => r.status === "cadangan");
  const diganti = cadangan.filter((r) => r.menggantikan_id != null).length;
  return {
    sls: new Set(rows.map((r) => r.kode_sls)).size,
    ppl: new Set(rows.map((r) => r.ppl_akun_id)).size,
    pml: new Set(rows.map((r) => r.pml_akun_id)).size,
    utama,
    cadangan: cadangan.length,
    diganti,
    cadangan_tersisa: cadangan.length - diganti,
    berkoordinat: rows.filter((r) => r.lat != null && r.lng != null).length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Penggantian sampel
// ---------------------------------------------------------------------------------------------------------------------------------

export const MIN_ALASAN = 3;
export const MAKS_ALASAN = 300;

export type PermintaanGanti = { utama_id: number; cadangan_id: number; alasan: string };
/** Permintaan ganti dari JSON tak tepercaya. */
export function periksaPermintaanGanti(mentah: unknown): { ok: true; data: PermintaanGanti } | { ok: false; pesan: string } {
  const r = (typeof mentah === "object" && mentah !== null ? mentah : {}) as Record<string, unknown>;
  const utama = Number(r.utama_id);
  const cadangan = Number(r.cadangan_id);
  const alasan = typeof r.alasan === "string" ? r.alasan.replace(/\s+/g, " ").trim() : "";
  if (!Number.isInteger(utama) || utama <= 0 || !Number.isInteger(cadangan) || cadangan <= 0) return { ok: false, pesan: "Sampel utama dan cadangan harus dipilih." };
  if (alasan.length < MIN_ALASAN) return { ok: false, pesan: "Alasan penggantian wajib diisi (singkat saja, mis. responden pindah)." };
  if (alasan.length > MAKS_ALASAN) return { ok: false, pesan: `Alasan terlalu panjang (maksimal ${MAKS_ALASAN} huruf).` };
  return { ok: true, data: { utama_id: utama, cadangan_id: cadangan, alasan } };
}

/** Cadangan yang masih bisa dipakai untuk menggantikan sampel utama ini: satu SLS, belum terpakai. */
export function cadanganTersedia(utama: SampelRow, rows: readonly SampelRow[]): SampelRow[] {
  return rows.filter((r) => r.status === "cadangan" && r.menggantikan_id == null && r.kode_sls === utama.kode_sls && r.ppl_akun_id === utama.ppl_akun_id).sort((a, b) => a.urut - b.urut);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Navigasi, templat, ringkasan modul
// ---------------------------------------------------------------------------------------------------------------------------------

export const tautanPetaSampel = (lat: number, lng: number): string => `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(7)},${lng.toFixed(7)}&travelmode=driving`;
export const tautanLihatSampel = (lat: number, lng: number): string => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(7)},${lng.toFixed(7)}`;
export const kodeSlsPendek = (kode: string): string => (kode.length > 6 ? `…${kode.slice(-6)}` : kode);

/** Isi templat Excel (judul kolom + contoh) untuk `aoa_to_sheet`. Kolom Kode Wilayah berupa teks agar nol di depan tidak hilang. */
export function templatSampel(): string[][] {
  return [
    [...KOLOM_TEMPLAT_SAMPEL],
    ["1303010001000100", "Contoh Responden Satu", "Anggota ruta lain (boleh dikosongkan)", "Utama", "-0.7894210", "100.6502310", "Nama PPL (sesuai penugasan)", "Nama PML (sesuai penugasan)"],
    ["1303010001000100", "Contoh Responden Dua", "", "Utama", "-0.7897120", "100.6509940", "Nama PPL (sesuai penugasan)", "Nama PML (sesuai penugasan)"],
    ["1303010001000100", "Contoh Cadangan Satu", "", "Cadangan", "", "", "Nama PPL (sesuai penugasan)", "Nama PML (sesuai penugasan)"],
  ];
}
export const PETUNJUK_TEMPLAT = [
  "Satu baris = satu sampel. Kode Wilayah ditulis sebagai TEKS (10-16 digit); SLS = 14 digit pertama.",
  "Status Sampel diisi Utama atau Cadangan. Latitude/Longitude boleh dikosongkan; pisah desimal dengan titik atau koma.",
  "Nama PPL dan Nama PML harus sama dengan nama petugas yang sudah ditugaskan pada kegiatan ini (gelar di belakang koma boleh dihilangkan).",
  "Baris contoh pada lembar Templat harus dihapus sebelum diunggah.",
];

export type InfoSampel = { kegiatan_id: number; peran: "ppl" | "pml"; sls: number; utama: number; cadangan: number; diganti: number; ppl: number };
export const ketModulSampel = (f: InfoSampel): string => {
  const dasar = `${f.sls} SLS · ${f.utama} sampel utama`;
  const sisa = f.diganti > 0 ? ` · ${f.diganti} diganti cadangan` : "";
  return f.peran === "pml" ? `${f.ppl} PPL · ${dasar}${sisa}` : `${dasar}${sisa}`;
};

export type DataSampelSaya = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  peran: "ppl" | "pml";
  saya: { id: number; nama: string };
  konfig: KonfigSampel;
  sampel: SampelRow[];
};

export type RiwayatUnggah = { id: number; nama_berkas: string | null; diunggah_at: string; oleh: string | null; jumlah: number; utama: number; cadangan: number; aktif: boolean };
export type DataSampelAdmin = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  boleh_kelola: boolean;
  /** false = migrasi belum dijalankan (tabel belum ada) */
  siap: boolean;
  konfig: KonfigSampel;
  rekap: RekapSampel;
  sampel: SampelRow[];
  riwayat: RiwayatUnggah[];
  /** sumber pencocokan: jumlah PPL dan PML yang sudah ditugaskan pada kegiatan */
  petugas: { ppl: number; pml: number };
};
