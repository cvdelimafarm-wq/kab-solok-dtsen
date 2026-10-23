// lib/belumDiajukan.ts
//
// (21 Okt 2026) Tab "Belum diajukan" di Kelola > Pendataan > "Permintaan daftar KK ke FASIH" -- permintaan user: daftar Sub SLS yang BELUM diajukan PML,
// lengkap dengan info plotting awalnya, dan admin dapat menugaskannya (assign) ke PML plotting ataupun ke PML/tim lain.
// Fungsi MURNI (tanpa DB/React): tipe, validasi kiriman, penyaringan, bawaan pilihan tim, dan susunan notifikasi.

import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "@/lib/sigapPushUtil";
import { rapikanNama } from "@/lib/rekapIdentifikasi";
import { MAKS_SUB_SEKALI_KIRIM, labelJorong } from "@/lib/permintaanDaftar";

/** Satu baris plotting awal Sub SLS (dari bencana_alokasi_subsls). ppl_id = id bencana_petugas, BUKAN id akun. */
export type PlottingAwal = {
  pml_id: number;
  pml_nama: string;
  ppl_id: number | null;
  ppl_nama: string | null;
  mode_kerja: string | null;
  porsi_kk: number | null;
  terkunci: boolean;
};

/** Pengajuan terakhir yang sudah tidak berlaku (mis. dibatalkan PML) -- supaya admin tahu riwayatnya. */
export type TerakhirBelum = {
  status: string;
  pml_nama: string | null;
  waktu: string | null;
  perlu_hapus: boolean;
  dari_kolam: boolean;
  dari_admin: boolean;
} | null;

export type BelumItem = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk: number;
  didata: number;
  /** true = masih di kolam wilayah kerja (belum diplot ke tim mana pun) */
  kolam: boolean;
  plotting: PlottingAwal[];
  terakhir: TerakhirBelum;
};

// (24 Okt 2026) email = email FASIH petugas (bencana_petugas.email_fasih) lalu email mitra; diisi server untuk admin, dipakai templat FASIH.
export type PplTugas = { petugas_id: number; nama: string; akun_id: number; email?: string };
export type TimTugas = { pml_id: number; pml_nama: string; sub: number; ppl: PplTugas[]; pml_email?: string };
export type DataBelum = { boleh_kelola: boolean; items: BelumItem[]; tim: TimTugas[] };

export type TugasPilihan = { idsubsls: string; pml_id: number; ppl_akun_id: number };

export function periksaTugas(x: unknown, maks = MAKS_SUB_SEKALI_KIRIM): { ok: true; pilihan: TugasPilihan[] } | { ok: false; pesan: string } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, pesan: "Pilih minimal satu Sub SLS." };
  if (x.length > maks) return { ok: false, pesan: `Maksimal ${maks} Sub SLS sekali tugaskan.` };
  const out: TugasPilihan[] = [];
  const sudah = new Set<string>();
  for (const r of x) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.idsubsls !== "string" || !/^\d{16}$/.test(o.idsubsls)) return { ok: false, pesan: "Kode Sub SLS tidak sah." };
    const pml = Number(o.pml_id);
    const ppl = Number(o.ppl_akun_id);
    if (!Number.isInteger(pml) || pml <= 0) return { ok: false, pesan: "Pilih PML tujuan untuk setiap Sub SLS." };
    if (!Number.isInteger(ppl) || ppl <= 0) return { ok: false, pesan: "Pilih PPL penerima untuk setiap Sub SLS." };
    if (sudah.has(o.idsubsls)) return { ok: false, pesan: "Sub SLS yang sama dipilih dua kali." };
    sudah.add(o.idsubsls);
    out.push({ idsubsls: o.idsubsls, pml_id: pml, ppl_akun_id: ppl });
  }
  return { ok: true, pilihan: out };
}

/** Alasan penolakan dari fungsi database bencana_admin_tugaskan -> kalimat untuk admin. `label` = nama Sub SLS yang bermasalah (boleh kosong). */
export function pesanTugas(alasan: string | undefined, label = ""): string {
  const u = label ? `${label}: ` : "";
  switch (alasan) {
    case "nonaktif":
      return `${u}Sub SLS berstatus NON AKTIF dan tidak dapat ditugaskan.`;
    case "tidak_ada":
      return `${u}Sub SLS tidak ditemukan.`;
    case "tanpa_kk":
      return `${u}daftar KK belum diunggah admin.`;
    case "ppl_bukan_tim":
      return `${u}PPL yang dipilih bukan anggota tim PML tujuan.`;
    case "sudah_didata":
      return `${u}sudah ada KK yang didata oleh tim lain, jadi plotting-nya tidak bisa dipindah.`;
    case "sudah_diminta":
      return `${u}sudah diminta dan masih berlaku (menunggu atau sudah keluar). Tolak atau batalkan dulu bila ingin menugaskan ulang.`;
    case "bukan_peserta":
      return `${u}PML atau PPL tujuan bukan peserta pelatihan pendataan.`;
    case "kosong":
      return "Pilih minimal satu Sub SLS.";
    default:
      return `${u}penugasan ditolak.`;
  }
}

const koleksi = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Urut menurut kecamatan, nagari, jorong, lalu sub. */
export function urutBelum<T extends Pick<BelumItem, "kecamatan" | "nagari" | "sls" | "sub_sls" | "idsubsls">>(a: T[]): T[] {
  return [...a].sort((p, q) => koleksi.compare(p.kecamatan, q.kecamatan) || koleksi.compare(p.nagari, q.nagari) || koleksi.compare(p.sls, q.sls) || koleksi.compare(p.sub_sls, q.sub_sls) || koleksi.compare(p.idsubsls, q.idsubsls));
}

export type SaringanBelum = { kecamatan: string; kata: string; jenis: "semua" | "plotting" | "kolam" };
export const SARINGAN_AWAL: SaringanBelum = { kecamatan: "", kata: "", jenis: "semua" };

export const adaPlotting = (b: Pick<BelumItem, "plotting">): boolean => b.plotting.length > 0;

/** Saring daftar. `kata` mencari di nama jorong/nagari, kode, dan nama PML/PPL plotting. */
export function saringBelum(items: BelumItem[], s: SaringanBelum): BelumItem[] {
  const kata = s.kata.trim().toLowerCase();
  return items.filter((b) => {
    if (s.kecamatan && b.kecamatan !== s.kecamatan) return false;
    if (s.jenis === "plotting" && !adaPlotting(b)) return false;
    if (s.jenis === "kolam" && adaPlotting(b)) return false;
    if (!kata) return true;
    const jerami = [b.sls, b.sub_sls, b.nagari, b.kecamatan, b.idsubsls, ...b.plotting.flatMap((p) => [p.pml_nama, p.ppl_nama ?? ""])].join(" ").toLowerCase();
    return kata.split(/\s+/).every((k) => jerami.includes(k));
  });
}

export const daftarKecamatan = (items: Pick<BelumItem, "kecamatan">[]): string[] => [...new Set(items.map((b) => b.kecamatan).filter(Boolean))].sort((a, b) => koleksi.compare(a, b));

const modeLabel = (m: string | null): string => (m === "keroyok" ? "keroyok" : m === "mandiri" ? "mandiri" : m ? m : "");

/** Satu baris ringkas plotting awal. Banyak PML/PPL (mis. keroyok) digabung. */
export function ringkasPlotting(b: Pick<BelumItem, "plotting">): string {
  if (!b.plotting.length) return "Belum diplot (masih di kolam wilayah)";
  const pml = [...new Set(b.plotting.map((p) => rapikanNama(p.pml_nama)))];
  const ppl = b.plotting.map((p) => (p.ppl_nama ? rapikanNama(p.ppl_nama) : "")).filter(Boolean);
  const mode = [...new Set(b.plotting.map((p) => modeLabel(p.mode_kerja)).filter(Boolean))];
  const kunci = b.plotting.some((p) => p.terkunci);
  return `PML ${pml.join(" & ")}${ppl.length ? ` → PPL ${ppl.join(", ")}` : ""}${mode.length ? ` · ${mode.join("/")}` : ""}${kunci ? " · terkunci" : ""}`;
}

/** Bawaan pilihan tim untuk satu Sub SLS: PML plotting awalnya (+ PPL plottingnya bila ada di tim itu, jika tidak PPL pertama). Tanpa plotting: kosong. */
export function bawaanTugas(b: Pick<BelumItem, "plotting">, tim: TimTugas[]): { pml_id: number | null; ppl_akun_id: number | null } {
  const p = b.plotting[0];
  if (!p) return { pml_id: null, ppl_akun_id: null };
  const t = tim.find((x) => x.pml_id === p.pml_id);
  if (!t) return { pml_id: null, ppl_akun_id: null };
  const cocok = p.ppl_id != null ? t.ppl.find((x) => x.petugas_id === p.ppl_id) : undefined;
  return { pml_id: t.pml_id, ppl_akun_id: (cocok ?? t.ppl[0])?.akun_id ?? null };
}

/**
 * (24 Okt 2026) Permintaan user: tab "Belum diajukan" perlu tombol unduh templat FASIH (format Pengawas-Pencacah) seperti tab "Menunggu admin".
 * Email pengawas = PML tujuan, email pencacah = PPL penerima (sesuai pilihan penugasan). Hasilnya diumpankan ke barisTemplatFasih (lib/permintaanDaftar.ts).
 * Email yang belum ada dikembalikan kosong (layar memberi peringatan, sama seperti ekspor di tab Menunggu admin).
 */
export function emailPilihanTugas(pilihan: TugasPilihan[], tim: TimTugas[]): { idsubsls: string; email_pengawas: string; email_pencacah: string }[] {
  return pilihan.map((p) => {
    const t = tim.find((x) => x.pml_id === p.pml_id);
    const ppl = t?.ppl.find((x) => x.akun_id === p.ppl_akun_id);
    return { idsubsls: p.idsubsls, email_pengawas: (t?.pml_email ?? "").trim(), email_pencacah: (ppl?.email ?? "").trim() };
  });
}

/** Pilihan bawaan saat admin berganti PML: PPL pertama tim itu. */
export function pplBawaan(tim: TimTugas[], pmlId: number): number | null {
  return tim.find((t) => t.pml_id === pmlId)?.ppl[0]?.akun_id ?? null;
}

export const labelSub = (b: Pick<BelumItem, "sls" | "sub_sls">): string => labelJorong(b.sls, b.sub_sls);

/** Kalimat riwayat pengajuan terakhir (bila ada). */
export function riwayatTerakhir(t: TerakhirBelum): string | null {
  if (!t) return null;
  const siapa = t.pml_nama ? ` ${rapikanNama(t.pml_nama)}` : "";
  const asal = t.dari_admin ? " (penugasan admin)" : t.dari_kolam ? " (dari kolam)" : "";
  if (t.status === "dibatalkan") return `Pengajuan terakhir${siapa}${asal} dibatalkan.${t.perlu_hapus ? " Assignment lamanya masih perlu dihapus di FASIH." : ""}`;
  return `Pengajuan terakhir${siapa}${asal}: ${t.status}.`;
}

// ---------------------------------------------------------------- notifikasi
export type ItemTugas = { jorong: string; ppl: string };

const namaPertama = (n: string): string => rapikanNama(n || "").split(" ")[0] || "PPL";
const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Gabungkan daftar item ke dalam batas MAKS_ISI_PUSH: yang dipotong DAFTARNYA ("+N lagi"), awal dan ekor tetap utuh. */
function susunDaftar(judul: string, awal: string, ekor: string, teks: string[]): { judul: string; isi: string } {
  const ruang = Math.max(20, MAKS_ISI_PUSH - ekor.length - awal.length - 1);
  const pilih: string[] = [];
  let pakai = 0;
  for (let k = 0; k < teks.length; k++) {
    const sisa = teks.length - k - 1;
    const tambah = (pilih.length ? 2 : 0) + teks[k].length;
    const cadangan = sisa > 0 ? ` (+${sisa} lagi)`.length : 0;
    if (pakai + tambah + cadangan > ruang && pilih.length > 0) break;
    pilih.push(pilih.length === 0 ? potong(teks[k], Math.max(10, ruang - cadangan)) : teks[k]);
    pakai += tambah;
  }
  const lagi = teks.length - pilih.length;
  return { judul: judul.slice(0, MAKS_JUDUL_PUSH), isi: potong(`${awal}${pilih.join("; ")}${lagi > 0 ? ` (+${lagi} lagi)` : ""}.${ekor}`, MAKS_ISI_PUSH) };
}

/**
 * Notifikasi penugasan admin. pml: rincian jorong → PPL penerima; ppl: jorong yang jadi tugasnya;
 * lama: PML asal yang Sub SLS-nya dialihkan admin ke tim lain.
 */
export function susunPushTugas(untuk: "pml" | "ppl" | "lama", items: ItemTugas[]): { judul: string; isi: string } {
  if (untuk === "pml") {
    return susunDaftar("Admin menugaskan Sub SLS ke tim Anda", "Ditugaskan admin: ", " Admin akan meng-assign di FASIH; Anda dikabari saat daftar KK sudah keluar. Tidak memakai kuota pengajuan Anda.", items.map((i) => `${i.jorong} → ${namaPertama(i.ppl)}`));
  }
  if (untuk === "ppl") {
    return susunDaftar("Anda ditugaskan admin", "Untuk Anda: ", " Tunggu daftar KK keluar di FASIH; Anda dikabari saat sudah siap.", items.map((i) => i.jorong));
  }
  return susunDaftar("Sub SLS dialihkan admin", "Dialihkan ke tim lain: ", " Anda tidak perlu mendata Sub SLS ini lagi.", items.map((i) => i.jorong));
}
