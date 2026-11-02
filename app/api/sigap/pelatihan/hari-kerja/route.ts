// app/api/sigap/pelatihan/hari-kerja/route.ts
//
// (2 Nov 2026) Kelola Pelatihan > Hari Kerja. Izin menu `pelatihan.kelola` (lihat = baca, kelola = ubah).
//
// GET                                      -> { kegiatan, tanggal, hari_ini, matriks[], ringkas, boleh_kelola }
// POST {aksi:"buat"|"lepas"|"pindah", item:[{akun_id,tanggal}]}   -> proses item terpilih -> { ok, berhasil, dilewati[] }
// POST {aksi:"buat"|"pindah", semua:true}                         -> proses SEMUA sel yang memenuhi syarat (dihitung di server) -> sama

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { muatHariKerja, ubahHariKerja } from "@/lib/sigapHariKerjaDb";
import { itemDariMatriks, ringkasMatriks, type Aksi, type Item } from "@/lib/hariKerjaPelatihan";

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
    const d = await muatHariKerja(p.db, p.kegiatanId);
    return NextResponse.json({ kegiatan: d.kegiatan, tanggal: d.tanggal, hari_ini: d.hari_ini, matriks: d.matriks, ringkas: ringkasMatriks(d.matriks), boleh_kelola: p.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengelola hari kerja pelatihan.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return galat("Permintaan tidak valid.");
    const aksi = body.aksi as Aksi;
    if (aksi !== "buat" && aksi !== "lepas" && aksi !== "pindah") return galat("Aksi tidak dikenal.");

    const d = await muatHariKerja(p.db, p.kegiatanId);
    let items: Item[];
    if (body.semua === true) {
      if (aksi === "lepas") return galat("Melepas semua tidak tersedia; pilih per sel.");
      items = itemDariMatriks(d.matriks, aksi);
    } else {
      if (!Array.isArray(body.item) || body.item.length === 0) return galat("Tidak ada yang dipilih.");
      items = [];
      for (const x of body.item as Record<string, unknown>[]) {
        const akunId = Number(x?.akun_id);
        const tanggal = String(x?.tanggal ?? "");
        if (!Number.isInteger(akunId) || akunId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return galat("Ada pilihan yang tidak valid.");
        items.push({ akun_id: akunId, tanggal });
      }
    }
    if (items.length === 0) return NextResponse.json({ ok: true, berhasil: 0, dilewati: [] });

    const hasil = await ubahHariKerja(p.db, p.kegiatanId, aksi, items, p.akun.nama, d);
    await catatAudit(p.db, p.akun.id, `pelatihan_hari_kerja_${aksi}`, { kegiatan_id: p.kegiatanId, diminta: items.length, berhasil: hasil.berhasil, dilewati: hasil.dilewati.length, semua: body.semua === true });
    return NextResponse.json({ ok: true, berhasil: hasil.berhasil, dilewati: hasil.dilewati });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
