// lib/seleksiNilai.ts  (logika murni, tanpa DB/React)
//
// (31 Okt 2026) Paket 4 seleksi petugas: kertas kerja penilaian (variabel berbobot), skor akhir, peringkat per wilayah menurut level yang dipilih PJ,
// penetapan lulus/cadangan, dan pesan pengumuman. Sumber nilai otomatis: tes seleksi, rekam jejak (nilai kinerja 1-5), jarak ke wilayah sampel terdekat.
// Variabel kustom diisi PJ (0-100). Nilai yang belum ada dihitung 0 dan ditandai "kosong" agar PJ tahu skornya belum utuh.

import { normalWilayah, type PeringkatLevel, type WilayahSeleksi } from "@/lib/seleksiSyarat";
import { alamatSeleksi } from "@/lib/seleksiDaftar";

export type SumberVariabel = "tes" | "rekam_jejak" | "jarak" | "manual";
export type InputVariabel = { kode: string; nama: string; sumber: SumberVariabel; bobot: number };
export type Variabel = InputVariabel & { id: number; urutan: number };

export const MAKS_VARIABEL = 12;
export const MAKS_CADANGAN = 3;
/** Jarak penuh-nol bila syarat jarak seleksi tidak aktif. */
export const JARAK_NOL_BAWAAN_KM = 20;
export const LABEL_SUMBER: Record<SumberVariabel, string> = { tes: "Nilai tes seleksi", rekam_jejak: "Rekam jejak (nilai kinerja)", jarak: "Kedekatan domisili", manual: "Diisi PJ" };

export const VARIABEL_BAWAAN: InputVariabel[] = [
  { kode: "tes", nama: "Nilai tes seleksi", sumber: "tes", bobot: 40 },
  { kode: "rekam_jejak", nama: "Rekam jejak", sumber: "rekam_jejak", bobot: 40 },
  { kode: "jarak", nama: "Kedekatan domisili", sumber: "jarak", bobot: 20 },
];

const bulat = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const SUMBER_SAH: SumberVariabel[] = ["tes", "rekam_jejak", "jarak", "manual"];

function kodeDariNama(nama: string): string {
  return nama.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function periksaVariabel(isi: unknown): { ok: true; nilai: InputVariabel[] } | { ok: false; galat: string[] } {
  if (!Array.isArray(isi)) return { ok: false, galat: ["Daftar variabel tidak terbaca."] };
  const galat: string[] = [];
  if (isi.length === 0) galat.push("Minimal satu variabel penilaian.");
  if (isi.length > MAKS_VARIABEL) galat.push(`Maksimal ${MAKS_VARIABEL} variabel.`);
  const hasil: InputVariabel[] = [];
  const kodeDipakai = new Set<string>();
  const otomatis = new Set<SumberVariabel>();
  isi.slice(0, MAKS_VARIABEL).forEach((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const awal = `Variabel ${i + 1}`;
    const nama = typeof o.nama === "string" ? o.nama.replace(/\s+/g, " ").trim() : "";
    if (!nama || nama.length > 60 || /[<>`]/.test(nama)) return void galat.push(`${awal}: nama wajib diisi (maks 60 karakter, tanpa simbol).`);
    const sumber = o.sumber as SumberVariabel;
    if (!SUMBER_SAH.includes(sumber)) return void galat.push(`${awal}: sumber nilai tidak dikenal.`);
    if (sumber !== "manual") {
      if (otomatis.has(sumber)) return void galat.push(`${awal}: sumber "${LABEL_SUMBER[sumber]}" hanya boleh dipakai satu variabel.`);
      otomatis.add(sumber);
    }
    const bobot = Number(o.bobot);
    if (!Number.isFinite(bobot) || bobot <= 0 || bobot > 100) return void galat.push(`${awal}: bobot harus angka 1-100.`);
    let kode = sumber === "manual" ? kodeDariNama(nama) : sumber;
    if (!kode) kode = `v${i + 1}`;
    if (kodeDipakai.has(kode)) kode = `${kode}_${i + 1}`;
    kodeDipakai.add(kode);
    hasil.push({ kode, nama, sumber, bobot: bulat(bobot, 2) });
  });
  if (galat.length) return { ok: false, galat };
  return { ok: true, nilai: hasil };
}

/** Nilai kinerja 1-5 -> 0-100. */
export function nilaiRekamJejak(n: number | null | undefined): number | null {
  if (typeof n !== "number" || !(n >= 1 && n <= 5)) return null;
  return bulat((n / 5) * 100, 1);
}

/** Semakin dekat semakin tinggi: 100 pada 0 km, 0 pada/atas batas. */
export function nilaiJarak(km: number | null | undefined, maksKm: number): number | null {
  if (typeof km !== "number" || !Number.isFinite(km) || !(maksKm > 0)) return null;
  return bulat(Math.max(0, 100 * (1 - km / maksKm)), 1);
}

/** Skor akhir = jumlah(bobot x nilai) / jumlah bobot. Nilai kosong dihitung 0 dan dicatat. */
export function skorAkhir(variabel: { id: number; bobot: number }[], nilai: Map<number, number | null | undefined>): { skor: number; kosong: number[] } {
  let atas = 0;
  let bawah = 0;
  const kosong: number[] = [];
  for (const v of variabel) {
    const n = nilai.get(v.id);
    bawah += v.bobot;
    if (typeof n === "number" && Number.isFinite(n)) atas += v.bobot * Math.min(100, Math.max(0, n));
    else kosong.push(v.id);
  }
  return { skor: bawah > 0 ? bulat(atas / bawah, 2) : 0, kosong };
}

// ---- Peringkat per wilayah ----

export type Peran = "ppl" | "pml";
export type Hasil = "lulus" | "cadangan" | "tidak";
export type PesertaNilai = { akun_id: number; nama: string; peran: Peran; grup: string; skor: number; kosong: number };
export type HasilPeringkat = PesertaNilai & { peringkat: number; hasil: Hasil };

export const GRUP_KABUPATEN = "KABUPATEN";
export const GRUP_TANPA_WILAYAH = "TANPA WILAYAH";

/** Bila level kecamatan/nagari dipilih tetapi tak satu pun wilayah sampel punya kebutuhan, seluruh pendaftar bersaing di level kabupaten. */
export function levelEfektif(level: PeringkatLevel, wilayah: WilayahSeleksi[]): { level: PeringkatLevel; catatan: string | null } {
  if (level === "kabupaten") return { level, catatan: null };
  const adaKuota = wilayah.some((w) => w.kebutuhan_ppl + w.kebutuhan_pml > 0);
  return adaKuota ? { level, catatan: null } : { level: "kabupaten", catatan: "Kebutuhan per wilayah sampel belum diisi, sehingga peringkat dihitung se-kabupaten." };
}

/** Kelompok persaingan seorang pendaftar: domisilinya bila wilayah itu punya sampel; selain itu wilayah sampel terdekat; selain itu domisili apa adanya. */
export function grupPeserta(level: PeringkatLevel, orang: { kecamatan: string | null; nagari: string | null }, wilayah: WilayahSeleksi[], terdekat: string | null): string {
  if (level === "kabupaten") return GRUP_KABUPATEN;
  const ambil = (w: { kecamatan: string | null; nagari: string | null }) => normalWilayah(level === "nagari" ? w.nagari : w.kecamatan);
  const dom = ambil(orang);
  const adaDi = new Set(wilayah.map(ambil).filter(Boolean));
  if (dom && adaDi.has(dom)) return dom;
  const wt = terdekat ? wilayah.find((w) => w.nama === terdekat) : undefined;
  const dekat = wt ? ambil(wt) : "";
  return dekat || dom || GRUP_TANPA_WILAYAH;
}

/** Kuota (lulus) suatu kelompok dan peran. Level kabupaten memakai sisa kebutuhan keseluruhan. */
export function kuotaGrup(level: PeringkatLevel, wilayah: WilayahSeleksi[], sisa: { ppl: number; pml: number }, grup: string, peran: Peran): number {
  if (level === "kabupaten") return Math.max(0, peran === "ppl" ? sisa.ppl : sisa.pml);
  const ambil = (w: WilayahSeleksi) => normalWilayah(level === "nagari" ? w.nagari : w.kecamatan);
  return wilayah.filter((w) => ambil(w) === grup).reduce((t, w) => t + (peran === "ppl" ? w.kebutuhan_ppl : w.kebutuhan_pml), 0);
}

export function susunPeringkat(peserta: PesertaNilai[], kuota: (grup: string, peran: Peran) => number): HasilPeringkat[] {
  const kelompok = new Map<string, PesertaNilai[]>();
  for (const p of peserta) {
    const k = `${p.grup}\u0000${p.peran}`;
    const l = kelompok.get(k);
    if (l) l.push(p);
    else kelompok.set(k, [p]);
  }
  const hasil: HasilPeringkat[] = [];
  for (const daftar of [...kelompok.entries()].sort((a, b) => a[0].localeCompare(b[0], "id")).map((e) => e[1])) {
    daftar.sort((a, b) => b.skor - a.skor || a.kosong - b.kosong || a.nama.localeCompare(b.nama, "id") || a.akun_id - b.akun_id);
    const q = kuota(daftar[0].grup, daftar[0].peran);
    daftar.forEach((p, i) => {
      const no = i + 1;
      hasil.push({ ...p, peringkat: no, hasil: no <= q ? "lulus" : no <= q + MAKS_CADANGAN ? "cadangan" : "tidak" });
    });
  }
  return hasil;
}

// ---- Tes seleksi: jendela ----

export type StatusTesSeleksi = "tidak_ada" | "belum_buka" | "buka" | "mengerjakan" | "selesai" | "terlewat";

export function statusTesSeleksi(o: { aktif: boolean; jumlahSoal: number; buka: string | null; tutup: string | null; sesi: { batas_at: string; selesai_at: string | null } | null; nowMs: number }): StatusTesSeleksi {
  if (o.sesi) return o.sesi.selesai_at || o.nowMs >= Date.parse(o.sesi.batas_at) ? "selesai" : "mengerjakan";
  if (!o.aktif || o.jumlahSoal <= 0 || !o.buka || !o.tutup) return "tidak_ada";
  if (o.nowMs < Date.parse(o.buka)) return "belum_buka";
  if (o.nowMs < Date.parse(o.tutup)) return "buka";
  return "terlewat";
}

export function periksaJadwalTes(buka: unknown, tutup: unknown, durasi: unknown): { ok: true; buka: string; tutup: string; durasi: number } | { ok: false; pesan: string } {
  const b = typeof buka === "string" ? Date.parse(buka) : NaN;
  const t = typeof tutup === "string" ? Date.parse(tutup) : NaN;
  const d = Number(durasi);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return { ok: false, pesan: "Tanggal buka dan tutup tes wajib diisi." };
  if (t <= b) return { ok: false, pesan: "Waktu tutup tes harus setelah waktu buka." };
  if (!Number.isInteger(d) || d < 1 || d > 240) return { ok: false, pesan: "Durasi tes 1-240 menit." };
  return { ok: true, buka: new Date(b).toISOString(), tutup: new Date(t).toISOString(), durasi: d };
}

// ---- Pengumuman dan konfirmasi ----

export type PutusanKonfirmasi = { boleh: boolean; alasan: string | null };

export function putusanKonfirmasi(o: { hasil: string | null; diumumkan: boolean; batas: string | null; nowMs: number }): PutusanKonfirmasi {
  if (!o.diumumkan) return { boleh: false, alasan: "Hasil seleksi belum diumumkan." };
  if (o.hasil !== "lulus") return { boleh: false, alasan: "Konfirmasi hanya untuk peserta yang dinyatakan lulus." };
  if (o.batas && o.nowMs > Date.parse(o.batas)) return { boleh: false, alasan: "Batas konfirmasi sudah lewat. Hubungi penanggung jawab kegiatan." };
  return { boleh: true, alasan: null };
}

export function pesanPengumuman(o: { namaSeleksi: string; namaKegiatan: string; hasil: Hasil; seleksiId: number; infoPelatihan: string | null; batasKonfirmasi: string | null }): { judul: string; isi: string; url: string } {
  const url = alamatSeleksi(o.seleksiId);
  if (o.hasil === "lulus") {
    const info = o.infoPelatihan ? ` ${o.infoPelatihan.trim()}` : "";
    const batas = o.batasKonfirmasi ? ` Konfirmasi paling lambat ${o.batasKonfirmasi}.` : "";
    return { judul: "Selamat, Anda lulus seleksi", isi: `Anda lulus seleksi ${o.namaSeleksi} (${o.namaKegiatan}). Buka aplikasi untuk menyatakan kesediaan.${batas}${info}`.trim(), url };
  }
  if (o.hasil === "cadangan") return { judul: "Hasil seleksi: cadangan", isi: `Anda masuk daftar cadangan seleksi ${o.namaSeleksi}. Anda akan dihubungi bila ada peserta yang berhalangan.`, url };
  return { judul: "Hasil seleksi diumumkan", isi: `Hasil seleksi ${o.namaSeleksi} (${o.namaKegiatan}) sudah diumumkan. Terima kasih telah mendaftar.`, url };
}
