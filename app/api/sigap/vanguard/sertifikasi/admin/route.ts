// app/api/sigap/vanguard/sertifikasi/admin/route.ts
//
// (1 Nov 2026) VANGUARD V7i: dasbor Sertifikasi untuk BPS Kabupaten Solok. HANYA BACA. Izin: menu `pelatihan.kelola` tingkat lihat (sama dengan dasbor Vanguard kegiatan pelatihan).
// Akun yang sedang "masuk sebagai" boleh melihat. Sertifikat bersifat kepemilikan; dasbor ini tidak mengubah apa pun.
//   GET                -> { dasbor: DasborSertifikasi, terpotong }
//   GET ?format=csv    -> vanguard_sertifikasi_YYYYMMDD.csv (daftar petugas dan tingkatnya)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { csvSertifikasi, susunDasborSertifikasi, type BarisButir, type BarisUjian } from "@/lib/vanguard/sertifikasi/dasbor";
import { NAMA_TINGKAT } from "@/lib/vanguard/sertifikasi/skor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MAKS = 20_000, HALAMAN = 1000;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function muat<T>(db: Db, tabel: string, kolom: string): Promise<{ baris: T[]; terpotong: boolean }> {
  const baris: T[] = [];
  for (let dari = 0; dari < MAKS; dari += HALAMAN) {
    const { data, error } = await db.from(tabel).select(kolom).order("id", { ascending: true }).range(dari, dari + HALAMAN - 1);
    if (error) throw new Error((error as { code?: string }).code === "42P01" ? "TABEL" : `gagal membaca ${tabel}`);
    const b = (data ?? []) as unknown as T[];
    baris.push(...b);
    if (b.length < HALAMAN) return { baris, terpotong: false };
  }
  return { baris, terpotong: true };
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db as Db, akun);
    if (!boleh(izin, "pelatihan.kelola", "lihat")) return galat("Tidak punya izin melihat dasbor sertifikasi.", 403);
    const u = await muat<BarisUjian>(db as Db, "sigap_vanguard_ujian", "id, akun_id, jenis, mulai_at, selesai_at, skor, tingkat");
    const b = await muat<BarisButir>(db as Db, "sigap_vanguard_ujian_butir", "id, ujian_id, kasus, poin, jml_fatal, benar, jawab_at, rincian");
    const nama = new Map<number, string>();
    const ids = [...new Set(u.baris.map((x) => x.akun_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("sigap_akun").select("id, nama").in("id", ids.slice(i, i + 200));
      for (const r of (data ?? []) as { id: number; nama: string }[]) nama.set(r.id, r.nama);
    }
    const d = susunDasborSertifikasi(u.baris, b.baris, nama);
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const tgl = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
      return new NextResponse("﻿" + csvSertifikasi(d, NAMA_TINGKAT), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vanguard_sertifikasi_${tgl}.csv"` } });
    }
    return NextResponse.json({ dasbor: d, terpotong: u.terpotong || b.terpotong });
  } catch (e) {
    if (e instanceof Error && e.message === "TABEL") return galat("Tabel sertifikasi belum dibuat (jalankan SQL 20261101z_vanguard_sertifikasi).", 503);
    return galat("Gagal memuat dasbor sertifikasi.", 500);
  }
}
