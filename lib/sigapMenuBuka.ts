// lib/sigapMenuBuka.ts  (murni)
//
// (31 Okt 2026) Catatan "sudah membuka menu hari ini" untuk menu pengawasan PML (Pengawasan) dan Supervisor (Supervisi): idealnya dibuka setiap hari.
// Hanya terlihat oleh yang bersangkutan (keputusan user 31 Okt). Satu baris per akun, kegiatan, menu, dan tanggal WIB di tabel sigap_menu_buka.

export const MENU_BUKA = ["pengawasan"] as const;
export type MenuBuka = (typeof MENU_BUKA)[number];
export const API_MENU_BUKA = "/api/portal/menu-buka";

export function periksaMenuBuka(b: unknown): { ok: true; kode: string; menu: MenuBuka } | { ok: false; pesan: string } {
  const o = (b && typeof b === "object" ? b : {}) as { kode?: unknown; menu?: unknown };
  if (typeof o.kode !== "string" || !/^[a-z0-9_]{2,30}$/.test(o.kode)) return { ok: false, pesan: "Kode kegiatan tidak sah." };
  if (typeof o.menu !== "string" || !(MENU_BUKA as readonly string[]).includes(o.menu)) return { ok: false, pesan: "Menu tidak dikenal." };
  return { ok: true, kode: o.kode, menu: o.menu as MenuBuka };
}

export type CatatanBuka = { pertama_at: string; terakhir_at: string; jumlah: number };

/** Teks status untuk baris pengingat Hari Ini. `iso` = waktu pertama dibuka hari ini (null = belum). Jam WIB. */
export function teksStatusBuka(iso: string | null): { sudah: boolean; teks: string } {
  if (!iso) return { sudah: false, teks: "Belum dibuka hari ini" };
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const jam = `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { sudah: true, teks: `Sudah dibuka hari ini pukul ${jam} WIB` };
}

export const CATATAN_LAPORAN_OTOMATIS = "Laporan Translok terisi otomatis dari data menu Sampel; Anda cukup memeriksa dan menambah catatan bila perlu.";
