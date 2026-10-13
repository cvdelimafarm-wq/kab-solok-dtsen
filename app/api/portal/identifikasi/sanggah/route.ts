// app/api/portal/identifikasi/sanggah/route.ts
//
// (13 Okt 2026) Sanggahan hasil identifikasi ("tidak terdampak" padahal terdampak) -- permintaan user.
// POST (Authorization: Bearer <sesi>)
//   { aksi: "buat", idsubsls, alasan, url? }      -> penyanggah = petugas lapangan / admin; diberi tahu: pengidentifikasi, PML bersangkutan, admin
//   { aksi: "tanggapi", id, tanggapan, url? }     -> hanya admin atau PML bersangkutan; hasil dipertahankan, penyanggah diberi tahu
// Sesi "masuk sebagai" (akun super menguji tampilan) DITOLAK: sanggahan tercatat atas nama orang sungguhan.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aksesRekap } from "@/lib/portal/rekapIdentifikasi";
import { buatSanggah, tanggapiSanggah } from "@/lib/portal/sanggahIdentifikasi";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { bersihkanTeksSanggah, MIN_ALASAN_SANGGAH, MIN_TANGGAPAN_SANGGAH } from "@/lib/rekapIdentifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  if (aktorDariHeader(req.headers)) return NextResponse.json({ error: "Sanggahan tidak dapat dibuat saat mode \"masuk sebagai\"." }, { status: 403 });

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Permintaan tidak sah." }, { status: 400 });
  }

  try {
    const akses = await aksesRekap(db, akun);
    if (!akses.boleh) return NextResponse.json({ error: "Sanggahan khusus petugas lapangan (PML/PPL) dan admin." }, { status: 403 });

    if (b.aksi === "buat") {
      const idsubsls = typeof b.idsubsls === "string" ? b.idsubsls : "";
      const alasan = bersihkanTeksSanggah(b.alasan, MIN_ALASAN_SANGGAH, "Alasan sanggahan");
      if (!alasan.ok) return NextResponse.json({ error: alasan.pesan }, { status: 400 });
      const h = await buatSanggah(db, { id: akun.id, nama: akun.nama }, idsubsls, alasan.teks, b.url);
      if ("galat" in h) return NextResponse.json({ error: h.galat }, { status: h.status });
      return NextResponse.json({ ok: true, id: h.id, dikirim: h.dikirim });
    }

    if (b.aksi === "tanggapi") {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Sanggahan tidak sah." }, { status: 400 });
      const t = bersihkanTeksSanggah(b.tanggapan, MIN_TANGGAPAN_SANGGAH, "Tanggapan");
      if (!t.ok) return NextResponse.json({ error: t.pesan }, { status: 400 });
      const h = await tanggapiSanggah(db, { id: akun.id, nama: akun.nama }, akses.admin, id, t.teks, b.url);
      if ("galat" in h) return NextResponse.json({ error: h.galat }, { status: h.status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memproses sanggahan." }, { status: 500 });
  }
}
