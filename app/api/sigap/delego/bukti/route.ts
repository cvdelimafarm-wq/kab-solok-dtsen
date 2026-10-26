// app/api/sigap/delego/bukti/route.ts
//
// (26 Okt 2026) Delego: unggah dan lihat foto bukti laporan harian. Tidak ada SQL baru: foto disimpan di penyimpanan sigap-files (delego/<delegasi>/<hash>.<ext>)
// dan lokasinya dicatat pada keu_dlg_laporan.bukti (jsonb) lewat keu_dlg_lapor seperti biasa.
//
// POST (multipart, Authorization: Bearer <sesi>)  bidang: berkas (jpeg/png/webp, maks 6 MB), delegasi (id).
//   Hanya penerima delegasi yang masih berjalan, atau PML yang mewakilinya (dibaca dari keu_dlg_saya, jadi hak ditegakkan basis data).
//   Jenis ditentukan dari byte awal berkas, bukan dari nama atau tipe kiriman klien. Balasan: { data: { path, ukuran, jenis } }.
//   Berkas yang tidak jadi dilampirkan pada laporan dibiarkan di penyimpanan (tidak ada penghapusan).
// GET ?path=delego/<delegasi>/<hash>.<ext>  mengirim gambar. Hanya bila path tercatat pada laporan yang boleh dilihat akun itu
//   atau hasil kerja (tahap 39) yang boleh dilihat akun itu (milik sendiri/diwakili dari keu_dlg_saya, atau milik tim dari keu_dlg_bahan).
//   Unggah foto untuk hasil kerja memakai rute POST yang sama (penerima delegasi yang masih baru/berjalan).
// Sesi "masuk sebagai" (simulasi) tidak boleh mengunggah. Logika murni ada di lib/delego/bukti.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { panggilKeu } from "@/lib/keu/gerbang";
import { ditemukanDiBukti, delegasiDariPath, EKSTENSI, jenisGambar, lokasiBukti, periksaUkuran, tipeDariPath, TIPE_ISI } from "@/lib/delego/bukti";
import type { BahanSaya, BahanTim } from "@/lib/delego/tipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function klien() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const db = klien();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (sesi.aktorId !== null) return galat("Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan.", 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return galat("Isian tidak terbaca."); }
  const berkas = form.get("berkas");
  if (!(berkas instanceof File)) return galat("Foto wajib dipilih.");
  const delegasi = Number(form.get("delegasi"));
  if (!Number.isInteger(delegasi) || delegasi <= 0) return galat("delegasi wajib.");
  const salahUkuran = periksaUkuran(berkas.size);
  if (salahUkuran) return galat(salahUkuran, berkas.size > 0 ? 413 : 400);

  // hak: delegasi harus milik akun ini (masih berjalan) atau diwakilinya; dibaca dari basis data
  const s = await panggilKeu<BahanSaya>(db, sesi.akunId, "keu_dlg_saya", {});
  if (!s.ok) return NextResponse.json({ error: s.galat.pesan, kode: s.galat.kode }, { status: s.galat.status });
  const boleh = [...s.data.delegasi.filter((d) => d.status === "baru" || d.status === "berjalan"), ...s.data.diwakili].some((d) => d.id === delegasi);
  if (!boleh) return galat("Anda tidak berwenang melaporkan delegasi ini.", 403);

  const isi = await berkas.arrayBuffer();
  const jenis = jenisGambar(new Uint8Array(isi.slice(0, 16)));
  if (!jenis) return galat("Berkas harus foto berformat JPG, PNG, atau WebP.", 415);
  const hash = await sha256Hex(isi);
  const path = lokasiBukti(delegasi, hash, jenis);
  const { error } = await db.storage.from(BUCKET_SIGAP).upload(path, Buffer.from(isi), { contentType: TIPE_ISI[jenis], upsert: true });
  if (error) return galat("Foto gagal disimpan ke penyimpanan.", 502);
  return NextResponse.json({ data: { path, ukuran: berkas.size, jenis: EKSTENSI[jenis] } });
}

export async function GET(req: NextRequest) {
  const db = klien();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (delegasiDariPath(path) === null) return galat("path tidak sah.");

  // hak lihat: path harus tercatat pada laporan yang boleh dilihat akun ini
  const s = await panggilKeu<BahanSaya>(db, sesi.akunId, "keu_dlg_saya", {});
  let boleh = s.ok && ditemukanDiBukti(path, [...s.data.laporan, ...s.data.laporan_diwakili], s.data.hasil);
  if (!boleh) {
    const b = await panggilKeu<BahanTim>(db, sesi.akunId, "keu_dlg_bahan", {});
    boleh = b.ok && ditemukanDiBukti(path, b.data.laporan, b.data.hasil);
  }
  if (!boleh) return galat("Foto tidak ditemukan atau Anda tidak berwenang melihatnya.", 404);

  const { data, error } = await db.storage.from(BUCKET_SIGAP).download(path);
  if (error || !data) return galat("Foto tidak ditemukan di penyimpanan.", 404);
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": tipeDariPath(path), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
