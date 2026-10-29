// lib/monitorKinerja.ts
//
// (19 Okt 2026) Tab Monitoring di Kelola Pendataan -- Fase 2-4: Transport lokal, Poin kinerja per hari, Perkiraan kebutuhan anggaran.
// Fungsi MURNI (tanpa database/jaringan) supaya mudah diuji; datanya disusun oleh lib/portal/pendataanKinerja.ts (server).
//
// Aturan (keputusan user 18 Okt 2026 + rancangan-skor-kinerja-harian-target-harian):
//  - Poin harian PPL = 5 x KK terdampak + 1 x KK tidak terdampak + poin jarak (maks 15 poin jarak, hanya bila ada KK didata hari itu). Target = 1 O-K.
//    (20 Okt 2026) Aturan MENURUT TANGGAL, tidak berlaku mundur (lib/skorKinerja.ts: RIWAYAT_ATURAN): 15-19 Okt target 45 poin & 1 poin/km; 20-28 Okt target 60 poin; mulai 29 Okt target 75 poin (poin jarak tetap 1 poin/km).
//    ATURAN di bawah = aturan yang berlaku SEKARANG (dipakai untuk perkiraan ke depan); hari yang sudah berlalu memakai aturan tanggalnya.
//  - Realisasi O-K: hari kerja LENGKAP (laporan + foto) saja; sebelum 15 Okt tiap hari lengkap dihitung penuh (1 O-K); mulai 15 Okt sesuai poin dengan HUTANG
//    kumulatif (poin hari berikutnya menutup hutang lebih dulu; kelebihan di atas target tidak menambah), pecahan O-K dibulatkan ke bawah.
//    Rumus per hari: kredit += min(poin, target + hutang); hutang += target - min(poin, target + hutang); O-K = lantai(kredit / target).
//  - Jarak realisasi = jarak jalan (OSRM); perkiraan sisa = 1,3 x garis lurus.
//  - Rangkuman ini adalah PERKIRAAN pemantauan, bukan angka pembayaran.

import { ATURAN_POIN, ATURAN_POIN_V1, aturanUntukTanggal, hitungRealisasi, poinJarakKm } from "@/lib/skorKinerja";

export type PeranKinerja = "ppl" | "pml" | "korwil";
export type MetodeJarak = "jalan" | "perkiraan" | "tanpa_rumah" | "tanpa_titik" | "tidak_ada";

export const ATURAN = {
  poinTerdampak: 5,
  poinTidakTerdampak: 1,
  poinPerKm: ATURAN_POIN.poinPerKm, // tetap 1 poin per km
  maksPoinJarak: ATURAN_POIN.maksPoinJarak,
  poinPerKmLebih: ATURAN_POIN.poinPerKmLebih, // 0,7 poin per km di atas 15 km (mulai 29 Okt 2026)
  targetHarian: ATURAN_POIN.targetHarian, // 75 poin mulai 29 Okt 2026 (60 pada 20-28 Okt, 45 pada 15-19 Okt)
  mulaiBobot: "2026-10-15", // awal penilaian bobot (aturan lama 15-19 Okt)
  faktorJalan: 1.3,
} as const;

export type HariOrang = {
  tanggal: string; // YYYY-MM-DD (WIB)
  hari_kerja: boolean;
  lengkap: boolean; // laporan + foto memenuhi aturan kegiatan (penilai yang sama dengan Monitoring Lapangan)
  ada_laporan: boolean;
  jumlah_foto: number;
  aktif: boolean; // ada hasil lapangan (identifikasi / KK berhasil / tidak ditemukan)
  terdampak: number;
  tidak_terdampak: number;
  tidak_ditemukan: number;
  km: number;
  metode: MetodeJarak;
};
export type OrangKinerja = {
  akun_id: number;
  nama: string;
  peran: PeranKinerja;
  pml_id: number | null;
  pml_nama: string | null;
  /** hanya PPL: sisa KK di porsi (target per PPL dikurangi didata), dan jarak garis lurus rumah -> pusat KK yang tersisa di wilayah tim */
  sisa_kk: number;
  rumah_ke_sisa_km: number | null;
  hari: HariOrang[];
};
export type DataKinerja = {
  sekarang: string;
  hari_ini: string;
  mulai_kegiatan: string;
  mulai_bobot: string;
  batas: string; // batas akhir kegiatan
  tenggang_hari: number;
  tarif: Record<PeranKinerja, number>;
  kuota: Record<PeranKinerja, number | null>;
  orang: OrangKinerja[];
  /** jumlah rute yang masih memakai perkiraan karena jarak jalan belum selesai dihitung (muat ulang sebentar lagi) */
  tertunda: number;
  /** false bila OSRM tidak tersedia: semua jarak berupa perkiraan */
  osrm: boolean;
};

// ----------------------------------------------------------------------------------------------- tanggal
export function geser(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Minggu ... 6 = Sabtu */
export const hariMinggu = (tanggal: string): number => new Date(`${tanggal}T00:00:00Z`).getUTCDay();
export function daftarTanggal(dari: string, sampai: string): string[] {
  const out: string[] = [];
  for (let t = dari; t <= sampai && out.length < 400; t = geser(t, 1)) out.push(t);
  return out;
}
export type PolaKerja = "sen_sab" | "sen_jum" | "setiap";
export const LABEL_POLA: Record<PolaKerja, string> = { sen_sab: "Senin – Sabtu", sen_jum: "Senin – Jumat", setiap: "Setiap hari" };
export function hariKerjaKalender(tanggal: string, pola: PolaKerja): boolean {
  const h = hariMinggu(tanggal);
  return pola === "setiap" ? true : pola === "sen_sab" ? h !== 0 : h >= 1 && h <= 5;
}
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const tglPendek = (t: string) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;

// ----------------------------------------------------------------------------------------------- jarak / rute
export type Titik = { lat: number; lng: number };
export function haversineKm(a: Titik, b: Titik): number {
  const R = 6371.0088;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function pusatTitik(titik: Titik[]): Titik | null {
  if (titik.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const t of titik) {
    lat += t.lat;
    lng += t.lng;
  }
  return { lat: lat / titik.length, lng: lng / titik.length };
}
/** Rute sehari: rumah -> pusat tiap Sub SLS (urut waktu) -> rumah. null bila tidak ada rumah atau tidak ada titik. */
export function susunRute(rumah: Titik | null, pusat: (Titik | null)[]): Titik[] | null {
  const titik = pusat.filter((t): t is Titik => t !== null);
  if (!rumah || titik.length === 0) return null;
  return [rumah, ...titik, rumah];
}
/** Jarak perkiraan = garis lurus tiap ruas x 1,3, dibulatkan 0,01 km. */
export function jarakPerkiraanKm(rute: Titik[]): number {
  let km = 0;
  for (let i = 1; i < rute.length; i++) km += haversineKm(rute[i - 1], rute[i]);
  return Math.round(km * ATURAN.faktorJalan * 100) / 100;
}
export const kunciRute = (rute: Titik[]): string => rute.map((t) => `${t.lat.toFixed(5)},${t.lng.toFixed(5)}`).join("|");
/** Urutan Sub SLS pada satu hari menurut waktu penandaan pertama (tanpa kembar). */
export function urutanSub(tanda: { idsubsls: string; waktu: number }[]): string[] {
  const awal = new Map<string, number>();
  for (const t of tanda) {
    const a = awal.get(t.idsubsls);
    if (a === undefined || t.waktu < a) awal.set(t.idsubsls, t.waktu);
  }
  return [...awal.entries()].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0])).map(([id]) => id);
}
/** Tanggal WIB (YYYY-MM-DD) dari waktu epoch ms. */
export function tanggalWib(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------------------------- Fase 2: transport lokal
export type KelasHari = "lengkap" | "sebagian" | "kosong" | "anomali" | "tidak_ada";
export const LABEL_KELAS: Record<KelasHari, string> = { lengkap: "Lengkap", sebagian: "Sebagian", kosong: "Kosong", anomali: "Anomali", tidak_ada: "Tidak ada" };

/**
 *  - hari kerja dipilih, laporan DAN foto belum ada sama sekali -> kosong
 *  - hari kerja dipilih, ada hasil lapangan, laporan + foto memenuhi aturan -> lengkap
 *  - hari kerja dipilih, selain itu (hasil belum ada atau laporan/foto belum penuh) -> sebagian
 *  - bukan hari kerja dipilih tetapi ada hasil/laporan/foto -> anomali (kolom terpisah)
 */
export function kelasHari(h: HariOrang): KelasHari {
  if (h.hari_kerja) {
    if (!h.ada_laporan && h.jumlah_foto === 0) return "kosong";
    return h.aktif && h.lengkap ? "lengkap" : "sebagian";
  }
  return h.aktif || h.ada_laporan || h.jumlah_foto > 0 ? "anomali" : "tidak_ada";
}

export type BarisTransport = {
  akun_id: number;
  nama: string;
  peran: PeranKinerja;
  pml_id: number | null;
  pml_nama: string | null;
  hari_kerja: number;
  lengkap: number;
  sebagian: number;
  kosong: number;
  anomali: number;
  tanggal_kosong: string[];
  tanggal_sebagian: string[];
  tanggal_anomali: string[];
};
export type TotalTransport = { orang: number; hari_kerja: number; lengkap: number; sebagian: number; kosong: number; anomali: number };

export function susunTransport(orang: OrangKinerja[], dari: string | null, sampai: string | null): { baris: BarisTransport[]; total: TotalTransport } {
  const baris: BarisTransport[] = orang.map((o) => {
    const b: BarisTransport = { akun_id: o.akun_id, nama: o.nama, peran: o.peran, pml_id: o.pml_id, pml_nama: o.pml_nama, hari_kerja: 0, lengkap: 0, sebagian: 0, kosong: 0, anomali: 0, tanggal_kosong: [], tanggal_sebagian: [], tanggal_anomali: [] };
    for (const h of o.hari) {
      if ((dari && h.tanggal < dari) || (sampai && h.tanggal > sampai)) continue;
      const k = kelasHari(h);
      if (h.hari_kerja) b.hari_kerja++;
      if (k === "lengkap") b.lengkap++;
      else if (k === "sebagian") (b.sebagian++, b.tanggal_sebagian.push(h.tanggal));
      else if (k === "kosong") (b.kosong++, b.tanggal_kosong.push(h.tanggal));
      else if (k === "anomali") (b.anomali++, b.tanggal_anomali.push(h.tanggal));
    }
    return b;
  });
  const total: TotalTransport = { orang: baris.length, hari_kerja: 0, lengkap: 0, sebagian: 0, kosong: 0, anomali: 0 };
  for (const b of baris) {
    total.hari_kerja += b.hari_kerja;
    total.lengkap += b.lengkap;
    total.sebagian += b.sebagian;
    total.kosong += b.kosong;
    total.anomali += b.anomali;
  }
  return { baris, total };
}
export const persenLengkap = (b: Pick<BarisTransport, "hari_kerja" | "lengkap">) => (b.hari_kerja > 0 ? Math.round((b.lengkap / b.hari_kerja) * 100) : 0);

// ----------------------------------------------------------------------------------------------- Fase 3: poin harian
export type PoinHari = { poin_kk: number; poin_jarak: number; total: number; persen: number };
/** Aturan poin untuk suatu tanggal (sebelum 15 Okt: aturan lama, hanya untuk tampilan). */
const aturanTanggal = (t?: string) => (t ? (aturanUntukTanggal(t) ?? ATURAN_POIN_V1) : ATURAN_POIN);
/** Target harian (poin) pada suatu tanggal. */
export const targetTanggal = (t?: string): number => aturanTanggal(t).targetHarian;
export function poinHari(h: Pick<HariOrang, "terdampak" | "tidak_terdampak" | "km"> & { tidak_ditemukan?: number; tanggal?: string }): PoinHari {
  // Sama dengan hitungPoinHari() di lib/skorKinerja.ts: poin jarak berlaku bila minimal 1 KK ditandai hari itu
  // (termasuk "tidak ditemukan", yang sendiri bernilai 0 poin); jarak dibulatkan 2 desimal, maks maksPoinJarak. Aturan dipilih menurut tanggal hari itu.
  const a = aturanTanggal(h.tanggal);
  const poinKk = h.terdampak * a.poinTerdampak + h.tidak_terdampak * a.poinTidakTerdampak;
  const adaKk = h.terdampak + h.tidak_terdampak + (h.tidak_ditemukan ?? 0) > 0;
  const poinJarak = adaKk ? poinJarakKm(h.km, a) : 0;
  const total = Math.round((poinKk + poinJarak) * 100) / 100;
  return { poin_kk: poinKk, poin_jarak: poinJarak, total, persen: Math.round((total / a.targetHarian) * 100) };
}
const bulat2 = (x: number) => Math.round(x * 100) / 100;

export type RealisasiOk = { ok: number; kredit: number; hutang: number; hutang_ok: number; hari_dihitung: number };
/** Realisasi O-K satu PPL (lihat aturan di kepala berkas): memakai hitungRealisasi (aturan per tanggal, hutang dalam O-K). Hanya hari kerja lengkap yang dihitung. */
export function realisasiPpl(hari: HariOrang[], sampai?: string): RealisasiOk {
  const hs = hari
    .filter((h) => h.hari_kerja && h.lengkap && !(sampai && h.tanggal > sampai))
    .map((h) => ({ tanggal: h.tanggal, lengkap: true, terdampak: h.terdampak, tidak_terdampak: h.tidak_terdampak, tidak_ditemukan: h.tidak_ditemukan, km: h.km }));
  const r = hitungRealisasi(hs);
  // kredit = poin yang terkredit (menutup hutang + untuk hari itu sendiri), masing-masing menurut aturan tanggalnya
  const kredit = r.rincian.reduce((a, x) => a + x.untuk_hutang + x.kredit_hari, 0);
  return { ok: r.ok_dibayar, kredit: bulat2(kredit), hutang: r.hutang_poin, hutang_ok: r.hutang_ok, hari_dihitung: r.hari_dihitung };
}
/** Realisasi PML / korwil: tiap hari kerja lengkap = 1 O-K (tanpa poin). */
export function realisasiHariKerja(hari: HariOrang[]): number {
  return hari.filter((h) => h.hari_kerja && h.lengkap).length;
}

export type KelasPoin = "penuh" | "sedang" | "rendah" | "kosong";
export const kelasPoin = (persen: number | null): KelasPoin => (persen === null ? "kosong" : persen >= 100 ? "penuh" : persen >= 60 ? "sedang" : "rendah");
export type SelPoin = { tanggal: string; ada: boolean; poin: number; persen: number | null; kk: number; km: number; metode: MetodeJarak; hari_kerja: boolean };
export type BarisPoin = {
  akun_id: number;
  nama: string;
  peran: PeranKinerja;
  pml_id: number | null;
  pml_nama: string | null;
  sel: SelPoin[];
  total: number;
  rata: number; // rata-rata poin pada hari yang ada kegiatan
  hari_aktif: number;
  hari_penuh: number; // hari dengan poin >= target
  hutang: number;
  perkiraan_jarak: boolean; // ada hari yang jaraknya masih perkiraan
};
export type RingkasPoin = { petugas: number; penuh_hari_ini: number; rata_hari_ini: number; total: number; hutang: number; tanggal: string[] };

/** Matriks PPL x tanggal sejak mulaiBobot s.d. hari ini. Hanya PPL (dan korwil yang menandai KK) yang tampil. */
export function matriksPoin(d: DataKinerja): { baris: BarisPoin[]; ringkas: RingkasPoin } {
  const tanggal = daftarTanggal(ATURAN.mulaiBobot, d.hari_ini);
  const baris: BarisPoin[] = [];
  for (const o of d.orang) {
    if (o.peran === "pml") continue;
    const pet = new Map(o.hari.map((h) => [h.tanggal, h]));
    const adaKk = o.hari.some((h) => h.terdampak + h.tidak_terdampak + h.tidak_ditemukan > 0);
    if (o.peran === "korwil" && !adaKk) continue;
    const sel: SelPoin[] = tanggal.map((t) => {
      const h = pet.get(t);
      const kk = h ? h.terdampak + h.tidak_terdampak + h.tidak_ditemukan : 0;
      if (!h || kk === 0) return { tanggal: t, ada: false, poin: 0, persen: null, kk: 0, km: 0, metode: "tidak_ada", hari_kerja: h?.hari_kerja ?? false };
      const p = poinHari(h);
      return { tanggal: t, ada: true, poin: bulat2(p.total), persen: p.persen, kk, km: h.km, metode: h.metode, hari_kerja: h.hari_kerja };
    });
    const ada = sel.filter((s) => s.ada);
    const total = ada.reduce((a, s) => a + s.poin, 0);
    baris.push({
      akun_id: o.akun_id,
      nama: o.nama,
      peran: o.peran,
      pml_id: o.pml_id,
      pml_nama: o.pml_nama,
      sel,
      total: bulat2(total),
      rata: ada.length ? bulat2(total / ada.length) : 0,
      hari_aktif: ada.length,
      hari_penuh: ada.filter((s) => s.poin >= targetTanggal(s.tanggal)).length,
      hutang: realisasiPpl(o.hari).hutang,
      perkiraan_jarak: ada.some((s) => s.metode === "perkiraan"),
    });
  }
  const hariIni = baris.map((b) => b.sel[b.sel.length - 1]).filter((s) => s && s.ada);
  const ringkas: RingkasPoin = {
    petugas: baris.length,
    penuh_hari_ini: hariIni.filter((s) => s.poin >= targetTanggal(s.tanggal)).length,
    rata_hari_ini: hariIni.length ? bulat2(hariIni.reduce((a, s) => a + s.poin, 0) / hariIni.length) : 0,
    total: bulat2(baris.reduce((a, b) => a + b.total, 0)),
    hutang: bulat2(baris.reduce((a, b) => a + b.hutang, 0)),
    tanggal,
  };
  return { baris, ringkas };
}

// ----------------------------------------------------------------------------------------------- Fase 4: perkiraan anggaran
export type DasarLaju = "periode" | "tiga_hari" | "target";
export const LABEL_LAJU: Record<DasarLaju, string> = { periode: "Rata-rata sejak pendataan dimulai", tiga_hari: "Rata-rata 3 hari kerja terakhir", target: `Target ${ATURAN.targetHarian} poin per hari` };
export type ParamAnggaran = { laju: DasarLaju; pola: PolaKerja; sertakanPmlKorwil: boolean };
export const PARAM_AWAL: ParamAnggaran = { laju: "periode", pola: "sen_sab", sertakanPmlKorwil: true };

export type BarisAnggaran = {
  akun_id: number;
  nama: string;
  peran: PeranKinerja;
  pml_nama: string | null;
  realisasi_ok: number;
  hutang: number;
  sisa_kk: number;
  laju: number; // poin KK per hari kerja
  sisa_hari: number | null;
  sisa_ok: number;
};
export type RingkasAnggaran = {
  posisi: string;
  tarif: Record<PeranKinerja, number>;
  realisasi: { ok: number; rupiah: number; ppl: number; pml_korwil: number };
  sisa: { ok: number; rupiah: number };
  total: { ok: number; rupiah: number; persen_kuota: number | null; kuota: number | null };
  hari: { dibagi_rata: number | null; tuntas_sendiri: number | null; selesai_dibagi_rata: string | null; selesai_tuntas_sendiri: string | null; batas: string; batas_tenggang: string; lewat_batas_dibagi_rata: boolean; lewat_batas_tuntas_sendiri: boolean };
  asumsi: { poin_per_kk: number; laju_rata: number; ppl_laju_pengganti: number };
  baris: BarisAnggaran[];
};

const jumlah = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function tambahHariKerja(dari: string, n: number, pola: PolaKerja): string {
  // tanggal setelah n hari kerja kalender sejak SETELAH `dari` (n = 0 -> `dari`)
  let t = dari;
  let sisa = n;
  let pagar = 0;
  while (sisa > 0 && pagar++ < 800) {
    t = geser(t, 1);
    if (hariKerjaKalender(t, pola)) sisa--;
  }
  return t;
}

export function perkiraanAnggaran(d: DataKinerja, p: ParamAnggaran): RingkasAnggaran {
  const T = ATURAN.targetHarian;
  const ppl = d.orang.filter((o) => o.peran === "ppl");
  // hari kerja kalender yang sudah lewat (s.d. kemarin) sejak kegiatan mulai
  const lalu = daftarTanggal(d.mulai_kegiatan, geser(d.hari_ini, -1)).filter((t) => hariKerjaKalender(t, p.pola));
  const tigaTerakhir = lalu.slice(-3);

  const poinKkTanggal = (o: OrangKinerja) => {
    const m = new Map<string, number>();
    for (const h of o.hari) m.set(h.tanggal, h.terdampak * ATURAN.poinTerdampak + h.tidak_terdampak * ATURAN.poinTidakTerdampak);
    return m;
  };
  // poin per KK (campuran hasil sejauh ini, seluruh PPL)
  let sumPoin = 0;
  let sumKk = 0;
  for (const o of ppl)
    for (const h of o.hari) {
      sumPoin += h.terdampak * ATURAN.poinTerdampak + h.tidak_terdampak * ATURAN.poinTidakTerdampak;
      sumKk += h.terdampak + h.tidak_terdampak;
    }
  const poinPerKk = sumKk > 0 ? sumPoin / sumKk : 3;

  // poin jarak perkiraan per hari: 2 x 1,3 x garis lurus rumah -> pusat KK tersisa (maks 15); tanpa data -> rata-rata jarak teramati
  let jarakTeramati = 0;
  let hariTeramati = 0;
  for (const o of ppl)
    for (const h of o.hari)
      if (h.terdampak + h.tidak_terdampak + h.tidak_ditemukan > 0 && h.tanggal >= ATURAN.mulaiBobot) {
        jarakTeramati += poinJarakKm(h.km, ATURAN); // dinyatakan dengan aturan sekarang (km sama, poin per km berbeda antar-aturan)
        hariTeramati++;
      }
  const jarakRata = hariTeramati > 0 ? jarakTeramati / hariTeramati : 0;

  type Antara = { o: OrangKinerja; laju: number | null; jarakPoin: number; sisaPoinKk: number };
  const antara: Antara[] = ppl.map((o) => {
    const per = poinKkTanggal(o);
    let laju: number | null = null;
    if (p.laju === "periode") laju = lalu.length > 0 ? jumlah(lalu.map((t) => per.get(t) ?? 0)) / lalu.length : null;
    else if (p.laju === "tiga_hari") laju = tigaTerakhir.length > 0 ? jumlah(tigaTerakhir.map((t) => per.get(t) ?? 0)) / tigaTerakhir.length : null;
    const jarakPoin = o.rumah_ke_sisa_km != null ? poinJarakKm(2 * ATURAN.faktorJalan * o.rumah_ke_sisa_km, ATURAN) : jarakRata;
    if (p.laju === "target") laju = Math.max(1, T - jarakPoin);
    return { o, laju, jarakPoin, sisaPoinKk: Math.max(0, o.sisa_kk) * poinPerKk };
  });
  // laju pengganti untuk PPL tanpa riwayat (laju null atau 0): rata-rata PPL yang punya laju > 0
  const berlaju = antara.map((a) => a.laju).filter((x): x is number => x != null && x > 0);
  const lajuRata = berlaju.length ? jumlah(berlaju) / berlaju.length : Math.max(1, T - jarakRata);
  let pengganti = 0;

  const baris: BarisAnggaran[] = [];
  let realPpl = 0;
  let sisaOkPpl = 0;
  const hariPerTim = new Map<number | null, number>();
  let jumlahSisaPoin = 0;
  let jumlahLaju = 0;
  let hariMaks = 0;
  for (const a of antara) {
    const pakaiPengganti = !(a.laju != null && a.laju > 0);
    if (pakaiPengganti && a.o.sisa_kk > 0) pengganti++;
    const laju = pakaiPengganti ? lajuRata : (a.laju as number);
    const sisaHari = a.o.sisa_kk > 0 ? Math.ceil(a.sisaPoinKk / laju) : 0;
    const real = realisasiPpl(a.o.hari);
    const sisaPoin = a.sisaPoinKk + sisaHari * a.jarakPoin;
    const sisaOk = Math.max(0, Math.min(sisaPoin / T, sisaHari + real.hutang_ok));
    realPpl += real.ok;
    sisaOkPpl += sisaOk;
    jumlahSisaPoin += a.sisaPoinKk;
    jumlahLaju += laju;
    hariMaks = Math.max(hariMaks, sisaHari);
    hariPerTim.set(a.o.pml_id, Math.max(hariPerTim.get(a.o.pml_id) ?? 0, sisaHari));
    baris.push({ akun_id: a.o.akun_id, nama: a.o.nama, peran: "ppl", pml_nama: a.o.pml_nama, realisasi_ok: real.ok, hutang: real.hutang, sisa_kk: Math.round(a.o.sisa_kk), laju: bulat2(laju), sisa_hari: sisaHari, sisa_ok: bulat2(sisaOk) });
  }
  const hariBagiRata = jumlahLaju > 0 ? (jumlahSisaPoin > 0 ? Math.ceil(jumlahSisaPoin / jumlahLaju) : 0) : null;

  // PML & korwil: tiap hari kerja lengkap = 1 O-K; sisa = hari kerja sampai timnya selesai (korwil belum memilih hari kerja -> 0)
  let realLain = 0;
  let sisaOkLain = 0;
  if (p.sertakanPmlKorwil) {
    for (const o of d.orang) {
      if (o.peran === "ppl") continue;
      const real = realisasiHariKerja(o.hari);
      // PML mengikuti hari timnya (pml_id PML = id petugasnya sendiri); korwil belum memilih hari kerja -> tidak ada sisa
      const sisaPakai = o.peran === "pml" ? (hariPerTim.get(o.pml_id) ?? 0) : 0;
      realLain += real;
      sisaOkLain += sisaPakai;
      baris.push({ akun_id: o.akun_id, nama: o.nama, peran: o.peran, pml_nama: o.pml_nama, realisasi_ok: real, hutang: 0, sisa_kk: 0, laju: 0, sisa_hari: sisaPakai, sisa_ok: sisaPakai });
    }
  }

  const tarifRata = (r: PeranKinerja) => d.tarif[r] ?? 0;
  const realRp = realPpl * tarifRata("ppl") + realLain * tarifRata("pml");
  const sisaOk = Math.ceil(sisaOkPpl - 1e-9) + sisaOkLain;
  const sisaRp = Math.ceil(sisaOkPpl - 1e-9) * tarifRata("ppl") + sisaOkLain * tarifRata("pml");
  const totalOk = realPpl + realLain + sisaOk;
  const kuota = (d.kuota.ppl ?? 0) + (p.sertakanPmlKorwil ? (d.kuota.pml ?? 0) + (d.kuota.korwil ?? 0) : 0);
  const batasTenggang = geser(d.batas, d.tenggang_hari);
  const selesai = (n: number | null) => (n == null ? null : n === 0 ? d.hari_ini : tambahHariKerja(d.hari_ini, n, p.pola));
  const sb = selesai(hariBagiRata);
  const ss = selesai(hariMaks);
  return {
    posisi: d.sekarang,
    tarif: d.tarif,
    realisasi: { ok: realPpl + realLain, rupiah: realRp, ppl: realPpl, pml_korwil: realLain },
    sisa: { ok: sisaOk, rupiah: sisaRp },
    total: { ok: totalOk, rupiah: realRp + sisaRp, persen_kuota: kuota > 0 ? Math.round((totalOk / kuota) * 100) : null, kuota: kuota > 0 ? kuota : null },
    hari: {
      dibagi_rata: hariBagiRata,
      tuntas_sendiri: hariMaks,
      selesai_dibagi_rata: sb,
      selesai_tuntas_sendiri: ss,
      batas: d.batas,
      batas_tenggang: batasTenggang,
      lewat_batas_dibagi_rata: sb != null && sb > d.batas,
      lewat_batas_tuntas_sendiri: ss != null && ss > d.batas,
    },
    asumsi: { poin_per_kk: bulat2(poinPerKk), laju_rata: bulat2(lajuRata), ppl_laju_pengganti: pengganti },
    baris: baris.sort((a, b) => b.sisa_ok - a.sisa_ok || a.nama.localeCompare(b.nama)),
  };
}

export const rupiah = (n: number): string => `Rp${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
