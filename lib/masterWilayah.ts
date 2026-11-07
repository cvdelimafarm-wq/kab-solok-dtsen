// lib/masterWilayah.ts
//
// (7 Nov 2026, tahap C1) Master > Wilayah dan Peta: satu baris per sub SLS dengan kolom status (peta, batas/shapefile, daftar KK, survei tahun berjalan).
// Fungsi MURNI (tanpa DOM/DB) untuk pengelompokan, penyaring, dan rekap; pembacaan data ada di lib/portal/masterWilayah.ts (SQL 20261107h).

export const API_MASTER_WILAYAH = "/api/portal/master/wilayah";
/** Izin menu (sigap_menu.kode): khusus Ketua, diberikan lewat peran `admin_master`. */
export const MENU_MASTER_WILAYAH = "master.wilayah";
export const API_MASTER_BATAS = "/api/portal/master/batas";

export type SurveiSub = { kegiatan_id: number; kegiatan: string; nks: string | null; target: number | null; ppl: string | null; pml: string | null };

export type BarisMaster = {
  idsubsls: string;
  kd_kec: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  aktif: boolean;
  jumlah_kk: number;
  kk_terbaru: string | null;
  gambar_peta: number;
  jumlah_survei: number;
  daftar_survei: SurveiSub[];
  /** ada polygon batas pada berkas batas (null = berkas batas tidak terbaca server) */
  batas: boolean | null;
};

export type UsulanMaster = {
  id: number;
  kegiatan_id: number;
  kegiatan: string;
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  alasan: string;
  nama_kk: string;
  status: "menunggu" | "disetujui";
  diajukan_nama: string | null;
  diajukan_at: string;
};

export type RingkasBatas = { versi: string | null; dibuat: string | null; dibaca: boolean; kecamatan: number; poligon: number; sumber?: "bawaan" | "unggahan" };

export type DataMasterWilayah = {
  /** tampilan master_v_subsls_status ada (SQL 20261107h sudah dijalankan) */
  siap: boolean;
  sekarang: string;
  tahun: number;
  baris: BarisMaster[];
  batas: RingkasBatas;
  usulan: UsulanMaster[];
  /** kegiatan tahun berjalan yang beralokasi (untuk keterangan) */
  kegiatan_tahun: { id: number; nama: string; sub_sls: number }[];
};

export const MASTER_KOSONG: DataMasterWilayah = {
  siap: false, sekarang: "", tahun: new Date().getFullYear(), baris: [], batas: { versi: null, dibuat: null, dibaca: false, kecamatan: 0, poligon: 0 }, usulan: [], kegiatan_tahun: [],
};

export const LABEL_ALASAN_USUL: Record<string, string> = {
  tidak_ditemukan: "Tidak ditemukan", menolak: "Menolak", pindah: "Pindah", kosong: "Rumah kosong", lainnya: "Lainnya",
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------------------------------------------

export type StatusKk = "belum" | "ada" | "baru";
/** Hari sejak pembaruan terakhir daftar KK yang masih dianggap "diperbarui". */
export const HARI_KK_BARU = 30;

export function hariAntara(dariIso: string, sampaiIso: string): number {
  const a = Date.parse(dariIso);
  const b = Date.parse(sampaiIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.floor((b - a) / 86_400_000);
}

/** belum = tanpa KK; baru = diperbarui dalam 30 hari terakhir; ada = ada KK, tidak baru. */
export function statusKk(b: Pick<BarisMaster, "jumlah_kk" | "kk_terbaru">, sekarangIso: string): StatusKk {
  if (b.jumlah_kk <= 0) return "belum";
  if (b.kk_terbaru && hariAntara(b.kk_terbaru, sekarangIso) <= HARI_KK_BARU) return "baru";
  return "ada";
}

export const LABEL_STATUS_KK: Record<StatusKk, string> = { belum: "Belum ada", ada: "Ada", baru: "Diperbarui" };

// ---------------------------------------------------------------------------------------------------------------------------------
// Penyaring dan rekap
// ---------------------------------------------------------------------------------------------------------------------------------

export type KunciSaring = "tanpa_kk" | "tanpa_gambar" | "tanpa_batas" | "ada_survei" | "multi_survei" | "tanpa_survei";
export const DAFTAR_SARING: { kunci: KunciSaring; label: string }[] = [
  { kunci: "tanpa_kk", label: "Tanpa KK" },
  { kunci: "tanpa_gambar", label: "Tanpa gambar peta" },
  { kunci: "tanpa_batas", label: "Tanpa batas" },
  { kunci: "ada_survei", label: "Dipakai survei" },
  { kunci: "multi_survei", label: "Dipakai lebih dari 1 survei" },
  { kunci: "tanpa_survei", label: "Belum dipakai survei" },
];

const LOLOS: Record<KunciSaring, (b: BarisMaster) => boolean> = {
  tanpa_kk: (b) => b.jumlah_kk <= 0,
  tanpa_gambar: (b) => b.gambar_peta <= 0,
  tanpa_batas: (b) => b.batas === false,
  ada_survei: (b) => b.jumlah_survei > 0,
  multi_survei: (b) => b.jumlah_survei > 1,
  tanpa_survei: (b) => b.jumlah_survei <= 0,
};

export type SaringMaster = { kecamatan: string; cari: string; kunci: readonly KunciSaring[] };
export const SARING_AWAL: SaringMaster = { kecamatan: "", cari: "", kunci: [] };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Kecamatan (kd_kec 7 digit) + pencarian teks (nama kecamatan/nagari/SLS atau potongan kode) + semua kunci saring harus lolos. */
export function saringBaris(baris: readonly BarisMaster[], s: SaringMaster): BarisMaster[] {
  const q = norm(s.cari);
  const digit = q.replace(/\D/g, "");
  return baris.filter((b) => {
    if (s.kecamatan && b.kd_kec !== s.kecamatan) return false;
    if (q) {
      const teks = norm(`${b.kecamatan} ${b.nagari} ${b.sls} ${b.sub_sls}`);
      const cocokKode = digit.length >= 4 && b.idsubsls.includes(digit);
      if (!teks.includes(q) && !cocokKode) return false;
    }
    return s.kunci.every((k) => LOLOS[k](b));
  });
}

export type RekapMaster = {
  sub_sls: number;
  dengan_kk: number;
  tanpa_kk: number;
  total_kk: number;
  dengan_gambar: number;
  /** null = status batas tidak diketahui (berkas batas tidak terbaca) */
  dengan_batas: number | null;
  dipakai_survei: number;
  multi_survei: number;
};

export function rekapMaster(baris: readonly BarisMaster[]): RekapMaster {
  const batasTahu = baris.length > 0 && baris.every((b) => b.batas !== null);
  return {
    sub_sls: baris.length,
    dengan_kk: baris.filter((b) => b.jumlah_kk > 0).length,
    tanpa_kk: baris.filter((b) => b.jumlah_kk <= 0).length,
    total_kk: baris.reduce((n, b) => n + b.jumlah_kk, 0),
    dengan_gambar: baris.filter((b) => b.gambar_peta > 0).length,
    dengan_batas: batasTahu ? baris.filter((b) => b.batas === true).length : null,
    dipakai_survei: baris.filter((b) => b.jumlah_survei > 0).length,
    multi_survei: baris.filter((b) => b.jumlah_survei > 1).length,
  };
}

export type KecamatanMaster = { kd_kec: string; nama: string; sub_sls: number };

/** Daftar kecamatan untuk dropdown (urut nama). */
export function daftarKecamatan(baris: readonly BarisMaster[]): KecamatanMaster[] {
  const m = new Map<string, KecamatanMaster>();
  for (const b of baris) {
    const ada = m.get(b.kd_kec);
    if (ada) ada.sub_sls += 1;
    else m.set(b.kd_kec, { kd_kec: b.kd_kec, nama: b.kecamatan, sub_sls: 1 });
  }
  return [...m.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Normalisasi satu baris mentah dari tampilan (angka bisa datang sebagai teks, jsonb sebagai objek/teks). Baris tak sah -> null. */
export function bacaBarisMaster(mentah: unknown, adaBatas: ReadonlySet<string> | null): BarisMaster | null {
  if (!mentah || typeof mentah !== "object") return null;
  const r = mentah as Record<string, unknown>;
  if (typeof r.idsubsls !== "string" || !/^\d{16}$/.test(r.idsubsls)) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  let survei: unknown = r.daftar_survei;
  if (typeof survei === "string") {
    try { survei = JSON.parse(survei); } catch { survei = []; }
  }
  const daftar: SurveiSub[] = (Array.isArray(survei) ? survei : []).flatMap((x): SurveiSub[] => {
    if (!x || typeof x !== "object") return [];
    const s = x as Record<string, unknown>;
    const id = Number(s.kegiatan_id);
    if (!Number.isInteger(id)) return [];
    const t = s.target == null ? null : Number(s.target);
    return [{
      kegiatan_id: id,
      kegiatan: typeof s.kegiatan === "string" ? s.kegiatan : `Kegiatan ${id}`,
      nks: typeof s.nks === "string" && s.nks !== "" ? s.nks : null,
      target: t != null && Number.isFinite(t) ? t : null,
      ppl: typeof s.ppl === "string" && s.ppl !== "" ? s.ppl : null,
      pml: typeof s.pml === "string" && s.pml !== "" ? s.pml : null,
    }];
  });
  return {
    idsubsls: r.idsubsls,
    kd_kec: typeof r.kd_kec === "string" ? r.kd_kec : r.idsubsls.slice(0, 7),
    kecamatan: typeof r.kecamatan === "string" ? r.kecamatan : "",
    nagari: typeof r.nagari === "string" ? r.nagari : "",
    sls: typeof r.sls === "string" ? r.sls : "",
    sub_sls: typeof r.sub_sls === "string" ? r.sub_sls : "",
    aktif: r.aktif !== false,
    jumlah_kk: n(r.jumlah_kk),
    kk_terbaru: typeof r.kk_terbaru === "string" ? r.kk_terbaru : null,
    gambar_peta: n(r.gambar_peta),
    jumlah_survei: Math.max(n(r.jumlah_survei), daftar.length),
    daftar_survei: daftar,
    batas: adaBatas ? adaBatas.has(r.idsubsls) : null,
  };
}

/** Peringatan kesehatan master untuk ditampilkan di atas tabel. */
export function peringatanMaster(r: RekapMaster, batas: RingkasBatas): string[] {
  const p: string[] = [];
  if (r.tanpa_kk > 0) p.push(`${r.tanpa_kk} sub SLS belum punya daftar KK master.`);
  if (r.dengan_batas !== null && r.dengan_batas < r.sub_sls) p.push(`${r.sub_sls - r.dengan_batas} sub SLS belum punya batas (shapefile).`);
  if (!batas.dibaca) p.push("Berkas batas peta tidak terbaca server, jadi status batas tidak diketahui.");
  return p;
}
