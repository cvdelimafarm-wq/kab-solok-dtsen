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

/** Foto bukti Transport Lokal diperlukan? Hanya kelas Daring yang tidak memerlukannya; bentuk belum diisi / tidak diketahui = tetap diperlukan (perilaku lama). */
export function perluFotoTranslok(aturan: Pick<AturanMode, "foto_translok"> | null | undefined): boolean {
  return aturan ? aturan.foto_translok : true;
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

export type PeriodeRencana = { mulai: string; selesai: string; hari: number };

/** Periode kegiatan menurut perencanaan = tanggal mulai paling awal sampai selesai paling akhir di antara kelas bertanggal sah. Tidak ada kelas bertanggal -> null. */
export function periodeKelas(daftar: readonly KelasInfo[]): PeriodeRencana | null {
  let mulai = "";
  let selesai = "";
  for (const k of daftar) {
    if (k.hari === 0) continue; // tanggal belum lengkap / terbalik
    if (mulai === "" || k.mulai < mulai) mulai = k.mulai;
    if (selesai === "" || k.selesai > selesai) selesai = k.selesai;
  }
  if (mulai === "" || selesai === "") return null;
  return { mulai, selesai, hari: (hariUtc(selesai) as number) - (hariUtc(mulai) as number) + 1 };
}

export type BandingPeriode = "sama" | "beda" | "kosong";

/** Periode tercatat pada kegiatan dibanding rencana: sama / beda / kosong (kegiatan belum punya salah satu tanggal). */
export function bandingPeriode(rencana: Pick<PeriodeRencana, "mulai" | "selesai">, kegiatan: { mulai: string | null; selesai: string | null }): BandingPeriode {
  if (!kegiatan.mulai || !kegiatan.selesai) return "kosong";
  return kegiatan.mulai === rencana.mulai && kegiatan.selesai === rencana.selesai ? "sama" : "beda";
}

/** Semua tanggal (YYYY-MM-DD) dari mulai sampai selesai inklusif; kosong bila tanggal tidak sah/terbalik. Dibatasi `maks` hari agar isian ngawur tidak meledak. */
export function tanggalKelas(k: Pick<KelasInfo, "mulai" | "selesai">, maks = 31): string[] {
  const a = hariUtc(k.mulai);
  const b = hariUtc(k.selesai);
  if (a === null || b === null || b < a) return [];
  const hasil: string[] = [];
  for (let h = a; h <= b && hasil.length < maks; h++) hasil.push(new Date(h * 86_400_000).toISOString().slice(0, 10));
  return hasil;
}

export type UsulanRapat = { kelas_nomor: number; nama: string; metode: "Daring" | "Hybrid"; tanggal: string; judul: string };

/**
 * Usulan rapat Zoom dari jadwal kelas: satu usulan per hari kelas berbentuk Daring/Hybrid yang BELUM punya rapat pada tanggal itu.
 * `tanggalRapatAda` = tanggal (WIB, YYYY-MM-DD) rapat yang sudah dibuat untuk kegiatan itu.
 */
export function usulanRapat(daftar: readonly KelasInfo[], tanggalRapatAda: readonly string[]): UsulanRapat[] {
  const ada = new Set(tanggalRapatAda);
  const hasil: UsulanRapat[] = [];
  for (const k of daftar) {
    if (k.metode !== "Daring" && k.metode !== "Hybrid") continue;
    const hari = tanggalKelas(k);
    hari.forEach((t, i) => {
      if (ada.has(t)) return;
      hasil.push({ kelas_nomor: k.nomor, nama: k.nama, metode: k.metode as "Daring" | "Hybrid", tanggal: t, judul: hari.length > 1 ? `${k.nama} (Zoom) – hari ke-${i + 1}` : `${k.nama} (Zoom)` });
    });
  }
  return hasil;
}

export type SebaranPeran = SebaranPeserta & { otomatis: number };

/**
 * Seperti `sebaranPeserta`, tetapi peserta tanpa nomor kelas tetap dihitung ke kelas bila peran-nya hanya cocok dengan satu kelas (sama dengan yang dilihat peserta).
 * `tanpa_kelas` = tidak bisa ditentukan (tidak ada kelas untuk perannya, atau lebih dari satu kandidat). `otomatis` = jumlah peserta yang kelasnya ditentukan dari peran.
 */
export function sebaranDenganPeran(daftar: readonly KelasInfo[], peserta: readonly { peran: string; kelas: number | null }[]): SebaranPeran {
  const per = new Map<number, number>(daftar.map((k) => [k.nomor, 0]));
  let tanpa = 0;
  let luar = 0;
  let otomatis = 0;
  for (const p of peserta) {
    const n = p.kelas === null || p.kelas === undefined ? null : Number(p.kelas);
    if (n !== null && Number.isInteger(n) && n >= 1 && n > daftar.length) {
      luar++;
      continue;
    }
    const h = kelasUntukPeserta(daftar, p.peran, n);
    if (h.kelas) {
      per.set(h.kelas.nomor, (per.get(h.kelas.nomor) ?? 0) + 1);
      if (h.cara === "otomatis") otomatis++;
    } else tanpa++;
  }
  return { per_kelas: per, tanpa_kelas: tanpa, di_luar: luar, otomatis };
}

/**
 * Teks ringkas jadwal pelatihan untuk pengumuman seleksi (batas 500 karakter pada kolom info): "Nama: 2–3 Nov 2026, Luring di Hotel X; Nama2: ..., Daring (Zoom)".
 * Kelas tanpa tanggal tetap disebut tanpa tanggal. Daftar kosong -> "". Dipotong pada batas kelas bila melebihi `maks`.
 */
export function teksInfoPelatihan(daftar: readonly KelasInfo[], maks = 480): string {
  const butir = daftar.map((k) => {
    const tgl = k.mulai !== "" && k.selesai !== "" ? rentangTanggal(k.mulai, k.selesai) : k.mulai !== "" ? tglIndo(k.mulai) : "";
    const bentuk = k.metode === "Daring" ? "Daring (Zoom)" : k.metode === "" ? "" : k.lokasi ? `${k.metode} di ${k.lokasi}` : k.metode;
    return [k.nama, [tgl, bentuk].filter(Boolean).join(", ")].filter(Boolean).join(": ");
  });
  let hasil = "";
  for (const b of butir) {
    const calon = hasil ? `${hasil}; ${b}` : b;
    if (calon.length > maks) break;
    hasil = calon;
  }
  if (hasil === "" && butir.length > 0) hasil = `${butir[0].slice(0, maks - 1)}…`;
  return hasil;
}

export type OpsiKelas = { nomor: number; nama: string; metode: MetodeInfo; jadwal: string; lokasi: string };

/** Kelas yang memuat peran itu (calon pilihan Mitra saat konfirmasi). */
export function opsiKelasPeran(daftar: readonly KelasInfo[], peran: string): KelasInfo[] {
  return daftar.filter((k) => k.untuk.includes(peran));
}

/** Bentuk ringkas untuk layar Mitra. */
export function ringkasOpsi(k: KelasInfo): OpsiKelas {
  return { nomor: k.nomor, nama: k.nama, metode: k.metode, jadwal: rentangTanggal(k.mulai, k.selesai), lokasi: k.lokasi };
}

/**
 * Kelas yang akan menjadi `sigap_penugasan.kelas` bagi Mitra yang bersedia: satu-satunya kelas untuk perannya (otomatis), atau pilihannya bila ada beberapa.
 * `perluPilih` = ada lebih dari satu kelas dan pilihan belum ada/tidak sah. Tidak ada kelas untuk peran -> nomor null (penugasan tanpa kelas, seperti sekarang).
 */
export function tetapkanKelas(daftar: readonly KelasInfo[], peran: string, pilihan: number | null | undefined): { nomor: number | null; perluPilih: boolean } {
  const opsi = opsiKelasPeran(daftar, peran);
  if (opsi.length === 0) return { nomor: null, perluPilih: false };
  if (opsi.length === 1) return { nomor: opsi[0].nomor, perluPilih: false };
  const p = pilihan === null || pilihan === undefined ? NaN : Number(pilihan);
  if (Number.isInteger(p) && opsi.some((k) => k.nomor === p)) return { nomor: p, perluPilih: false };
  return { nomor: null, perluPilih: true };
}
