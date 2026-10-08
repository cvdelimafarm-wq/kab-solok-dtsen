// app/api/sigap/pelatihan/admin/pengumuman/route.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > Pengumuman: modal pengumuman peserta yang diatur panitia.
// Izin menu `pelatihan.kelola` (lihat = melihat daftar; kelola = ubah). Semua aksi tulis dicatat di sigap_audit.
// Tidak ada penghapusan permanen: modal dimatikan lewat `aktif`.
//
// GET                                  -> { boleh_kelola, sekarang, daftar: Pengumuman[] }
// POST {aksi:"simpan", id?, judul, jenis, isi, tombol_label?, tombol_url?, frekuensi, sasaran_kelas?, sasaran_peran?,
//        mulai_at?, akhir_at? ("YYYY-MM-DDTHH:mm" WIB), aktif}   -> { ok, id }
// POST {aksi:"urut", ids:[id,...]}     -> atur urutan antrian
// POST {aksi:"aktif", id, aktif}       -> hidup/matikan cepat

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { KOLOM_PENGUMUMAN, MAKS_PENGUMUMAN, validasiIsianPengumuman, type Pengumuman } from "@/lib/sigapPengumuman";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/** Waktu dari klien: ISO berzona, atau "YYYY-MM-DDTHH:mm" (dianggap WIB). Kosong -> null; tidak valid -> undefined. */
function bacaWaktu(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db);
  if (!kegiatanId) return { err: galat("Kegiatan pelatihan belum dibuat.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const { data, error } = await p.db.from("sigap_pengumuman").select(KOLOM_PENGUMUMAN).eq("kegiatan_id", p.kegiatanId).order("urut").order("id").limit(200);
    if (error) return galat(error.message, 500);
    return NextResponse.json({ boleh_kelola: p.bisaKelola, sekarang: new Date().toISOString(), daftar: (data ?? []) as Pengumuman[] });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengelola pengumuman pelatihan.", 403);
    const { db, akun, kegiatanId } = p;
    const body = await req.json().catch(() => null);
    const aksi = String(body?.aksi ?? "");

    if (aksi === "simpan") {
      const mulai = bacaWaktu(body?.mulai_at);
      const akhir = bacaWaktu(body?.akhir_at);
      if (mulai === undefined || akhir === undefined) return galat("Waktu mulai/berakhir tidak valid.");
      const v = validasiIsianPengumuman({ ...body, mulai_at: mulai, akhir_at: akhir });
      if (!v.ok) return galat(v.pesan, 422);
      const id = body?.id !== undefined && body?.id !== null ? Number(body.id) : null;
      const sekarang = new Date().toISOString();
      if (id !== null) {
        if (!Number.isInteger(id)) return galat("Pengumuman tidak valid.");
        const { data: ada } = await db.from("sigap_pengumuman").select("id").eq("id", id).eq("kegiatan_id", kegiatanId).maybeSingle();
        if (!ada) return galat("Pengumuman tidak ditemukan.", 404);
        const { error } = await db.from("sigap_pengumuman").update({ ...v.nilai, diubah_at: sekarang }).eq("id", id).eq("kegiatan_id", kegiatanId);
        if (error) return galat(error.message, 500);
        await catatAudit(db, akun.id, "pelatihan_pengumuman_ubah", { id, ...v.nilai });
        return NextResponse.json({ ok: true, id });
      }
      const { data: semua } = await db.from("sigap_pengumuman").select("urut").eq("kegiatan_id", kegiatanId).order("urut", { ascending: false }).limit(MAKS_PENGUMUMAN + 1);
      if ((semua ?? []).length >= MAKS_PENGUMUMAN) return galat(`Maksimal ${MAKS_PENGUMUMAN} pengumuman. Matikan atau pakai ulang yang lama.`, 409);
      const urut = ((semua ?? [])[0]?.urut as number | undefined) ?? 0;
      const { data, error } = await db.from("sigap_pengumuman").insert({ ...v.nilai, kegiatan_id: kegiatanId, urut: urut + 1 }).select("id").maybeSingle();
      if (error || !data) return galat(error?.message ?? "Gagal menyimpan.", 500);
      await catatAudit(db, akun.id, "pelatihan_pengumuman_baru", { id: data.id, ...v.nilai });
      return NextResponse.json({ ok: true, id: data.id as number });
    }

    if (aksi === "urut") {
      const ids: unknown = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => !Number.isInteger(x))) return galat("Urutan tidak valid.");
      const unik = [...new Set(ids as number[])];
      const { data: ada } = await db.from("sigap_pengumuman").select("id").eq("kegiatan_id", kegiatanId).in("id", unik);
      if ((ada ?? []).length !== unik.length) return galat("Ada pengumuman yang tidak dikenal.", 404);
      for (let i = 0; i < unik.length; i++) {
        const { error } = await db.from("sigap_pengumuman").update({ urut: i + 1 }).eq("id", unik[i]).eq("kegiatan_id", kegiatanId);
        if (error) return galat(error.message, 500);
      }
      await catatAudit(db, akun.id, "pelatihan_pengumuman_urut", { ids: unik });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "aktif") {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || typeof body?.aktif !== "boolean") return galat("Permintaan tidak valid.");
      const { data, error } = await db.from("sigap_pengumuman").update({ aktif: body.aktif, diubah_at: new Date().toISOString() }).eq("id", id).eq("kegiatan_id", kegiatanId).select("id").maybeSingle();
      if (error) return galat(error.message, 500);
      if (!data) return galat("Pengumuman tidak ditemukan.", 404);
      await catatAudit(db, akun.id, "pelatihan_pengumuman_aktif", { id, aktif: body.aktif });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
