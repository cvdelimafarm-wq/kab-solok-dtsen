// app/api/portal/notifikasi-otomatis/route.ts
//
// (31 Okt 2026) Pengaturan NOTIFIKASI OTOMATIS per kegiatan (Kelola Pendataan > 3 · Notifikasi). Aturan murni: lib/pushPengaturan.ts.
// GET  ?k=<id kegiatan>   -> { pengaturan, fasih[], denyut, kesiapan, riwayat[], boleh_kelola, tabel_siap }   (admin bencana.admin level lihat untuk kegiatan itu)
// POST { kegiatan, kunci, aktif, nilai }   -> simpan satu pengaturan (level kelola)
// POST { aksi:"bawaan", kegiatan }         -> hapus semua pengaturan kegiatan itu = kembali ke bawaan (level kelola)
// Izin mengikuti siaran-petugas: kegiatan 1 (Pascabencana) memakai bencana.admin global; kegiatan lain memakai bencana.admin UNTUK kegiatan itu.
// Tabel sigap_push_pengaturan/denyut belum ada (SQL belum dijalankan) -> GET tetap menjawab dengan bawaan dan tabel_siap=false; POST menjawab 503 jelas.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { pushSiap } from "@/lib/sigapPush";
import { akunPenerimaSiaran } from "@/lib/portal/siaranPetugas";
import { bacaPengaturan, idKegiatanPascabencana } from "@/lib/portal/pushTerkelola";
import { BAWAAN_TRANSLOK, KUNCI_FASIH, adalahKunciFasih, bacaTranslok, bacaUmum, fasihAktif, gabungRiwayat, statusDenyut, validasiSimpan, type BarisLog } from "@/lib/pushPengaturan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const SQL_BELUM = "Tabel pengaturan notifikasi belum ada. Jalankan skema-sql/fase-b/20261031d_push_pengaturan.sql di Supabase dulu.";

function bacaK(v: unknown): number | null {
  const n = typeof v === "string" ? (/^\d{1,7}$/.test(v.trim()) ? Number(v) : NaN) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}
/** Kegiatan 1 memakai izin global (seperti semula); kegiatan lain izin untuk kegiatan itu. */
const izinKeg = (k: number): number | null => (k === 1 ? null : k);

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const k = bacaK(new URL(req.url).searchParams.get("k"));
  if (!k) return galat("Kegiatan tidak sah.");
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "lihat", izinKeg(k))) return galat("Khusus admin pendataan.", 403);
    const { data: keg } = await db.from("sigap_kegiatan").select("id").eq("id", k).maybeSingle();
    if (!keg) return galat("Kegiatan tidak ditemukan.", 404);

    const { error: eTabel } = await db.from("sigap_push_pengaturan").select("kunci").limit(1);
    const tabelSiap = !eTabel;
    const baris = tabelSiap ? await bacaPengaturan(db, k) : [];
    const pasca = await idKegiatanPascabencana(db);
    const adaFasih = pasca === k;

    const denyut: Record<string, { terakhir: string | null; status: string; ringkasan: unknown }> = {
      pengingat: { terakhir: null, status: "belum", ringkasan: null },
      qc: { terakhir: null, status: "belum", ringkasan: null },
    };
    const now = Date.now();
    if (tabelSiap) {
      const { data: d } = await db.from("sigap_push_denyut").select("kunci, terakhir, ringkasan").in("kunci", ["pengingat", "qc"]);
      for (const r of d ?? []) denyut[r.kunci as string] = { terakhir: r.terakhir as string, status: statusDenyut(r.terakhir as string, now), ringkasan: r.ringkasan };
    }

    const penerima = await akunPenerimaSiaran(db, k);
    let berlangganan = 0;
    if (penerima.length) {
      const { data } = await db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).in("akun_id", penerima).limit(5000);
      berlangganan = new Set((data ?? []).map((x) => x.akun_id as number)).size;
    }

    const { data: log } = await db
      .from("sigap_push_log")
      .select("dibuat_at, jenis, judul, oleh_akun_id, jumlah_akun, jumlah_perangkat, terkirim, gagal")
      .eq("kegiatan_id", k)
      .order("dibuat_at", { ascending: false })
      .limit(1500);

    return NextResponse.json({
      kegiatan_id: k,
      tabel_siap: tabelSiap,
      pengaturan: { translok: bacaTranslok(baris), umum: bacaUmum(baris), bawaan_translok: BAWAAN_TRANSLOK },
      fasih: adaFasih ? KUNCI_FASIH.map((f) => ({ ...f, aktif: fasihAktif(baris, f.kunci) })) : null,
      denyut,
      kesiapan: { push_siap: pushSiap(), penerima: penerima.length, berlangganan },
      riwayat: gabungRiwayat((log ?? []) as BarisLog[]),
      boleh_kelola: boleh(izin, "bencana.admin", "kelola", izinKeg(k)),
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Pengaturan notifikasi tidak dapat diubah saat mode "masuk sebagai".', 403);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const k = bacaK(body?.kegiatan);
  if (!body || !k) return galat("Kegiatan tidak sah.");
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "kelola", izinKeg(k))) return galat("Tidak punya izin mengubah pengaturan notifikasi.", 403);
    const { data: keg } = await db.from("sigap_kegiatan").select("id").eq("id", k).maybeSingle();
    if (!keg) return galat("Kegiatan tidak ditemukan.", 404);

    if (body.aksi === "bawaan") {
      const { error } = await db.from("sigap_push_pengaturan").delete().eq("kegiatan_id", k);
      if (error) return galat(SQL_BELUM, 503);
      await catatAudit(db, akun.id, "push_pengaturan_bawaan", { kegiatan: k }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (adalahKunciFasih(body.kunci) && (await idKegiatanPascabencana(db)) !== k) return galat("Notifikasi alur FASIH hanya untuk Pendataan Pascabencana.", 422);
    const sekarang = await bacaPengaturan(db, k);
    const v = validasiSimpan(body, sekarang);
    if (!v.ok) return galat(v.pesan, 422);
    const { error } = await db.from("sigap_push_pengaturan").upsert(
      { kegiatan_id: k, kunci: v.nilai.kunci, aktif: v.nilai.aktif, nilai: v.nilai.nilai, diubah_oleh: akun.id, diubah_at: new Date().toISOString() },
      { onConflict: "kegiatan_id,kunci" }
    );
    if (error) return galat(SQL_BELUM, 503);
    await catatAudit(db, akun.id, "push_pengaturan", { kegiatan: k, kunci: v.nilai.kunci, aktif: v.nilai.aktif, nilai: v.nilai.nilai }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
