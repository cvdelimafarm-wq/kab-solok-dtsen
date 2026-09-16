// app/api/anomali-kp/rerun/route.ts
//
// "Jalankan Ulang Pengecekan" — pakai data mentah dari upload TERAKHIR yang
// tersimpan (kolom kp_anomali_upload.raw_data), tanpa perlu upload file DBF
// lagi. Berguna sesudah ubah ambang batas/status aktif di Kelola Anomali,
// atau sesudah perbaikan kode — supaya tidak perlu browse & upload file
// yang sama berkali-kali cuma untuk lihat efek perubahan aturan.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Tables } from '@/lib/anomalyChecks';
import { runAnomaliPipeline } from '@/lib/runAnomaliPipeline';
import { runKonsistensiPipeline } from '@/lib/runKonsistensiPipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  try {
    let keterangan: string | null = null;
    try {
      const body = await req.json();
      keterangan = body?.keterangan || null;
    } catch {
      // body kosong/bukan JSON — boleh, keterangan tetap null
    }

    // Ambil upload TERAKHIR yang punya raw_data tersimpan (upload dari
    // sebelum fitur ini ada tidak punya raw_data, jadi dilewati).
    const { data: lastUpload, error: fetchErr } = await supabase
      .from('kp_anomali_upload')
      .select('id, raw_data, filenames')
      .not('raw_data', 'is', null)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!lastUpload || !lastUpload.raw_data) {
      return NextResponse.json(
        {
          error:
            'Belum ada data tersimpan yang bisa dijalankan ulang. Upload file DBF setidaknya sekali dulu ' +
            '(upload setelah fitur "Jalankan Ulang" ini tersedia) — setelah itu tombol ini bisa dipakai berulang kali.',
        },
        { status: 400 }
      );
    }

    const tables = lastUpload.raw_data as Partial<Tables>;
    const filenames = (lastUpload.filenames || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const hasil = await runAnomaliPipeline(
      supabase,
      tables,
      keterangan ?? `Jalankan ulang dari upload #${lastUpload.id}`,
      filenames
    );

    let warningKonsistensi: string | null = null;
    let hasilKonsistensi: { totalTemuan: number; ringkasan: { baru: number; tetap: number; selesai: number } } | null = null;
    if (tables.m1 || tables.mrt1 || tables.mrt2) {
      try {
        hasilKonsistensi = await runKonsistensiPipeline(supabase, tables, hasil.uploadId);
      } catch (err: any) {
        console.error('konsistensi-m pipeline error:', err);
        warningKonsistensi = `Evaluasi Error Konsistensi gagal: ${err.message || String(err)}`;
      }
    }

    return NextResponse.json({ ...hasil, konsistensi: hasilKonsistensi, warningKonsistensi });
  } catch (err: any) {
    console.error('anomali-kp rerun error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
