// lib/sigapLupaPin.ts
//
// (22 Okt 2026) Penilaian "Lupa PIN" (reset mandiri SIGAP) -- logika murni, dipisah dari app/api/sigap/masuk/route.ts agar bisa diuji.
//
// Latar masalah (kasus Riva): data pembanding di sistem kurang (mitra tanpa NIK/email/tanggal lahir), sehingga "minimal 2 dari 3 data
// cocok" tak mungkin terpenuhi -- dan SETIAP percobaan dihitung gagal sampai akun terkunci. Perbaikan:
//   1. NIP (opsional) jadi pembanding keempat; aturan tetap minimal 2 data pribadi "benar-benar cocok".
//   2. "Data pembanding tidak cukup" (tak ada data yang SALAH) BUKAN kesalahan petugas -> tidak menambah hitungan gagal/kunci.
//      Hanya data yang salah (atau nama tak dikenal) yang dihitung. Menebak tetap terbatas karena tebakan salah pada data yang
//      ada selalu dihitung; data yang belum ada tidak memberi petunjuk apa pun.

export type StatusKolom = "benar" | "salah" | "belum_ada" | "belum_dicek";
export type KolomLupa = {
  nama: StatusKolom;
  nik: StatusKolom;
  email: StatusKolom;
  tanggal_lahir: StatusKolom;
  /** Hanya ada bila petugas mengisi NIP. */
  nip?: StatusKolom;
};

/** Minimal data pribadi (NIK / email / tanggal lahir / NIP) yang harus benar-benar cocok untuk reset mandiri. */
export const MIN_COCOK_RESET = 2;

const DATA_PRIBADI = ["nik", "email", "tanggal_lahir", "nip"] as const;

/** NIP: hanya digit. */
export function normNip(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}
/** NIP BPS: 9 digit (lama) sampai 18 digit (lengkap). */
export function nipValid(s: string): boolean {
  return /^\d{9,18}$/.test(s);
}

export type Masukan = { nik: string; email: string; tgl: string; nip: string };
/** Data pembanding di sistem, sudah dinormalisasi (daftar kosong = belum ada). */
export type Pembanding = { nik: string[]; email: string[]; tgl: string[]; nip: string[] };

function banding(ada: string[], isian: string): StatusKolom {
  return ada.length === 0 ? "belum_ada" : ada.includes(isian) ? "benar" : "salah";
}

/** Nilai tiap kolom. `pembanding` null = nama tidak dikenal di sistem. */
export function nilaiKolomLupa(masukan: Masukan, pembanding: Pembanding | null): KolomLupa {
  const pakaiNip = masukan.nip !== "";
  if (!pembanding) {
    return { nama: "salah", nik: "belum_dicek", email: "belum_dicek", tanggal_lahir: "belum_dicek", ...(pakaiNip ? { nip: "belum_dicek" as const } : {}) };
  }
  return {
    nama: "benar",
    nik: banding(pembanding.nik, masukan.nik),
    email: banding(pembanding.email, masukan.email),
    tanggal_lahir: banding(pembanding.tgl, masukan.tgl),
    ...(pakaiNip ? { nip: banding(pembanding.nip, masukan.nip) } : {}),
  };
}

export type PutusanLupa = {
  /** salah = ada data keliru (dihitung gagal) · kurang = tak ada yang keliru tapi belum cukup (TIDAK dihitung) · lolos = lanjut ke tiket. */
  putusan: "salah" | "kurang" | "lolos";
  cocok: number;
};

export function putusanLupa(kolom: KolomLupa): PutusanLupa {
  const cocok = DATA_PRIBADI.filter((k) => kolom[k] === "benar").length;
  if (Object.values(kolom).includes("salah")) return { putusan: "salah", cocok };
  if (cocok < MIN_COCOK_RESET) return { putusan: "kurang", cocok };
  return { putusan: "lolos", cocok };
}

/** Pesan untuk petugas bila datanya belum cukup (bukan salah). */
export function pesanDataKurang(kolom: KolomLupa, cocok: number): string {
  const petunjukNip = kolom.nip === undefined ? " Bila Anda ASN/memiliki NIP, isi kolom NIP (opsional) agar data yang cocok bertambah." : "";
  return (
    `Data Anda belum cukup untuk reset mandiri: baru ${cocok} dari ${MIN_COCOK_RESET} data yang bisa dicocokkan, karena sebagian data pembanding belum tercatat di sistem. ` +
    `Percobaan ini tidak dihitung sebagai kesalahan.${petunjukNip} Bila tetap belum bisa, hubungi admin anggaran BPS Kabupaten Solok untuk PIN sementara.`
  );
}
