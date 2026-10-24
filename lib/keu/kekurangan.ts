// lib/keu/kekurangan.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- logika murni formulir catatan Kekurangan RAB (tanpa React/DB): pembacaan rupiah, pemeriksaan isian
// (cermin aturan fungsi basis data keu_kekurangan_catat/ubah/tarik supaya pesan muncul sebelum dikirim; basis data tetap yang memutuskan),
// dan penyusunan argumen untuk gerbang keu_jalankan. p_akun tidak pernah dikirim: server mengisinya dari sesi.
import { argsPutuskan as _argsPutuskan, awalKeputusan, type Keputusan, type Putusan } from "@/lib/keu/revisi";

export const PRIORITAS = [
  { kode: "inti", nama: "Inti" },
  { kode: "penting", nama: "Penting" },
  { kode: "tunda", nama: "Dapat ditunda" },
] as const;
export type KodePrioritas = (typeof PRIORITAS)[number]["kode"];

export type IsianKekurangan = { akun_kode: string; uraian: string; jumlah: string; prioritas: string; alasan: string; komponen?: string };

/** "1.500.000" / "1500000" / "Rp 1.500.000" -> 1500000; selain bilangan bulat positif -> null. */
export function bacaRupiah(teks: string): number | null {
  const t = teks.replace(/^\s*rp\.?\s*/i, "").replace(/[\s.]/g, "");
  if (!/^\d{1,15}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const RE_AKUN = /^\d{6}$/;

/** Daftar pesan galat (kosong = sah). Aturan sama dengan fungsi basis data. */
export function periksaKekurangan(f: IsianKekurangan, opsi: { baru: boolean } = { baru: true }): string[] {
  const g: string[] = [];
  if (opsi.baru && !RE_AKUN.test(f.akun_kode.trim())) g.push("Akun anggaran harus 6 angka.");
  if (f.uraian.trim().length < 4) g.push("Uraian minimal 4 huruf.");
  if (f.uraian.trim().length > 200) g.push("Uraian terlalu panjang (maksimal 200 huruf).");
  if (bacaRupiah(f.jumlah) === null) g.push("Jumlah harus bilangan bulat rupiah lebih dari nol.");
  if (!PRIORITAS.some((p) => p.kode === f.prioritas)) g.push("Pilih prioritas.");
  if (f.alasan.trim().length < 5) g.push("Alasan minimal 5 huruf.");
  if (f.alasan.trim().length > 500) g.push("Alasan terlalu panjang (maksimal 500 huruf).");
  return g;
}

export function argsCatat(ro: string, f: IsianKekurangan): Record<string, unknown> {
  return {
    p_ro: ro, p_akun_kode: f.akun_kode.trim(), p_uraian: f.uraian.trim(), p_jumlah: bacaRupiah(f.jumlah),
    p_prioritas: f.prioritas, p_alasan: f.alasan.trim(), p_komponen: f.komponen?.trim() || null,
  };
}

/** Hanya isian yang berubah yang dikirim (null = tidak diubah di basis data). */
export function argsUbah(id: number, lama: { uraian: string; jumlah: number | string; prioritas_kode: string; alasan: string }, f: IsianKekurangan): Record<string, unknown> | null {
  const a: Record<string, unknown> = { p_id: id };
  if (f.uraian.trim() !== lama.uraian.trim()) a.p_uraian = f.uraian.trim();
  const j = bacaRupiah(f.jumlah);
  if (j !== null && j !== Number(lama.jumlah)) a.p_jumlah = j;
  if (f.prioritas !== lama.prioritas_kode) a.p_prioritas = f.prioritas;
  if (f.alasan.trim() !== lama.alasan.trim()) a.p_alasan = f.alasan.trim();
  return Object.keys(a).length > 1 ? a : null;
}

export function argsTarik(id: number, alasan: string): { args: Record<string, unknown> } | { galat: string } {
  if (alasan.trim().length < 5) return { galat: "Alasan penarikan minimal 5 huruf." };
  return { args: { p_id: id, p_alasan: alasan.trim() } };
}

export const bentukIsian = (): IsianKekurangan => ({ akun_kode: "", uraian: "", jumlah: "", prioritas: "", alasan: "" });

// ---------------------------------------------------------------- keputusan atas tambahan pagu (papan 15, bagian 3)

export type PilihanPutus = Record<number, Putusan | undefined>;
export type CatatanTerbuka = { id: number; uraian: string; jumlah: number | string };

/** Isian awal dari saran sistem (catatan tanpa saran ditunda). Hanya titik awal: ketua tim yang memutuskan. */
export function pilihanDariSaran(ids: number[], saran: { kekurangan_id: number | string; saran: string }[]): PilihanPutus {
  const p: PilihanPutus = {};
  for (const k of awalKeputusan(ids, saran)) p[k.id] = k.keputusan;
  return p;
}

export type RingkasPutus = { dipenuhi: number; sisa: number; belum: number; galat: string[]; siap: boolean; daftar: Keputusan[] };
/**
 * Ringkasan keputusan yang sedang dipilih. Siap diterapkan bila semua catatan sudah diputuskan, tolak punya alasan (minimal 5 huruf),
 * dan total yang dipenuhi tidak melebihi tambahan pagu (dana penggenap tidak boleh minus). Cermin aturan keu_kekurangan_putuskan.
 */
export function ringkasPutus(terbuka: CatatanTerbuka[], pilih: PilihanPutus, alasan: Record<number, string>, tambahan: number): RingkasPutus {
  const galat: string[] = [];
  const daftar: Keputusan[] = [];
  let dipenuhi = 0, belum = 0;
  for (const k of terbuka) {
    const p = pilih[k.id];
    if (!p) { belum++; continue; }
    const a = (alasan[k.id] ?? "").trim();
    if (p === "tolak" && a.length < 5) galat.push(`Alasan menolak "${k.uraian}" wajib diisi (minimal 5 huruf).`);
    if (p === "penuhi") dipenuhi += Number(k.jumlah) || 0;
    daftar.push({ id: k.id, keputusan: p, alasan: p === "tolak" ? a : "" });
  }
  if (dipenuhi > tambahan) galat.push(`Yang dipenuhi melebihi tambahan pagu (kelebihan ${dipenuhi - tambahan}). Dana penggenap tidak boleh minus.`);
  return { dipenuhi, sisa: tambahan - dipenuhi, belum, galat, siap: terbuka.length > 0 && belum === 0 && galat.length === 0, daftar };
}
export const argsTerapkan = (tambahan: number, daftar: Keputusan[]): Record<string, unknown> => _argsPutuskan(tambahan, daftar);

// ---------------------------------------------------------------- riwayat (dari kolom dicatat_* dan diputus_*)
export type BarisKek = {
  id: number; ro_kode?: string; akun_kode: string; uraian: string; jumlah: number | string; prioritas_nama?: string | null; status: string;
  dicatat_oleh?: number | string | null; dicatat_at?: string | null; diputus_oleh?: number | string | null; diputus_at?: string | null; alasan_putus?: string | null;
};
export type PeristiwaKek = { waktu: string; akun: number | null; teks: string };
const rp = (n: number | string) => `Rp ${Math.round(Number(n)).toLocaleString("id-ID")}`;
const KATA_PUTUS: Record<string, string> = { dipenuhi: "memenuhi", ditunda: "menunda", ditolak: "menolak", ditarik: "menarik" };
/** Peristiwa terbaru dahulu: pencatatan dan keputusan. */
export function peristiwaKekurangan(baris: BarisKek[], batas = 30): PeristiwaKek[] {
  const hasil: PeristiwaKek[] = [];
  for (const k of baris) {
    const nama = `${k.akun_kode} ${k.uraian}`;
    if (k.dicatat_at) hasil.push({ waktu: k.dicatat_at, akun: k.dicatat_oleh == null ? null : Number(k.dicatat_oleh), teks: `mencatat kekurangan ${nama} sebesar ${rp(k.jumlah)}${k.prioritas_nama ? ` (prioritas ${k.prioritas_nama})` : ""}.` });
    if (k.diputus_at) hasil.push({ waktu: k.diputus_at, akun: k.diputus_oleh == null ? null : Number(k.diputus_oleh), teks: `${KATA_PUTUS[k.status] ?? "memutuskan"} ${nama}${k.alasan_putus ? `: ${k.alasan_putus}` : ""}.` });
  }
  return hasil.sort((a, b) => Date.parse(b.waktu) - Date.parse(a.waktu)).slice(0, batas);
}
