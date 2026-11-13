// lib/belajarAturan.ts  (murni; aman diimpor klien dan server)
//
// (13 Nov 2026, keputusan B) Kegiatan belajar dan mutu per waktu (mockup A4b). SATU sumber aturan: tabel sigap_belajar_aturan (SQL 20261113e).
// Cermin lama (sigap_pelatihan_aturan.vanguard_*, sigap_kegiatan_fitur vanguard/vanguard_roleplay) disalin otomatis oleh pemicu basis data.

export type WaktuBelajar = "pra_pelatihan" | "saat_pelatihan" | "saat_pendataan";
export type ButirBelajar = "pretest" | "vanguard_latihan" | "lainnya" | "vanguard_roleplay" | "posttest" | "kuis" | "qc_murajaah";

export const WAKTU_BELAJAR: readonly { kode: WaktuBelajar; label: string; butir: readonly ButirBelajar[] }[] = [
  { kode: "pra_pelatihan", label: "Pra pelatihan", butir: ["pretest", "vanguard_latihan", "lainnya"] },
  { kode: "saat_pelatihan", label: "Saat pelatihan", butir: ["pretest", "vanguard_roleplay", "posttest", "kuis"] },
  { kode: "saat_pendataan", label: "Saat pendataan", butir: ["vanguard_roleplay", "vanguard_latihan", "kuis", "qc_murajaah"] },
];
export const LABEL_BUTIR: Record<ButirBelajar, string> = {
  pretest: "Pretest", vanguard_latihan: "Vanguard: latihan pengisian kuesioner interaktif", lainnya: "Lainnya", vanguard_roleplay: "Vanguard: roleplay",
  posttest: "Posttest", kuis: "Kuis", qc_murajaah: "QC / murajaah",
};

export type BarisBelajar = {
  id?: number; kegiatan_id: number; waktu: WaktuBelajar; butir: ButirBelajar; aktif: boolean; wajib: boolean; tenggat: string | null; blokir: boolean; catatan: string;
  batal_alasan: string | null; batal_oleh: string | null; batal_at: string | null; diubah_oleh: string; diubah_at: string | null;
};

/** Waktu yang relevan untuk jenis kegiatan: pelatihan = pra dan saat pelatihan; selain itu = saat pendataan. */
export const waktuUntukJenis = (jenis: string | null | undefined): WaktuBelajar[] => (jenis === "pelatihan" ? ["pra_pelatihan", "saat_pelatihan"] : ["saat_pendataan"]);

export const butirSah = (waktu: unknown, butir: unknown): boolean => WAKTU_BELAJAR.some((w) => w.kode === waktu && (w.butir as readonly string[]).includes(String(butir)));

/** Semua butir untuk waktu-waktu itu; yang belum tersimpan diisi kosong (tidak dicentang). */
export function lengkapiButir(kegiatanId: number, waktu: readonly WaktuBelajar[], tersimpan: readonly BarisBelajar[]): BarisBelajar[] {
  const per = new Map(tersimpan.map((b) => [`${b.waktu}|${b.butir}`, b] as const));
  return WAKTU_BELAJAR.filter((w) => waktu.includes(w.kode)).flatMap((w) => w.butir.map((butir) => per.get(`${w.kode}|${butir}`) ?? {
    kegiatan_id: kegiatanId, waktu: w.kode, butir, aktif: false, wajib: false, tenggat: null, blokir: false, catatan: "", batal_alasan: null, batal_oleh: null, batal_at: null, diubah_oleh: "", diubah_at: null,
  }));
}

export type IsianBelajar = { waktu: WaktuBelajar; butir: ButirBelajar; aktif: boolean; wajib: boolean; tenggat: string | null; blokir: boolean; catatan: string };
/** Periksa isian PUT; null = sah. Wajib/blokir hanya bermakna bila dicentang. */
export function periksaIsian(x: unknown): { ok: true; isian: IsianBelajar } | { ok: false; pesan: string } {
  if (!x || typeof x !== "object") return { ok: false, pesan: "Isian tidak sah." };
  const o = x as Record<string, unknown>;
  if (!butirSah(o.waktu, o.butir)) return { ok: false, pesan: "Waktu atau butir tidak dikenal." };
  const tenggat = o.tenggat === null || o.tenggat === undefined || o.tenggat === "" ? null : String(o.tenggat);
  if (tenggat !== null && !/^\d{4}-\d{2}-\d{2}$/.test(tenggat)) return { ok: false, pesan: "Tenggat harus tanggal (YYYY-MM-DD)." };
  const catatan = String(o.catatan ?? "").trim();
  if (catatan.length > 300) return { ok: false, pesan: "Catatan maksimal 300 huruf." };
  const aktif = o.aktif === true;
  return { ok: true, isian: { waktu: o.waktu as WaktuBelajar, butir: o.butir as ButirBelajar, aktif, wajib: aktif && o.wajib === true, tenggat, blokir: aktif && o.blokir === true, catatan } };
}

/** Keadaan satu butir untuk tampilan. */
export function keadaanButir(b: BarisBelajar): { teks: string; warna: "hijau" | "kuning" | "merah" | "abu" } {
  if (b.batal_at) return { teks: "Dibatalkan", warna: "merah" };
  if (!b.aktif) return { teks: "Tidak dipakai", warna: "abu" };
  return b.wajib ? { teks: b.blokir ? "Wajib · memblokir" : "Wajib", warna: "hijau" } : { teks: "Dipakai (tidak wajib)", warna: "kuning" };
}

/** Vanguard menyala menurut sumber tunggal? null = kegiatan belum punya aturan (pakai cara lama). */
export function vanguardDariAturan(baris: readonly Pick<BarisBelajar, "butir" | "aktif" | "batal_at">[]): boolean | null {
  if (baris.length === 0) return null;
  return baris.some((b) => (b.butir === "vanguard_latihan" || b.butir === "vanguard_roleplay") && b.aktif && !b.batal_at);
}
