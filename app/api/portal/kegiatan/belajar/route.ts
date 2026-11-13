// app/api/portal/kegiatan/belajar/route.ts
//
// (13 Nov 2026, keputusan B) Kegiatan belajar dan mutu per waktu (sumber tunggal sigap_belajar_aturan, SQL 20261113e).
// GET  ?k=<id kegiatan> (tanpa k: pelatihan yang sedang dilayani, sama seperti Kelola Pelatihan)
//      -> { kegiatan:{id,nama,jenis}, waktu:[...], butir:[...lengkap...], boleh_kelola }
// PUT  {kegiatan_id, waktu, butir, aktif, wajib, tenggat, blokir, catatan}  -> simpan satu butir (cermin lama ikut lewat pemicu basis data)
// POST {kegiatan_id, waktu, butir, aksi:"batal"|"pulihkan", alasan?}        -> batal wajib beralasan (min 5 huruf); siapa dan kapan dicatat
// Izin: kegiatan pelatihan = pelatihan.kelola; selain itu = bencana.admin (sama dengan Fitur kegiatan Kelola Pendataan). Jejak: sigap_belajar_aturan_jejak + sigap_audit.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, catatAudit, izinAkun, type Level } from "@/lib/sigapAkses";
import { idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { butirSah, lengkapiButir, periksaIsian, waktuUntukJenis, type BarisBelajar } from "@/lib/belajarAturan";
import type { Db } from "@/lib/sigap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const idSah = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const PESAN_SQL = "Tabel aturan belajar belum ada di basis data. Jalankan SQL 20261113e_sigap_belajar_aturan.sql.";

async function masuk(req: NextRequest, kegiatanId: number | null, level: Level) {
  const db = dbPortal();
  if (!db) return { res: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { res: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const id = kegiatanId ?? (await idKegiatanPelatihan(db as Db, null, akun.id));
  if (!id) return { res: galat("Kegiatan tidak ditemukan.", 404) } as const;
  const { data: k } = await db.from("sigap_kegiatan").select("id, nama, jenis").eq("id", id).maybeSingle();
  if (!k) return { res: galat("Kegiatan tidak ditemukan.", 404) } as const;
  const keg = k as { id: number; nama: string; jenis: string | null };
  const menu = keg.jenis === "pelatihan" ? "pelatihan.kelola" : "bencana.admin";
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, menu, level, keg.id)) return { res: galat(level === "kelola" ? "Anda tidak boleh mengubah aturan kegiatan ini." : "Anda tidak punya akses ke kegiatan ini.", 403) } as const;
  return { db: db as Db, akun, keg, bisaKelola: boleh(izin, menu, "kelola", keg.id) } as const;
}

async function keadaan(db: Db, keg: { id: number; nama: string; jenis: string | null }, bisaKelola: boolean) {
  const { data, error } = await db.from("sigap_belajar_aturan").select("id, kegiatan_id, waktu, butir, aktif, wajib, tenggat, blokir, catatan, batal_alasan, batal_oleh, batal_at, diubah_oleh, diubah_at").eq("kegiatan_id", keg.id);
  if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message) ? PESAN_SQL : error.message);
  const waktu = waktuUntukJenis(keg.jenis);
  return { kegiatan: keg, waktu, butir: lengkapiButir(keg.id, waktu, (data ?? []) as BarisBelajar[]), boleh_kelola: bisaKelola };
}

export async function GET(req: NextRequest) {
  try {
    const m = await masuk(req, idSah(req.nextUrl.searchParams.get("k")), "lihat");
    if ("res" in m) return m.res;
    return NextResponse.json(await keadaan(m.db, m.keg, m.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal memuat aturan belajar.", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const m = await masuk(req, idSah(body?.kegiatan_id), "kelola");
    if ("res" in m) return m.res;
    const p = periksaIsian(body);
    if (!p.ok) return galat(p.pesan);
    if (!waktuUntukJenis(m.keg.jenis).includes(p.isian.waktu)) return galat("Waktu itu tidak berlaku untuk jenis kegiatan ini.");
    const oleh = (m.akun.nama ?? `akun ${m.akun.id}`).slice(0, 120);
    const { data: ada } = await m.db.from("sigap_belajar_aturan").select("id, batal_at").eq("kegiatan_id", m.keg.id).eq("waktu", p.isian.waktu).eq("butir", p.isian.butir).maybeSingle();
    const isi = { ...p.isian, diubah_oleh: oleh, diubah_at: new Date().toISOString() };
    const r = ada
      ? await m.db.from("sigap_belajar_aturan").update(isi).eq("id", (ada as { id: number }).id)
      : await m.db.from("sigap_belajar_aturan").insert({ kegiatan_id: m.keg.id, ...isi });
    if (r.error) return galat(/relation|does not exist|schema cache/i.test(r.error.message) ? PESAN_SQL : r.error.message, 500);
    await catatAudit(m.db, m.akun.id, "belajar_aturan_simpan", { kegiatan_id: m.keg.id, ...p.isian });
    return NextResponse.json(await keadaan(m.db, m.keg, m.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal menyimpan aturan belajar.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const m = await masuk(req, idSah(body?.kegiatan_id), "kelola");
    if ("res" in m) return m.res;
    if (!butirSah(body?.waktu, body?.butir)) return galat("Waktu atau butir tidak dikenal.");
    const aksi = body?.aksi;
    const alasan = String(body?.alasan ?? "").trim();
    if (aksi !== "batal" && aksi !== "pulihkan") return galat("Aksi harus batal atau pulihkan.");
    if (aksi === "batal" && (alasan.length < 5 || alasan.length > 300)) return galat("Alasan pembatalan wajib diisi (5 sampai 300 huruf).");
    const oleh = (m.akun.nama ?? `akun ${m.akun.id}`).slice(0, 120);
    const { data: ada } = await m.db.from("sigap_belajar_aturan").select("id, aktif").eq("kegiatan_id", m.keg.id).eq("waktu", String(body?.waktu)).eq("butir", String(body?.butir)).maybeSingle();
    if (!ada) return galat("Butir ini belum diatur; centang dan simpan dulu.");
    const isi = aksi === "batal"
      ? { batal_alasan: alasan, batal_oleh: oleh, batal_at: new Date().toISOString(), diubah_oleh: oleh, diubah_at: new Date().toISOString() }
      : { batal_alasan: null, batal_oleh: null, batal_at: null, diubah_oleh: oleh, diubah_at: new Date().toISOString() };
    const r = await m.db.from("sigap_belajar_aturan").update(isi).eq("id", (ada as { id: number }).id);
    if (r.error) return galat(r.error.message, 500);
    await catatAudit(m.db, m.akun.id, aksi === "batal" ? "belajar_aturan_batal" : "belajar_aturan_pulihkan", { kegiatan_id: m.keg.id, waktu: body?.waktu, butir: body?.butir, alasan });
    return NextResponse.json(await keadaan(m.db, m.keg, m.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal menyimpan pembatalan.", 500);
  }
}
