// lib/sigapPelatihanSurvei.ts
//
// (31 Okt 2026) Kelola Pelatihan per SURVEI: satu kartu untuk satu survei (kegiatan induk, sigap_induk), dan di dalam halaman kelola ada
// dropdown Survei (serta dropdown Pelatihan bila satu survei punya lebih dari satu pelatihan) -- sama seperti pemilih survei di Kelola Pendataan.
// Logika MURNI (tanpa React/DB) dipakai API daftar dan halaman; diuji di lib/__tests__/sigapPelatihanSurvei.test.ts.
// Survei = sigap_induk; pelatihan = kegiatan berjenis 'pelatihan' di kegiatan_ids induk itu. Alamat: ?survei=<kode induk>&kegiatan=<id pelatihan>&tab=...

export type StatusPelatihan = "berlangsung" | "akan_datang" | "selesai" | "nonaktif";

export type PelatihanSurvei = {
  id: number;
  kode: string;
  nama: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  status: StatusPelatihan;
  peserta: number;
  boleh_kelola: boolean;
  /** Pelatihan bawaan (dipakai server bila alamat tidak menyebut ?kegiatan). */
  bawaan?: boolean;
};

export type Survei = {
  /** Kode induk (sigap_induk.kode); pelatihan yang tidak termasuk induk mana pun memakai KODE_SURVEI_LAIN. */
  kode: string;
  nama: string;
  pelatihan: PelatihanSurvei[];
  /** Akun ini boleh membuat pelatihan baru di bawah survei ini (admin atau PJ kegiatan yang lingkupnya mencakup survei). Diisi API daftar. */
  boleh_buat?: boolean;
};

export const KODE_SURVEI_LAIN = "_lain";

const URUT_STATUS: Record<StatusPelatihan, number> = { berlangsung: 0, akan_datang: 1, selesai: 2, nonaktif: 3 };

/** Pelatihan yang dibuka pertama kali saat survei dipilih: yang sedang berlangsung, lalu yang akan datang paling dekat, lalu selesai paling baru. */
export function pilihPelatihanAwal(daftar: readonly PelatihanSurvei[]): PelatihanSurvei | null {
  if (daftar.length === 0) return null;
  const urut = [...daftar].sort((a, b) => {
    const s = URUT_STATUS[a.status] - URUT_STATUS[b.status];
    if (s !== 0) return s;
    const ta = a.tanggal_mulai ?? "";
    const tb = b.tanggal_mulai ?? "";
    // akan datang: yang paling dekat dulu; selainnya: yang paling baru dulu
    if (a.status === "akan_datang") return ta.localeCompare(tb) || a.id - b.id;
    return tb.localeCompare(ta) || a.id - b.id;
  });
  return urut[0];
}

export type RingkasSurvei = { jumlah: number; peserta: number; status: StatusPelatihan | "kosong"; mulai: string | null; selesai: string | null };

/** Ringkasan satu survei untuk kartu hub. */
export function ringkasSurvei(s: Pick<Survei, "pelatihan">): RingkasSurvei {
  const p = s.pelatihan;
  if (p.length === 0) return { jumlah: 0, peserta: 0, status: "kosong", mulai: null, selesai: null };
  const status = [...p].sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status])[0].status;
  const mulai = p.map((x) => x.tanggal_mulai).filter((x): x is string => !!x).sort()[0] ?? null;
  const selesai = p.map((x) => x.tanggal_selesai ?? x.tanggal_mulai).filter((x): x is string => !!x).sort().slice(-1)[0] ?? null;
  return { jumlah: p.length, peserta: p.reduce((a, x) => a + x.peserta, 0), status, mulai, selesai };
}

/**
 * Menyusun daftar survei dari induk + pelatihan yang boleh dilihat akun.
 * - Induk yang punya pelatihan terlihat selalu tampil.
 * - Induk TANPA pelatihan tampil (kartu "Belum ada pelatihan") hanya bila akun punya lingkup ke induk itu: lingkup "semua", atau salah satu kegiatan induk ada di lingkup.
 * - Pelatihan yang tidak masuk induk mana pun dikumpulkan di survei "Pelatihan lainnya".
 */
export function susunSurvei(
  induk: readonly { kode: string; nama: string; kegiatan_ids: readonly (number | string)[] | null }[],
  pelatihan: readonly PelatihanSurvei[],
  lingkup: "semua" | readonly number[],
): Survei[] {
  const hasil: Survei[] = [];
  const sisa = new Set(pelatihan.map((p) => p.id));
  for (const i of induk) {
    const anggota = (i.kegiatan_ids ?? []).map(Number);
    const isi = pelatihan.filter((p) => anggota.includes(p.id) && sisa.has(p.id));
    isi.forEach((p) => sisa.delete(p.id));
    const dalamLingkup = lingkup === "semua" || anggota.some((id) => lingkup.includes(id));
    if (isi.length === 0 && !dalamLingkup) continue;
    hasil.push({ kode: i.kode, nama: i.nama, pelatihan: urutkanPelatihan(isi) });
  }
  const lain = pelatihan.filter((p) => sisa.has(p.id));
  if (lain.length > 0) hasil.push({ kode: KODE_SURVEI_LAIN, nama: "Pelatihan lainnya", pelatihan: urutkanPelatihan(lain) });
  return hasil;
}

function urutkanPelatihan(p: readonly PelatihanSurvei[]): PelatihanSurvei[] {
  return [...p].sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status] || (b.tanggal_mulai ?? "").localeCompare(a.tanggal_mulai ?? "") || a.id - b.id);
}

// ----------------------------------------------------------------------------------------------
// Alamat halaman kelola
// ----------------------------------------------------------------------------------------------
export type ParamKelola = { kegiatan: number | null; survei: string | null; tab: string | null };

/** Membaca ?kegiatan, ?survei, ?tab dari query. Nilai tidak sah menjadi null. */
export function bacaParamKelola(search: string): ParamKelola {
  const q = new URLSearchParams(search);
  const k = q.get("kegiatan");
  const kegiatan = k && /^\d{1,12}$/.test(k) && Number(k) > 0 ? Number(k) : null;
  const s = (q.get("survei") ?? "").trim();
  const survei = /^[A-Za-z0-9_-]{1,60}$/.test(s) ? s : null;
  const t = (q.get("tab") ?? "").trim();
  const tab = /^[a-z_]{1,30}$/.test(t) ? t : null;
  return { kegiatan, survei, tab };
}

/** Alamat setelah memilih survei/pelatihan: ?survei dan ?kegiatan diisi, ?tab dan parameter lain dibiarkan. kegiatan null = hapus ?kegiatan. */
export function urlKelola(pathname: string, search: string, p: { survei: string | null; kegiatan: number | null }): string {
  const q = new URLSearchParams(search);
  if (p.survei) q.set("survei", p.survei);
  else q.delete("survei");
  if (p.kegiatan !== null) q.set("kegiatan", String(p.kegiatan));
  else q.delete("kegiatan");
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}

/** Survei yang memuat pelatihan `kegiatanId`; bila tidak ada, survei menurut kode `kode`. */
export function cariSurvei(daftar: readonly Survei[], kegiatanId: number | null, kode: string | null): Survei | null {
  if (kegiatanId !== null) {
    const s = daftar.find((x) => x.pelatihan.some((p) => p.id === kegiatanId));
    if (s) return s;
  }
  return kode ? (daftar.find((x) => x.kode === kode) ?? null) : null;
}

// ----------------------------------------------------------------------------------------------
// Membuat pelatihan baru di bawah survei (31 Okt 2026) -- permintaan Iqbal: "admin dan PJ"
// ----------------------------------------------------------------------------------------------
/** Peran yang boleh membuat pelatihan: admin (anggaran/aplikasi) dan PJ kegiatan. */
export const PERAN_PEMBUAT_PELATIHAN = ["admin_anggaran", "admin_aplikasi", "pj_kegiatan"] as const;

/**
 * Boleh membuat pelatihan di survei dengan kegiatan `kegiatanIdsInduk`? Syarat: memegang salah satu peran pembuat dengan lingkup "semua kegiatan" (kegiatan_id null)
 * atau lingkup ke salah satu kegiatan survei itu. Peran pengelola lain (mis. pengelola survei, panitia, instruktur) tidak otomatis boleh.
 */
export function bolehBuatPelatihan(peran: readonly { kode: string; kegiatan_id: number | null }[], kegiatanIdsInduk: readonly (number | string)[] | null): boolean {
  const ids = (kegiatanIdsInduk ?? []).map(Number);
  return peran.some((p) => (PERAN_PEMBUAT_PELATIHAN as readonly string[]).includes(p.kode) && (p.kegiatan_id === null || ids.includes(Number(p.kegiatan_id))));
}

export type PelatihanBaru = { nama: string; tanggal_mulai: string; tanggal_selesai: string };

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const tglSah = (t: string) => TGL.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

/** Memeriksa isian formulir pelatihan baru. Tanggal selesai kosong = sama dengan tanggal mulai. */
export function validasiPelatihanBaru(x: unknown): { ok: true; data: PelatihanBaru } | { ok: false; error: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const nama = String(o.nama ?? "").replace(/\s+/g, " ").trim();
  if (nama.length < 5 || nama.length > 120) return { ok: false, error: "Nama pelatihan 5–120 karakter." };
  const mulai = String(o.tanggal_mulai ?? "").trim();
  if (!tglSah(mulai)) return { ok: false, error: "Tanggal mulai tidak sah (format tahun-bulan-tanggal)." };
  const selesaiTeks = String(o.tanggal_selesai ?? "").trim();
  const selesai = selesaiTeks === "" ? mulai : selesaiTeks;
  if (!tglSah(selesai)) return { ok: false, error: "Tanggal selesai tidak sah (format tahun-bulan-tanggal)." };
  if (selesai < mulai) return { ok: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
  const hari = (Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) / 86_400_000;
  if (hari > 60) return { ok: false, error: "Rentang pelatihan maksimal 60 hari." };
  return { ok: true, data: { nama, tanggal_mulai: mulai, tanggal_selesai: selesai } };
}

/** Kode kegiatan: pelatihan_<kode survei>_<nama ringkas>_<tahun>, huruf kecil/angka/garis bawah, maksimal 80 karakter. */
export function kodePelatihan(kodeSurvei: string, nama: string, tanggalMulai: string): string {
  const ringkas = (s: string, maks: number) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, maks).replace(/_+$/g, "");
  const bagian = ["pelatihan", ringkas(kodeSurvei, 30), ringkas(nama, 40), tanggalMulai.slice(0, 4)].filter(Boolean);
  return bagian.join("_").slice(0, 80);
}

export type TesBawaan = { jenis: "pretest" | "posttest"; judul: string; buka_at: string; tutup_at: string; durasi_menit: number; aktif: boolean; ulang_maks: number; wajib_lulus: boolean; nilai_lulus: number };

/**
 * Pretest dan posttest bawaan untuk pelatihan baru: buka pukul 07.00 WIB hari pertama, tutup 22.00 WIB hari terakhir, durasi 15 menit.
 * Dibuat TIDAK AKTIF (belum tampil bagi peserta) sampai soal diunggah dan jadwalnya disetel panitia; wajib lulus tidak dicentang (PJ memilih sendiri).
 */
export function tesBawaan(nama: string, tanggalMulai: string, tanggalSelesai: string): TesBawaan[] {
  const buka = new Date(`${tanggalMulai}T07:00:00+07:00`).toISOString();
  const tutup = new Date(`${tanggalSelesai}T22:00:00+07:00`).toISOString();
  return (["pretest", "posttest"] as const).map((jenis) => ({
    jenis,
    judul: `${jenis === "pretest" ? "Pretest" : "Posttest"} · ${nama}`.slice(0, 160),
    buka_at: buka,
    tutup_at: tutup,
    durasi_menit: 15,
    aktif: false,
    ulang_maks: 1,
    wajib_lulus: false,
    nilai_lulus: 70,
  }));
}
