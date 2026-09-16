// app/api/anomali-kp/upload/route.ts
//
// Terima upload file DBF (VSEN26.KP: "3_","4_","5_","9_" — VSEN26.M:
// "1_1","1_3","2_1","2_2"), parse, jalankan seluruh pengecekan anomali,
// simpan hasilnya ke Supabase. Data mentah hasil parsing ikut disimpan
// (kolom raw_data) supaya bisa "Jalankan Ulang" nanti tanpa upload file lagi
// — lihat route /rerun.
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

// Route ini butuh Node.js runtime (paket 'dbffile' pakai modul 'fs'),
// tidak bisa jalan di Edge Runtime.
export const runtime = 'nodejs';
// File DBF bisa besar (ribuan baris) — jangan biarkan Next cache respons ini.
export const dynamic = 'force-dynamic';

function detectTableRole(filename: string): keyof Tables | null {
  // Pola gabungan dulu (mis. "1_1.", "2_1.") — khusus file VSEN26.M yang
  // penomorannya dua tingkat (1_1/1_2/1_3 = KOR ART, 2_1/2_2/2_3 = KOR RT).
  const compound = filename.match(/^(\d+_\d+)[._]/);
  if (compound) {
    if (compound[1] === '1_1') return 'm1';
    if (compound[1] === '1_3') return 'm1c';
    if (compound[1] === '2_1') return 'mrt1';
    if (compound[1] === '2_2') return 'mrt2';
    return null; // 1_2, 2_3 dst -- belum dipakai
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
      if (!role) continue; // file di luar tabel yang dipakai, diabaikan
      const filePath = path.join(tmpDir, file.name);
      tables[role] = await readDbf(filePath);
      usedFilenames.push(file.name);
    }

    const adaKp = tables.t3 || tables.t4 || tables.t5 || tables.t9;
    const adaM = tables.m1 || tables.m1c || tables.mrt1 || tables.mrt2;
    if (!adaKp && !adaM) {
      return NextResponse.json(
        {
          error:
            'Tidak ada file yang dikenali. Pastikan nama file diawali "3_"/"4_"/"5_"/"9_" (VSEN26.KP) ' +
            'atau "1_1"/"1_3"/"2_1"/"2_2" (VSEN26.M) persis seperti hasil export aplikasi desktop.',
          namaFileYangDiterimaServer: files.map((f) => f.name),
        },
        { status: 400 }
      );
    }
    if (adaKp) {
      const missing = (['t3', 't4', 't5', 't9'] as const).filter((k) => !tables[k]);
      if (missing.length) {
        return NextResponse.json(
          {
            error:
              `File VSEN26.KP tidak lengkap, kurang: ${missing.join(', ')}. ` +
              'Upload keempat-empatnya sekaligus (3_, 4_, 5_, 9_), atau kalau memang cuma mau upload VSEN26.M, jangan sertakan file KP sama sekali.',
            namaFileYangDiterimaServer: files.map((f) => f.name),
          },
          { status: 400 }
        );
      }
    }

    const hasil = await runAnomaliPipeline(supabase, tables, keterangan, usedFilenames);
    return NextResponse.json(hasil);
  } catch (err: any) {
    console.error('anomali-kp upload error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
