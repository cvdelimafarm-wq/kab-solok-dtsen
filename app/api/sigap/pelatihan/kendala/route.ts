// app/api/sigap/pelatihan/kendala/route.ts
//
// (3 Nov 2026) Kelola Pelatihan > Kendala: petugas menolak / mundur. Izin menu `pelatihan.kelola` (lihat untuk membaca, kelola untuk memutuskan).
//
// GET                              -> { tersedia, petugas[], perlu[], riwayat[], boleh_kelola }
// GET ?cari=kata&akun=<id>         -> { kandidat[] } calon pengganti (kata kosong = saran se-kecamatan dengan petugas <id>)
// POST {aksi:"putuskan", akun_id, keputusan: ganti|kosong|alihkan, pengganti_akun_id?, catatan?} -> { ok, id, ringkas, beban? }
// POST {aksi:"urungkan", id}                                                                      -> { ok, ringkas }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { cariKandidat, DAFTAR_KEPUTUSAN, muatPapan, terapkanKendala, urungkanKendala, type Keputusan } from "@/lib/sigapKendalaDb";

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
    const cari = req.nextUrl.searchParams.get("cari");
    if (cari !== null) {
      const akunId = Number(req.nextUrl.searchParams.get("akun"));
      let kecamatan: string | null = null;
      if (Number.isInteger(akunId) && akunId > 0) {
        const { data } = await p.db.from("sigap_akun").select("alamat_kecamatan").eq("id", akunId).maybeSingle();
        kecamatan = (data as { alamat_kecamatan?: string | null } | null)?.alamat_kecamatan ?? null;
      }
      return NextResponse.json({ kandidat: await cariKandidat(p.db, p.kegiatanId, cari, kecamatan) });
    }
    const papan = await muatPapan(p.db, p.kegiatanId);
    return NextResponse.json({ kegiatan_id: p.kegiatanId, ...papan, boleh_kelola: p.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin memutuskan kendala.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return galat("Permintaan tidak valid.");

    if (body.aksi === "putuskan") {
      const keputusan = body.keputusan as Keputusan;
      if (!DAFTAR_KEPUTUSAN.includes(keputusan)) return galat("Pilihan keputusan tidak dikenal.");
      const akunId = Number(body.akun_id);
      const pengganti = body.pengganti_akun_id == null || body.pengganti_akun_id === "" ? null : Number(body.pengganti_akun_id);
      const hasil = await terapkanKendala(p.db, p.kegiatanId, p.akun.id, { akun_id: akunId, keputusan, pengganti_akun_id: pengganti, catatan: typeof body.catatan === "string" ? body.catatan : null });
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_kendala_putuskan", { kegiatan_id: p.kegiatanId, akun_id: akunId, keputusan, pengganti_akun_id: pengganti, kendala_id: hasil.id });
      return NextResponse.json({ ok: true, id: hasil.id, ringkas: hasil.ringkas, beban: hasil.beban ?? null });
    }
    if (body.aksi === "urungkan") {
      const id = Number(body.id);
      const hasil = await urungkanKendala(p.db, p.kegiatanId, id, p.akun.id);
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_kendala_urungkan", { kegiatan_id: p.kegiatanId, kendala_id: id });
      return NextResponse.json({ ok: true, ringkas: hasil.ringkas });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
