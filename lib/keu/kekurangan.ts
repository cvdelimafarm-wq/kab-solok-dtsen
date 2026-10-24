// lib/keu/kekurangan.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- logika murni formulir catatan Kekurangan RAB (tanpa React/DB): pembacaan rupiah, pemeriksaan isian
// (cermin aturan fungsi basis data keu_kekurangan_catat/ubah/tarik supaya pesan muncul sebelum dikirim; basis data tetap yang memutuskan),
// dan penyusunan argumen untuk gerbang keu_jalankan. p_akun tidak pernah dikirim: server mengisinya dari sesi.

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
