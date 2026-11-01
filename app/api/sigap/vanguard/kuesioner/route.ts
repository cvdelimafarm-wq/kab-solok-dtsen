// app/api/sigap/vanguard/kuesioner/route.ts
//
// (1 Nov 2026) VANGUARD V6d: penilaian Mode Kuesioner Penuh (kasus K, Blok IV.1) di SERVER. Kunci tidak pernah dikirim ke perangkat kecuali petugas minta "Lihat kunci".
// Tahap ini LATIHAN saja: tidak dicatat, tidak masuk bintang atau dasbor (pencatatan menyusul).
//   GET  ?kode=K01&soal=1[&benih=N] -> { kode, benih, cerita, catatan, info }   (V7a: angka soal dari BENIH; tanpa benih = benih acak baru; benih 0 = angka baku; kunci tidak ikut)
//   GET  ?kode=K01&petunjuk=2[&benih=N] -> { petunjuk: string[2], total }   (petunjuk berurutan; 401 sesi berakhir; 400 kode tidak sah; 404 kasus tidak ada)
//   POST { kode, benih?, isian: IsianK[], lihat?: boolean, kegiatan?, petunjuk?, durasiDtk? } -> { benar, kesalahan[], sesuai, total, rekapSesuai, pembahasan?, rujukan?, kunci?, dicatat, nomor?, bintang?, pesanCatat? }
//        pembahasan dan rujukan menyertai hasil benar atau permintaan "lihat"; kunci hanya menyertai "lihat".
// (V6g) Dengan "kegiatan" (masuk dari kartu kegiatan) dan peserta yang berhak, percobaan DICATAT (latihan): nomor = urutan percobaan petugas pada kasus itu, bintang memakai rumus kasus biasa.
//        "Lihat kunci" tidak menambah percobaan: percobaan terakhir ditandai lihat_jawaban dan bintangnya jadi 0. Gagal mencatat tidak menghalangi umpan balik (dicatat:false + pesanCatat).
//        Kasus K tidak ikut bintang atau kelulusan Mode Simulasi.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { bolehMencatat } from "@/lib/vanguardAkses";
import { benihBaru, bacaBenih } from "@/lib/vanguard/kuesioner/templat";
import { barisKesalahanK, barisPercobaanK, rapikanCacahanK, ringkasPercobaanK } from "@/lib/vanguard/kuesioner/rekamK";
import { cariKasusK, nilaiKasusK } from "@/lib/vanguard/kuesioner/nilaiK";
import { bersihkanIsian } from "@/lib/vanguard/kuesioner/validasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const KODE = /^[A-Z][0-9]{2}$/;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

type Catat = { dicatat: boolean; nomor?: number; bintang?: number; pesanCatat?: string };

async function catatPercobaan(db: ReturnType<typeof supabaseAdmin>, akunId: number, aktor: boolean, m: { kegiatan: number; kasus: string; benih: number; isian: ReturnType<typeof bersihkanIsian>["isian"]; petunjuk: number; lihatJawaban: boolean; durasiDtk: number }, kasus: NonNullable<ReturnType<typeof cariKasusK>>): Promise<Catat> {
  if (!db) return { dicatat: false, pesanCatat: "Penyimpanan belum siap; hasil tidak dicatat." };
  if (aktor) return { dicatat: false, pesanCatat: "Mode lihat (masuk sebagai) tidak mencatat percobaan." };
  try {
    const izin = await bolehMencatat(db as Db, akunId, m.kegiatan);
    if (!izin.boleh) return { dicatat: false, pesanCatat: izin.alasan ?? "Tidak diizinkan mencatat pada kegiatan ini." };
    // "Lihat kunci" = penanda pada percobaan terakhir, bukan percobaan baru.
    if (m.lihatJawaban) {
      const { data: akhir } = await db.from("sigap_vanguard_percobaan").select("id, nomor").eq("kegiatan_id", m.kegiatan).eq("akun_id", akunId).eq("kasus", m.kasus).order("nomor", { ascending: false }).limit(1);
      const baris = ((akhir ?? []) as { id: number; nomor: number }[])[0];
      if (baris) {
        const { error } = await db.from("sigap_vanguard_percobaan").update({ lihat_jawaban: true, benar: false, bintang: 0 }).eq("id", baris.id);
        return error ? { dicatat: false, pesanCatat: "Gagal mencatat." } : { dicatat: true, nomor: baris.nomor, bintang: 0 };
      }
    }
    for (let ulang = 0; ulang < 2; ulang++) {
      const { count, error: eHitung } = await db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", m.kegiatan).eq("akun_id", akunId).eq("kasus", m.kasus);
      if (eHitung) return { dicatat: false, pesanCatat: "Gagal mencatat." };
      const nomor = (count ?? 0) + 1;
      const r = ringkasPercobaanK(kasus, m, nomor);
      const { data: baru, error } = await db.from("sigap_vanguard_percobaan").insert(barisPercobaanK(akunId, m, r, nomor)).select("id").single();
      if (error) {
        if ((error as { code?: string }).code === "23505" && ulang === 0) continue;
        return { dicatat: false, pesanCatat: "Gagal mencatat." };
      }
      const kes = barisKesalahanK((baru as { id: number }).id, akunId, m, r);
      if (kes.length > 0) {
        const { error: eKes } = await db.from("sigap_vanguard_kesalahan").insert(kes);
        if (eKes) return { dicatat: true, nomor, bintang: r.bintang, pesanCatat: "Percobaan tercatat, tetapi rincian kesalahan gagal disimpan." };
      }
      return { dicatat: true, nomor, bintang: r.bintang };
    }
    return { dicatat: false, pesanCatat: "Gagal mencatat." };
  } catch {
    return { dicatat: false, pesanCatat: "Gagal mencatat." };
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!sesiDariHeader(req.headers)) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kode = req.nextUrl.searchParams.get("kode") ?? "";
    if (!KODE.test(kode)) return galat("Kode kasus tidak sah.");
    const mintaSoal = req.nextUrl.searchParams.get("soal") === "1";
    const bBenih = req.nextUrl.searchParams.get("benih");
    const benih = bBenih === null ? (mintaSoal ? benihBaru() : 0) : bacaBenih(Number(bBenih));
    if (benih === null || (bBenih !== null && bBenih.trim() === "")) return galat("Benih tidak sah.");
    const kasus = cariKasusK(kode, benih);
    if (!kasus) return galat("Kasus tidak ditemukan.", 404);
    if (mintaSoal) return NextResponse.json({ kode, benih, cerita: kasus.cerita, catatan: kasus.catatan, info: kasus.info });
    const n = Math.max(0, Math.min(kasus.petunjuk.length, Number.parseInt(req.nextUrl.searchParams.get("petunjuk") ?? "0", 10) || 0));
    return NextResponse.json({ kode, petunjuk: kasus.petunjuk.slice(0, n), total: kasus.petunjuk.length });
  } catch {
    return galat("Gagal memuat soal.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    let badan: { kode?: unknown; benih?: unknown; isian?: unknown; lihat?: unknown; kegiatan?: unknown; petunjuk?: unknown; durasiDtk?: unknown };
    try { badan = await req.json(); } catch { return galat("Permintaan tidak sah."); }
    const kode = typeof badan.kode === "string" ? badan.kode : "";
    if (!KODE.test(kode)) return galat("Kode kasus tidak sah.");
    const benih = badan.benih === undefined ? 0 : bacaBenih(badan.benih);
    if (benih === null) return galat("Benih tidak sah.");
    const kasus = cariKasusK(kode, benih);
    if (!kasus) return galat("Kasus tidak ditemukan.", 404);
    const { isian, galat: g } = bersihkanIsian(badan.isian);
    if (g) return galat(g);
    const hasil = nilaiKasusK(kasus, isian);
    const lihat = badan.lihat === true;
    let catat: Catat = { dicatat: false };
    if (badan.kegiatan !== undefined && badan.kegiatan !== null) {
      const keg = badan.kegiatan;
      if (typeof keg !== "number" || !Number.isInteger(keg) || keg < 1) return galat("Kegiatan tidak sah.");
      const cac = rapikanCacahanK(badan.petunjuk, badan.durasiDtk);
      catat = await catatPercobaan(supabaseAdmin(), akunId, !!aktorDariHeader(req.headers), { kegiatan: keg, kasus: kode, benih, isian, petunjuk: cac.petunjuk, lihatJawaban: lihat, durasiDtk: cac.durasiDtk }, kasus);
    }
    return NextResponse.json({
      ...hasil,
      ...(hasil.benar || lihat ? { pembahasan: kasus.pembahasan, rujukan: kasus.rujukan } : {}),
      ...(lihat ? { kunci: kasus.kunci } : {}),
      ...catat,
    });
  } catch {
    return galat("Gagal menilai isian.", 500);
  }
}
