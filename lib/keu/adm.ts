// lib/keu/adm.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- logika murni tab Administrasi (papan 13): mengelompokkan baris keu_v_adm_dokumen menjadi
// seksi -> dokumen per item, aksi yang pantas ditampilkan menurut status, serta aturan berkas unggahan (jenis, ukuran, nama, lokasi).
// Hak sebenarnya (siapa boleh unggah/verifikasi/kembalikan) ditegakkan basis data lewat keu_adm_aksi; di sini hanya menentukan tombol.

export type StatusDok = "belum" | "draf" | "terunggah" | "terverifikasi";

export const STATUS_DOK: Record<string, string> = { belum: "Belum ada", draf: "Draf SIGAP", terunggah: "Terunggah", terverifikasi: "Terverifikasi" };
export const WARNA_DOK: Record<string, "abu" | "kuning" | "biru" | "hijau"> = { belum: "abu", draf: "kuning", terunggah: "biru", terverifikasi: "hijau" };

/** Satu baris keu_v_adm_dokumen (kolom yang dipakai). */
export type BarisDok = {
  detail_id: number; dok_id: number; seksi_urut: number | string; seksi_judul: string; seksi_huruf: string; no: number | string; uraian_dok: string;
  pihak: string[] | string | null; ket: string | null; gen: boolean; adm_id: number | string | null; status: string | null;
  berkas_nama: string | null; berkas_ukuran: number | string | null; diunggah_at: string | null; diverifikasi_at: string | null; catatan: string | null;
};

export type DokTampil = { dokId: number; no: string; uraian: string; pihak: string[]; ket: string; gen: boolean; admId: number | null; status: StatusDok; berkas: string | null; ukuran: number | null; diunggahAt: string | null; diverifikasiAt: string | null; catatan: string };
export type SeksiTampil = { judul: string; huruf: string; dok: DokTampil[] };

const STATUS_SAH = new Set(["belum", "draf", "terunggah", "terverifikasi"]);

/** Larik pihak dari nilai view (larik, teks "{a,b}", atau teks biasa). */
export function daftarPihak(p: string[] | string | null | undefined): string[] {
  if (p == null) return [];
  if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
  return String(p).replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "").trim()).filter(Boolean);
}

const angkaAtauNull = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Dokumen satu item, dikelompokkan per seksi dan diurutkan menurut urutan seksi lalu nomor. */
export function susunDokumen(baris: BarisDok[]): SeksiTampil[] {
  const urut = [...baris].sort((a, b) => Number(a.seksi_urut) - Number(b.seksi_urut) || Number(a.no) - Number(b.no) || a.dok_id - b.dok_id);
  const hasil: SeksiTampil[] = [];
  for (const b of urut) {
    let s = hasil.find((x) => x.huruf === b.seksi_huruf && x.judul === b.seksi_judul);
    if (!s) { s = { judul: b.seksi_judul, huruf: b.seksi_huruf, dok: [] }; hasil.push(s); }
    const st = STATUS_SAH.has(b.status ?? "") ? (b.status as StatusDok) : "belum";
    s.dok.push({
      dokId: b.dok_id, no: String(b.no), uraian: b.uraian_dok, pihak: daftarPihak(b.pihak), ket: b.ket ?? "", gen: b.gen === true,
      admId: angkaAtauNull(b.adm_id), status: st, berkas: b.berkas_nama, ukuran: angkaAtauNull(b.berkas_ukuran),
      diunggahAt: b.diunggah_at, diverifikasiAt: b.diverifikasi_at, catatan: b.catatan ?? "",
    });
  }
  return hasil;
}

export type AksiDok = "draf" | "unggah" | "verifikasi" | "kembalikan";

/**
 * Aksi yang pantas ditawarkan untuk satu dokumen menurut statusnya (urutan alur: draf, unggah, verifikasi, kembalikan).
 * Tidak memeriksa siapa pelakunya: basis data menolak bila akun bukan pihak yang berwenang.
 */
export function aksiDokTersedia(status: StatusDok, gen: boolean): AksiDok[] {
  switch (status) {
    case "belum": return gen ? ["draf", "unggah"] : ["unggah"];
    case "draf": return ["unggah"];
    case "terunggah": return ["verifikasi", "unggah", "kembalikan"];
    case "terverifikasi": return ["kembalikan"];
    default: return [];
  }
}

export const LABEL_AKSI: Record<AksiDok, string> = { draf: "Tandai draf siap", unggah: "Unggah berkas", verifikasi: "Verifikasi", kembalikan: "Kembalikan" };

/** Alasan pengembalian wajib minimal 5 huruf (sama dengan basis data). */
export const MIN_ALASAN_KEMBALI = 5;
export const alasanSah = (t: string): boolean => t.trim().length >= MIN_ALASAN_KEMBALI;

// ---------------------------------------------------------------- berkas unggahan
export const MAKS_BYTE_BERKAS = 15 * 1024 * 1024;
export const EKSTENSI_BERKAS = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "odt", "ods"] as const;

/** Memeriksa nama dan ukuran berkas; pesan galat atau null bila sah. */
export function periksaBerkas(nama: string, ukuran: number): string | null {
  const n = (nama ?? "").trim();
  if (n.length < 3) return "Nama berkas tidak sah.";
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(n);
  if (!m || !(EKSTENSI_BERKAS as readonly string[]).includes(m[1].toLowerCase())) return `Jenis berkas tidak didukung (boleh: ${EKSTENSI_BERKAS.join(", ")}).`;
  if (!Number.isFinite(ukuran) || ukuran <= 0) return "Berkas kosong.";
  if (ukuran > MAKS_BYTE_BERKAS) return "Berkas terlalu besar (maks 15 MB).";
  return null;
}

/** Nama berkas aman untuk lokasi penyimpanan: huruf, angka, titik, minus, garis bawah; maks 80 karakter, ekstensi dipertahankan. */
export function namaBerkasAman(nama: string): string {
  const asli = (nama ?? "").trim();
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(asli);
  const ext = m ? `.${m[1].toLowerCase()}` : "";
  const badan = m ? asli.slice(0, asli.length - m[0].length) : asli;
  const bersih = badan.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").replace(/_{2,}/g, "_");
  return (bersih.slice(0, 80 - ext.length) || "berkas") + ext;
}

/** Lokasi di penyimpanan: keu-adm/<tahun>/<RO>/<detail>/<dok>-<8 awal hash>-<nama>. Hash menjadikan isi berbeda tidak saling menimpa. */
export function lokasiBerkas(tahun: number, ro: string, detailId: number, dokId: number, hash: string, nama: string): string {
  return `keu-adm/${tahun}/${ro}/${detailId}/${dokId}-${hash.slice(0, 8)}-${namaBerkasAman(nama)}`;
}

export const TIPE_ISI: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
};
export function tipeIsi(nama: string): string {
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(nama ?? "");
  return (m && TIPE_ISI[m[1].toLowerCase()]) || "application/octet-stream";
}

export const ukuranTeks = (b: number | null): string => (b === null ? "" : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
