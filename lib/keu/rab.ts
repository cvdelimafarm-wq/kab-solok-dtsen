// lib/keu/rab.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- logika murni editor RAB per RO (tanpa React/DB): status dan aksi yang tersedia menurut hak,
// pemeriksaan dan penyusunan data rincian, pemetaan item POK ke item/rincian RAB. Cermin aturan basis data supaya pesan muncul sebelum dikirim;
// basis data (penjaga tabel dan keu_rab_aksi) tetap yang memutuskan.

import type { ItemAnggaran } from "@/lib/keu/ro";
import { bacaRupiah } from "@/lib/keu/kekurangan";

export const LABEL_STATUS_RAB: Record<string, string> = {
  draf: "Draf", menunggu_ketua: "Menunggu persetujuan ketua tim", menunggu_ppk: "Menunggu pengesahan PPK",
  disetujui: "Disahkan", dikembalikan: "Dikembalikan", digantikan: "Digantikan", dibatalkan: "Dibatalkan",
};
export const STATUS_BISA_DIUBAH = ["draf", "dikembalikan"] as const;
export const STATUS_AKTIF = ["draf", "menunggu_ketua", "menunggu_ppk", "dikembalikan"] as const;
export const bisaDiubah = (status: string | null | undefined): boolean => (STATUS_BISA_DIUBAH as readonly string[]).includes(status ?? "");

export type HakRab = { rab: boolean; draf: boolean; setuju_ketua: boolean; sahkan: boolean };
export type AksiRab = "ajukan" | "setuju_ketua" | "sahkan" | "kembalikan" | "batalkan";
export const LABEL_AKSI: Record<AksiRab, string> = { ajukan: "Ajukan", setuju_ketua: "Setujui sebagai ketua tim", sahkan: "Sahkan", kembalikan: "Kembalikan", batalkan: "Batalkan RAB" };
export const AKSI_BUTUH_CATATAN: readonly AksiRab[] = ["kembalikan"];

/** Aksi yang perlu ditampilkan untuk RAB berstatus ini menurut hak akun (tampilan saja; keu_rab_aksi memutuskan). */
export function aksiTersedia(status: string, hak: HakRab): AksiRab[] {
  const a: AksiRab[] = [];
  if (status === "draf" || status === "dikembalikan") {
    if (hak.rab || hak.draf) a.push("ajukan");
    if (hak.rab || hak.draf) a.push("batalkan");
  } else if (status === "menunggu_ketua") {
    if (hak.setuju_ketua) a.push("setuju_ketua", "kembalikan");
  } else if (status === "menunggu_ppk") {
    if (hak.sahkan) a.push("sahkan", "kembalikan");
  }
  return a;
}

/** Boleh menyusun RAB baru? Tidak boleh bila masih ada RAB dalam pengerjaan atau akun tidak berwenang menyusun. */
export function bolehSusunBaru(statusAktif: string | null, hak: HakRab): boolean {
  return !(statusAktif && (STATUS_AKTIF as readonly string[]).includes(statusAktif)) && (hak.rab || hak.draf);
}

export function periksaCatatanAksi(aksi: AksiRab, catatan: string): string | null {
  if (AKSI_BUTUH_CATATAN.includes(aksi) && catatan.trim().length < 5) return "Alasan pengembalian minimal 5 huruf.";
  return null;
}

// ---------------------------------------------------------------- Rincian
export type Periode = "sekali" | "bulanan" | "triwulan";
export const LABEL_PERIODE: Record<Periode, string> = { sekali: "Sekali", bulanan: "Tiap bulan", triwulan: "Tiap triwulan" };
export const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export type IsianBaris = { ket: string; volume: string; satuan: string; harga: string; periode: Periode; bulan_mulai: number; bulan_sampai: number; minggu: number };
export const barisKosong = (satuan = "", bulan = 1): IsianBaris => ({ ket: "", volume: "", satuan, harga: "", periode: "sekali", bulan_mulai: bulan, bulan_sampai: bulan, minggu: 3 });

/** "2", "2,5", "2.5" -> angka dengan paling banyak dua desimal; selain itu null. Tanpa pemisah ribuan. */
export function bacaVolume(teks: string): number | null {
  const t = teks.trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function periksaBaris(f: IsianBaris): string[] {
  const g: string[] = [];
  if (f.ket.length > 200) g.push("Keterangan terlalu panjang (maksimal 200 huruf).");
  if (bacaVolume(f.volume) === null) g.push("Volume harus angka lebih dari nol (paling banyak dua desimal).");
  if (f.satuan.trim().length < 1 || f.satuan.trim().length > 20) g.push("Satuan wajib diisi (maksimal 20 huruf).");
  if (bacaRupiah(f.harga) === null) g.push("Harga satuan harus bilangan bulat rupiah lebih dari nol.");
  if (!(f.bulan_mulai >= 1 && f.bulan_mulai <= 12)) g.push("Bulan mulai tidak sah.");
  if (f.periode !== "sekali" && !(f.bulan_sampai >= f.bulan_mulai && f.bulan_sampai <= 12)) g.push("Bulan sampai tidak boleh sebelum bulan mulai.");
  if (!(f.minggu >= 1 && f.minggu <= 4)) g.push("Minggu pencairan harus 1 sampai 4.");
  return g;
}

/** Jumlah rincian (volume x harga, dibulatkan) -- sama dengan kolom `jumlah` di basis data. */
export function jumlahBaris(f: IsianBaris): number | null {
  const v = bacaVolume(f.volume);
  const h = bacaRupiah(f.harga);
  return v === null || h === null ? null : Math.round(v * h);
}

/** Data untuk keu_tulis (insert/update) pada keu_rab_baris. Periode "sekali" memaksa bulan sampai = bulan mulai. */
export function dataBaris(f: IsianBaris): Record<string, unknown> {
  return {
    ket: f.ket.trim(), volume: bacaVolume(f.volume), satuan: f.satuan.trim(), harga_satuan: bacaRupiah(f.harga),
    periode: f.periode, bulan_mulai: f.bulan_mulai, bulan_sampai: f.periode === "sekali" ? f.bulan_mulai : f.bulan_sampai, minggu: f.minggu,
  };
}

/** "RAB = item": satu rincian yang menyamai pagu POK (jumlah dikunci ke jumlah POK, bukan volume x harga yang dibulatkan). */
export function dataSamaDenganItem(itemId: number, item: Pick<ItemAnggaran, "volume" | "satuan" | "pok">, bulan: number, minggu: number): Record<string, unknown> {
  const vol = item.volume > 0 ? item.volume : 1;
  return {
    item_id: itemId, urut: 1, ket: "RAB = item", volume: vol, satuan: item.satuan.slice(0, 20) || "PAKET", harga_satuan: Math.round((item.pok / vol) * 100) / 100,
    jumlah_tetap: item.pok, sama_dengan_item: true, periode: "sekali", bulan_mulai: bulan, bulan_sampai: bulan, minggu,
  };
}

export function dataItemRab(rabId: number, item: Pick<ItemAnggaran, "kunci" | "komponen" | "akun" | "uraian" | "satuan">, prioritas: string | null): Record<string, unknown> {
  return { rab_id: rabId, pok_kunci: item.kunci, komponen_kode: item.komponen, akun_kode: item.akun, uraian: item.uraian, satuan: item.satuan.slice(0, 20) || "PAKET", prioritas_kode: prioritas || null };
}

// ---------------------------------------------------------------- Pemetaan POK <-> RAB
export type ItemRabRow = { id: number; pok_kunci: string | null; selesai: boolean; prioritas_kode: string | null; akun_tujuan?: string | null };
export type BarisRabRow = { baris_id: number; item_id: number; urut: number; ket: string; volume: number | string; satuan: string; harga_satuan: number | string; jumlah: number | string; jumlah_dikunci: boolean; sama_dengan_item: boolean; periode: Periode; bulan_mulai: number; bulan_sampai: number; minggu: number };

export type PemetaanItem = { pok: ItemAnggaran; rab: ItemRabRow | null; baris: BarisRabRow[]; jumlahRab: number; selisih: number | null; status: "belum" | "sama" | "rinci" | "selesai" };

/** Setiap item POK dipasangkan dengan item RAB (lewat kunci stabil) dan rinciannya. Selisih = jumlah RAB - pagu POK (null bila belum ada rincian). */
export function petakanRab(items: ItemAnggaran[], itemRab: ItemRabRow[], baris: BarisRabRow[]): PemetaanItem[] {
  const perKunci = new Map<string, ItemRabRow>();
  for (const r of itemRab) if (r.pok_kunci) perKunci.set(r.pok_kunci, r);
  const perItem = new Map<number, BarisRabRow[]>();
  for (const b of baris) perItem.set(b.item_id, [...(perItem.get(b.item_id) ?? []), b]);
  return items.map((pok) => {
    const rab = perKunci.get(pok.kunci) ?? null;
    const br = rab ? (perItem.get(rab.id) ?? []).sort((a, b) => a.urut - b.urut || a.baris_id - b.baris_id) : [];
    const jumlahRab = br.reduce((a, b) => a + Number(b.jumlah), 0);
    const status = rab?.selesai ? "selesai" : br.length === 0 ? "belum" : br.length === 1 && br[0].sama_dengan_item ? "sama" : "rinci";
    return { pok, rab, baris: br, jumlahRab, selisih: br.length ? jumlahRab - pok.pok : null, status };
  });
}

/** Item RAB yang kuncinya tidak ada lagi di POK (mis. setelah revisi POK): ditampilkan terpisah agar tidak hilang diam-diam. */
export function itemRabYatim(items: ItemAnggaran[], itemRab: ItemRabRow[]): ItemRabRow[] {
  const ada = new Set(items.map((i) => i.kunci));
  return itemRab.filter((r) => r.pok_kunci !== null && !ada.has(r.pok_kunci));
}

/** Alasan versi RAB baru dari RAB sebelumnya: wajib, minimal 10 karakter (sama dengan aturan keu_rab_baru_alasan). Null bila sah. */
export const MIN_ALASAN_VERSI = 10;
export function periksaAlasanVersi(teks: string): string | null {
  const t = teks.trim();
  if (t.length < MIN_ALASAN_VERSI) return `Alasan versi minimal ${MIN_ALASAN_VERSI} karakter (sekarang ${t.length}).`;
  if (t.length > 500) return "Alasan versi terlalu panjang (maksimal 500 karakter).";
  return null;
}
