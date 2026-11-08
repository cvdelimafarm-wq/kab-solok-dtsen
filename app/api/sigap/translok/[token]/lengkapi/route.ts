// app/api/sigap/translok/[token]/lengkapi/route.ts
//
// (8 Nov 2026) PML / Supervisor / admin translok melengkapi LAPORAN hari terlewat anggotanya (kegiatan Pascabencana), lewat form rincian SLS.
// Token = sigap_akun.token pemanggil (seperti halaman translok). Kewenangan = lib/translokBlokirDb.bolehMengelola (atasan bertingkat, Supervisor, admin).
// Hanya laporan; foto tetap diunggah petugas sendiri. Angka tidak dihitung sebagai poin kinerja (lib/sigapLaporanSlsDb.ts).
//
// GET  ?kegiatan=ID                                              -> { anggota: [{ penugasan_id, akun_id, nama, peran, hari: [{ tanggal, foto }] }] }
//                                                                    anggota yang hari terlewatnya masih bisa dilengkapi laporannya
// POST { aksi:"laporan_sls", penugasan_id, tanggal, rincian_sls, kendala? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { HK_AKTIF, akunDariToken, cekAksesIsian, hariIniWib, tanggalValid } from "@/lib/sigap";
import { statusPeriode } from "@/lib/portal/periode";
import { galatServer } from "@/lib/sigapGalat";
import { memblokir } from "@/lib/translokBlokir";
import { bawahanDikelola, bolehMengelola } from "@/lib/translokBlokirDb";
import { MAKS_FOTO_KURANG_MANDIRI, pakaiFormSls } from "@/lib/sigapLengkapiMandiri";
import { simpanLaporanSlsManual } from "@/lib/sigapLaporanSlsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
}

const angka = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
};

/** Semua baris (melewati batas 1000 baris per permintaan). */
async function semua<T>(ambil: (a: number, b: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data } = await ambil(a, a + 999);
    const baris = (data ?? []) as T[];
    hasil.push(...baris);
    if (baris.length < 1000) break;
  }
  return hasil;
}

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const kegiatanId = angka(req.nextUrl.searchParams.get("kegiatan"));
    if (!kegiatanId) return NextResponse.json({ error: "Kegiatan tidak valid." }, { status: 400 });

    const hariIni = hariIniWib();
    const { data: keg } = await db
      .from("sigap_kegiatan")
      .select("id, kode, aktif, tanggal_mulai, tanggal_selesai, hari_tenggang, dibuka_sampai, wajib_laporan, jumlah_foto")
      .eq("id", kegiatanId)
      .maybeSingle();
    const kosong = NextResponse.json({ anggota: [] });
    if (!keg || !keg.aktif || !pakaiFormSls(String(keg.kode ?? "")) || keg.wajib_laporan === false) return kosong;
    if (statusPeriode({ tanggal_mulai: keg.tanggal_mulai as string | null, tanggal_selesai: keg.tanggal_selesai as string | null, hari_tenggang: keg.hari_tenggang as number | null, dibuka_sampai: keg.dibuka_sampai as string | null }, hariIni).status === "arsip") return kosong;

    const { daftar } = await bawahanDikelola(db, akun.id, kegiatanId);
    if (daftar.length === 0) return kosong;
    const akunIds = daftar.map((b) => b.akun_id);
    const pen = await semua<{ id: number; akun_id: number }>((a, b) =>
      db.from("sigap_penugasan").select("id, akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).is("dikunci_at", null).in("akun_id", akunIds).order("id").range(a, b)
    );
    if (pen.length === 0) return kosong;
    const penIds = pen.map((p) => p.id);
    const [hk, real, dok, blok] = await Promise.all([
      semua<{ penugasan_id: number; tanggal: string }>((a, b) => db.from("sigap_hari_kerja").select("penugasan_id, tanggal").in("penugasan_id", penIds).lt("tanggal", hariIni).or(HK_AKTIF()).order("id").range(a, b)),
      semua<{ penugasan_id: number; tanggal: string }>((a, b) => db.from("sigap_realisasi").select("penugasan_id, tanggal").in("penugasan_id", penIds).lt("tanggal", hariIni).order("id").range(a, b)),
      semua<{ penugasan_id: number; tanggal: string }>((a, b) => db.from("sigap_dokumentasi").select("penugasan_id, tanggal").in("penugasan_id", penIds).lt("tanggal", hariIni).order("id").range(a, b)),
      semua<{ akun_id: number; status: string }>((a, b) => db.from("sigap_translok_blokir").select("akun_id, status").eq("kegiatan_id", kegiatanId).in("akun_id", akunIds).order("id").range(a, b)),
    ]);
    const diblokir = new Set(blok.filter((x) => memblokir(x.status as never)).map((x) => x.akun_id));
    const adaLaporan = new Set(real.map((r) => `${r.penugasan_id}|${r.tanggal}`));
    const nFoto = new Map<string, number>();
    for (const d of dok) nFoto.set(`${d.penugasan_id}|${d.tanggal}`, (nFoto.get(`${d.penugasan_id}|${d.tanggal}`) ?? 0) + 1);
    const jumlahFoto = Number(keg.jumlah_foto ?? 5) || 5;

    const anggota = pen
      .filter((p) => !diblokir.has(p.akun_id))
      .map((p) => {
        const b = daftar.find((x) => x.akun_id === p.akun_id)!;
        const hari = hk
          .filter((h) => h.penugasan_id === p.id && !adaLaporan.has(`${p.id}|${h.tanggal}`))
          .map((h) => ({ tanggal: h.tanggal, foto: nFoto.get(`${p.id}|${h.tanggal}`) ?? 0 }))
          .filter((h) => jumlahFoto - h.foto <= MAKS_FOTO_KURANG_MANDIRI)
          .sort((x, y) => x.tanggal.localeCompare(y.tanggal));
        return { penugasan_id: p.id, akun_id: p.akun_id, nama: b.nama, peran: b.peran, hari };
      })
      .filter((x) => x.hari.length > 0)
      .sort((x, y) => x.nama.localeCompare(y.nama));
    return NextResponse.json({ anggota });
  } catch (e) {
    return galatServer("translok_lengkapi GET", e);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.aksi !== "laporan_sls") return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
    const penugasanId = angka(b.penugasan_id);
    if (!penugasanId || !tanggalValid(b.tanggal)) return NextResponse.json({ error: "Petugas dan tanggal wajib." }, { status: 400 });

    const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, kegiatan_id").eq("id", penugasanId).maybeSingle();
    if (!pen) return NextResponse.json({ error: "Penugasan tidak ditemukan." }, { status: 404 });
    const targetAkun = pen.akun_id as number;
    const kegiatanId = pen.kegiatan_id as number;
    if (!(await bolehMengelola(db, akun.id, targetAkun, kegiatanId))) return NextResponse.json({ error: "Anda tidak berwenang melengkapi laporan petugas ini." }, { status: 403 });

    // Aturan yang sama dengan petugas sendiri (SPJ belum dikunci, bukan arsip, tidak diblokir, hari kerja, foto kurang paling banyak 2, laporan belum ada).
    const akses = await cekAksesIsian(db, targetAkun, penugasanId, b.tanggal, { lengkapiMandiri: true });
    if ("error" in akses) return NextResponse.json({ error: akses.error }, { status: akses.status });
    if (!akses.mandiri) return NextResponse.json({ error: "Tanggal ini masih terbuka bagi petugas; laporan diisi petugas sendiri." }, { status: 400 });
    if (!pakaiFormSls(akses.penugasan.kegiatan.kode) || !akses.penugasan.kegiatan.wajib_laporan) return NextResponse.json({ error: "Kegiatan ini tidak memakai form laporan SLS." }, { status: 400 });

    const hasil = await simpanLaporanSlsManual(db, { penugasanId, kegiatanId, tanggal: akses.tanggal }, { rincian_sls: b.rincian_sls, kendala: b.kendala }, akun.id, targetAkun);
    if ("error" in hasil) return NextResponse.json({ error: hasil.error }, { status: hasil.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galatServer("translok_lengkapi POST", e);
  }
}
