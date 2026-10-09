// app/api/sigap/rapat/admin/route.ts
//
// (9 Okt 2026) SIGAP > Kelola Pelatihan > tab "Rapat Zoom": atur rapat & lihat rekap hadir. Izin menu `pelatihan.kelola` (lihat/kelola).
// Aksi tulis dicatat di sigap_audit. Tanpa hapus permanen: rapat dimatikan lewat `aktif`.
//
// GET ?rapat_id=            -> { boleh_kelola, sekarang, daftar: Rapat[], rekap: {rapat_id, baris[]}|null }
// POST {aksi:"simpan", id?, judul, mulai_at, selesai_at ("YYYY-MM-DDTHH:mm" WIB), tautan, meeting_id, passcode, token,
//        buka_menit, tutup_menit, sasaran_peran, aktif} -> { ok, id }
// POST {aksi:"aktif", id, aktif}
// POST {aksi:"manual", rapat_id, akun_id, alasan}   -> catat hadir manual (alasan wajib)

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { KOLOM_RAPAT, tautanAman, type PeranSasaran, type Rapat } from "@/lib/sigapRapat";
import { muatRapat, rekapRapat } from "@/lib/sigapRapatDb";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function bacaWaktu(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const teks = (v: unknown, maks: number) => (typeof v === "string" ? v.trim().slice(0, maks) : "");
const menit = (v: unknown, bawaan: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(720, Math.max(0, Math.round(n))) : bawaan;
};

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
    const { data, error } = await p.db.from("sigap_rapat").select(KOLOM_RAPAT).order("mulai_at", { ascending: false }).limit(50);
    if (error) return galat(error.message, 500);
    const daftar = (data ?? []) as Rapat[];
    const diminta = Number(req.nextUrl.searchParams.get("rapat_id"));
    const pilih = daftar.find((r) => r.id === diminta) ?? daftar.find((r) => r.aktif) ?? daftar[0] ?? null;
    return NextResponse.json({ boleh_kelola: p.bisaKelola, sekarang: new Date().toISOString(), daftar, rekap: pilih ? { rapat_id: pilih.id, baris: await rekapRapat(p.db, pilih) } : null });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengelola rapat.", 403);
    const { db, akun } = p;
    const body = await req.json().catch(() => null);
    const aksi = String(body?.aksi ?? "");

    if (aksi === "simpan") {
      const judul = teks(body?.judul, 160);
      const mulai = bacaWaktu(body?.mulai_at);
      const selesai = bacaWaktu(body?.selesai_at);
      const token = teks(body?.token, 40);
      const tautanMentah = teks(body?.tautan, 500);
      const tautan = tautanMentah ? tautanAman(tautanMentah) : null;
      const peran = (["semua", "ppl", "pml"].includes(String(body?.sasaran_peran)) ? body.sasaran_peran : "semua") as PeranSasaran;
      if (!judul) return galat("Judul rapat wajib diisi.", 422);
      if (!mulai || !selesai) return galat("Waktu mulai & selesai wajib diisi dengan benar.", 422);
      if (new Date(selesai) <= new Date(mulai)) return galat("Waktu selesai harus setelah waktu mulai.", 422);
      if (!token) return galat("Token hadir wajib diisi.", 422);
      if (tautanMentah && !tautan) return galat("Tautan Zoom harus diawali https://", 422);
      const nilai = {
        judul, mulai_at: mulai, selesai_at: selesai, tautan, meeting_id: teks(body?.meeting_id, 40) || null, passcode: teks(body?.passcode, 40) || null,
        token, buka_menit: menit(body?.buka_menit, 15), tutup_menit: menit(body?.tutup_menit, 30), sasaran_peran: peran, aktif: !!body?.aktif, diubah_at: new Date().toISOString(),
      };
      const id = body?.id != null ? Number(body.id) : null;
      if (id !== null) {
        if (!Number.isInteger(id) || !(await muatRapat(db, id))) return galat("Rapat tidak ditemukan.", 404);
        const { error } = await db.from("sigap_rapat").update(nilai).eq("id", id);
        if (error) return galat(error.message, 500);
        await catatAudit(db, akun.id, "rapat_ubah", { id, judul, aktif: nilai.aktif });
        return NextResponse.json({ ok: true, id });
      }
      const { data, error } = await db.from("sigap_rapat").insert(nilai).select("id").single();
      if (error) return galat(error.message, 500);
      await catatAudit(db, akun.id, "rapat_buat", { id: data.id, judul, aktif: nilai.aktif });
      return NextResponse.json({ ok: true, id: data.id as number });
    }

    if (aksi === "aktif") {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || !(await muatRapat(db, id))) return galat("Rapat tidak ditemukan.", 404);
      const { error } = await db.from("sigap_rapat").update({ aktif: !!body?.aktif, diubah_at: new Date().toISOString() }).eq("id", id);
      if (error) return galat(error.message, 500);
      await catatAudit(db, akun.id, "rapat_aktif", { id, aktif: !!body?.aktif });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "manual") {
      const rapatId = Number(body?.rapat_id);
      const akunId = Number(body?.akun_id);
      const alasan = teks(body?.alasan, 200);
      if (!Number.isInteger(rapatId) || !Number.isInteger(akunId)) return galat("Data tidak valid.");
      if (alasan.length < 3) return galat("Alasan catat manual wajib diisi.", 422);
      const r = await muatRapat(db, rapatId);
      if (!r) return galat("Rapat tidak ditemukan.", 404);
      const rekap = await rekapRapat(db, r);
      if (!rekap.some((b) => b.akun_id === akunId)) return galat("Akun bukan sasaran rapat ini.", 422);
      const { error } = await db.from("sigap_rapat_hadir").insert({ rapat_id: rapatId, akun_id: akunId, sumber: "manual", alasan });
      if (error && error.code !== "23505") return galat(error.message, 500);
      await catatAudit(db, akun.id, "rapat_hadir_manual", { rapat_id: rapatId, akun_id: akunId, alasan });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
