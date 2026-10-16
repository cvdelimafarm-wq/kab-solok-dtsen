// lib/spdtNtp.ts  (murni; dipakai server DAN klien)
//
// (16 Okt 2026) SPDT NTP 2026 -- Lembar Pendataan (lembar bantu: daftar nama KK + koordinat + navigasi; TANPA status pendataan dan TANPA umpan balik petugas).
// Aturan akses (permintaan user): PPL hanya melihat KK wilayah tugasnya; PML melihat KK seluruh PPL-nya; Supervisor melihat semuanya.
// Isi berkas ini: tipe data API, tautan navigasi, penyaringan/pengelompokan, ringkasan modul tahapan, dan penyusun Monitoring.
// Data KK ada di tabel sigap_spdt_kk (dimuat dari berkas Excel SPDT_NTP_Maps_DSRT.xlsx); pencatatan "koordinat dibuka" di sigap_spdt_buka.

export const KEGIATAN_SPDT_ID = 2;
export const MENU_SUPERVISOR_SPDT = "spdt.supervisor";
export const API_SPDT_KK = "/api/portal/spdt-kk";
export const API_SPDT_MONITORING = "/api/portal/spdt-monitoring";
/** Periode pendataan SPDT NTP 2026 (jawaban user: berakhir 12 Nov). */
export const PERIODE_SPDT = { mulai: "2026-10-12", selesai: "2026-11-12" } as const;
/** Akurasi geotag di atas ini (meter) ditandai "kurang akurat" -- patokan awal 50 m. */
export const BATAS_AKURASI_M = 50;

export type PeranSpdt = "ppl" | "pml" | "supervisor";
export const LABEL_PERAN: Record<PeranSpdt, string> = { ppl: "PPL", pml: "PML", supervisor: "Supervisor" };

export type KkSpdt = {
  id: number;
  urut: number;
  kode_wilayah: string;
  kecamatan: string;
  nagari: string;
  jorong: string;
  nama_kk: string;
  anggota_lain: string | null;
  alamat: string | null;
  akurasi_m: number | null;
  lat: number;
  lng: number;
  ppl_nama: string;
  pml_nama: string;
  ppl_akun_id: number | null;
  pml_akun_id: number | null;
};

export type DataKkSpdt = {
  sekarang: string;
  peran: PeranSpdt;
  saya: { id: number; nama: string };
  kk: KkSpdt[];
  periode: { mulai: string; selesai: string };
};

// ------------------------------------------------------------------ tautan navigasi
const koordinat = (lat: number, lng: number) => `${lat.toFixed(7)},${lng.toFixed(7)}`;

/** Petunjuk arah ke titik (membuka Google Maps / aplikasi peta di HP). */
export function tautanNavigasi(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${koordinat(lat, lng)}&travelmode=driving`;
}
/** Hanya melihat titik di peta. */
export function tautanLihat(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${koordinat(lat, lng)}`;
}
export const teksKoordinat = (lat: number, lng: number): string => koordinat(lat, lng).replace(",", ", ");

export const akurasiRendah = (m: number | null | undefined): boolean => m != null && Number.isFinite(m) && m > BATAS_AKURASI_M;

// ------------------------------------------------------------------ nama & penyaringan
/** "AIE DINGIN" -> "Aie Dingin"; "JORONG KAYU ARO" -> "Jorong Kayu Aro". */
export function judulKata(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => k[0].toUpperCase() + k.slice(1))
    .join(" ");
}
export function inisialNama(nama: string): string {
  const k = nama.trim().split(/\s+/).filter(Boolean);
  if (k.length === 0) return "?";
  return (k[0][0] + (k[1]?.[0] ?? k[0][1] ?? "")).toUpperCase();
}

export type PplSpdt = { akun_id: number; nama: string; pml: string; indeks: number; jumlah: number };

/** Daftar PPL dari baris KK, urut nama; `indeks` stabil untuk pewarnaan. */
export function daftarPpl(kk: Pick<KkSpdt, "ppl_akun_id" | "ppl_nama" | "pml_nama">[]): PplSpdt[] {
  const peta = new Map<number, { nama: string; pml: Set<string>; n: number }>();
  for (const k of kk) {
    if (k.ppl_akun_id == null) continue;
    const e = peta.get(k.ppl_akun_id) ?? { nama: k.ppl_nama, pml: new Set<string>(), n: 0 };
    e.pml.add(k.pml_nama);
    e.n += 1;
    peta.set(k.ppl_akun_id, e);
  }
  return Array.from(peta, ([akun_id, e]) => ({ akun_id, nama: e.nama, pml: Array.from(e.pml).join(" / "), jumlah: e.n }))
    .sort((a, b) => a.nama.localeCompare(b.nama))
    .map((p, i) => ({ ...p, indeks: i }));
}

export type SaringKk = { ppl: number | null; jorong: string | null; cari: string; hanyaRendah?: boolean };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function saringKk(kk: KkSpdt[], f: SaringKk): KkSpdt[] {
  const q = norm(f.cari);
  return kk.filter((k) => {
    if (f.ppl != null && k.ppl_akun_id !== f.ppl) return false;
    if (f.jorong && `${k.nagari}|${k.jorong}` !== f.jorong) return false;
    if (f.hanyaRendah && !akurasiRendah(k.akurasi_m)) return false;
    if (q) {
      const gudang = norm(`${k.nama_kk} ${k.anggota_lain ?? ""} ${k.alamat ?? ""} ${k.jorong} ${k.nagari} ${k.ppl_nama}`);
      if (!q.split(" ").every((kata) => gudang.includes(kata))) return false;
    }
    return true;
  });
}

export type GrupJorong = { kunci: string; nagari: string; jorong: string; kecamatan: string; kk: KkSpdt[] };
/** Kelompok per Nagari + Jorong, urut kecamatan/nagari/jorong lalu nama KK. */
export function kelompokJorong(kk: KkSpdt[]): GrupJorong[] {
  const m = new Map<string, GrupJorong>();
  for (const k of kk) {
    const kunci = `${k.nagari}|${k.jorong}`;
    const g = m.get(kunci) ?? { kunci, nagari: k.nagari, jorong: k.jorong, kecamatan: k.kecamatan, kk: [] };
    g.kk.push(k);
    m.set(kunci, g);
  }
  const hasil = Array.from(m.values());
  for (const g of hasil) g.kk.sort((a, b) => a.nama_kk.localeCompare(b.nama_kk));
  return hasil.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.jorong.localeCompare(b.jorong));
}

/** Urutkan menurut jarak dari posisi petugas (terdekat dulu); jarak meter dihitung garis lurus. */
export function jarakM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function teksJarak(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10 || 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`.replace(".", ",");
}

// ------------------------------------------------------------------ ringkasan modul tahapan (Layer 2/3)
export type InfoSpdt = { peran: PeranSpdt; total: number; ppl: number; pml: number };

export function ringkasSpdt(peran: PeranSpdt, kk: Pick<KkSpdt, "ppl_akun_id" | "pml_akun_id">[]): InfoSpdt {
  const ppl = new Set<number>();
  const pml = new Set<number>();
  for (const k of kk) {
    if (k.ppl_akun_id != null) ppl.add(k.ppl_akun_id);
    if (k.pml_akun_id != null) pml.add(k.pml_akun_id);
  }
  return { peran, total: kk.length, ppl: ppl.size, pml: pml.size };
}

/** Keterangan satu baris di halaman tahap. */
export function ketModulSpdt(f: InfoSpdt): string {
  if (f.peran === "supervisor") return `Monitoring, peta, dan daftar ${f.total} KK seluruh wilayah · ${f.ppl} PPL`;
  if (f.peran === "pml") return `${f.total} KK milik ${f.ppl} PPL Anda · Monitoring, peta, daftar`;
  return `${f.total} KK di wilayah tugas Anda · peta dan navigasi`;
}

// ------------------------------------------------------------------ Monitoring
export type OrangMon = {
  akun_id: number;
  nama: string;
  /** waktu pertama aktif hari ini (ISO); null = belum login hari ini */
  login: string | null;
  terakhir: string | null;
  /** jumlah KK yang koordinatnya dibuka hari ini (di antara KK pasangan ini) */
  dibuka: number;
  kk: number;
};
export type GrupMon = { pml: OrangMon; ppl: OrangMon[] };
export type RingkasMon = { ppl: number; login: number; belum_login: number; belum_buka: number; kk_dibuka: number; kk_total: number };
export type DataMonitoring = { sekarang: string; tanggal: string; peran: PeranSpdt; grup: GrupMon[]; ringkas: RingkasMon };

export type KkRingan = { id: number; ppl_akun_id: number | null; pml_akun_id: number | null; ppl_nama: string; pml_nama: string };
export type SesiRingan = { akun_id: number; mulai_at: string; terakhir_aktif_at: string };
export type BukaRingan = { akun_id: number; kk_id: number };

/** Awal hari WIB (ISO UTC) untuk tanggal YYYY-MM-DD. */
export const awalHariWib = (tanggal: string): string => new Date(`${tanggal}T00:00:00+07:00`).toISOString();

/**
 * Susun Monitoring: tiap PML beserta PPL-nya. PPL yang dipegang dua PML (mis. Dana Nokeladio) muncul di kedua grup dengan jumlah KK masing-masing.
 * `nama` memetakan akun -> nama tampil; bila tak ada dipakai nama dari baris KK. `sesi` sudah dibatasi pada hari ini (terakhir_aktif_at >= awal hari).
 */
export function susunMonitoring(opsi: {
  tanggal: string;
  kk: KkRingan[];
  nama: Map<number, string>;
  sesi: SesiRingan[];
  buka: BukaRingan[];
}): { grup: GrupMon[]; ringkas: RingkasMon } {
  const awal = Date.parse(awalHariWib(opsi.tanggal));
  const sesiPer = new Map<number, { login: number; akhir: number }>();
  for (const s of opsi.sesi) {
    const akhir = Date.parse(s.terakhir_aktif_at);
    if (!(akhir >= awal)) continue;
    const mulai = Math.max(Date.parse(s.mulai_at), awal);
    const e = sesiPer.get(s.akun_id);
    if (!e) sesiPer.set(s.akun_id, { login: mulai, akhir });
    else {
      e.login = Math.min(e.login, mulai);
      e.akhir = Math.max(e.akhir, akhir);
    }
  }
  const bukaPer = new Map<number, Set<number>>();
  for (const b of opsi.buka) {
    const s = bukaPer.get(b.akun_id) ?? new Set<number>();
    s.add(b.kk_id);
    bukaPer.set(b.akun_id, s);
  }

  const orang = (akun: number, namaCadangan: string, kkIds: Set<number>): OrangMon => {
    const s = sesiPer.get(akun);
    const dibuka = bukaPer.get(akun);
    let n = 0;
    if (dibuka) for (const id of kkIds) if (dibuka.has(id)) n += 1;
    return {
      akun_id: akun,
      nama: opsi.nama.get(akun) ?? namaCadangan,
      login: s ? new Date(s.login).toISOString() : null,
      terakhir: s ? new Date(s.akhir).toISOString() : null,
      dibuka: n,
      kk: kkIds.size,
    };
  };

  // pml -> (ppl -> id KK)
  const pohon = new Map<number, { nama: string; ppl: Map<number, { nama: string; ids: Set<number> }>; semua: Set<number> }>();
  for (const k of opsi.kk) {
    if (k.pml_akun_id == null || k.ppl_akun_id == null) continue;
    const g = pohon.get(k.pml_akun_id) ?? { nama: k.pml_nama, ppl: new Map(), semua: new Set<number>() };
    const p = g.ppl.get(k.ppl_akun_id) ?? { nama: k.ppl_nama, ids: new Set<number>() };
    p.ids.add(k.id);
    g.semua.add(k.id);
    g.ppl.set(k.ppl_akun_id, p);
    pohon.set(k.pml_akun_id, g);
  }

  const grup: GrupMon[] = Array.from(pohon, ([pmlId, g]) => ({
    pml: orang(pmlId, g.nama, g.semua),
    ppl: Array.from(g.ppl, ([pplId, p]) => orang(pplId, p.nama, p.ids)).sort((a, b) => a.nama.localeCompare(b.nama)),
  })).sort((a, b) => a.pml.nama.localeCompare(b.pml.nama));

  // ringkasan dihitung per PPL unik (PPL ganda-PML tidak dihitung dua kali)
  const unik = new Map<number, { login: boolean; dibuka: number; kk: number }>();
  for (const g of grup)
    for (const p of g.ppl) {
      const e = unik.get(p.akun_id) ?? { login: !!p.login, dibuka: 0, kk: 0 };
      e.dibuka += p.dibuka;
      e.kk += p.kk;
      unik.set(p.akun_id, e);
    }
  const semuaPpl = Array.from(unik.values());
  const ringkas: RingkasMon = {
    ppl: semuaPpl.length,
    login: semuaPpl.filter((p) => p.login).length,
    belum_login: semuaPpl.filter((p) => !p.login).length,
    belum_buka: semuaPpl.filter((p) => p.dibuka === 0).length,
    kk_dibuka: semuaPpl.reduce((a, p) => a + p.dibuka, 0),
    kk_total: semuaPpl.reduce((a, p) => a + p.kk, 0),
  };
  return { grup, ringkas };
}

/** "06.42" (WIB) dari ISO. */
export function jamWib(iso: string | null): string {
  if (!iso) return "-";
  const w = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}

// ------------------------------------------------------------------ masukan POST pencatatan "koordinat dibuka"
export function periksaBuka(body: unknown): { ok: true; kk_id: number; navigasi: boolean } | { ok: false; pesan: string } {
  const b = (body ?? {}) as { kk_id?: unknown; navigasi?: unknown };
  const id = Number(b.kk_id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "kk_id tidak sah." };
  return { ok: true, kk_id: id, navigasi: b.navigasi === true };
}
