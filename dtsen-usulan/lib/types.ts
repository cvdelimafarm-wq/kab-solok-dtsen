export type UsulanStatus =
  | "draft"
  | "dikirim_ke_nagari"
  | "dibaca_operator"
  | "sk_dibuat"
  | "sk_dikonfirmasi"
  | "dikirim_ke_bps"
  | "diterima_lengkap"
  | "approved"
  | "ditolak";

export const STATUS_LABEL: Record<UsulanStatus, string> = {
  draft: "Draft",
  dikirim_ke_nagari: "Dikirim ke Nagari",
  dibaca_operator: "Dibaca Operator",
  sk_dibuat: "SK Dibuat",
  sk_dikonfirmasi: "SK Terverifikasi",
  dikirim_ke_bps: "Dikirim ke BPS",
  diterima_lengkap: "Diterima Lengkap",
  approved: "Disetujui",
  ditolak: "Ditolak, Perlu Perbaikan",
};

export const STATUS_COLOR: Record<UsulanStatus, string> = {
  draft: "bg-line text-ink",
  dikirim_ke_nagari: "bg-navy-100 text-navy-700",
  dibaca_operator: "bg-navy-100 text-navy-700",
  sk_dibuat: "bg-gold-100 text-gold-600",
  sk_dikonfirmasi: "bg-gold-100 text-gold-600",
  dikirim_ke_bps: "bg-gold-100 text-gold-600",
  diterima_lengkap: "bg-moss-100 text-moss-700",
  approved: "bg-moss-100 text-moss-700",
  ditolak: "bg-rust-100 text-rust-700",
};

export const VARIABEL_LABEL: { key: string; label: string }[] = [
  { key: "v01_luas_lantai", label: "Luas lantai < 8m\u00b2 per anggota keluarga" },
  { key: "v02_jenis_lantai", label: "Jenis lantai tanah/bambu/kayu murah" },
  { key: "v03_jenis_dinding", label: "Jenis dinding bambu/rumbia/kayu murah" },
  { key: "v04_fasilitas_bab", label: "Tidak punya fasilitas BAB sendiri" },
  { key: "v05_sumber_air", label: "Sumber air tidak terlindungi" },
  { key: "v06_sumber_penerangan", label: "Tidak menggunakan listrik" },
  { key: "v07_bahan_bakar_masak", label: "Bahan bakar masak kayu/arang/minyak tanah" },
  { key: "v08_konsumsi_daging", label: "Jarang konsumsi daging/susu/ayam" },
  { key: "v09_frekuensi_makan", label: "Makan kurang dari 2x sehari" },
  { key: "v10_kemampuan_berobat", label: "Tidak mampu berobat ke fasilitas kesehatan" },
];

export interface Usulan {
  id: string;
  jorong_id: string;
  nik: string;
  no_kk: string | null;
  nama_warga: string;
  alamat: string | null;
  status: UsulanStatus;
  catatan_wali_jorong: string | null;
  created_at: string;
  dikirim_at: string | null;
  [key: string]: unknown;
}
