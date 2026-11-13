// app/api/sigap/butir-saya/route.ts
//
// (14 Nov 2026, Fase 2c) Butir kerja mitra untuk tab Hari Ini. HANYA MEMBACA data akun sendiri.
//   GET ?kegiatan=ID -> { ada:false } bila akun bukan mitra atau tidak punya penugasan PPL/PML aktif di kegiatan itu;
//                       { ada:true, butir } selain itu (lib/butirMitra.ts). Pegawai organik/PPPK memakai Delego, bukan kartu ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { susunButirMitra } from "@/lib/butirMitra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const hariWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

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
    const k = req.nextUrl.searchParams.get("kegiatan") ?? "";
    if (!/^\d{1,9}$/.test(k)) return galat("Kegiatan tidak sah.");
    const kegiatan = Number(k);
    const [{ data: akun }, { data: pen }, { data: keg }] = await Promise.all([
      db.from("sigap_akun").select("jenis").eq("id", akunId).maybeSingle(),
      db.from("sigap_penugasan").select("id, peran").eq("kegiatan_id", kegiatan).eq("akun_id", akunId).eq("aktif", true).in("peran", ["ppl", "pml"]).limit(5),
      db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai, satuan_realisasi, jenis").eq("id", kegiatan).maybeSingle(),
    ]);
    const p = (pen ?? [])[0] as { id: number; peran: string } | undefined;
    if (!akun || (akun as { jenis: string }).jenis !== "mitra" || !p || !keg || (keg as { jenis: string | null }).jenis === "pelatihan") return NextResponse.json({ ada: false });
    const kolom = p.peran === "ppl" ? "ppl_akun_id" : "pml_akun_id";
    const [{ data: alok }, { data: real }] = await Promise.all([
      db.from("sigap_alokasi_wilayah").select("target_sampel, idsubsls").eq("kegiatan_id", kegiatan).eq(kolom, akunId).is("nonaktif_at", null).limit(2000),
      db.from("sigap_realisasi").select("jumlah_realisasi").eq("kegiatan_id", kegiatan).eq("penugasan_id", p.id).is("nonaktif_at", null).limit(2000),
    ]);
    const kg = keg as { tanggal_mulai: string | null; tanggal_selesai: string | null; satuan_realisasi: string | null };
    const butir = susunButirMitra({
      peran: p.peran, satuan: kg.satuan_realisasi ?? "dokumen",
      alokasi: (alok ?? []) as { target_sampel: number | null; idsubsls: string | null }[],
      realisasi: ((real ?? []) as { jumlah_realisasi: number | null }[]).reduce((s, r) => s + (Number(r.jumlah_realisasi) || 0), 0),
      mulai: kg.tanggal_mulai, selesai: kg.tanggal_selesai, hariIni: hariWib(),
    });
    return NextResponse.json(butir ? { ada: true, butir } : { ada: false });
  } catch {
    return galat("Gagal memuat butir kerja.", 500);
  }
}
