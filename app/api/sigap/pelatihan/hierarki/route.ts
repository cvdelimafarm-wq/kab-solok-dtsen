// app/api/sigap/pelatihan/hierarki/route.ts
//
// (2 Nov 2026) Kelola Pelatihan > Hierarki (instruktur > korwil > PML > PPL). Izin menu `pelatihan.kelola`.
//
// GET                                  -> { tersedia, simpul[], masalah:{siklus,atasan_asing,tanpa_atasan}, boleh_kelola }
// POST {aksi:"salin"}                  -> menyalin atasan awal dari PSP (fungsi SQL sigap_pelatihan_salin_hierarki; hanya mengisi yang belum ada) -> { ok, ditambah }
// POST {aksi:"atur", akun_id, atasan_akun_id|null, peran?}   -> ubah manual -> { ok }
// POST {aksi:"impor", perubahan:[{akun_id, atasan_akun_id|null, peran}]}  -> terapkan hasil impor template (semua atau tidak sama sekali) -> { ok, diterapkan }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { periksaHierarki, type PeranPelatihan } from "@/lib/hierarkiPelatihan";
import { aturAtasan, muatSimpulHierarki, terapkanPerubahan } from "@/lib/sigapPelatihanBaruDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return { err: galat("Pelatihan tidak ditemukan.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const { tersedia, simpul } = await muatSimpulHierarki(p.db, p.kegiatanId);
    return NextResponse.json({ kegiatan_id: p.kegiatanId, tersedia, simpul, masalah: periksaHierarki(simpul), boleh_kelola: p.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengelola hierarki pelatihan.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return galat("Permintaan tidak valid.");

    if (body.aksi === "salin") {
      const { data, error } = await p.db.rpc("sigap_pelatihan_salin_hierarki", { p_kegiatan: p.kegiatanId });
      if (error) return galat("Penyalinan belum dapat dijalankan. Pastikan SQL 20261102zh_pelatihan_hierarki sudah dijalankan.", 500);
      await catatAudit(p.db, p.akun.id, "pelatihan_hierarki_salin", { kegiatan_id: p.kegiatanId, ditambah: data });
      return NextResponse.json({ ok: true, ditambah: Number(data ?? 0) });
    }

    if (body.aksi === "atur") {
      const akunId = Number(body.akun_id);
      if (!Number.isInteger(akunId) || akunId <= 0) return galat("Akun tidak valid.");
      const atasan = body.atasan_akun_id === null || body.atasan_akun_id === undefined || body.atasan_akun_id === "" ? null : Number(body.atasan_akun_id);
      if (atasan !== null && (!Number.isInteger(atasan) || atasan <= 0)) return galat("Atasan tidak valid.");
      const peran = body.peran === undefined || body.peran === null ? null : (["ppl", "pml", "korwil"].includes(String(body.peran)) ? (String(body.peran) as PeranPelatihan) : undefined);
      if (peran === undefined) return galat("Peran tidak valid.");
      const { simpul } = await muatSimpulHierarki(p.db, p.kegiatanId);
      const hasil = await aturAtasan(p.db, p.kegiatanId, akunId, atasan, peran, p.akun.nama, simpul);
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_hierarki_atur", { kegiatan_id: p.kegiatanId, akun_id: akunId, atasan_akun_id: atasan, peran });
      return NextResponse.json({ ok: true });
    }

    if (body.aksi === "impor") {
      if (!Array.isArray(body.perubahan)) return galat("Daftar perubahan tidak valid.");
      const masuk: { akun_id: number; atasan_akun_id: number | null; peran: PeranPelatihan }[] = [];
      for (const x of body.perubahan as Record<string, unknown>[]) {
        const akunId = Number(x?.akun_id);
        const atasan = x?.atasan_akun_id === null || x?.atasan_akun_id === undefined ? null : Number(x.atasan_akun_id);
        const peran = String(x?.peran);
        if (!Number.isInteger(akunId) || akunId <= 0 || (atasan !== null && (!Number.isInteger(atasan) || atasan <= 0)) || !["ppl", "pml", "korwil"].includes(peran)) return galat("Ada baris perubahan yang tidak valid.");
        masuk.push({ akun_id: akunId, atasan_akun_id: atasan, peran: peran as PeranPelatihan });
      }
      const { simpul } = await muatSimpulHierarki(p.db, p.kegiatanId);
      const hasil = await terapkanPerubahan(p.db, p.kegiatanId, masuk, p.akun.nama, simpul);
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_hierarki_impor", { kegiatan_id: p.kegiatanId, diterapkan: hasil.diterapkan ?? 0 });
      return NextResponse.json({ ok: true, diterapkan: hasil.diterapkan ?? 0 });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
