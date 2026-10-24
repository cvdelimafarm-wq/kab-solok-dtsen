// lib/keu/usulan.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK, papan 9 dan 10 mockup -- logika murni tab "Revisi" (usulan per RO) dan "Tim dan akses" pada
// ruang kerja satu RO. Tanpa React/DB supaya mudah diuji. Yang memutuskan tetap basis data (keu_usulan_buat, keu_usulan_aksi, keu_boleh);
// fungsi di sini hanya menentukan tombol mana yang layak ditampilkan dan bagaimana alur dibaca.
//
// Alur usulan RO (ditegakkan keu_usulan_aksi):
//   draf --ajukan (admin RO)--> menunggu_ketua --setuju_ketua--> menunggu_ppk --sahkan--> disetujui
//   ketua tim yang mengajukan langsung ke menunggu_ppk; PPK yang merangkap ketua tim langsung disetujui (lapor KPA);
//   kembalikan (alasan >= 5 huruf) dari menunggu_ketua/menunggu_ppk -> dikembalikan -> diajukan lagi. Semua aksi hanya saat jadwal dibuka.

import type { BarisPenugasan } from "./ro";

export type HakUsulan = { rab: boolean; draf: boolean; setuju_ketua: boolean; sahkan: boolean };
export type AksiUsulan = "ajukan" | "setuju_ketua" | "sahkan" | "kembalikan";

export const LABEL_AKSI_USULAN: Record<AksiUsulan, string> = {
  ajukan: "Ajukan", setuju_ketua: "Setujui sebagai ketua tim", sahkan: "Sahkan sebagai PPK", kembalikan: "Kembalikan",
};
/** Kata kerja lampau untuk riwayat ("Ahmad mengajukan ..."). Aksi tak dikenal ditampilkan apa adanya. */
export const LABEL_JEJAK_USULAN: Record<string, string> = {
  ajukan: "Diajukan", setuju_ketua: "Disetujui ketua tim", sahkan: "Disahkan PPK", kembalikan: "Dikembalikan", buat: "Dibuat",
};
export const AKSI_USULAN_BUTUH_ALASAN: readonly AksiUsulan[] = ["kembalikan"];

/** Empat langkah alur pada stepper. `dikembalikan` dibaca sebagai kembali ke langkah Draf (perlu diperbaiki lalu diajukan lagi). */
export const LANGKAH_USULAN: { kode: "draf" | "menunggu_ketua" | "menunggu_ppk" | "disetujui"; label: string }[] = [
  { kode: "draf", label: "Draf" },
  { kode: "menunggu_ketua", label: "Menunggu ketua tim" },
  { kode: "menunggu_ppk", label: "Menunggu PPK" },
  { kode: "disetujui", label: "Disetujui" },
];

export type KeadaanLangkah = "selesai" | "sekarang" | "belum";
/** Keadaan tiap langkah stepper untuk status usulan itu. Status tak dikenal -> semua belum. */
export function keadaanLangkah(status: string): KeadaanLangkah[] {
  const s = status === "dikembalikan" ? "draf" : status;
  const i = LANGKAH_USULAN.findIndex((l) => l.kode === s);
  if (i < 0) return LANGKAH_USULAN.map(() => "belum");
  // langkah terakhir (Disetujui) yang sudah tercapai tampil selesai, bukan "sekarang"
  return LANGKAH_USULAN.map((_, k) => (k < i || (s === "disetujui" && k === i) ? "selesai" : k === i ? "sekarang" : "belum"));
}

/** Usulan masih dalam proses (belum final)? */
export const usulanBerjalan = (status: string): boolean => ["draf", "menunggu_ketua", "menunggu_ppk", "dikembalikan"].includes(status);

/**
 * Aksi yang layak ditampilkan. `jadwalStatus` harus "dibuka" untuk semua aksi (keu_usulan_aksi menolak selain itu).
 * Aturan pengaju-tak-boleh-menyetujui-sendiri ditegakkan basis data (klien tidak tahu siapa pengaju) dan ditampilkan sebagai galat.
 */
export function aksiUsulan(status: string, jadwalStatus: string, hak: HakUsulan): AksiUsulan[] {
  if (jadwalStatus !== "dibuka") return [];
  const a: AksiUsulan[] = [];
  if (status === "draf" || status === "dikembalikan") {
    if (hak.rab || hak.draf) a.push("ajukan");
  } else if (status === "menunggu_ketua") {
    if (hak.setuju_ketua) a.push("setuju_ketua", "kembalikan");
  } else if (status === "menunggu_ppk") {
    if (hak.sahkan) a.push("sahkan", "kembalikan");
  }
  return a;
}

/** Boleh membuat usulan baru untuk jadwal ini? Jadwal harus dibuka, akun berwenang menyusun, dan RO belum punya usulan pada jadwal itu. */
export function bolehBuatUsulan(jadwalStatus: string, sudahAda: boolean, hak: HakUsulan): boolean {
  return jadwalStatus === "dibuka" && !sudahAda && (hak.rab || hak.draf);
}

export function periksaAlasanUsulan(aksi: AksiUsulan, catatan: string): string | null {
  if (AKSI_USULAN_BUTUH_ALASAN.includes(aksi) && catatan.trim().length < 5) return "Alasan pengembalian minimal 5 huruf.";
  return null;
}

/** Teks "kini di tangan siapa" di bawah stepper; kosong bila sudah final. */
export function teksGiliran(status: string): string {
  switch (status) {
    case "draf": return "Belum diajukan. Ketua tim atau admin RO dapat mengajukan.";
    case "menunggu_ketua": return "Menunggu persetujuan ketua tim.";
    case "menunggu_ppk": return "Menunggu pengesahan PPK.";
    case "dikembalikan": return "Dikembalikan untuk diperbaiki; ajukan lagi setelah selesai.";
    case "disetujui": return "Disetujui. Kepala (KPA) menerima laporan; sah atau tidaknya revisi diputuskan PPK di halaman Jadwal revisi.";
    default: return "";
  }
}

/** Apakah usulan ini menunggu tindakan akun ini? Dipakai untuk lencana tab dan sorotan kartu. */
export function menungguSaya(status: string, jadwalStatus: string, hak: HakUsulan): boolean {
  const a = aksiUsulan(status, jadwalStatus, hak);
  return a.includes("setuju_ketua") || a.includes("sahkan");
}

export type BarisJejakUsulan = { id: number; usulan_id: number; jadwal_id: number; ro_kode: string; aksi: string; dari: string | null; ke: string | null; oleh_nama: string | null; catatan: string; waktu: string };
/** Jejak satu usulan, terbaru dulu (id menurun). */
export function jejakUsulan(baris: BarisJejakUsulan[], usulanId: number): BarisJejakUsulan[] {
  return baris.filter((b) => b.usulan_id === usulanId).sort((a, b) => b.id - a.id);
}

export type UsulanRingkas = { id: number; jadwal_id: number; ro_kode: string; status: string };
/** Usulan RO ini pada jadwal itu (satu per jadwal; bila ada ganda, yang terbaru). */
export function usulanJadwal<U extends UsulanRingkas>(daftar: U[], jadwalId: number, ro: string): U | null {
  return daftar.filter((u) => u.jadwal_id === jadwalId && u.ro_kode === ro).sort((a, b) => b.id - a.id)[0] ?? null;
}

/** Jumlah usulan RO ini yang menunggu tindakan akun (untuk lencana tab Revisi). `jadwalStatus` memetakan id jadwal -> status. */
export function jumlahMenunggu(daftar: UsulanRingkas[], jadwalStatus: Map<number, string>, hak: HakUsulan): number {
  return daftar.filter((u) => menungguSaya(u.status, jadwalStatus.get(u.jadwal_id) ?? "", hak)).length;
}

/** Jadwal yang ditampilkan di tab Revisi: yang dibuka, ditambah yang sudah punya usulan RO ini. Dibuka dulu, lalu id menurun. */
export function jadwalTampil<J extends { id: number; status: string }>(jadwal: J[], usulan: UsulanRingkas[]): J[] {
  const punya = new Set(usulan.map((u) => u.jadwal_id));
  return jadwal
    .filter((j) => j.status === "dibuka" || punya.has(j.id))
    .sort((a, b) => Number(b.status === "dibuka") - Number(a.status === "dibuka") || b.id - a.id);
}

// ---------------------------------------------------------------- Tim dan akses
export const LABEL_PERAN: Record<string, string> = {
  KETUA: "Ketua tim", ADMINRO: "Admin RO", PBJ: "Pengelola PBJ", AKSES_ADM: "Akses tab Administrasi",
  PPK: "PPK", KPA: "Kepala (KPA)", BEND: "Bendahara", TU: "Tata usaha", RENC: "Perencanaan", ADMIN: "Admin aplikasi",
};
/** Peran yang melekat pada satu RO (urutan tampil). Selain ini berlaku untuk seluruh satker. */
export const PERAN_PER_RO: readonly string[] = ["KETUA", "ADMINRO", "PBJ", "AKSES_ADM"];
export const PERAN_SATKER: readonly string[] = ["PPK", "KPA", "BEND", "TU", "RENC", "ADMIN"];

export type BarisTim = { nama: string; peran: string; mulai: string; sampai: string | null; aktif: boolean; semuaRo: boolean };
export type KelompokTim = { peran: string; label: string; baris: BarisTim[] };

const urutTim = (a: BarisTim, b: BarisTim) => Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama) || b.mulai.localeCompare(a.mulai);

/**
 * Penugasan yang menyangkut RO ini, dikelompokkan per peran. Peran per-RO hanya yang ro_kode-nya RO ini (AKSES_ADM boleh untuk semua RO);
 * peran satker (PPK, KPA, ...) ditampilkan sebagai konteks. Kelompok per-RO selalu muncul walau kosong supaya "belum ditugaskan" terlihat.
 */
export function timRo(baris: BarisPenugasan[], ro: string): { perRo: KelompokTim[]; satker: KelompokTim[] } {
  const ubah = (b: BarisPenugasan): BarisTim => ({ nama: b.akun_nama, peran: b.peran_kode, mulai: b.berlaku_mulai, sampai: b.berlaku_sampai, aktif: b.aktif_hari_ini, semuaRo: b.ro_kode === null });
  const perRo: KelompokTim[] = PERAN_PER_RO.map((p) => ({
    peran: p, label: LABEL_PERAN[p] ?? p,
    baris: baris.filter((b) => b.peran_kode === p && (b.ro_kode === ro || (p === "AKSES_ADM" && b.ro_kode === null))).map(ubah).sort(urutTim),
  }));
  const satker: KelompokTim[] = PERAN_SATKER
    .map((p) => ({ peran: p, label: LABEL_PERAN[p] ?? p, baris: baris.filter((b) => b.peran_kode === p && b.ro_kode === null).map(ubah).sort(urutTim) }))
    .filter((k) => k.baris.length > 0);
  return { perRo, satker };
}

/** "mulai 1 Jan 2026 s.d. 31 Des 2026" / "sejak 1 Jan 2026" (tanpa batas akhir). Tanggal diformat oleh pemanggil. */
export function masaBerlaku(mulai: string, sampai: string | null, fmt: (s: string) => string): string {
  return sampai ? `${fmt(mulai)} s.d. ${fmt(sampai)}` : `sejak ${fmt(mulai)}`;
}

/** Peran akun ini pada RO ini menurut hak (untuk kalimat "Peran Anda di RO ini"). Urutan dari yang paling berwenang. */
export function peranSaya(hak: HakUsulan): string[] {
  const p: string[] = [];
  if (hak.sahkan) p.push("PPK (mengesahkan usulan)");
  if (hak.setuju_ketua) p.push("Ketua tim (menyetujui usulan admin RO)");
  if (hak.rab && !hak.setuju_ketua) p.push("Penyusun RAB");
  if (hak.draf && !hak.rab) p.push("Admin RO (menyusun dan mengajukan draf)");
  return p;
}

// ---------------------------------------------------------------- dari= dan tab terakhir
/**
 * Alamat asal yang boleh dipakai tombol Kembali: harus jalur dalam aplikasi berawalan /sigap/ (bukan //, bukan skema, bukan hasil
 * pengodean ulang yang lolos). Selain itu null sehingga halaman memakai tujuan bawaan.
 */
export function dariAman(q: string | null | undefined): string | null {
  if (!q || q.length > 300) return null;
  let t = q;
  try {
    t = decodeURIComponent(q);
  } catch {
    t = q; // bukan hasil pengodean (mis. sudah didekode pembaca parameter): periksa apa adanya
  }
  if (!t.startsWith("/sigap") || t.startsWith("//") || /[\\\s\u0000-\u001f]/.test(t) || t.includes("://")) return null;
  if (t !== "/sigap" && !/^\/sigap[/?#]/.test(t)) return null;
  return t;
}

/** Nama tujuan untuk tombol "Kembali ke ..." menurut alamat asal. Tak dikenal -> "Halaman sebelumnya". */
export function labelDari(alamat: string): string {
  const jalur = alamat.split(/[?#]/)[0].replace(/\/+$/, "");
  if (jalur === "/sigap/revisi/kertas") return "Kertas kerja KRO";
  if (jalur === "/sigap/revisi") return "Jadwal revisi";
  if (jalur === "/sigap/ro") return "Daftar RO";
  if (jalur === "/sigap/akses") return "Peran dan akses";
  if (jalur === "/sigap/realisasi") return "Realisasi";
  if (jalur === "/sigap") return "Beranda SIGAP";
  if (/^\/sigap\/ro\/[^/]+$/.test(jalur)) return "Ruang kerja RO";
  return "Halaman sebelumnya";
}

export const KUNCI_TAB_TERAKHIR = "sigap.ro.tab";
/** Tab terakhir per RO disimpan sebagai objek {kodeRO: tab}; bentuk rusak -> kosong. Tab yang tak lagi dikenal dibuang. */
export function bacaTabTerakhir(mentah: string | null | undefined, ro: string, sah: readonly string[]): string | null {
  if (!mentah) return null;
  try {
    const o = JSON.parse(mentah) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const v = (o as Record<string, unknown>)[ro];
    return typeof v === "string" && sah.includes(v) ? v : null;
  } catch {
    return null;
  }
}
/** Gabungkan tab baru ke simpanan lama (maks 60 RO supaya tidak membesar). */
export function simpanTabTerakhir(mentah: string | null | undefined, ro: string, tab: string): string {
  let o: Record<string, string> = {};
  try {
    const p = JSON.parse(mentah ?? "{}") as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) o = Object.fromEntries(Object.entries(p as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    o = {};
  }
  delete o[ro];
  const hasil = { ...o, [ro]: tab };
  const kunci = Object.keys(hasil);
  if (kunci.length > 60) for (const k of kunci.slice(0, kunci.length - 60)) delete hasil[k];
  return JSON.stringify(hasil);
}
