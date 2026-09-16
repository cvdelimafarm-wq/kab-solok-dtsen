// lib/runAnomaliPipeline.ts
//
// Logika inti "jalankan 37+50 pengecekan lalu simpan hasilnya" — dipakai
// BERSAMA oleh route upload (data baru dari file) dan route rerun (data lama
// yang sudah tersimpan, dipakai ulang tanpa perlu upload file lagi).

import type { SupabaseClient } from '@supabase/supabase-js';
import { runAllChecks, type Tables, type Thresholds } from './anomalyChecks';

const KODE_KE_THRESHOLD_KEY: Record<string, keyof Thresholds> = {
  // KP-17/18/22 pakai rentang (Min & Max), Excel/Kelola Anomali cuma bisa isi
  // 1 angka per kode — override dipakai utk batas ATAS (Max) saja, batas
  // bawah (Min) tetap pakai default hasil verifikasi data riil tahun lalu.
  'KP-17': 'tiketPesawatMax',
  'KP-18': 'hotelMax',
  'KP-22': 'transportasiLautMax',
  'KP-20': 'garam',
  'KP-21': 'transportasiDarat',
  'KP-02': 'zscoreNonMakanan',
  'M-35': 'uangSaku',
  'M-36': 'biayaTransport',
  'M-37': 'biayaBukuLKS',
  'M-38': 'biayaBukuATK',
  'M-39': 'sppMaks',
};

export async function runAnomaliPipeline(
  supabase: SupabaseClient,
  tables: Partial<Tables>,
  keterangan: string | null,
  filenames: string[],
  simpanRawData: boolean = true
) {
  // Ambil pengaturan ambang batas & status aktif dari database (diisi lewat
  // Kelola Anomali / upload Excel). Kalau belum pernah diisi, tabelnya
  // kosong dan sistem otomatis pakai nilai default di lib/anomalyChecks.ts.
  const { data: pengaturanRows } = await supabase
    .from('kp_anomali_pengaturan')
    .select('kode, ambang_batas, aktif');

  const thresholds: Thresholds = {};
  const aktifMap = new Map<string, boolean>();
  for (const r of pengaturanRows ?? []) {
    aktifMap.set(r.kode, r.aktif);
    const thresholdKey = KODE_KE_THRESHOLD_KEY[r.kode];
    if (thresholdKey && r.ambang_batas !== null && r.ambang_batas !== undefined) {
      (thresholds as any)[thresholdKey] = r.ambang_batas;
    }
  }

  let findings = runAllChecks(tables as Tables, thresholds);

  // Buang temuan yang kode-nya ditandai TIDAK AKTIF di kp_anomali_pengaturan.
  // KP-11.007 dst / M-xx.yyy dicek pakai basis (sebelum titik) supaya bisa
  // dinonaktifkan sekaligus semua variannya lewat satu baris.
  findings = findings.filter((f) => {
    const base = f.kode_anomali.split('.')[0];
    const aktifPenuh = aktifMap.get(f.kode_anomali);
    const aktifBasis = aktifMap.get(base);
    if (aktifPenuh === false) return false;
    if (aktifPenuh === undefined && aktifBasis === false) return false;
    return true;
  });

  // 1) catat metadata upload — raw_data disimpan supaya bisa "Jalankan Ulang"
  //    nanti tanpa perlu upload file yang sama lagi.
  const { data: uploadRow, error: uploadErr } = await supabase
    .from('kp_anomali_upload')
    .insert({
      keterangan,
      filenames: filenames.join(', '),
      total_temuan: findings.length,
      raw_data: simpanRawData ? tables : null,
    })
    .select('id')
    .single();
  if (uploadErr) throw uploadErr;
  const uploadId = uploadRow.id as number;

  // 2) upsert seluruh temuan dalam SATU panggilan RPC (atomic) — bukan
  //    insert biasa. Fungsi kp_anomali_upsert_batch akan:
  //      - insert baris baru untuk temuan yang belum pernah ada,
  //      - PERTAHANKAN status konfirmasi PPL kalau nilainya tidak berubah,
  //      - reset ke 'pending' kalau nilainya berubah,
  //      - tandai 'resolved' utk temuan lama yang sudah tidak muncul lagi.
  const payload = findings.map((f) => ({
    kode_anomali: f.kode_anomali,
    kelompok: f.kelompok,
    nks: f.nks,
    nurt: f.nurt,
    nourutkomo: f.nourutkomo,
    nama_krt: f.nama_krt,
    keterangan: f.keterangan,
    narasi: f.narasi ?? null,
    rincian: f.rincian ?? null,
    kategori: f.kategori ?? null,
    nama_lainnya: f.namaLainnya ?? null,
    banyak: f.banyak ?? null,
    nilai: f.nilai ?? null,
    detail: f.detail ?? null,
  }));

  const { data: upsertResult, error: upsertErr } = await supabase
    .rpc('kp_anomali_upsert_batch', { p_upload_id: uploadId, p_findings: payload })
    .single();
  if (upsertErr) throw upsertErr;

  const ringkasan = upsertResult as { baru: number; berubah: number; tetap: number; selesai: number };

  // 3) lengkapi metadata upload dgn ringkasan perubahan
  const { error: updateSummaryErr } = await supabase
    .from('kp_anomali_upload')
    .update({
      jumlah_baru: ringkasan.baru,
      jumlah_berubah: ringkasan.berubah,
      jumlah_tetap: ringkasan.tetap,
      jumlah_selesai: ringkasan.selesai,
    })
    .eq('id', uploadId);
  if (updateSummaryErr) {
    console.error('Gagal update ringkasan kp_anomali_upload:', updateSummaryErr);
  }

  return {
    uploadId,
    totalTemuan: findings.length,
    filenames,
    ringkasan,
    warningRingkasanUpload: updateSummaryErr
      ? `Ringkasan upload gagal disimpan: ${updateSummaryErr.message}`
      : null,
  };
}
