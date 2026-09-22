// lib/spjWilayahTugas.ts
//
// Fungsi BERSAMA utk menghitung kecamatan DOMISILI & kecamatan WILAYAH
// TUGAS seorang petugas dari data yg SUDAH ADA di sistem (BUKAN input
// manual) -- awalnya ditulis khusus utk Visum (app/api/penyisiran/spj/
// visum/route.ts, permintaan user 22 Sep 2026 supaya Visum tidak salah
// ketik/beda dgn data Perencanaan Lapangan sebenarnya), lalu DIPAKAI ULANG
// oleh Kwitansi (field "untuk perjalanan dinas dalam kota pada", permintaan
// user yg sama) supaya KEDUA dokumen selalu konsisten menyebut kecamatan yg
// sama utk petugas yg sama -- SATU sumber logic, jangan diduplikasi lagi.
//
//  - domisili      <- petugas_penyisiran_akun.alamat_kecamatan
//  - wilayah tugas  <- distinct penyisiran_alokasi_pilihan.kec_nama milik
//    petugas itu (bisa >1 kecamatan, digabung " / ")
// Utk jenis "tetangga" TIDAK ada sumber data itu (tabel tetangga_akun tidak
// py alamat & tidak pernah nge-tag wilayah SLS), jadi kedua field NULL --
// pemanggil (jenis "tetangga") tetap pakai input manual spt sebelumnya.

import type { SpjSession } from "./spjAuth";
import { judulKecamatan } from "./spjFormat";

export interface KecamatanTugasHasil {
  domisili: string | null;
  wilayahTugas: string | null;
}

// supabase diketik "any" -- lihat catatan yg sama di lib/spjAuth.ts kenapa.
export async function hitungKecamatanTugas(supabase: any, session: SpjSession): Promise<KecamatanTugasHasil> {
  if (session.jenis !== "penyisiran") return { domisili: null, wilayahTugas: null };

  const [{ data: akun }, { data: wilayah }] = await Promise.all([
    supabase.from("petugas_penyisiran_akun").select("alamat_kecamatan").eq("id", session.petugasId).maybeSingle(),
    supabase.from("penyisiran_alokasi_pilihan").select("kec_nama").eq("petugas_id", session.petugasId),
  ]);

  const alamatKecamatan: string | null | undefined = akun?.alamat_kecamatan;
  const domisili = alamatKecamatan ? judulKecamatan(alamatKecamatan) : null;

  const kecTugasSet = new Set<string>();
  for (const w of (wilayah ?? []) as { kec_nama?: string | null }[]) {
    if (w?.kec_nama) kecTugasSet.add(judulKecamatan(w.kec_nama));
  }
  const wilayahTugas = kecTugasSet.size > 0 ? Array.from(kecTugasSet).sort().join(" / ") : null;

  return { domisili, wilayahTugas };
}
