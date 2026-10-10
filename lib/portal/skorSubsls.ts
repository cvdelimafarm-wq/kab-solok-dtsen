// lib/portal/skorSubsls.ts  (hanya server)
//
// (10 Okt 2026) Ambil SEMUA baris fungsi bencana_skor_beban_subsls(). Sebelumnya dipanggil `db.rpc(...)` polos, padahal PostgREST membatasi
// 1000 baris per permintaan sedangkan fungsi ini mengembalikan 1084 Sub SLS -> Sub SLS di ujung urutan (mis. Sumani & Saniang Baka, X Koto Singkarak)
// terpotong diam-diam; PML Ayu Sepriani hanya melihat Sibarambang -- temuan dari tangkapan layar user. Diambil bertahap 1000 baris dengan urutan tetap.
// (10 Okt 2026) Dipercepat -- permintaan user (pindah layer terlalu lama): dua halaman pertama diambil BERSAMAAN, dan hasilnya disimpan 10 menit
// di memori server (data KK per Sub SLS praktis tetap; satu panggilan induk/wilayah-tim/identifikasi tadinya bisa memanggil fungsi ini 2-4 kali).
import type { Db } from "@/lib/sigap";
import { memoWaktu } from "@/lib/portal/memoSingkat";

export type SkorSubsls = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; kk_total: number; kk_terdampak_estimasi: number };

const HALAMAN = 1000;
const TTL_MS = 10 * 60_000;

async function halaman(db: Db, dari: number): Promise<SkorSubsls[]> {
  const { data, error } = await db
    .rpc("bencana_skor_beban_subsls")
    .order("idsubsls", { ascending: true })
    .range(dari, dari + HALAMAN - 1);
  if (error) throw new Error(`Gagal membaca skor beban Sub SLS: ${error.message}`);
  return (data ?? []) as SkorSubsls[];
}

async function ambilSemua(db: Db): Promise<SkorSubsls[]> {
  const [a, b] = await Promise.all([halaman(db, 0), halaman(db, HALAMAN)]);
  const hasil = [...a, ...b];
  let terakhir = b;
  for (let dari = HALAMAN * 2; a.length === HALAMAN && terakhir.length === HALAMAN; dari += HALAMAN) {
    terakhir = await halaman(db, dari);
    hasil.push(...terakhir);
  }
  return hasil;
}

/** Hasilnya dipakai bersama banyak permintaan: JANGAN diubah di tempat (pakai filter/map yang membuat salinan). */
export function ambilSkorSubsls(db: Db): Promise<SkorSubsls[]> {
  return memoWaktu("skor-subsls", TTL_MS, () => ambilSemua(db));
}
