// app/api/sigap/vanguard/usulan/route.ts
//
// (1 Nov 2026) VANGUARD V8b: Usul Kasus oleh petugas (kasus janggal dari lapangan, tanpa data responden asli) dan tinjauan admin. Tabel sigap_vanguard_usulan (SQL 20261101za).
//   GET             -> { usulan:[{id, judul, status, catatan_admin, dibuat_at}] }                        usulan milik akun sendiri
//   GET ?semua=1    -> { usulan:[{id, nama, judul, cerita, jawaban, blok, status, catatan_admin, dibuat_at, ditinjau_at}] }   semua usulan (izin pelatihan.kelola tingkat lihat)
//   POST { judul, cerita, jawaban?, blok? }  -> { id }   maksimum 5 usulan per 24 jam per petugas; mode lihat (masuk sebagai) tidak boleh menulis
//   PATCH { id, status:"diterima"|"ditolak"|"dikerjakan", catatan? } -> { ok:true }                      tinjauan (izin pelatihan.kelola tingkat kelola)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { bacaTinjauan, bacaUsulan, MAKS_USULAN_PER_HARI } from "@/lib/vanguard/pembinaan/usulan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const PESAN_TABEL = "Fitur usul kasus belum siap: tabel basis data belum dibuat (jalankan SQL 20261101za_vanguard_pembinaan).";
const tabelBelumAda = (e: unknown): boolean => { const x = e as { code?: string; message?: string } | null; return !!x && (x.code === "42P01" || /does not exist|schema cache/i.test(x.message ?? "")); };

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}
type Baris = { id: number; akun_id: number; judul: string; cerita: string; jawaban: string | null; blok: string | null; status: string; catatan_admin: string | null; dibuat_at: string; ditinjau_at: string | null };

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const semua = req.nextUrl.searchParams.get("semua") === "1";
    if (semua) {
      const { izin } = await izinAkun(db as Db, akun);
      if (!boleh(izin, "pelatihan.kelola", "lihat")) return galat("Tidak punya izin melihat usulan kasus.", 403);
    }
    let q = db.from("sigap_vanguard_usulan").select("id, akun_id, judul, cerita, jawaban, blok, status, catatan_admin, dibuat_at, ditinjau_at");
    if (!semua) q = q.eq("akun_id", akun);
    const { data, error } = await q.order("id", { ascending: false }).limit(semua ? 500 : 50);
    if (error) return tabelBelumAda(error) ? galat(PESAN_TABEL, 503) : galat("Gagal memuat usulan.", 500);
    const baris = (data ?? []) as unknown as Baris[];
    if (!semua) return NextResponse.json({ usulan: baris.map((b) => ({ id: b.id, judul: b.judul, status: b.status, catatan_admin: b.catatan_admin, dibuat_at: b.dibuat_at })) });
    const nama = new Map<number, string>();
    const ids = [...new Set(baris.map((b) => b.akun_id))];
    for (let i = 0; i < ids.length; i += 200) {
      const { data: a } = await db.from("sigap_akun").select("id, nama").in("id", ids.slice(i, i + 200));
      for (const r of (a ?? []) as { id: number; nama: string }[]) nama.set(r.id, r.nama);
    }
    return NextResponse.json({ usulan: baris.map((b) => ({ id: b.id, nama: nama.get(b.akun_id) ?? `Akun ${b.akun_id}`, judul: b.judul, cerita: b.cerita, jawaban: b.jawaban, blok: b.blok, status: b.status, catatan_admin: b.catatan_admin, dibuat_at: b.dibuat_at, ditinjau_at: b.ditinjau_at })) });
  } catch {
    return galat("Gagal memuat usulan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mengirim usulan.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Permintaan tidak sah."); }
    const { usulan, galat: g } = bacaUsulan(badan);
    if (!usulan) return galat(g ?? "Usulan tidak sah.");
    const { data: ada, error: eAda } = await db.from("sigap_vanguard_usulan").select("id, dibuat_at").eq("akun_id", akun).order("id", { ascending: false }).limit(20);
    if (eAda) return tabelBelumAda(eAda) ? galat(PESAN_TABEL, 503) : galat("Gagal memeriksa usulan.", 500);
    const sehari = Date.now() - 86_400_000;
    if (((ada ?? []) as { dibuat_at: string }[]).filter((x) => new Date(x.dibuat_at).getTime() > sehari).length >= MAKS_USULAN_PER_HARI) return galat(`Batas ${MAKS_USULAN_PER_HARI} usulan per hari tercapai. Coba lagi besok.`, 429);
    const { data: baru, error } = await db.from("sigap_vanguard_usulan").insert({ akun_id: akun, judul: usulan.judul, cerita: usulan.cerita, jawaban: usulan.jawaban || null, blok: usulan.blok || null, status: "baru", dibuat_at: new Date().toISOString() }).select("id").single();
    if (error || !baru) return tabelBelumAda(error) ? galat(PESAN_TABEL, 503) : galat("Gagal menyimpan usulan.", 500);
    return NextResponse.json({ id: (baru as { id: number }).id });
  } catch {
    return galat("Gagal mengirim usulan.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat meninjau usulan.", 403);
    const { izin } = await izinAkun(db as Db, akun);
    if (!boleh(izin, "pelatihan.kelola", "kelola")) return galat("Tidak punya izin meninjau usulan kasus.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Permintaan tidak sah."); }
    const id = typeof (badan as { id?: unknown })?.id === "number" && Number.isInteger((badan as { id: number }).id) && (badan as { id: number }).id > 0 ? (badan as { id: number }).id : null;
    if (!id) return galat("Usulan tidak sah.");
    const t = bacaTinjauan(badan);
    if (!t.status) return galat(t.galat ?? "Status tidak sah.");
    const { data: ada, error: eAda } = await db.from("sigap_vanguard_usulan").select("id").eq("id", id).limit(1);
    if (eAda) return tabelBelumAda(eAda) ? galat(PESAN_TABEL, 503) : galat("Gagal memuat usulan.", 500);
    if (((ada ?? []) as unknown[]).length === 0) return galat("Usulan tidak ditemukan.", 404);
    const { error } = await db.from("sigap_vanguard_usulan").update({ status: t.status, catatan_admin: t.catatan || null, ditinjau_at: new Date().toISOString(), ditinjau_oleh: akun }).eq("id", id);
    if (error) return galat("Gagal menyimpan tinjauan.", 500);
    return NextResponse.json({ ok: true });
  } catch {
    return galat("Gagal meninjau usulan.", 500);
  }
}
