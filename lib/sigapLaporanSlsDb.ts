// lib/sigapLaporanSlsDb.ts  (khusus server)
//
// (8 Nov 2026) Menyimpan laporan manual per SLS untuk hari terlewat (kegiatan Pascabencana). Dipakai dua jalur:
//  - petugas sendiri  (app/api/sigap/translok/[token]/route.ts, aksi "realisasi")
//  - PML / Supervisor / admin atas nama anggotanya (app/api/sigap/translok/[token]/lengkapi/route.ts)
// Aturan: lib/sigapLengkapiMandiri.ts. Hanya MENAMBAH (insert); angka TIDAK dihitung sebagai poin kinerja: tiap SLS bertanda
// sumber "manual_susulan" dan idsubsls null (tidak menandai Sub SLS "sudah berlapor" di lib/portal/induk.ts).

import type { Db } from "@/lib/sigap";
import { ambilWilayahRingkas } from "@/lib/portal/realisasiOtomatis";
import { SUMBER_LAPORAN_MANUAL, kunciSls, susunLaporanSls } from "@/lib/sigapLengkapiMandiri";

export type TargetLaporan = { penugasanId: number; kegiatanId: number; tanggal: string };

export async function simpanLaporanSlsManual(
  db: Db,
  target: TargetLaporan,
  isi: { rincian_sls: unknown; kendala: unknown },
  /** akun yang mengisi (petugas sendiri, atau PML/admin) -- untuk jejak audit */
  aktorAkunId: number,
  untukAkunId: number
): Promise<{ error: string; status: number } | { ok: true; jumlah: number }> {
  const { data: sudah } = await db.from("sigap_realisasi").select("id").eq("penugasan_id", target.penugasanId).eq("tanggal", target.tanggal).maybeSingle();
  if (sudah) return { error: "Laporan tanggal terlewat yang sudah tersimpan tidak bisa diubah.", status: 403 };
  const master = await ambilWilayahRingkas(db);
  const hasil = susunLaporanSls(isi.rincian_sls, new Set(master.map((w) => kunciSls({ kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls }))));
  if ("error" in hasil) return { error: hasil.error, status: 400 };
  const kendala = typeof isi.kendala === "string" ? isi.kendala.trim().slice(0, 1000) : "";
  const { error } = await db.from("sigap_realisasi").insert({
    penugasan_id: target.penugasanId,
    kegiatan_id: target.kegiatanId,
    tanggal: target.tanggal,
    lokasi: hasil.rincian.map((r) => ({
      kecamatan: r.kecamatan,
      nagari: r.nagari,
      jorong: r.jorong,
      idsubsls: null,
      terdampak: r.terdampak,
      tidak_terdampak: r.tidak_terdampak,
      tidak_ditemukan: r.tidak_ditemukan,
      sumber: SUMBER_LAPORAN_MANUAL,
    })),
    jumlah_realisasi: hasil.jumlah,
    kendala: kendala || null,
    diperbarui_at: new Date().toISOString(),
  });
  if (error) return { error: "Gagal menyimpan laporan. Coba lagi.", status: 500 };
  await db.from("sigap_audit").insert({
    akun_id: aktorAkunId,
    aksi: "translok.lengkapi_laporan",
    detail: { penugasan_id: target.penugasanId, tanggal: target.tanggal, jumlah: hasil.jumlah, sls: hasil.rincian.length, untuk_akun_id: untukAkunId, oleh_sendiri: aktorAkunId === untukAkunId },
  });
  return { ok: true, jumlah: hasil.jumlah };
}
