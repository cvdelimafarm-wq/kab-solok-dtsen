// lib/lembarKonfig.ts  (murni; dipakai server DAN klien)
//
// (27 Okt 2026) Pengaturan Lembar Pendataan PER KEGIATAN, supaya beberapa kegiatan (mis. Pendataan Pascabencana, Updating) memakai lembar yang sama dengan istilah berbeda.
// Dua bagian: (1) TOMBOL HASIL: nama, keterangan, warna, bentuk penanda dan pilihan alasan; (2) RADAR sekitar: nyala/mati, radius awal dan batas, pilihan cepat, kecepatan
// sapuan, tampilan awal, kepekaan gerak.
// KEPUTUSAN user: kategori hasil TETAP tiga (terdampak, tidak_terdampak, tidak_ditemukan) -- yang disimpan di database dan dihitung target/monitoring/skor tetap sama.
// Tiap kategori hanya berganti NAMA/WARNA/BENTUK/ALASAN di layar. Contoh Updating: "Terdampak" -> "KK ada, data sesuai"; "Tidak terdampak" -> "KK ada, data berubah";
// "Tidak ditemukan" -> "Pindah / tidak ada". Kegiatan tanpa pengaturan memakai KONFIG_BAWAAN = tampilan Pendataan Pascabencana yang berjalan sekarang.
// "Tidak ditemukan" selalu aktif (KK tak boleh buntu); sekurang-kurangnya satu dari dua kategori "didata" aktif.

import { HASIL_KK, type HasilKk } from "./pendataan";

export const BENTUK_HASIL = ["bulat_penuh", "bulat_kosong", "belah_ketupat", "kotak", "segitiga"] as const;
export type BentukHasil = (typeof BENTUK_HASIL)[number];
export const LABEL_BENTUK: Record<BentukHasil, string> = {
  bulat_penuh: "Bulat penuh",
  bulat_kosong: "Bulat kosong",
  belah_ketupat: "Belah ketupat",
  kotak: "Kotak",
  segitiga: "Segitiga",
};

export type KonfigHasil = {
  aktif: boolean;
  /** tombol hasil dan pesan "Tersimpan: ..." */
  label: string;
  /** kartu saring dan legenda peta */
  label_pendek: string;
  /** label pada daftar KK (lencana kecil) */
  label_pil: string;
  /** keterangan di bawah tombol hasil */
  subteks: string;
  /** warna bilah progres dan penanda */
  warna: string;
  pil_latar: string;
  pil_teks: string;
  bentuk: BentukHasil;
  /** pilihan alasan cepat setelah hasil ditandai; kosong = tanpa alasan */
  alasan: string[];
};

export type TampilanRadar = "radar" | "rincian";
export type KonfigRadar = {
  aktif: boolean;
  radius_awal: number;
  radius_pilihan: number[];
  radius_min: number;
  radius_maks: number;
  /** detik per putaran sapuan */
  putar_detik: number;
  tampilan_awal: TampilanRadar;
  /** hitungan diperbarui bila posisi bergeser sekian meter ... */
  gerak_minimal_m: number;
  /** ... atau sekian detik sudah lewat */
  jeda_detik: number;
};

export type KonfigLembar = { versi: 1; hasil: Record<HasilKk, KonfigHasil>; radar: KonfigRadar };

export const BATAS = {
  label: 40,
  subteks: 100,
  alasanJumlah: 8,
  alasanPanjang: 40,
  radarMin: 10,
  radarMaks: 2000,
  pilihanJumlah: 6,
  putar: [2, 12],
  gerak: [3, 50],
  jeda: [3, 60],
} as const;

export const KONFIG_BAWAAN: KonfigLembar = {
  versi: 1,
  hasil: {
    terdampak: { aktif: true, label: "Didata, terdampak", label_pendek: "Terdampak", label_pil: "Terdampak", subteks: "Keluarga terdampak bencana", warna: "#0F2A52", pil_latar: "#0F2A52", pil_teks: "#FFFFFF", bentuk: "bulat_penuh", alasan: [] },
    tidak_terdampak: { aktif: true, label: "Didata, tidak terdampak", label_pendek: "Tidak terdampak", label_pil: "Tidak", subteks: "Keluarga tidak terdampak", warna: "#4C86E8", pil_latar: "#E6EEFC", pil_teks: "#1F5FD1", bentuk: "bulat_kosong", alasan: [] },
    tidak_ditemukan: {
      aktif: true,
      label: "Tidak ditemukan",
      label_pendek: "Tidak ditemukan",
      label_pil: "Tidak ditemukan",
      subteks: "Rumah kosong, pindah, menolak, atau alamat tidak ada",
      warna: "#B7791F",
      pil_latar: "#FFF4D6",
      pil_teks: "#8A6200",
      bentuk: "belah_ketupat",
      alasan: ["Rumah kosong", "Pindah", "Menolak", "Alamat tidak ada"],
    },
  },
  radar: { aktif: true, radius_awal: 100, radius_pilihan: [50, 100, 200, 500], radius_min: 10, radius_maks: 1000, putar_detik: 4, tampilan_awal: "radar", gerak_minimal_m: 8, jeda_detik: 10 },
};

export const WARNA_BELUM_BILAH = "#CBD6E4";

const WARNA = /^#[0-9a-fA-F]{6}$/;
const adalahObjek = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const rapikan = (x: unknown): string => (typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "");
const jepit = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const angka = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function rapikanAlasan(x: unknown): string[] {
  const hasil: string[] = [];
  if (Array.isArray(x)) {
    for (const a of x) {
      const t = rapikan(a);
      if (t && !hasil.some((h) => h.toLowerCase() === t.toLowerCase())) hasil.push(t.slice(0, BATAS.alasanPanjang));
      if (hasil.length >= BATAS.alasanJumlah) break;
    }
  }
  return hasil;
}

function gabungHasil(mentah: unknown, dasar: KonfigHasil): KonfigHasil {
  const m = adalahObjek(mentah) ? mentah : {};
  const teks = (k: "label" | "label_pendek" | "label_pil" | "subteks", maks: number) => {
    const t = rapikan(m[k]);
    return t ? t.slice(0, maks) : dasar[k];
  };
  const warna = (k: "warna" | "pil_latar" | "pil_teks") => (typeof m[k] === "string" && WARNA.test(m[k] as string) ? (m[k] as string).toUpperCase() : dasar[k]);
  return {
    aktif: typeof m.aktif === "boolean" ? m.aktif : dasar.aktif,
    label: teks("label", BATAS.label),
    label_pendek: teks("label_pendek", BATAS.label),
    label_pil: teks("label_pil", BATAS.label),
    subteks: typeof m.subteks === "string" ? rapikan(m.subteks).slice(0, BATAS.subteks) : dasar.subteks, // subteks boleh dikosongkan
    warna: warna("warna"),
    pil_latar: warna("pil_latar"),
    pil_teks: warna("pil_teks"),
    bentuk: (BENTUK_HASIL as readonly unknown[]).includes(m.bentuk) ? (m.bentuk as BentukHasil) : dasar.bentuk,
    alasan: Array.isArray(m.alasan) ? rapikanAlasan(m.alasan) : [...dasar.alasan],
  };
}

function gabungRadar(mentah: unknown, dasar: KonfigRadar): KonfigRadar {
  const m = adalahObjek(mentah) ? mentah : {};
  const bil = (k: string, a: number, b: number, d: number) => {
    const n = angka(m[k]);
    return n === null ? d : jepit(Math.round(n), a, b);
  };
  const min = bil("radius_min", BATAS.radarMin, BATAS.radarMaks, dasar.radius_min);
  const maks = Math.max(min, bil("radius_maks", BATAS.radarMin, BATAS.radarMaks, dasar.radius_maks));
  let pilihan = dasar.radius_pilihan;
  if (Array.isArray(m.radius_pilihan)) {
    const p = (m.radius_pilihan as unknown[]).map(angka).filter((n): n is number => n !== null).map((n) => jepit(Math.round(n), min, maks));
    pilihan = Array.from(new Set(p)).sort((a, b) => a - b).slice(0, BATAS.pilihanJumlah);
  }
  if (pilihan.length === 0) pilihan = [jepit(dasar.radius_awal, min, maks)];
  return {
    aktif: typeof m.aktif === "boolean" ? m.aktif : dasar.aktif,
    radius_awal: bil("radius_awal", min, maks, jepit(dasar.radius_awal, min, maks)),
    radius_pilihan: pilihan,
    radius_min: min,
    radius_maks: maks,
    putar_detik: bil("putar_detik", BATAS.putar[0], BATAS.putar[1], dasar.putar_detik),
    tampilan_awal: m.tampilan_awal === "rincian" ? "rincian" : m.tampilan_awal === "radar" ? "radar" : dasar.tampilan_awal,
    gerak_minimal_m: bil("gerak_minimal_m", BATAS.gerak[0], BATAS.gerak[1], dasar.gerak_minimal_m),
    jeda_detik: bil("jeda_detik", BATAS.jeda[0], BATAS.jeda[1], dasar.jeda_detik),
  };
}

/** Bacaan LONGGAR: nilai tak sah diganti nilai bawaan; aturan "tidak ditemukan selalu aktif" dan "minimal satu kategori didata aktif" ditegakkan. Tidak pernah gagal. */
export function normalisasiKonfig(mentah: unknown): KonfigLembar {
  const m = adalahObjek(mentah) ? mentah : {};
  const h = adalahObjek(m.hasil) ? m.hasil : {};
  const hasil = {} as Record<HasilKk, KonfigHasil>;
  for (const k of HASIL_KK) hasil[k] = gabungHasil(h[k], KONFIG_BAWAAN.hasil[k]);
  hasil.tidak_ditemukan.aktif = true;
  if (!hasil.terdampak.aktif && !hasil.tidak_terdampak.aktif) hasil.terdampak.aktif = true;
  return { versi: 1, hasil, radar: gabungRadar(m.radar, KONFIG_BAWAAN.radar) };
}

/** Bacaan KETAT untuk simpanan admin: daftar pesan galat ([] = sah). Isian tidak dibetulkan diam-diam. */
export function galatKonfig(mentah: unknown): string[] {
  const g: string[] = [];
  if (!adalahObjek(mentah)) return ["Isian pengaturan tidak terbaca."];
  const h = adalahObjek(mentah.hasil) ? mentah.hasil : null;
  if (!h) g.push("Bagian tombol hasil tidak ada.");
  const nama: Record<HasilKk, string> = { terdampak: "Hasil 1 (terdampak)", tidak_terdampak: "Hasil 2 (tidak terdampak)", tidak_ditemukan: "Hasil 3 (tidak ditemukan)" };
  if (h) {
    for (const k of HASIL_KK) {
      const x = adalahObjek(h[k]) ? h[k] : null;
      if (!x) {
        g.push(`${nama[k]}: pengaturan tidak ada.`);
        continue;
      }
      for (const [f, ket, maks] of [["label", "Nama tombol", BATAS.label], ["label_pendek", "Nama singkat", BATAS.label], ["label_pil", "Nama pada daftar KK", BATAS.label]] as const) {
        const t = rapikan(x[f]);
        if (!t) g.push(`${nama[k]}: ${ket} wajib diisi.`);
        else if (t.length > maks) g.push(`${nama[k]}: ${ket} maksimal ${maks} huruf.`);
      }
      if (rapikan(x.subteks).length > BATAS.subteks) g.push(`${nama[k]}: keterangan maksimal ${BATAS.subteks} huruf.`);
      for (const f of ["warna", "pil_latar", "pil_teks"] as const) if (typeof x[f] !== "string" || !WARNA.test(x[f] as string)) g.push(`${nama[k]}: warna "${f}" harus berbentuk #RRGGBB.`);
      if (!(BENTUK_HASIL as readonly unknown[]).includes(x.bentuk)) g.push(`${nama[k]}: bentuk tidak dikenal.`);
      if (!Array.isArray(x.alasan)) g.push(`${nama[k]}: daftar alasan tidak terbaca.`);
      else {
        const a = x.alasan.map(rapikan);
        if (a.length > BATAS.alasanJumlah) g.push(`${nama[k]}: alasan maksimal ${BATAS.alasanJumlah} pilihan.`);
        if (a.some((t) => !t)) g.push(`${nama[k]}: alasan tidak boleh kosong.`);
        if (a.some((t) => t.length > BATAS.alasanPanjang)) g.push(`${nama[k]}: tiap alasan maksimal ${BATAS.alasanPanjang} huruf.`);
        if (new Set(a.map((t) => t.toLowerCase())).size !== a.length) g.push(`${nama[k]}: ada alasan yang sama.`);
      }
      if (typeof x.aktif !== "boolean") g.push(`${nama[k]}: status aktif tidak terbaca.`);
    }
    const a1 = adalahObjek(h.terdampak) && h.terdampak.aktif === true;
    const a2 = adalahObjek(h.tidak_terdampak) && h.tidak_terdampak.aktif === true;
    if (!a1 && !a2) g.push("Sekurang-kurangnya satu dari hasil 1 atau hasil 2 harus aktif.");
    if (!(adalahObjek(h.tidak_ditemukan) && h.tidak_ditemukan.aktif === true)) g.push("Hasil 3 (tidak ditemukan) harus selalu aktif.");
    const labels = HASIL_KK.filter((k) => adalahObjek(h[k]) && h[k] && (h[k] as Record<string, unknown>).aktif === true).map((k) => rapikan((h[k] as Record<string, unknown>).label).toLowerCase());
    if (new Set(labels).size !== labels.length) g.push("Nama tombol aktif tidak boleh sama.");
  }
  const r = adalahObjek(mentah.radar) ? mentah.radar : null;
  if (!r) g.push("Bagian radar tidak ada.");
  else {
    const dalam = (f: string, ket: string, a: number, b: number): number | null => {
      const n = angka(r[f]);
      if (n === null || !Number.isInteger(n) || n < a || n > b) {
        g.push(`Radar: ${ket} harus bilangan bulat ${a}-${b}.`);
        return null;
      }
      return n;
    };
    if (typeof r.aktif !== "boolean") g.push("Radar: status aktif tidak terbaca.");
    const min = dalam("radius_min", "radius terkecil (m)", BATAS.radarMin, BATAS.radarMaks);
    const maks = dalam("radius_maks", "radius terbesar (m)", BATAS.radarMin, BATAS.radarMaks);
    if (min !== null && maks !== null && min > maks) g.push("Radar: radius terkecil tidak boleh lebih besar dari radius terbesar.");
    const awal = dalam("radius_awal", "radius awal (m)", BATAS.radarMin, BATAS.radarMaks);
    if (min !== null && maks !== null && awal !== null && (awal < min || awal > maks)) g.push("Radar: radius awal harus di antara radius terkecil dan terbesar.");
    if (!Array.isArray(r.radius_pilihan) || r.radius_pilihan.length === 0 || r.radius_pilihan.length > BATAS.pilihanJumlah) g.push(`Radar: pilihan cepat radius 1-${BATAS.pilihanJumlah} angka.`);
    else {
      const p = r.radius_pilihan.map(angka);
      if (p.some((n) => n === null || !Number.isInteger(n))) g.push("Radar: pilihan cepat radius harus bilangan bulat.");
      else if (min !== null && maks !== null && p.some((n) => (n as number) < min || (n as number) > maks)) g.push("Radar: pilihan cepat radius harus di antara radius terkecil dan terbesar.");
      else if (new Set(p).size !== p.length) g.push("Radar: pilihan cepat radius tidak boleh kembar.");
    }
    dalam("putar_detik", "detik per putaran sapuan", BATAS.putar[0], BATAS.putar[1]);
    dalam("gerak_minimal_m", "gerak minimal (m)", BATAS.gerak[0], BATAS.gerak[1]);
    dalam("jeda_detik", "jeda pembaruan (detik)", BATAS.jeda[0], BATAS.jeda[1]);
    if (r.tampilan_awal !== "radar" && r.tampilan_awal !== "rincian") g.push("Radar: tampilan awal harus radar atau rincian.");
  }
  return g;
}

/** Simpanan admin sah -> bentuk rapi (urut, tanpa spasi ganda). Panggil setelah galatKonfig kosong. */
export function rapikanKonfig(mentah: unknown): KonfigLembar {
  const k = normalisasiKonfig(mentah);
  k.radar.radius_pilihan = [...k.radar.radius_pilihan].sort((a, b) => a - b);
  return k;
}

export const samaDenganBawaan = (k: KonfigLembar): boolean => JSON.stringify(normalisasiKonfig(k)) === JSON.stringify(KONFIG_BAWAAN);
export const salinBawaan = (): KonfigLembar => salin(KONFIG_BAWAAN);

/** Kategori yang tombolnya tampil, urut tetap. */
export const hasilAktif = (k: KonfigLembar): HasilKk[] => HASIL_KK.filter((h) => k.hasil[h].aktif);

/** Lencana kecil pada daftar KK: [latar, teks, label]. null = belum didata. */
export function lencanaHasil(k: KonfigLembar, hasil: HasilKk | null): [string, string, string] {
  if (!hasil) return ["#EEF2F7", "#5B6B84", "Belum"];
  const h = k.hasil[hasil];
  return [h.pil_latar, h.pil_teks, h.label_pil];
}

/** Bentuk penanda per kategori untuk peta dan legenda. */
export const bentukPeta = (k: KonfigLembar): Record<HasilKk, BentukHasil> => ({
  terdampak: k.hasil.terdampak.bentuk,
  tidak_terdampak: k.hasil.tidak_terdampak.bentuk,
  tidak_ditemukan: k.hasil.tidak_ditemukan.bentuk,
});

/** Contoh siap pakai untuk kegiatan Updating (menjaga tidak ada KK terlewat): tiga kategori tetap, hanya istilah/warna/bentuk/alasan/radar yang berganti. Bisa diubah lagi. */
export function contohUpdating(): KonfigLembar {
  const k = salinBawaan();
  k.hasil.terdampak = { ...k.hasil.terdampak, label: "KK ada, data sesuai", label_pendek: "Sesuai", label_pil: "Sesuai", subteks: "Keluarga ada dan datanya masih sama", warna: "#157A3E", pil_latar: "#E3F6EC", pil_teks: "#13794B", bentuk: "bulat_penuh", alasan: [] };
  k.hasil.tidak_terdampak = { ...k.hasil.tidak_terdampak, label: "KK ada, data berubah", label_pendek: "Berubah", label_pil: "Berubah", subteks: "Anggota, alamat atau keterangan lain berubah", warna: "#4C86E8", pil_latar: "#E6EEFC", pil_teks: "#1F5FD1", bentuk: "kotak", alasan: ["Anggota bertambah", "Anggota berkurang", "Pindah alamat", "Data lain berubah"] };
  k.hasil.tidak_ditemukan = { ...k.hasil.tidak_ditemukan, label: "Pindah / tidak ada", label_pendek: "Pindah/tidak ada", label_pil: "Pindah", subteks: "Rumah kosong, pindah, atau tidak ditemukan" };
  k.radar = { ...k.radar, radius_awal: 50, radius_pilihan: [30, 50, 100, 200], radius_maks: 500, gerak_minimal_m: 6, jeda_detik: 8 };
  return k;
}
