// lib/sigapAgenda.ts
//
// (9 Nov 2026) SIGAP > Pelatihan > Agenda hari H (versi minimal): pretest/posttest DIMULAI INSTRUKTUR kelas. Fungsi MURNI (tanpa database).
//
// Aturan (putusan Iqbal 8-9 Nov 2026):
//   - Instruktur kelas menekan Mulai (boleh lebih awal dari jam di jadwal tes; tanpa pengaman admin). Sesudah itu peserta kelas itu bisa mengerjakan.
//   - Tiap peserta mendapat durasi pengerjaan yang sama (durasi_menit tes) kapan pun ia mulai; jendela (jendela_menit sejak Mulai, atau sampai
//     instruktur menekan Selesai) hanya membatasi KAPAN peserta boleh mulai. Yang terlambat tidak mendapat perpanjangan.
//   - Hasil dan pembahasan tampil begitu peserta mengirim jawaban / menekan selesai / waktunya habis.
//   - Tes yang punya baris agenda tetapi belum dimulai = "menunggu instruktur"; tes tanpa baris agenda = jadwal biasa (perilaku lama).

import type { InfoAgendaTes } from "@/lib/sigapTes";

export type BarisAgenda = {
  id: number;
  kegiatan_id: number;
  kelas: number;
  tes_id: number;
  jendela_menit: number;
  mulai_at: string | null;
  mulai_oleh: number | null;
  selesai_at: string | null;
};

export const KOLOM_AGENDA = "id, kegiatan_id, kelas, tes_id, jendela_menit, mulai_at, mulai_oleh, selesai_at";
export const JENDELA_BAWAAN_MENIT = 30;
export const JENDELA_MAKS_MENIT = 480;

export type StatusAgenda = "menunggu" | "berjalan" | "selesai";
export const LABEL_STATUS_AGENDA: Record<StatusAgenda, string> = { menunggu: "Menunggu dimulai", berjalan: "Berjalan", selesai: "Selesai" };

/** Penutupan jendela: yang lebih awal antara Mulai + jendela dan saat Selesai ditekan; null bila belum dimulai. */
export function tutupJendela(a: Pick<BarisAgenda, "mulai_at" | "selesai_at" | "jendela_menit">): string | null {
  if (!a.mulai_at) return null;
  const batas = new Date(a.mulai_at).getTime() + a.jendela_menit * 60_000;
  const selesai = a.selesai_at ? new Date(a.selesai_at).getTime() : Infinity;
  return new Date(Math.min(batas, selesai)).toISOString();
}

export function statusAgenda(a: Pick<BarisAgenda, "mulai_at" | "selesai_at" | "jendela_menit">, sekarang: Date): StatusAgenda {
  const tutup = tutupJendela(a);
  if (tutup === null) return "menunggu";
  return sekarang.getTime() >= new Date(tutup).getTime() ? "selesai" : "berjalan";
}

/**
 * Terapkan agenda pada tes seorang peserta.
 *   adaAgenda = tes ini punya setidaknya satu baris agenda (di kelas mana pun). Bila ya tetapi kelas peserta tidak punya barisnya (baris = null),
 *   tes dianggap MENUNGGU selamanya bagi peserta itu (aman: tidak terbuka sendiri lewat jadwal).
 *   Tanpa agenda sama sekali: tes dikembalikan apa adanya (objek yang sama).
 */
export function tesDenganAgenda<T extends { buka_at: string; tutup_at: string; agenda?: InfoAgendaTes | null }>(
  tes: T,
  baris: Pick<BarisAgenda, "mulai_at" | "selesai_at" | "jendela_menit"> | null | undefined,
  adaAgenda: boolean
): T {
  if (!adaAgenda) return tes;
  const tutup = baris ? tutupJendela(baris) : null;
  if (!baris || !baris.mulai_at || tutup === null) return { ...tes, agenda: { menunggu: true, mulai_at: null, tutup_at: null } };
  return { ...tes, buka_at: baris.mulai_at, tutup_at: tutup, agenda: { menunggu: false, mulai_at: baris.mulai_at, tutup_at: tutup } };
}

export type AksiAgenda = "mulai" | "selesai" | "buka_lagi";
export const AKSI_AGENDA: readonly AksiAgenda[] = ["mulai", "selesai", "buka_lagi"];
export const aksiAgendaSah = (x: unknown): x is AksiAgenda => typeof x === "string" && (AKSI_AGENDA as readonly string[]).includes(x);

/** Aksi yang masuk akal pada keadaan sekarang (tombol yang ditampilkan). */
export function aksiTersedia(status: StatusAgenda): AksiAgenda[] {
  return status === "menunggu" ? ["mulai"] : status === "berjalan" ? ["selesai"] : ["buka_lagi"];
}

/** Peringatan (bukan blokir) saat Mulai: Posttest ditekan sebelum Pretest kelas itu selesai. */
export function peringatanMulai(jenis: string, semua: readonly { jenis: string; status: StatusAgenda }[]): string | null {
  if (jenis !== "posttest") return null;
  const pre = semua.find((x) => x.jenis === "pretest");
  if (!pre || pre.status === "selesai") return null;
  return pre.status === "menunggu" ? "Pretest kelas ini belum dimulai." : "Pretest kelas ini masih berjalan.";
}
