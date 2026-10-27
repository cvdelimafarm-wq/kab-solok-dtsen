// lib/sigapSusunHari.ts
//
// (27 Okt 2026) Foto saya: foto yang diambil satu hari disusun seperti kisi nomor di layar Hari Ini --
// yang sudah punya nomor tampil berurutan menurut nomornya, sisanya (cadangan, dilepas, belum bernomor, ditolak) dikelompokkan terpisah dan
// disembunyikan secara bawaan. Murni (tanpa React/DB) supaya bisa diuji.

export type TagFotoHari = { peran_tag: string; status: string; slot: number | null };
export type FotoHari = { id: number; diambil_at: string; tag: TagFotoHari[] };

export type UbinNomor<T> = { slot: number; foto: T; ditahan: boolean };
export type SusunanHari<T> = { nomor: UbinNomor<T>[]; cadangan: T[] };

/** Nomor foto milik pemotret: hanya tag pemotret berstatus diterima/ditahan yang BERNOMOR. */
export function nomorPemotret(f: FotoHari): { slot: number; ditahan: boolean } | null {
  const p = f.tag.find((x) => x.peran_tag === "pemotret");
  if (!p || p.slot === null || p.slot === undefined || !(p.slot >= 1)) return null;
  if (p.status !== "diterima" && p.status !== "ditahan") return null;
  return { slot: p.slot, ditahan: p.status === "ditahan" };
}

/**
 * Susun foto satu hari (satu kegiatan). Nomor urut naik. Bila dua foto mengaku nomor yang sama (tidak seharusnya terjadi),
 * yang diambil paling akhir tetap di nomornya dan sisanya pindah ke cadangan -- tidak ada foto yang hilang dari tampilan.
 * Cadangan: urut jam pengambilan (paling awal dulu).
 */
export function susunHari<T extends FotoHari>(daftar: T[]): SusunanHari<T> {
  const nomor = new Map<number, UbinNomor<T>>();
  const cadangan: T[] = [];
  for (const f of [...daftar].sort((a, b) => (a.diambil_at < b.diambil_at ? -1 : a.diambil_at > b.diambil_at ? 1 : a.id - b.id))) {
    const n = nomorPemotret(f);
    if (!n) {
      cadangan.push(f);
      continue;
    }
    const ada = nomor.get(n.slot);
    if (ada) cadangan.push(ada.foto); // yang lebih awal pindah ke cadangan
    nomor.set(n.slot, { slot: n.slot, foto: f, ditahan: n.ditahan });
  }
  return {
    nomor: Array.from(nomor.values()).sort((a, b) => a.slot - b.slot),
    cadangan: cadangan.sort((a, b) => (a.diambil_at < b.diambil_at ? -1 : a.diambil_at > b.diambil_at ? 1 : a.id - b.id)),
  };
}

// (27 Okt 2026) Foto yang DIBAGIKAN rekan kepada saya (tag tim/luar_tim) ikut tampil di kisi nomor hari itu: yang diterima/ditahan di nomornya, yang
// dilepas (tergeser) di cadangan, tiap-tiapnya berlabel "dari <nama>". Tag yang masih menunggu (diajukan) dan yang ditolak tidak ikut.
// Dibuat dengan membentuk ulang tag rekan sebagai tag "pemotret" sehingga aturan nomor yang sama (susunHari) berlaku.
export type TagUntukSaya<F> = { peran_tag: string; status: string; slot: number | null; foto: F | null };
export type FotoRekan<F> = F & { dari: string; tag: (TagFotoHari & { akun_id: number; nama: string })[] };
const PERAN_REKAN = ["tim", "luar_tim"];
const STATUS_REKAN = ["diterima", "ditahan", "dilepas"];

export function rekanKeHari<F extends { id: number; pemotret?: string | null }>(untukSaya: TagUntukSaya<F>[]): FotoRekan<F>[] {
  const hasil = new Map<number, FotoRekan<F>>();
  for (const t of untukSaya) {
    if (!t.foto || !PERAN_REKAN.includes(t.peran_tag) || !STATUS_REKAN.includes(t.status) || hasil.has(t.foto.id)) continue;
    const dari = (t.foto.pemotret ?? "").trim() && t.foto.pemotret !== "-" ? (t.foto.pemotret as string) : "rekan";
    hasil.set(t.foto.id, { ...t.foto, dari, tag: [{ akun_id: 0, nama: dari, peran_tag: "pemotret", status: t.status, slot: t.slot }] });
  }
  return Array.from(hasil.values());
}

/** Huruf cadangan A, B, C ... (urutan jam), sama dengan layar Hari Ini. */
export const hurufCadangan = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));
