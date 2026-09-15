// app/api/anomali-kp/upload-aturan/route.ts
//
// Terima upload 1 file Excel (format "Draft_Aturan_Anomali_KP.xlsx"), baca
// 3 sheet-nya, sinkron ke 3 tabel Supabase:
//   - "Aturan Anomali"              -> kp_anomali_pengaturan (ambang_batas, aktif)
//   - "2. Batas Maks Konsumsi"      -> kp_anomali_q_maksimum
//   - "3. Referensi Kalori (DKBM)"  -> kp_anomali_kalori
//
// PENTING: sama seperti route upload DBF, ini butuh SUPABASE_SERVICE_ROLE_KEY
// di environment variable server (bukan NEXT_PUBLIC_*).
//
// ⚠ CATATAN KEAMANAN PAKET 'xlsx': versi yang ada di npm registry (xlsx@0.18.5)
// punya 2 kerentanan yang diketahui (Prototype Pollution, ReDoS) saat mem-parse
// file .xlsx. SheetJS (pembuatnya) sudah merilis versi yang diperbaiki, TAPI
// cuma didistribusikan lewat CDN mereka sendiri, bukan npm registry. Install
// versi yang sudah diperbaiki dengan:
//   npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
// (bukan `npm install xlsx` biasa). Risiko ini serupa dgn upload DBF yang
// sudah ada (halaman /seruti terbuka tanpa login), jadi tidak menambah
// celah baru secara mendasar, tapi tetap disarankan pakai versi yg diperbaiki.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];
  return all.slice(1); // buang baris header
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

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Tidak ada file yang diupload.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });

    const hasil = {
      pengaturan: 0,
      qMaksimum: 0,
      kalori: 0,
      errors: [] as string[],
    };

    // ---------- Sheet "Aturan Anomali" -> kp_anomali_pengaturan ----------
    const rowsAturan = toRows(wb, 'Aturan Anomali');
    const upsertsAturan = rowsAturan
      .filter((r) => typeof r[0] === 'string' && r[0].trim() !== '')
      .map((r) => ({
        kode: String(r[0]).trim(),
        kelompok: r[1] ?? null,
        ambang_batas: typeof r[7] === 'number' ? r[7] : null, // kolom H: "Nilai Ambang (angka saja)"
        aktif: String(r[10] ?? '').trim().toUpperCase() === 'Y',
        catatan: r[11] ?? null,
      }));
    if (upsertsAturan.length) {
      const { error } = await supabase.from('kp_anomali_pengaturan').upsert(upsertsAturan, { onConflict: 'kode' });
      if (error) hasil.errors.push(`Sheet "Aturan Anomali": ${error.message}`);
      else hasil.pengaturan = upsertsAturan.length;
    }

    // Kolom M (index 12) "Rekomendasi PPL" — opsional, ditangani TERPISAH dari
    // upsert di atas. Kalau selnya kosong, kolom `rekomendasi` di database
    // TIDAK disentuh (supaya tidak menimpa isi default yang sudah ada dengan
    // kosong, kalau user upload draft lama yang belum punya kolom ini).
    const updatesRekomendasi = rowsAturan
      .filter((r) => typeof r[0] === 'string' && r[0].trim() !== '' && typeof r[12] === 'string' && r[12].trim() !== '')
      .map((r) => ({ kode: String(r[0]).trim(), rekomendasi: String(r[12]).trim() }));
    for (const u of updatesRekomendasi) {
      const { error } = await supabase
        .from('kp_anomali_pengaturan')
        .update({ rekomendasi: u.rekomendasi })
        .eq('kode', u.kode);
      if (error) hasil.errors.push(`Rekomendasi ${u.kode}: ${error.message}`);
    }

    // ---------- Sheet "2. Batas Maks Konsumsi" -> kp_anomali_q_maksimum ----------
    const rowsQmax = toRows(wb, '2. Batas Maks Konsumsi');
    const upsertsQmax = rowsQmax
      .filter((r) => typeof r[0] === 'number' && typeof r[3] === 'number')
      .map((r) => ({
        no_urut_komoditas: r[0],
        nama_komoditas: r[1] ?? null,
        satuan: r[2] ?? null,
        q_maksimum: r[3],
        catatan: r[4] ?? null,
      }));
    if (upsertsQmax.length) {
      const { error } = await supabase
        .from('kp_anomali_q_maksimum')
        .upsert(upsertsQmax, { onConflict: 'no_urut_komoditas' });
      if (error) hasil.errors.push(`Sheet "2. Batas Maks Konsumsi": ${error.message}`);
      else hasil.qMaksimum = upsertsQmax.length;
    }

    // ---------- Sheet "3. Referensi Kalori (DKBM)" -> kp_anomali_kalori ----------
    const rowsKalori = toRows(wb, '3. Referensi Kalori (DKBM)');
    const upsertsKalori = rowsKalori
      .filter((r) => typeof r[0] === 'number' && typeof r[3] === 'number')
      .map((r) => ({
        no_urut_komoditas: r[0],
        nama_komoditas: r[1] ?? null,
        satuan: r[2] ?? null,
        kalori_per_satuan: r[3],
        catatan: r[4] ?? null,
      }));
    if (upsertsKalori.length) {
      const { error } = await supabase
        .from('kp_anomali_kalori')
        .upsert(upsertsKalori, { onConflict: 'no_urut_komoditas' });
      if (error) hasil.errors.push(`Sheet "3. Referensi Kalori (DKBM)": ${error.message}`);
      else hasil.kalori = upsertsKalori.length;
    }

    if (hasil.pengaturan === 0 && hasil.qMaksimum === 0 && hasil.kalori === 0 && hasil.errors.length === 0) {
      return NextResponse.json(
        {
          error:
            'Tidak ada baris yang berhasil dibaca. Pastikan nama sheet persis: "Aturan Anomali", ' +
            '"2. Batas Maks Konsumsi", "3. Referensi Kalori (DKBM)".',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(hasil);
  } catch (err: any) {
    console.error('upload-aturan error:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
