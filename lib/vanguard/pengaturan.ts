// lib/vanguard/pengaturan.ts  (murni: tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V5a: pengaturan per kegiatan (tabel sigap_vanguard_pengaturan): level kasus yang dibuka, nilai lulus (persen kasus yang harus benar), jadwal buka dan tutup,
// batas percobaan per kasus. Bawaan = semua level, tanpa jadwal, tanpa batas lulus, batas percobaan sistem. Berlaku untuk mode TERCATAT; simulasi bebas tidak terpengaruh.
// (V5b) `mode`: "latihan" (kunci, petunjuk, dan pembahasan tampil) atau "uji" (server yang menilai; kunci tidak dikirim ke perangkat petugas; tanpa petunjuk dan tanpa "Lihat jawaban").
// "Lulus" memakai kasus bernilai (bukan kalkulator bebas) pada level yang dibuka, dan kasus dihitung benar bila pernah benar tanpa "Lihat jawaban".

import { MAKS_PERCOBAAN_PER_KASUS } from "./konstanta";
import { KASUS_PUBLIK, URUTAN_LEVEL } from "./kasus/daftar";
import type { KasusPublik, Level } from "./tipe";

export type ModeKegiatan = "latihan" | "uji";

export type Pengaturan = {
  /** Kosong = semua level. */
  level_dibuka: Level[];
  /** Persen 1..100 dari kasus bernilai yang dibuka yang harus benar; null = tidak ada batas lulus. */
  nilai_lulus: number | null;
  buka_at: string | null;
  tutup_at: string | null;
  /** Per kasus per petugas, 1..200; null = batas sistem. */
  maks_percobaan: number | null;
  mode: ModeKegiatan;
};

export const PENGATURAN_BAWAAN: Pengaturan = { level_dibuka: [], nilai_lulus: null, buka_at: null, tutup_at: null, maks_percobaan: null, mode: "latihan" };
export type StatusJadwal = "belum_buka" | "buka" | "tutup";

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const waktu = (x: unknown): string | null => {
  if (typeof x !== "string" || x.trim() === "") return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const bulat = (x: unknown, a: number, b: number): number | null => (typeof x === "number" && Number.isInteger(x) && x >= a && x <= b ? x : null);

/** Membaca baris dari basis data atau JSON tak tepercaya; nilai rusak diganti bawaan (tidak melempar). */
export function bacaPengaturan(x: unknown): Pengaturan {
  if (!adalahObjek(x)) return { ...PENGATURAN_BAWAAN };
  const lv = Array.isArray(x.level_dibuka) ? x.level_dibuka.filter((l): l is Level => typeof l === "string" && (URUTAN_LEVEL as string[]).includes(l)) : [];
  const unik = URUTAN_LEVEL.filter((l) => lv.includes(l));
  const buka = waktu(x.buka_at), tutup = waktu(x.tutup_at);
  return {
    level_dibuka: unik.length === URUTAN_LEVEL.length ? [] : unik,
    nilai_lulus: bulat(x.nilai_lulus, 1, 100),
    buka_at: buka, tutup_at: buka && tutup && Date.parse(tutup) <= Date.parse(buka) ? null : tutup,
    maks_percobaan: bulat(x.maks_percobaan, 1, MAKS_PERCOBAAN_PER_KASUS),
    mode: x.mode === "uji" ? "uji" : "latihan",
  };
}

/** Pemeriksa masukan admin (ketat): kembali pesan galat bila ada yang tidak sah. Level semua terpilih disimpan sebagai kosong. */
export function periksaSimpan(x: unknown): { ok: true; pengaturan: Pengaturan } | { ok: false; pesan: string } {
  if (!adalahObjek(x)) return { ok: false, pesan: "Pengaturan tidak sah." };
  let level: Level[] = [];
  if (x.level_dibuka !== undefined && x.level_dibuka !== null) {
    if (!Array.isArray(x.level_dibuka)) return { ok: false, pesan: "Level dibuka tidak sah." };
    for (const l of x.level_dibuka) if (typeof l !== "string" || !(URUTAN_LEVEL as string[]).includes(l)) return { ok: false, pesan: "Ada level yang tidak dikenal." };
    level = URUTAN_LEVEL.filter((l) => (x.level_dibuka as string[]).includes(l));
    if (level.length === URUTAN_LEVEL.length) level = [];
  }
  const lulus = x.nilai_lulus === null || x.nilai_lulus === undefined || x.nilai_lulus === "" ? null : bulat(x.nilai_lulus, 1, 100);
  if (x.nilai_lulus !== null && x.nilai_lulus !== undefined && x.nilai_lulus !== "" && lulus === null) return { ok: false, pesan: "Nilai lulus harus bilangan bulat 1 sampai 100 (persen)." };
  const maks = x.maks_percobaan === null || x.maks_percobaan === undefined || x.maks_percobaan === "" ? null : bulat(x.maks_percobaan, 1, MAKS_PERCOBAAN_PER_KASUS);
  if (x.maks_percobaan !== null && x.maks_percobaan !== undefined && x.maks_percobaan !== "" && maks === null) return { ok: false, pesan: `Batas percobaan harus bilangan bulat 1 sampai ${MAKS_PERCOBAAN_PER_KASUS}.` };
  const buka = x.buka_at === null || x.buka_at === undefined || x.buka_at === "" ? null : waktu(x.buka_at);
  const tutup = x.tutup_at === null || x.tutup_at === undefined || x.tutup_at === "" ? null : waktu(x.tutup_at);
  if (x.buka_at && !buka) return { ok: false, pesan: "Waktu buka tidak sah." };
  if (x.tutup_at && !tutup) return { ok: false, pesan: "Waktu tutup tidak sah." };
  if (buka && tutup && Date.parse(tutup) <= Date.parse(buka)) return { ok: false, pesan: "Waktu tutup harus sesudah waktu buka." };
  if (x.mode !== undefined && x.mode !== null && x.mode !== "latihan" && x.mode !== "uji") return { ok: false, pesan: "Mode harus latihan atau uji." };
  const mode: ModeKegiatan = x.mode === "uji" ? "uji" : "latihan";
  return { ok: true, pengaturan: { level_dibuka: level, nilai_lulus: lulus, buka_at: buka, tutup_at: tutup, maks_percobaan: maks, mode } };
}

export function statusJadwal(p: Pengaturan, sekarangMs: number): StatusJadwal {
  if (p.buka_at && sekarangMs < Date.parse(p.buka_at)) return "belum_buka";
  if (p.tutup_at && sekarangMs >= Date.parse(p.tutup_at)) return "tutup";
  return "buka";
}

export const levelDibuka = (p: Pengaturan): Level[] => (p.level_dibuka.length === 0 ? [...URUTAN_LEVEL] : URUTAN_LEVEL.filter((l) => p.level_dibuka.includes(l)));
/** Kasus pada level yang dibuka (termasuk kalkulator bebas bila levelnya dibuka). */
export const kasusDibuka = (p: Pengaturan, daftar: KasusPublik[] = KASUS_PUBLIK): KasusPublik[] => { const lv = new Set<Level>(levelDibuka(p)); return daftar.filter((k) => lv.has(k.level)); };
export const maksPercobaan = (p: Pengaturan): number => p.maks_percobaan ?? MAKS_PERCOBAAN_PER_KASUS;

export function bolehMencoba(p: Pengaturan, kasus: Pick<KasusPublik, "level">, percobaanSudah: number, sekarangMs: number): { boleh: true } | { boleh: false; alasan: string } {
  const j = statusJadwal(p, sekarangMs);
  if (j === "belum_buka") return { boleh: false, alasan: "Latihan Vanguard untuk kegiatan ini belum dibuka." };
  if (j === "tutup") return { boleh: false, alasan: "Latihan Vanguard untuk kegiatan ini sudah ditutup." };
  if (!levelDibuka(p).includes(kasus.level)) return { boleh: false, alasan: "Kasus ini belum dibuka untuk kegiatan Anda." };
  if (percobaanSudah >= maksPercobaan(p)) return { boleh: false, alasan: "Batas percobaan untuk kasus ini sudah tercapai." };
  return { boleh: true };
}

/** Mode uji sedang berlaku: kegiatan bermode uji dan jadwalnya buka. Di luar jadwal tidak ada uji (dan tidak ada pencatatan). */
export const ujiBerlaku = (p: Pengaturan, sekarangMs: number): boolean => p.mode === "uji" && statusJadwal(p, sekarangMs) === "buka";
/** Kasus ini sedang diuji di kegiatan ini: kuncinya tidak boleh keluar ke peserta kegiatan tersebut (juga lewat simulasi bebas). */
export const kasusSedangDiuji = (p: Pengaturan, level: Level, sekarangMs: number): boolean => ujiBerlaku(p, sekarangMs) && levelDibuka(p).includes(level);

export type HasilLulus = { dibuka: number; benar: number; persen: number; lulus: boolean | null };
/** `benarKasus` = kode kasus yang pernah benar (tanpa lihat jawaban) bagi seorang petugas. */
export function hitungLulus(p: Pengaturan, benarKasus: Iterable<string>, daftar: KasusPublik[] = KASUS_PUBLIK): HasilLulus {
  const bernilai = kasusDibuka(p, daftar).filter((k) => !k.bebas);
  const kode = new Set(bernilai.map((k) => k.kode));
  const benar = new Set([...benarKasus].filter((k) => kode.has(k))).size;
  const persen = bernilai.length === 0 ? 0 : Math.round((benar / bernilai.length) * 1000) / 10;
  return { dibuka: bernilai.length, benar, persen, lulus: p.nilai_lulus === null ? null : persen >= p.nilai_lulus };
}

// ---- Waktu untuk kolom isian datetime-local (WIB, UTC+7) ----
/** ISO (UTC) -> "YYYY-MM-DDTHH:mm" waktu WIB; kosong atau rusak -> "". */
export function isoKeInputWib(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 7 * 3_600_000).toISOString().slice(0, 16) : "";
}
/** "YYYY-MM-DDTHH:mm" (dianggap WIB) -> ISO UTC; kosong atau rusak -> null. */
export function inputWibKeIso(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}:00+07:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
