// app/api/anomali-kp/upload/route.ts
//
// Terima upload 4 file DBF (nama diawali "3_", "4_", "5_", "9_"), parse,
// jalankan 37 pengecekan anomali, simpan hasilnya ke Supabase.
//
// PENTING: route ini butuh SUPABASE_SERVICE_ROLE_KEY di environment
// variable Railway (Settings > Variables), BUKAN NEXT_PUBLIC_* — supaya
// insert bisa lewat tanpa terhalang RLS, dan supaya key ini tidak pernah
// terkirim ke browser.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { readDbf } from '@/lib/dbfParser';
import { runAllChecks, type Tables, type Thresholds } from '@/lib/anomalyChecks';

// Route ini butuh Node.js runtime (paket 'dbffile' pakai modul 'fs'),
// tidak bisa jalan di Edge Runtime.
export const runtime = 'nodejs';
// File DBF bisa besar (ribuan baris) — jangan biarkan Next cache respons ini.
export const dynamic = 'force-dynamic';

function detectTableRole(filename: string): keyof Tables | null {
  // Terima format "3_..." (garis bawah) MAUPUN "3. ..." (titik+spasi, format
  // penomoran asli aplikasi desktop) — dua-duanya sama-sama dipakai di
  // berbagai versi/konteks export.
  const m = filename.match(/^(\d+)[._]/);
  if (!m) return null;
  const n = m[1];
  if (n === '3') return 't3';
  if (n === '4') return 't4';
  if (n === '5') return 't5';
  if (n === '9') return 't9';
  return null;
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di environment variable server.' },
      { status: 500 }
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let tmpDir: string | null = null;
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const keterangan = (formData.get('keterangan') as string) || null;
    // Opsional: kirim JSON string di field 'thresholds' utk override ambang batas
    const thresholdsRaw = formData.get('thresholds') as string | null;
    const thresholds: Thresholds = thresholdsRaw ? JSON.parse(thresholdsRaw) : {};

    if (!files.length) {
      return NextResponse.json({ error: 'Tidak ada file yang diupload.' }, { status: 400 });
    }

    tmpDir = await mkdtemp(path.join(tmpdir(), 'anomali-kp-'));
    const tables: Partial<Tables> = {};
    const usedFilenames: string[] = [];

    // TAHAP 1: tulis SEMUA file yang diupload ke folder sementara terlebih
    // dahulu (termasuk file .dbt / memo pendamping). Ini penting karena
    // tabel dengan kolom teks panjang (mis. tabel 3, kolom NAMAKRTDSR)
    // butuh file .dbt dengan nama sama persis ada DI SAMPING file .dbf-nya
    // sebelum bisa dibaca — kalau dibaca duluan sebelum .dbt-nya tersimpan,
    // akan gagal dengan error "Memo file not found".
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(tmpDir, file.name), buf);
    }

    // TAHAP 2: baru baca file .dbf yang relevan (bukan file .dbt itu sendiri
    // — itu cuma pendamping, bukan tabel yang dibaca langsung).
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.dbt')) continue;
      const role = detectTableRole(file.name);
      if (!role) continue; // file di luar 4 tabel yang dipakai, diabaikan
      const filePath = path.join(tmpDir, file.name);
      tables[role] = await readDbf(filePath);
      usedFilenames.push(file.name);
    }

    const missing = (['t3', 't4', 't5', 't9'] as const).filter((k) => !tables[k]);
    if (missing.length) {
      return NextResponse.json(
        {
          error:
            `File berikut belum diupload / nama filenya tidak dikenali: ${missing.join(', ')}. ` +
            'Pastikan nama file diawali "3_", "4_", "5_", atau "9_" persis seperti hasil export aplikasi desktop.',
          // Diagnostik: nama file PERSIS yang diterima server, supaya kelihatan
          // kalau ada perbedaan nama (spasi, penomoran, dsb) dari yang diharapkan.
          namaFileYangDiterimaServer: files.map((f) => f.name),
        },
        { status: 400 }
      );
    }

    // Ambil pengaturan ambang batas & status aktif dari database (diisi lewat
    // upload Excel "Aturan Anomali" di route upload-aturan). Kalau belum
    // pernah diupload, tabelnya kosong dan sistem otomatis pakai nilai
    // default yang sudah ditulis di lib/anomalyChecks.ts.
    const { data: pengaturanRows } = await supabase
      .from('kp_anomali_pengaturan')
      .select('kode, ambang_batas, aktif');

    const KODE_KE_THRESHOLD_KEY: Record<string, keyof Thresholds> = {
      'KP-17': 'tiketPesawat',
      'KP-18': 'hotel',
      'KP-20': 'garam',
      'KP-21': 'transportasiDarat',
      'KP-02': 'zscoreNonMakanan',
    };
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
    // KP-11.007 dst dicek pakai basis "KP-11" (sebelum titik) supaya bisa
    // dinonaktifkan sekaligus semua variannya lewat satu baris di Excel.
    findings = findings.filter((f) => {
      const base = f.kode_anomali.split('.')[0];
      const aktifPenuh = aktifMap.get(f.kode_anomali);
      const aktifBasis = aktifMap.get(base);
      // default true kalau kode itu belum ada di kp_anomali_pengaturan sama sekali
      if (aktifPenuh === false) return false;
      if (aktifPenuh === undefined && aktifBasis === false) return false;
      return true;
    });

    // 1) catat metadata upload (diisi lengkap setelah upsert selesai, lihat bawah)
    const { data: uploadRow, error: uploadErr } = await supabase
      .from('kp_anomali_upload')
      .insert({
        keterangan,
        filenames: usedFilenames.join(', '),
        total_temuan: findings.length,
      })
      .select('id')
      .single();
    if (uploadErr) throw uploadErr;
    const uploadId = uploadRow.id as number;

    // 2) upsert seluruh temuan dalam SATU panggilan RPC (atomic, dilakukan di
    //    Postgres) — bukan insert biasa. Fungsi kp_anomali_upsert_batch akan:
    //      - insert baris baru untuk temuan yang belum pernah ada,
    //      - PERTAHANKAN status konfirmasi PPL kalau nilainya tidak berubah,
    //      - reset ke 'pending' kalau nilainya berubah sejak upload sebelumnya,
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
    // Sengaja TIDAK throw kalau ini gagal (mis. kolom belum ada karena migrasi
    // belum update) — data temuan-nya sendiri sudah tersimpan lewat langkah 2,
    // jadi upload tetap dianggap berhasil. Tapi log & kirim balik warning-nya
    // supaya kelihatan di response kalau ada masalah.
    if (updateSummaryErr) {
      console.error('Gagal update ringkasan kp_anomali_upload:', updateSummaryErr);
    }

    return NextResponse.json({
      uploadId,
      totalTemuan: findings.length,
      filenames: usedFilenames,
      ringkasan,
      warningRingkasanUpload: updateSummaryErr
        ? `Ringkasan upload gagal disimpan: ${updateSummaryErr.message}`
        : null,
    });
  } catch (err: any) {
    console.error('anomali-kp upload error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
