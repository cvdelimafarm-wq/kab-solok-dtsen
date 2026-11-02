// app/api/sigap/pelatihan/info/route.ts
//
// (1 Nov 2026) Info ringkas pelatihan yang sedang dilayani untuk akun ini: nama kegiatan dan kegiatan induknya (untuk judul layar peserta dan tombol kembali).
// Pelatihan ditentukan sama seperti rute peserta lain (?kegiatan=ID, atau pilihan otomatis lib/sigapPelatihanPilih.ts). Hanya baca; tahan galat (induk tidak ditemukan = null).
// GET -> { kegiatan_id, nama, kode, induk_kode }

import { NextRequest, NextResponse } from "next/server";
import { FILTER_BUKAN_ADMINISTRASI, akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { tanggalWib } from "@/lib/sigapPresensi";
import { urutkanPilihan, type PilihanPelatihan } from "@/lib/sigapPelatihanNama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return NextResponse.json({ kegiatan_id: null, nama: "", kode: "", induk_kode: null });
    const { data: k } = await db.from("sigap_kegiatan").select("nama, kode").eq("id", kegiatanId).maybeSingle();
    let indukKode: string | null = null;
    try {
      const { data: induk } = await db.from("sigap_induk").select("kode").eq("aktif", true).contains("kegiatan_ids", [kegiatanId]).order("urutan").limit(1);
      indukKode = ((induk ?? []) as { kode: string }[])[0]?.kode ?? null;
    } catch {
      indukKode = null;
    }
    // (3 Nov 2026) bila akun terdaftar di dua pelatihan aktif atau lebih, kirim daftarnya agar peserta bisa berpindah (pemilih pelatihan); gagal -> tanpa daftar
    let pilihan: PilihanPelatihan[] = [];
    try {
      const { data: pen } = await db.from("sigap_penugasan").select("kegiatan_id").eq("akun_id", akun.id).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(50);
      const ids = Array.from(new Set(((pen ?? []) as { kegiatan_id: number }[]).map((r) => r.kegiatan_id)));
      if (ids.length >= 2) {
        const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, kode, tanggal_mulai, tanggal_selesai").in("id", ids).eq("jenis", "pelatihan").eq("aktif", true);
        pilihan = urutkanPilihan(
          ((keg ?? []) as { id: number; nama: string | null; kode: string | null; tanggal_mulai: string | null; tanggal_selesai: string | null }[]).map((r) => ({ id: r.id, nama: r.nama ?? "", kode: r.kode ?? "", tanggal_mulai: r.tanggal_mulai ?? null, tanggal_selesai: r.tanggal_selesai ?? null })),
          tanggalWib(new Date().getTime()),
        );
      }
    } catch {
      pilihan = [];
    }
    return NextResponse.json({ kegiatan_id: kegiatanId, nama: (k?.nama as string | undefined) ?? "", kode: (k?.kode as string | undefined) ?? "", induk_kode: indukKode, ...(pilihan.length >= 2 ? { pilihan } : {}) });
  } catch {
    return NextResponse.json({ kegiatan_id: null, nama: "", kode: "", induk_kode: null });
  }
}
