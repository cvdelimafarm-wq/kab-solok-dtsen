// app/api/sigap/foto/usulan-hapus/route.ts
//
// (19 Okt 2026) Daftar foto yang masa simpannya habis + persetujuan penghapusan. Aturan user: foto dihapus HANYA setelah persetujuan
// pemilik (akun super); sistem tidak pernah menghapus sendiri -- endpoint ini hanya menandai (usul / batal / setuju).
// Setelah 'setuju', pemilik menghapus berkas fisik secara manual (lihat panduan) lalu mengisi file_dihapus_at.
//
// GET  -> { kedaluwarsa, tanpa_tag, diusulkan, disetujui }  (maks 200 per kelompok)
// POST { aksi: 'usul'|'batal'|'setuju', foto_ids: number[] }   usul/batal: admin foto; setuju: akun super saja.

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { kedaluwarsaTanpaTag } from "@/lib/sigapFoto";
import { hariIniWib } from "@/lib/sigap";
import { adalahAdminFoto, adalahSuper } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KOLOM = "id, kode, kegiatan_id, akun_pengambil, tanggal, simpan_sampai, ukuran_byte, file_path, status_periksa, usul_hapus_at, hapus_disetujui_at";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  if (!(await adalahAdminFoto(db, akunId))) return galat("Tidak punya izin.", 403);
  const hariIni = hariIniWib();

  const [{ data: lewat }, { data: usul }, { data: setuju }, { data: calon }] = await Promise.all([
    db.from("sigap_foto").select(KOLOM).lte("simpan_sampai", hariIni).is("hapus_disetujui_at", null).is("file_dihapus_at", null).order("simpan_sampai").limit(200),
    db.from("sigap_foto").select(KOLOM).not("usul_hapus_at", "is", null).is("hapus_disetujui_at", null).is("file_dihapus_at", null).order("usul_hapus_at").limit(200),
    db.from("sigap_foto").select(KOLOM).not("hapus_disetujui_at", "is", null).is("file_dihapus_at", null).order("hapus_disetujui_at").limit(200),
    db.from("sigap_foto").select(KOLOM).lte("tanggal", kedaluwarsaMundur(hariIni)).is("hapus_disetujui_at", null).is("file_dihapus_at", null).order("tanggal").limit(500),
  ]);

  // "Tanpa tag diterima": tidak pernah menjadi nomor foto siapa pun.
  const calonIds = (calon ?? []).map((f) => f.id as number);
  const dipakai = new Set<number>();
  if (calonIds.length) {
    const { data: t } = await db.from("sigap_foto_tag").select("foto_id").eq("status", "diterima").in("foto_id", calonIds);
    for (const r of t ?? []) dipakai.add(r.foto_id as number);
  }
  const tanpaTag = (calon ?? []).filter((f) => !dipakai.has(f.id as number) && kedaluwarsaTanpaTag(f.tanggal as string) <= hariIni).slice(0, 200);

  const semua = [...(lewat ?? []), ...(usul ?? []), ...(setuju ?? []), ...tanpaTag];
  const idsAll = Array.from(new Set(semua.map((f) => f.id as number)));
  const bukti = new Set<number>();
  if (idsAll.length) {
    const { data: t } = await db.from("sigap_foto_tag").select("foto_id").eq("status", "diterima").in("foto_id", idsAll);
    for (const r of t ?? []) bukti.add(r.foto_id as number);
  }
  const tandai = (a: Record<string, unknown>[] | null) => (a ?? []).map((f) => ({ ...f, dipakai_bukti: bukti.has(f.id as number) }));
  return NextResponse.json({ kedaluwarsa: tandai(lewat), tanpa_tag: tandai(tanpaTag), diusulkan: tandai(usul), disetujui: tandai(setuju), akun_super: await adalahSuper(db, akunId) });
}

function kedaluwarsaMundur(hariIni: string): string {
  const t = new Date(`${hariIni}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 90);
  return t.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const b = (await req.json().catch(() => null)) as { aksi?: unknown; foto_ids?: unknown } | null;
  const ids = Array.isArray(b?.foto_ids) ? (b.foto_ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length || ids.length > 200 || (b?.aksi !== "usul" && b?.aksi !== "batal" && b?.aksi !== "setuju")) return galat("aksi dan foto_ids (maks 200) wajib.");
  if (!(await adalahAdminFoto(db, akunId))) return galat("Tidak punya izin.", 403);
  const sekarang = new Date().toISOString();

  if (b.aksi === "setuju") {
    if (!(await adalahSuper(db, akunId))) return galat("Persetujuan penghapusan hanya oleh akun super.", 403);
    const { error } = await db.from("sigap_foto").update({ hapus_disetujui_at: sekarang, hapus_disetujui_oleh: akunId, usul_hapus_at: sekarang }).in("id", ids).is("file_dihapus_at", null);
    if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
  } else if (b.aksi === "usul") {
    const { error } = await db.from("sigap_foto").update({ usul_hapus_at: sekarang }).in("id", ids).is("hapus_disetujui_at", null).is("file_dihapus_at", null);
    if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
  } else {
    // batal usul; persetujuan yang sudah diberikan hanya bisa dibatalkan akun super
    const super_ = await adalahSuper(db, akunId);
    let q = db
      .from("sigap_foto")
      .update(super_ ? { usul_hapus_at: null, hapus_disetujui_at: null, hapus_disetujui_oleh: null } : { usul_hapus_at: null })
      .in("id", ids)
      .is("file_dihapus_at", null);
    if (!super_) q = q.is("hapus_disetujui_at", null);
    const { error } = await q;
    if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
  }
  await catatAudit(db, akunId, `foto.hapus_${b.aksi}`, { foto_ids: ids });
  return NextResponse.json({ ok: true, jumlah: ids.length });
}
