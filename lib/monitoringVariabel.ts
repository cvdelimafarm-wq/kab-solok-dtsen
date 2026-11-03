// lib/monitoringVariabel.ts  (murni; dipakai klien dan tes)
//
// (3 Nov 2026) Tab Monitoring pelatihan: dropdown "Pantau menurut" supaya SETIAP tahapan dapat dipantau sendiri-sendiri
// (undangan terima/tolak, kehadiran, materi wajib, Vanguard, pretest, posttest, kunci/izin, kelulusan), lengkap dengan saringan status dan hitungan per status.
// Dipakai sama oleh panitia, instruktur, dan atasan peserta (PML / korwil: bawahannya) karena data sudah disaring server menurut hierarki.

export type NadaPantau = "ok" | "wait" | "bad" | "mut";
export type KodeVariabel = "semua" | "undangan" | "hadir" | "materi" | "vanguard" | "pretest" | "posttest" | "kunci" | "kelulusan";

export type VgBaris = {
  mode: "tidak_ada" | "opsional" | "wajib";
  berturut: number;
  hari_berturut: number;
  /** Latihan wajib (N hari berturut-turut) sudah tuntas. */
  latihan_tuntas: boolean;
  hari_ini_sudah: boolean;
  terputus: boolean;
  /** null = tidak disyaratkan (bukan mode wajib). */
  sertifikasi_selesai: boolean | null;
};
export type BankBaris = { percobaan: number; benar: number };

type Tes = { status: "belum" | "mengerjakan" | "selesai" };
export type BarisPantau = {
  undangan: "belum" | "terima" | "tolak";
  pretest: Tes;
  posttest: Tes;
  hadir: boolean;
  materi?: { belum: number; manual: boolean } | null;
  kunci: { tahap: string }[];
  izin: { pretest: string | null; posttest: string | null };
  kelulusan?: string;
  vanguard?: VgBaris | null;
  bank?: BankBaris | null;
};

export type StatusPantau = { kode: string; label: string; nada: NadaPantau };

const S = (kode: string, label: string, nada: NadaPantau): StatusPantau => ({ kode, label, nada });

const STATUS: Record<Exclude<KodeVariabel, "semua">, StatusPantau[]> = {
  undangan: [S("terima", "Diterima", "ok"), S("tolak", "Ditolak", "bad"), S("belum", "Belum menjawab", "mut")],
  hadir: [S("ya", "Sudah hadir", "ok"), S("belum", "Belum hadir", "mut")],
  materi: [S("tuntas", "Tuntas", "ok"), S("belum", "Belum tuntas", "wait")],
  vanguard: [
    S("selesai", "Lengkap", "ok"),
    S("tinggal_sertifikasi", "Tinggal Sertifikasi", "wait"),
    S("berjalan", "Berjalan", "wait"),
    S("terputus", "Terputus", "bad"),
    S("belum_mulai", "Belum mulai", "mut"),
  ],
  pretest: [S("selesai", "Selesai", "ok"), S("mengerjakan", "Berjalan", "wait"), S("belum", "Belum", "mut")],
  posttest: [S("selesai", "Selesai", "ok"), S("mengerjakan", "Berjalan", "wait"), S("belum", "Belum", "mut")],
  kunci: [S("izin_menunggu", "Minta buka kunci", "wait"), S("terkunci", "Terkunci", "wait"), S("lancar", "Tidak terkunci", "ok")],
  kelulusan: [S("lulus", "Lulus", "ok"), S("tidak_lulus", "Tidak lulus", "bad"), S("belum_lengkap", "Belum lengkap", "wait"), S("belum_dinilai", "Belum dinilai", "mut")],
};

export const LABEL_VARIABEL: Record<KodeVariabel, string> = {
  semua: "Semua tahapan (ringkas)",
  undangan: "Undangan (terima / tolak)",
  hadir: "Kehadiran",
  materi: "Materi wajib (video / tautan)",
  vanguard: "Vanguard (latihan, sertifikasi, bank soal)",
  pretest: "Pretest",
  posttest: "Posttest",
  kunci: "Terkunci dan permintaan buka kunci",
  kelulusan: "Nilai akhir dan kelulusan",
};

const URUTAN: KodeVariabel[] = ["semua", "undangan", "hadir", "materi", "vanguard", "pretest", "posttest", "kunci", "kelulusan"];

/** Variabel yang punya data pada daftar ini (yang kosong tidak ditawarkan supaya dropdown tidak membingungkan). */
export function variabelTersedia(baris: readonly BarisPantau[]): { kode: KodeVariabel; label: string }[] {
  const ada = (k: KodeVariabel): boolean => {
    switch (k) {
      case "materi": return baris.some((b) => !!b.materi);
      case "vanguard": return baris.some((b) => !!b.vanguard || (b.bank?.percobaan ?? 0) > 0);
      case "kelulusan": return baris.some((b) => b.kelulusan !== undefined);
      default: return true;
    }
  };
  return URUTAN.filter(ada).map((kode) => ({ kode, label: LABEL_VARIABEL[kode] }));
}

export function statusVanguard(v: VgBaris | null | undefined): string {
  if (!v) return "belum_mulai";
  const lengkap = v.latihan_tuntas && v.sertifikasi_selesai !== false;
  if (lengkap) return "selesai";
  if (v.latihan_tuntas) return "tinggal_sertifikasi";
  if (v.terputus) return "terputus";
  return v.berturut > 0 || v.hari_ini_sudah ? "berjalan" : "belum_mulai";
}

export function kodeStatus(variabel: Exclude<KodeVariabel, "semua">, b: BarisPantau): string {
  switch (variabel) {
    case "undangan": return b.undangan;
    case "hadir": return b.hadir ? "ya" : "belum";
    case "materi": return !b.materi || b.materi.belum === 0 ? "tuntas" : "belum";
    case "vanguard": return statusVanguard(b.vanguard);
    case "pretest": return b.pretest.status;
    case "posttest": return b.posttest.status;
    case "kunci": return b.izin.pretest === "menunggu" || b.izin.posttest === "menunggu" ? "izin_menunggu" : b.kunci.length > 0 ? "terkunci" : "lancar";
    case "kelulusan": return b.kelulusan ?? "belum_dinilai";
  }
}

export function daftarStatus(variabel: KodeVariabel): StatusPantau[] {
  return variabel === "semua" ? [] : STATUS[variabel];
}

export function statusUntuk(variabel: Exclude<KodeVariabel, "semua">, b: BarisPantau): StatusPantau {
  const kode = kodeStatus(variabel, b);
  return STATUS[variabel].find((s) => s.kode === kode) ?? S(kode, kode, "mut");
}

/** Jumlah orang per status (urutan sama dengan daftarStatus). */
export function hitungPerStatus(variabel: KodeVariabel, baris: readonly BarisPantau[]): { status: StatusPantau; jumlah: number }[] {
  if (variabel === "semua") return [];
  return STATUS[variabel].map((status) => ({ status, jumlah: baris.filter((b) => kodeStatus(variabel, b) === status.kode).length }));
}

export function saringBaris<T extends BarisPantau>(variabel: KodeVariabel, status: string | null, baris: readonly T[]): T[] {
  if (variabel === "semua" || !status) return [...baris];
  return baris.filter((b) => kodeStatus(variabel, b) === status);
}

/** Keterangan satu baris untuk variabel yang dipantau (di samping chip status). */
export function keteranganPantau(variabel: KodeVariabel, b: BarisPantau): string {
  if (variabel === "vanguard") {
    const v = b.vanguard;
    const bagian: string[] = [];
    if (v) {
      bagian.push(`Latihan wajib ${Math.min(v.berturut, v.hari_berturut)} dari ${v.hari_berturut} hari`);
      if (v.sertifikasi_selesai !== null) bagian.push(`Sertifikasi wajib ${v.sertifikasi_selesai ? "sudah" : "belum"}`);
    }
    if (b.bank && b.bank.percobaan > 0) bagian.push(`Bank soal ${b.bank.percobaan} percobaan, ${b.bank.benar} benar`);
    return bagian.join(" · ") || "Belum ada aktivitas Vanguard";
  }
  if (variabel === "materi" && b.materi) return b.materi.belum === 0 ? (b.materi.manual ? "Ditandai manual oleh peserta" : "Semua materi wajib tuntas") : `${b.materi.belum} materi wajib belum tuntas`;
  if (variabel === "kunci") {
    const k = b.kunci.map((x) => (x.tahap === "pretest" ? "Pretest" : "Posttest")).join(" dan ");
    return k ? `${k} terkunci` : "";
  }
  return "";
}
