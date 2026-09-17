// app/api/anomali-kp/upload/route.ts
//
// Terima upload file DBF (VSEN26.KP: "3_" s.d. "12_" — VSEN26.M: "1_1",
// "1_2","1_3","2_1","2_2","2_3"), parse, jalankan seluruh pengecekan
// anomali & aturan konsistensi resmi BPS (VSEN26.M + VSEN26.KP), simpan
// hasilnya ke Supabase. Data mentah hasil parsing ikut disimpan (kolom
// raw_data) supaya bisa "Jalankan Ulang" nanti tanpa upload file lagi —
// lihat route /rerun.
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
import type { Tables } from '@/lib/anomalyChecks';
import { runAnomaliPipeline } from '@/lib/runAnomaliPipeline';
import { runKonsistensiPipeline } from '@/lib/runKonsistensiPipeline';
import { runKonsistensiPipelineKP } from '@/lib/runKonsistensiPipelineKP';

// Route ini butuh Node.js runtime (paket 'dbffile' pakai modul 'fs'),
// tidak bisa jalan di Edge Runtime.
export const runtime = 'nodejs';
// File DBF bisa besar (ribuan baris) — jangan biarkan Next cache respons ini.
export const dynamic = 'force-dynamic';

// Log RSS (memori proses sesungguhnya, dalam MB) di titik2 penting --
// SEMENTARA, dipasang 17/9 utk melacak tepatnya tahap mana yg bikin proses
// ke-OOM-kill di Railway (limit 1GB) saat upload data besar. Log muncul di
// tab "Deployments" > "View logs" Railway dgn prefix "[MEM]" supaya gampang
// dicari -- boleh dihapus lagi setelah root cause OOM terverifikasi.
function logMem(tag: string) {
  const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log(`[MEM] ${tag}: ${mb} MB`);
}

function detectTableRole(filename: string): keyof Tables | null {
  // Pola gabungan dulu (mis. "1_1.", "2_1.") — khusus file VSEN26.M yang
  // penomorannya dua tingkat (1_1/1_2/1_3 = KOR ART, 2_1/2_2/2_3 = KOR RT).
  const compound = filename.match(/^(\d+_\d+)[._]/);
  if (compound) {
    if (compound[1] === '1_1') return 'm1';
    if (compound[1] === '1_2') return 'm1b';
    if (compound[1] === '1_3') return 'm1c';
    if (compound[1] === '2_1') return 'mrt1';
    if (compound[1] === '2_2') return 'mrt2';
    if (compound[1] === '2_3') return 'mrt3';
    return null;
  }

  // Terima format "3_..." (garis bawah) MAUPUN "3. ..." (titik+spasi, format
  // penomoran asli aplikasi desktop) — dua-duanya sama-sama dipakai di
  // berbagai versi/konteks export.
  const m = filename.match(/^(\d+)[._]/);
  if (!m) return null;
  const n = m[1];
  if (n === '3') return 't3';
  if (n === '4') return 't4';
  if (n === '5') return 't5';
  if (n === '6') return 't6';
  if (n === '7') return 't7';
  if (n === '8') return 't8';
  if (n === '9') return 't9';
  if (n === '10') return 't10';
  if (n === '11') return 't11';
  if (n === '12') return 't12';
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
  logMem('mulai POST');
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const keterangan = (formData.get('keterangan') as string) || null;

    if (!files.length) {
      return NextResponse.json({ error: 'Tidak ada file yang diupload.' }, { status: 400 });
    }

    tmpDir = await mkdtemp(path.join(tmpdir(), 'anomali-kp-'));
    const tables: Partial<Tables> = {};
    const usedFilenames: string[] = [];
    const fileDiabaikan: string[] = [];

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
    // — itu cuma pendamping, bukan tabel yang dibaca langsung). File yg
    // TIDAK dikenali detectTableRole DICATAT (fileDiabaikan) supaya PPL
    // diberi tahu lewat respons, bukan diam2 diabaikan tanpa keterangan
    // (dulu tidak ada peringatan ini sama sekali — sempat bikin PPL
    // mengira semua filenya sudah terekam padahal sebagian tidak dipakai).
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.dbt')) continue;
      const role = detectTableRole(file.name);
      if (!role) {
        fileDiabaikan.push(file.name);
        continue;
      }
      const filePath = path.join(tmpDir, file.name);
      tables[role] = await readDbf(filePath);
      usedFilenames.push(file.name);
    }
    logMem(`selesai baca ${usedFilenames.length} file DBF`);
    let totalBaris = 0;
    for (const k of Object.keys(tables) as (keyof Tables)[]) {
      const n = (tables[k] as unknown[] | undefined)?.length ?? 0;
      totalBaris += n;
      console.log(`[MEM]   tabel ${k}: ${n} baris`);
    }
    // Utk upload BESAR (banyak baris total), JANGAN simpan salinan mentah
    // (raw_data) ke Supabase -- kolom itu dipakai fitur "Jalankan Ulang" saja
    // (route /rerun), TIDAK WAJIB utk hasil Anomali Cepat & Error Konsistensi
    // sendiri. Menyimpannya berarti supabase-js harus JSON.stringify SELURUH
    // data itu (yg pd upload besar bisa >500MB sbg objek JS) -- proses
    // serialize ini butuh salinan string tambahan yg SEMENTARA bikin memori
    // dobel persis pd saat proses sudah paling rawan OOM. Di atas batas ini,
    // fitur "Jalankan Ulang" utk upload tsb jadi tidak tersedia (PPL perlu
    // upload ulang file kalau mau re-run), tapi hasil pengecekannya sendiri
    // TETAP tersimpan normal -- lebih baik drpd seluruh upload gagal krn OOM.
    const RAW_DATA_ROW_LIMIT = 20000;
    const simpanRawData = totalBaris <= RAW_DATA_ROW_LIMIT;
    logMem(
      `total ${totalBaris} baris seluruh tabel${
        simpanRawData ? '' : ` -- MELEBIHI batas ${RAW_DATA_ROW_LIMIT}, raw_data TIDAK disimpan demi hemat memori`
      }`
    );

    const adaKp = tables.t3 || tables.t4 || tables.t5 || tables.t9 || tables.t6 || tables.t7 || tables.t8 || tables.t10 || tables.t11 || tables.t12;
    const adaM = tables.m1 || tables.m1b || tables.m1c || tables.mrt1 || tables.mrt2 || tables.mrt3;
    if (!adaKp && !adaM) {
      return NextResponse.json(
        {
          error:
            'Tidak ada file yang dikenali. Pastikan nama file diawali "3_" s.d. "12_" (VSEN26.KP) ' +
            'atau "1_1"/"1_2"/"1_3"/"2_1"/"2_2"/"2_3" (VSEN26.M) persis seperti hasil export aplikasi desktop.',
          namaFileYangDiterimaServer: files.map((f) => f.name),
        },
        { status: 400 }
      );
    }
    // t3/t4/t5/t9 tetap WAJIB kalau ada file KP sama sekali (dipakai Anomali
    // Cepat & jadi basis Error Konsistensi KP) — t6/t7/t8/t10/t11/t12 (Blok
    // IV.3 ART, Blok V-VII) OPSIONAL: kalau tidak diupload, aturan yg
    // butuh data itu saja yang dilewati (lihat KONSISTENSI_RULES_KP,
    // unsupported_reason), TIDAK menggagalkan upload PPL yg cuma pernah
    // upload 7 file lama.
    if (adaKp) {
      const missing = (['t3', 't4', 't5', 't9'] as const).filter((k) => !tables[k]);
      if (missing.length) {
        return NextResponse.json(
          {
            error:
              `File VSEN26.KP tidak lengkap, kurang: ${missing.join(', ')}. ` +
              'Upload minimal keempat-empatnya sekaligus (3_, 4_, 5_, 9_), atau kalau memang cuma mau upload VSEN26.M, jangan sertakan file KP sama sekali.',
            namaFileYangDiterimaServer: files.map((f) => f.name),
          },
          { status: 400 }
        );
      }
    }

    const hasil = await runAnomaliPipeline(supabase, tables, keterangan, usedFilenames, simpanRawData);
    logMem('selesai runAnomaliPipeline (Anomali Cepat)');

    // Jalankan juga evaluasi aturan konsistensi resmi BPS VSEN26.M (kalau ada
    // data m1/mrt1/mrt2) — pakai upload_id yang SAMA dgn Anomali Cepat di
    // atas, supaya raw_data tidak disimpan dua kali. Kegagalan di sini TIDAK
    // membatalkan hasil Anomali Cepat yang sudah tersimpan — cukup dilaporkan
    // sebagai warning.
    let warningKonsistensi: string | null = null;
    let hasilKonsistensi: { totalTemuan: number; ringkasan: { baru: number; tetap: number; selesai: number } } | null = null;
    if (tables.m1 || tables.mrt1 || tables.mrt2) {
      try {
        hasilKonsistensi = await runKonsistensiPipeline(supabase, tables, hasil.uploadId);
        logMem('selesai runKonsistensiPipeline (Error Konsistensi M)');
      } catch (err: any) {
        console.error('konsistensi-m pipeline error:', err);
        warningKonsistensi = `Evaluasi Error Konsistensi (VSEN26.M) gagal: ${err.message || String(err)}`;
      }
    }

    // Evaluasi aturan konsistensi resmi BPS VSEN26.KP (3.339 aturan, lihat
    // lib/konsistensiRulesKP.ts) — sama polanya dgn VSEN26.M di atas, upload_id
    // SAMA, kegagalan tidak membatalkan hasil Anomali Cepat.
    let warningKonsistensiKp: string | null = null;
    let hasilKonsistensiKp: { totalTemuan: number; ringkasan: { baru: number; tetap: number; selesai: number } } | null = null;
    if (adaKp) {
      logMem('sebelum runKonsistensiPipelineKP (tahap terberat -- 3.280 aturan)');
      try {
        hasilKonsistensiKp = await runKonsistensiPipelineKP(supabase, tables, hasil.uploadId);
        logMem('selesai runKonsistensiPipelineKP (Error Konsistensi KP)');
      } catch (err: any) {
        console.error('konsistensi-kp pipeline error:', err);
        warningKonsistensiKp = `Evaluasi Error Konsistensi (VSEN26.KP) gagal: ${err.message || String(err)}`;
      }
    }

    return NextResponse.json({
      ...hasil,
      konsistensi: hasilKonsistensi,
      warningKonsistensi,
      konsistensiKp: hasilKonsistensiKp,
      warningKonsistensiKp,
      // File yg diupload tapi TIDAK dikenali/dipakai (nama tidak cocok pola
      // manapun) — supaya PPL tahu kalau ada file yg "kelewat" dari 15+ file
      // ekspor VSEN26.KP/VSEN26.M, bukan cuma diam2 diabaikan server.
      fileDiabaikan,
      // Lihat catatan RAW_DATA_ROW_LIMIT di atas -- kalau false, fitur
      // "Jalankan Ulang" utk upload ini tidak tersedia (data terlalu besar
      // utk disimpan mentah demi menghindari OOM), tapi hasil pengecekan di
      // atas TETAP tersimpan & valid.
      rawDataDisimpan: simpanRawData,
      totalBarisData: totalBaris,
    });
  } catch (err: any) {
    console.error('anomali-kp upload error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
