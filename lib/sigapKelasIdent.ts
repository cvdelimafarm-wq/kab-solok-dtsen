// lib/sigapKelasIdent.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Kelas pelatihan yang direncanakan pada identifikasi lanjutan (keu_ident_lanjutan.isi.kelas) -> bentuk ringkas untuk layar pelaksanaan:
// mode kelas (Daring / Luring / Hybrid), jadwal, tempat, peran peserta; kelas milik satu peserta; aturan tiap mode; peringatan isian.
// Hanya MEMBACA. Pemetaan penugasan.kelas (1..4) <-> kelas lanjutan = URUTAN kelas (disetujui 31 Okt 2026). Untuk kegiatan pelatihan, urutan dihitung di antara
// kelas berjenis "pelatihan" (kelas briefing tidak ikut) bila ada; selain itu di antara semua kelas.

import type { Kelas } from "@/lib/keu/lanjutan";

export type MetodeInfo = "Daring" | "Luring" | "Hybrid" | "";

export type KelasInfo = {
  nomor: number; // urutan 1.. (dasar pemetaan ke penugasan.kelas)
  id: string;
  nama: string;
  sesi: "briefing" | "pelatihan";
  metode: MetodeInfo;
  tempat: string;
  lokasi: string;
  mulai: string; // YYYY-MM-DD atau ""
  selesai: string;
  hari: number; // jumlah hari kalender inklusif; 0 bila tanggal belum lengkap
  untuk: string[]; // kode peran
  instruktur: string[];
  fix: boolean;
};

const TGL = /^\d{4}-\d{2}-\d{2}$/;
function hariUtc(t: string): number | null {
  if (!TGL.test(t)) return null;
  const [y, m, d] = t.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const cek = new Date(ms);
  return cek.getUTCFullYear() === y && cek.getUTCMonth() === m - 1 && cek.getUTCDate() === d ? Math.floor(ms / 86_400_000) : null;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "2026-03-02" -> "2 Mar 2026"; selain tanggal sah dikembalikan apa adanya. */
export function tglIndo(t: string): string {
  if (hariUtc(t) === null) return t;
  const [y, m, d] = t.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** "2 Mar 2026", "2–3 Mar 2026", "30 Mar – 1 Apr 2026" atau "Jadwal belum diisi". */
export function rentangTanggal(mulai: string, selesai: string): string {
  const a = hariUtc(mulai);
  const b = hariUtc(selesai);
  if (a === null && b === null) return "Jadwal belum diisi";
  if (a === null || b === null || mulai === selesai) return tglIndo(a !== null ? mulai : selesai);
  const [y1, m1, d1] = mulai.split("-").map(Number);
  const [y2, m2, d2] = selesai.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${BULAN[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${BULAN[m1 - 1]} – ${d2} ${BULAN[m2 - 1]} ${y1}`;
  return `${tglIndo(mulai)} – ${tglIndo(selesai)}`;
}

const metodeSah = (m: string): MetodeInfo => (m === "Daring" || m === "Luring" || m === "Hybrid" ? m : "");

type KelasMentah = Pick<Kelas, "id" | "nama" | "sesi" | "metode" | "tempat" | "lokasi" | "mulai" | "selesai" | "untuk" | "fix"> & { instruktur?: { nama: string }[] };

/** Daftar kelas lanjutan -> ringkas bernomor. `hanyaPelatihan`: bila ada kelas berjenis pelatihan, kelas briefing dibuang (nomor dihitung ulang dari 1). */
export function ringkasKelas(kelas: readonly KelasMentah[], hanyaPelatihan: boolean): KelasInfo[] {
  const ada = hanyaPelatihan && kelas.some((k) => k.sesi === "pelatihan");
  const pakai = ada ? kelas.filter((k) => k.sesi === "pelatihan") : kelas;
  return pakai.map((k, i) => {
    const a = hariUtc(k.mulai);
    const b = hariUtc(k.selesai);
    return {
      nomor: i + 1,
      id: String(k.id),
      nama: String(k.nama ?? "").trim() || `Kelas ${i + 1}`,
      sesi: k.sesi === "briefing" ? "briefing" : "pelatihan",
      metode: metodeSah(String(k.metode ?? "")),
      tempat: String(k.tempat ?? ""),
      lokasi: String(k.lokasi ?? "").trim(),
      mulai: a !== null ? k.mulai : "",
      selesai: b !== null ? k.selesai : "",
      hari: a !== null && b !== null && b >= a ? b - a + 1 : 0,
      untuk: Array.isArray(k.untuk) ? k.untuk.map(String) : [],
      instruktur: (k.instruktur ?? []).map((x) => String(x.nama ?? "").trim()).filter(Boolean),
      fix: k.fix === true,
    };
  });
}

export type CaraKelas = "penugasan" | "otomatis" | "tidak_pasti" | "tidak_ada";
export type KelasPeserta = { cara: CaraKelas; kelas: KelasInfo | null; kandidat: KelasInfo[] };

/**
 * Kelas milik satu peserta. `nomorPenugasan` = sigap_penugasan.kelas (1..n). Bila kosong/di luar jangkauan: satu-satunya kelas yang memuat peran peserta (otomatis);
 * lebih dari satu -> tidak pasti (kandidat dikembalikan); nol -> tidak ada.
 */
export function kelasUntukPeserta(daftar: readonly KelasInfo[], peran: string, nomorPenugasan: number | null): KelasPeserta {
  if (daftar.length === 0) return { cara: "tidak_ada", kelas: null, kandidat: [] };
  if (nomorPenugasan !== null && Number.isInteger(nomorPenugasan) && nomorPenugasan >= 1 && nomorPenugasan <= daftar.length) {
    return { cara: "penugasan", kelas: daftar[nomorPenugasan - 1], kandidat: [] };
  }
  const kandidat = daftar.filter((k) => k.untuk.includes(peran));
  if (kandidat.length === 1) return { cara: "otomatis", kelas: kandidat[0], kandidat: [] };
  return { cara: kandidat.length === 0 ? "tidak_ada" : "tidak_pasti", kelas: null, kandidat };
}

export type AturanMode = {
  metode: Exclude<MetodeInfo, "">;
  /** Cara presensi: lokasi (GPS di tempat), token (kode dari panitia saat Zoom), keduanya (hybrid). */
  presensi: "lokasi" | "token" | "keduanya";
  foto_translok: boolean;
  pulsa: boolean;
  judul: string;
  petunjuk: string[];
};

export function aturanMode(metode: MetodeInfo): AturanMode | null {
  if (metode === "Daring") {
    return {
      metode, presensi: "token", foto_translok: false, pulsa: true, judul: "Daring (Zoom)",
      petunjuk: ["Ikuti kelas lewat Zoom pada jadwal di atas.", "Presensi memakai token yang dibagikan panitia saat kelas berlangsung.", "Tidak ada transport lokal: foto bukti kehadiran di lokasi tidak diperlukan."],
    };
  }
  if (metode === "Luring") {
    return {
      metode, presensi: "lokasi", foto_translok: true, pulsa: false, judul: "Luring (tatap muka)",
      petunjuk: ["Hadir langsung di lokasi kelas.", "Presensi dilakukan di lokasi dengan lokasi (GPS) HP aktif.", "Transport lokal dicairkan dengan foto bukti kehadiran di lokasi."],
    };
  }
  if (metode === "Hybrid") {
    return {
      metode, presensi: "keduanya", foto_translok: true, pulsa: true, judul: "Hybrid (luring dan daring)",
      petunjuk: ["Peserta di lokasi: presensi dengan GPS aktif; transport lokal dengan foto bukti.", "Peserta via Zoom: presensi dengan token dari panitia.", "Tanyakan ke panitia bila belum jelas Anda ikut yang mana."],
    };
  }
  return null;
}

export type PeringatanKelas = { nomor: number; pesan: string };

/** Isian kelas yang belum cukup untuk dipakai layar pelaksanaan. Hanya saran; tidak memblokir apa pun. */
export function peringatanKelas(daftar: readonly KelasInfo[]): PeringatanKelas[] {
  const hasil: PeringatanKelas[] = [];
  for (const k of daftar) {
    const label = `${k.nama} (kelas ${k.nomor})`;
    if (k.metode === "") hasil.push({ nomor: k.nomor, pesan: `${label}: bentuk kelas (daring/luring/hybrid) belum diisi, layar peserta tidak bisa menampilkan cara presensi.` });
    if (k.mulai === "" || k.selesai === "") hasil.push({ nomor: k.nomor, pesan: `${label}: tanggal mulai atau selesai belum diisi.` });
    else if (k.hari === 0) hasil.push({ nomor: k.nomor, pesan: `${label}: tanggal selesai lebih awal dari tanggal mulai.` });
    if ((k.metode === "Luring" || k.metode === "Hybrid") && k.lokasi === "") hasil.push({ nomor: k.nomor, pesan: `${label}: nama tempat belum diisi (dipakai pada undangan dan presensi).` });
    if (k.untuk.length === 0) hasil.push({ nomor: k.nomor, pesan: `${label}: peran peserta belum dipilih.` });
  }
  return hasil;
}

export type SebaranPeserta = { per_kelas: Map<number, number>; tanpa_kelas: number; di_luar: number };

/** Hitung peserta per kelas dari penugasan.kelas. `di_luar` = nomor kelas penugasan yang tidak ada di perencanaan. */
export function sebaranPeserta(daftar: readonly KelasInfo[], nomorPenugasan: readonly (number | null)[]): SebaranPeserta {
  const per = new Map<number, number>(daftar.map((k) => [k.nomor, 0]));
  let tanpa = 0;
  let luar = 0;
  for (const n of nomorPenugasan) {
    if (n === null || n === undefined) tanpa++;
    else if (per.has(n)) per.set(n, (per.get(n) ?? 0) + 1);
    else luar++;
  }
  return { per_kelas: per, tanpa_kelas: tanpa, di_luar: luar };
}
