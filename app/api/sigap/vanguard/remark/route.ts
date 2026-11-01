// app/api/sigap/vanguard/remark/route.ts
//
// (1 Nov 2026) VANGUARD V5c: remark "tidak lulus Vanguard, tetap mendata dengan pendampingan khusus" untuk LEVEL DI ATAS petugas yang bermasalah (aturan: lib/vanguard/remark.ts).
//   GET ?kegiatan=ID -> { boleh, peran, remark:[{akun_id, nama, peran, nilai, benar, dibuka, remark}] }
//   PPL bermasalah terlihat oleh PML dan supervisor/korwil; PML bermasalah hanya oleh supervisor/korwil. Peran lain mendapat daftar kosong (boleh:false).
// Hanya hasil final TIDAK LULUS yang ditampilkan. Kegiatan tanpa Vanguard atau tanpa nilai lulus: kosong. Hanya baca (akun "masuk sebagai" boleh melihat).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { keadaanVanguard } from "@/lib/vanguardAkses";
import { muatPengaturan } from "@/lib/vanguardPengaturanDb";
import { peranDilihat, peranTertinggi, susunRemark } from "@/lib/vanguard/remark";
import type { BarisPercobaanDb, Peserta } from "@/lib/vanguard/dasbor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const BUKAN_ADMINISTRASI = "sumber.is.null,sumber.neq.administrasi";
const HALAMAN = 1000;
const MAKS_BARIS = 50_000;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const v = req.nextUrl.searchParams.get("kegiatan");
    const kegiatan = v && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v) : null;
    if (!kegiatan) return galat("Kegiatan tidak sah.");
    const kosong = (peran: string | null) => NextResponse.json({ boleh: false, peran, remark: [] });

    // peran pelihat pada kegiatan ini (penugasan aktif, bukan peserta tambahan administrasi)
    const { data: milik } = await db.from("sigap_penugasan").select("peran").eq("kegiatan_id", kegiatan).eq("akun_id", akunId).eq("aktif", true).or(BUKAN_ADMINISTRASI).limit(10);
    const peran = peranTertinggi(((milik ?? []) as { peran: string | null }[]).map((x) => x.peran));
    const dilihat = peranDilihat(peran);
    if (dilihat.length === 0) return kosong(peran);
    if (!(await keadaanVanguard(db as Db, kegiatan)).menyala) return kosong(peran);
    const peng = await muatPengaturan(db as Db, kegiatan);
    if (peng.nilai_lulus === null) return NextResponse.json({ boleh: true, peran, remark: [] });

    const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran").eq("kegiatan_id", kegiatan).eq("aktif", true).or(BUKAN_ADMINISTRASI).limit(5000);
    const pegawai = new Map<number, string | null>();
    for (const r of (pen ?? []) as { akun_id: number; peran: string | null }[]) {
      const lama = pegawai.get(r.akun_id);
      pegawai.set(r.akun_id, lama ? peranTertinggi([lama, r.peran]) ?? lama : r.peran);
    }
    const bawahanId = [...pegawai].filter(([, p]) => p && dilihat.includes(p)).map(([id]) => id);
    if (bawahanId.length === 0) return NextResponse.json({ boleh: true, peran, remark: [] });

    const perc: BarisPercobaanDb[] = [];
    for (let dari = 0; dari < MAKS_BARIS; dari += HALAMAN) {
      const { data, error } = await db.from("sigap_vanguard_percobaan").select("akun_id, kasus, nomor, benar, bintang, jml_salah, jml_fatal, petunjuk, lihat_jawaban, durasi_dtk, dibuat_at, mode").eq("kegiatan_id", kegiatan).order("id", { ascending: true }).range(dari, dari + HALAMAN - 1);
      if (error) return galat("Gagal memuat remark Vanguard.", 500);
      const b = (data ?? []) as unknown as BarisPercobaanDb[];
      perc.push(...b);
      if (b.length < HALAMAN) break;
    }
    const nama = new Map<number, string>();
    for (let i = 0; i < bawahanId.length; i += 200) {
      const { data } = await db.from("sigap_akun").select("id, nama").in("id", bawahanId.slice(i, i + 200));
      for (const r of (data ?? []) as { id: number; nama: string }[]) nama.set(r.id, r.nama);
    }
    const peserta: Peserta[] = bawahanId.map((id) => ({ akun_id: id, nama: nama.get(id) ?? `Akun ${id}`, peran: pegawai.get(id) ?? null }));
    return NextResponse.json({ boleh: true, peran, remark: susunRemark(peran, peserta, perc, peng) });
  } catch {
    return galat("Gagal memuat remark Vanguard.", 500);
  }
}
