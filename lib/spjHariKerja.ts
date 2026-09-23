// lib/spjHariKerja.ts
//
// Fungsi BERSAMA utk mengambil daftar TANGGAL "hari kerja" yg berlaku bagi
// SEORANG petugas SPJ -- awalnya logic ini cuma ada di dalam
// app/api/penyisiran/spj/hari-kerja-saya/route.ts (dipakai kartu
// "Kelengkapan per Jenis Dokumen" di administrasi-spj.tsx), SEKARANG
// DIPAKAI ULANG oleh app/api/penyisiran/spj/buat-otomatis/route.ts (fitur
// "Buat Otomatis" utk Kwitansi/Visum/Surat Pernyataan per-SET, lihat
// lib/spjSetHariTugas.ts) -- SATU sumber logic, jangan diduplikasi lagi,
// spy kartu kelengkapan & fitur Buat Otomatis SELALU melihat "hari kerja"
// yg persis sama utk petugas yg sama.
//
// - jenis "penyisiran": tanggal diambil LANGSUNG dari
//   penyisiran_alokasi_hari_tugas (kartu 🗓 Identifikasi Hari Tugas, tab
//   Perencanaan Lapangan) milik petugas ybs -- HANYA baris yg masih aktif
//   (dibatalkan_oleh IS NULL) & masih dlm periode resmi
//   (tanggalDalamPeriodeHariTugas).
// - jenis "tetangga": TIDAK PERNAH BISA mengisi penyisiran_alokasi_hari_tugas
//   sama sekali -- tabel itu py FK KHUSUS ke petugas_penyisiran_akun(id).
//   Fallback: SEMUA tanggal kalender dlm rentang tanggal_mulai..tanggal_selesai
//   tiap Surat Tugas yg ditautkan ke akun ybs.

import type { SpjSession } from "./spjAuth";
import { tanggalDalamPeriodeHariTugas } from "./penyisiranHari";

export type SumberHariKerja = "hari_tugas" | "fallback_st_range";

export interface HariKerjaHasil {
  tanggal: string[]; // urut kronologis, unik
  sumber: SumberHariKerja;
}

function rentangTanggal(mulai: string, selesai: string): string[] {
  const hasil: string[] = [];
  let d = new Date(mulai + "T00:00:00Z");
  const akhir = new Date(selesai + "T00:00:00Z");
  while (d.getTime() <= akhir.getTime()) {
    hasil.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return hasil;
}

// supabase diketik "any" -- lihat catatan yg sama di lib/spjAuth.ts kenapa.
export async function daftarHariKerjaPetugas(supabase: any, session: Pick<SpjSession, "jenis" | "petugasId">): Promise<HariKerjaHasil> {
  if (session.jenis === "penyisiran") {
    const { data } = await supabase
      .from("penyisiran_alokasi_hari_tugas")
      .select("tanggal, dibatalkan_oleh")
      .eq("petugas_id", session.petugasId);

    const tanggal = ((data ?? []) as { tanggal: string; dibatalkan_oleh: string | null }[])
      .filter((r) => !r.dibatalkan_oleh)
      .map((r) => r.tanggal)
      .filter((t) => tanggalDalamPeriodeHariTugas(t));

    return { tanggal: Array.from(new Set(tanggal)).sort(), sumber: "hari_tugas" };
  }

  // jenis "tetangga" -- fallback rentang ST, lihat komentar panjang di atas file ini.
  const { data: tautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);

  const ids = ((tautan ?? []) as { surat_tugas_id: number }[]).map((t) => t.surat_tugas_id);
  if (ids.length === 0) return { tanggal: [], sumber: "fallback_st_range" };

  const { data: stList } = await supabase.from("spj_surat_tugas").select("tanggal_mulai, tanggal_selesai").in("id", ids);

  const set = new Set<string>();
  for (const st of (stList ?? []) as { tanggal_mulai: string; tanggal_selesai: string }[]) {
    for (const t of rentangTanggal(st.tanggal_mulai, st.tanggal_selesai)) set.add(t);
  }

  return { tanggal: Array.from(set).sort(), sumber: "fallback_st_range" };
}
