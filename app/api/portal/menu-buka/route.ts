// app/api/portal/menu-buka/route.ts
//
// (31 Okt 2026) Catatan "sudah membuka menu hari ini" (lib/sigapMenuBuka.ts), hanya untuk akun yang bersangkutan.
//  GET  ?kode=<induk>  -> { tersedia, tanggal, buka: { pengawasan: { pertama_at, terakhir_at, jumlah } | null } }
//  POST { kode, menu } -> mencatat pembukaan hari ini (satu baris per akun/kegiatan/menu/hari WIB; jumlah bertambah).
// "Masuk sebagai" (akun super) hanya melihat: pencatatan dilewati. Tabel belum dimigrasi (20261031a) -> tersedia:false / dicatat:false, bukan galat.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { hariIniWib } from "@/lib/sigap";
import { periksaMenuBuka, type CatatanBuka } from "@/lib/sigapMenuBuka";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABEL_HILANG = (m: string) => /relation .*sigap_menu_buka.* does not exist|schema cache|Could not find the table/i.test(m);

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  const kode = req.nextUrl.searchParams.get("kode") ?? "";
  if (!/^[a-z0-9_]{2,30}$/.test(kode)) return NextResponse.json({ error: "Kode kegiatan tidak sah." }, { status: 400 });
  const tanggal = hariIniWib();
  const { data, error } = await db.from("sigap_menu_buka").select("menu, pertama_at, terakhir_at, jumlah").eq("akun_id", akun.id).eq("kegiatan_kode", kode).eq("tanggal", tanggal);
  if (error) {
    if (TABEL_HILANG(error.message)) return NextResponse.json({ tersedia: false, tanggal, buka: { pengawasan: null } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const buka: Record<string, CatatanBuka | null> = { pengawasan: null };
  for (const r of data ?? []) buka[r.menu as string] = { pertama_at: r.pertama_at as string, terakhir_at: r.terakhir_at as string, jumlah: Number(r.jumlah) || 1 };
  return NextResponse.json({ tersedia: true, tanggal, buka });
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  const cek = periksaMenuBuka(await req.json().catch(() => null));
  if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 400 });
  if (aktorDariHeader(req.headers)) return NextResponse.json({ ok: true, dicatat: false });
  const tanggal = hariIniWib();
  const sekarang = new Date().toISOString();
  const { data: ada, error: e1 } = await db.from("sigap_menu_buka").select("id, jumlah").eq("akun_id", akun.id).eq("kegiatan_kode", cek.kode).eq("menu", cek.menu).eq("tanggal", tanggal).maybeSingle();
  if (e1) return NextResponse.json(TABEL_HILANG(e1.message) ? { ok: true, dicatat: false } : { error: e1.message }, { status: TABEL_HILANG(e1.message) ? 200 : 500 });
  if (ada) {
    await db.from("sigap_menu_buka").update({ terakhir_at: sekarang, jumlah: (Number(ada.jumlah) || 1) + 1 }).eq("id", ada.id);
    return NextResponse.json({ ok: true, dicatat: true });
  }
  const { error: e2 } = await db.from("sigap_menu_buka").insert({ akun_id: akun.id, kegiatan_kode: cek.kode, menu: cek.menu, tanggal, pertama_at: sekarang, terakhir_at: sekarang, jumlah: 1 });
  if (e2 && !/duplicate key|unique/i.test(e2.message)) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, dicatat: true });
}
