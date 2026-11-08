// lib/sigapLaporanSlsDb.ts  (khusus server)
//
// (8 Nov 2026) Menyimpan laporan MANUAL untuk hari terlewat (kegiatan Pascabencana). Dipakai dua jalur:
//  - petugas sendiri  (app/api/sigap/translok/[token]/route.ts, aksi "realisasi")
//  - PML / Supervisor / admin atas nama anggotanya (app/api/sigap/translok/[token]/lengkapi/route.ts)
// Bentuk isian menurut PERAN penugasan (bukan kiriman klien): PPL = rincian per SLS; PML = SLS/PPL diawasi + dokumen diperiksa; Korwil = SLS/PPL disupervisi +
// dokumen diperiksa. Aturan: lib/sigapLengkapiMandiri.ts. Hanya MENAMBAH (insert). Angka TIDAK dihitung sebagai poin kinerja: SLS bertanda
// sumber "manual_susulan" + idsubsls null; laporan PML/Korwil bertanda PENANDA_MANUAL di kendala dan lokasi kosong.

import type { Db } from "@/lib/sigap";
import { ambilWilayahRingkas } from "@/lib/portal/realisasiOtomatis";
import { SUMBER_LAPORAN_MANUAL, jenisFormLaporan, kunciSls, susunLaporanPengawasan, susunLaporanSls } from "@/lib/sigapLengkapiMandiri";

export type TargetLaporan = { penugasanId: number; kegiatanId: number; tanggal: string; peran: string };

export async function simpanLaporanManual(
  db: Db,
  target: TargetLaporan,
  isi: { rincian_sls?: unknown; rincian_pengawasan?: unknown; kendala: unknown },
  /** akun yang mengisi (petugas sendiri, atau PML/admin) -- untuk jejak audit */
  aktorAkunId: number,
  untukAkunId: number
): Promise<{ error: string; status: number } | { ok: true; jumlah: number }> {
  const { data: sudah } = await db.from("sigap_realisasi").select("id").eq("penugasan_id", target.penugasanId).eq("tanggal", target.tanggal).maybeSingle();
  if (sudah) return { error: "Laporan tanggal terlewat yang sudah tersimpan tidak bisa diubah.", status: 403 };
  const kendalaPetugas = typeof isi.kendala === "string" ? isi.kendala.trim().slice(0, 1000) : "";
  const jenis = jenisFormLaporan(target.peran);

  let lokasi: Record<string, unknown>[] = [];
  let jumlah = 0;
  let kendala: string | null = kendalaPetugas || null;
  let ringkas: Record<string, unknown> = {};
  if (jenis === "sls") {
    const master = await ambilWilayahRingkas(db);
    const h = susunLaporanSls(isi.rincian_sls, new Set(master.map((w) => kunciSls({ kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls }))));
    if ("error" in h) return { error: h.error, status: 400 };
    lokasi = h.rincian.map((r) => ({ kecamatan: r.kecamatan, nagari: r.nagari, jorong: r.jorong, idsubsls: null, terdampak: r.terdampak, tidak_terdampak: r.tidak_terdampak, tidak_ditemukan: r.tidak_ditemukan, sumber: SUMBER_LAPORAN_MANUAL }));
    jumlah = h.jumlah;
    ringkas = { sls: h.rincian.length };
  } else {
    const h = susunLaporanPengawasan(isi.rincian_pengawasan, jenis, kendalaPetugas);
    if ("error" in h) return { error: h.error, status: 400 };
    jumlah = h.jumlah;
    kendala = h.kendala;
    ringkas = { sls_diawasi: h.rincian.sls, ppl_diawasi: h.rincian.ppl, dokumen_diperiksa: h.rincian.dokumen };
  }

  const { error } = await db.from("sigap_realisasi").insert({
    penugasan_id: target.penugasanId,
    kegiatan_id: target.kegiatanId,
    tanggal: target.tanggal,
    lokasi,
    jumlah_realisasi: jumlah,
    kendala,
    diperbarui_at: new Date().toISOString(),
  });
  if (error) return { error: "Gagal menyimpan laporan. Coba lagi.", status: 500 };
  await db.from("sigap_audit").insert({
    akun_id: aktorAkunId,
    aksi: "translok.lengkapi_laporan",
    detail: { penugasan_id: target.penugasanId, tanggal: target.tanggal, peran: target.peran, jumlah, ...ringkas, untuk_akun_id: untukAkunId, oleh_sendiri: aktorAkunId === untukAkunId },
  });
  return { ok: true, jumlah };
}
