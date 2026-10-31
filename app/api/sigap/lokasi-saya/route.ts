// app/api/sigap/lokasi-saya/route.ts
//
// (31 Okt 2026) Mitra Kepka melengkapi lokasi rumahnya sendiri (tujuan kartu emas "perlu lokasi" di Beranda). Aturan: lib/lokasiMitra.ts.
//   GET                          -> { nama, kecamatan, nagari, titik, perlu: {titik, kecamatan}, pilihan_kecamatan[] }
//   POST { lat, lng, akurasi, kecamatan }  -> mengisi HANYA bagian yang masih kosong (titik rumah / kecamatan). Yang sudah tercatat tidak ditimpa.
// Hanya akun Mitra aktif; tidak boleh saat "masuk sebagai" akun lain. Titik bersumber "gps mandiri (layar lokasi)", verif_* tidak disentuh.
// Setiap pengisian dicatat di sigap_audit (aksi lokasi_mandiri).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, catatAudit, sesiDariHeader } from "@/lib/sigapAkses";
import { titikSah, buangKodeWilayah } from "@/lib/penggunaPool";
import { kebutuhanLokasi, KECAMATAN_SOLOK, periksaSimpanLokasi, SUMBER_LOKASI_MANDIRI } from "@/lib/lokasiMitra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

type BarisAkun = { id: number; nama: string; jenis: string; aktif: boolean; alamat_kecamatan: string | null; domisili_lat: number | null; domisili_lng: number | null; domisili_sumber: string | null; verif_at: string | null; mitra_id: number | null };

async function bacaAkun(db: Db, akunId: number): Promise<BarisAkun | null> {
  const { data } = await db.from("sigap_akun").select("id, nama, jenis, aktif, alamat_kecamatan, domisili_lat, domisili_lng, domisili_sumber, verif_at, mitra_id").eq("id", akunId).maybeSingle();
  const a = data as BarisAkun | null;
  return a && a.aktif && a.jenis === "mitra" ? a : null;
}

/** Daftar kecamatan dari wilayah yang dipakai aplikasi; gagal/kosong -> daftar tetap Kabupaten Solok. */
async function daftarKecamatan(db: Db): Promise<string[]> {
  try {
    const ada = new Set<string>();
    for (let dari = 0; dari < 3000; dari += 1000) {
      const { data, error } = await db.from("bencana_wilayah").select("kecamatan").order("idsubsls").range(dari, dari + 999);
      if (error) return [...KECAMATAN_SOLOK];
      for (const x of (data ?? []) as { kecamatan: string | null }[]) {
        const k = (x.kecamatan ?? "").replace(/\s+/g, " ").trim().toUpperCase();
        if (k) ada.add(k);
      }
      if ((data ?? []).length < 1000) break;
    }
    return ada.size > 0 ? [...ada].sort((a, b) => a.localeCompare(b, "id")) : [...KECAMATAN_SOLOK];
  } catch {
    return [...KECAMATAN_SOLOK];
  }
}

async function bacaNagari(db: Db, mitraId: number | null): Promise<string | null> {
  if (!mitraId) return null;
  const { data } = await db.from("bencana_mitra").select("alamat_desa").eq("id", mitraId).maybeSingle();
  return buangKodeWilayah((data?.alamat_desa as string | null) ?? null);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const a = await bacaAkun(db, akunId);
    if (!a) return galat("Layar ini untuk Mitra Kepka.", 403);
    const adaTitik = titikSah(a.domisili_lat, a.domisili_lng);
    return NextResponse.json({
      nama: a.nama,
      kecamatan: (a.alamat_kecamatan ?? "").trim() || null,
      nagari: await bacaNagari(db, a.mitra_id),
      titik: adaTitik ? { lat: a.domisili_lat, lng: a.domisili_lng, terverifikasi: !!a.verif_at, mandiri: a.domisili_sumber === SUMBER_LOKASI_MANDIRI } : null,
      perlu: kebutuhanLokasi({ lat: a.domisili_lat, lng: a.domisili_lng, kecamatan: a.alamat_kecamatan }),
      pilihan_kecamatan: await daftarKecamatan(db),
    });
  } catch {
    return galat("Gagal memuat lokasi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mengisi lokasi saat masuk sebagai akun lain.", 403);
    const a = await bacaAkun(db, akunId);
    if (!a) return galat("Layar ini untuk Mitra Kepka.", 403);
    const isi = await req.json().catch(() => null);
    const perlu = kebutuhanLokasi({ lat: a.domisili_lat, lng: a.domisili_lng, kecamatan: a.alamat_kecamatan });
    const p = periksaSimpanLokasi(isi, perlu, await daftarKecamatan(db));
    if (!p.ok) return galat(p.pesan);

    // Syarat "masih kosong" diulang di UPDATE supaya dua permintaan serentak (atau admin yang baru mengisi) tidak saling menimpa.
    if (p.nilai.titik) {
      const { data, error } = await db
        .from("sigap_akun")
        .update({ domisili_lat: p.nilai.titik.lat, domisili_lng: p.nilai.titik.lng, domisili_sumber: SUMBER_LOKASI_MANDIRI })
        .eq("id", akunId)
        .or("domisili_lat.is.null,domisili_lng.is.null,domisili_lat.eq.0")
        .select("id");
      if (error) return galat("Gagal menyimpan titik rumah. Coba lagi sebentar lagi.", 500);
      if (!data || data.length === 0) return galat("Titik rumah Anda baru saja tercatat oleh pihak lain. Muat ulang halaman ini.", 409);
    }
    if (p.nilai.kecamatan) {
      const { data, error } = await db.from("sigap_akun").update({ alamat_kecamatan: p.nilai.kecamatan }).eq("id", akunId).or("alamat_kecamatan.is.null,alamat_kecamatan.eq.").select("id");
      if (error) return galat("Gagal menyimpan kecamatan. Coba lagi sebentar lagi.", 500);
      if (!data || data.length === 0) return galat("Kecamatan Anda baru saja tercatat oleh pihak lain. Muat ulang halaman ini.", 409);
    }
    try {
      await catatAudit(db, akunId, "lokasi_mandiri", { titik: p.nilai.titik, kecamatan: p.nilai.kecamatan });
    } catch {
      /* jejak audit tidak boleh menggagalkan pengisian yang sudah tersimpan */
    }
    return NextResponse.json({ ok: true });
  } catch {
    return galat("Gagal menyimpan lokasi.", 500);
  }
}
