// lib/portal/skorSubsls.ts  (hanya server)
//
// (10 Okt 2026) Ambil SEMUA baris fungsi bencana_skor_beban_subsls(). Sebelumnya dipanggil `db.rpc(...)` polos, padahal PostgREST membatasi
// 1000 baris per permintaan sedangkan fungsi ini mengembalikan 1084 Sub SLS -> Sub SLS di ujung urutan (mis. Sumani & Saniang Baka, X Koto Singkarak)
// terpotong diam-diam; PML Ayu Sepriani hanya melihat Sibarambang -- temuan dari tangkapan layar user. Diambil bertahap 1000 baris dengan urutan tetap.
import type { Db } from "@/lib/sigap";

export type SkorSubsls = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; kk_total: number; kk_terdampak_estimasi: number };

export async function ambilSkorSubsls(db: Db): Promise<SkorSubsls[]> {
  const hasil: SkorSubsls[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await db
      .rpc("bencana_skor_beban_subsls")
      .order("idsubsls", { ascending: true })
      .range(dari, dari + 999);
    if (error) throw new Error(`Gagal membaca skor beban Sub SLS: ${error.message}`);
    const baris = (data ?? []) as SkorSubsls[];
    hasil.push(...baris);
    if (baris.length < 1000) break;
  }
  return hasil;
}
