// app/api/sigap/foto/pengaturan/route.ts
//
// (19 Okt 2026) Saklar Kamera SIGAP (Kelola > Foto kamera). Hanya akun super / izin MENU_ADMIN_FOTO.
// GET  -> { bawaan, kegiatan: [{ id, kode, nama, mode, efektif }] }
// POST { bawaan?: 'kamera'|'unggah', kegiatan?: [{ kegiatan_id, mode: 'ikuti'|'kamera'|'unggah' }] }
// Berlaku untuk foto berikutnya; foto yang sudah ada tidak berubah. Tiap perubahan dicatat ke sigap_audit (aksi 'foto.saklar').
// Mematikan = kembali ke unggah foto lama. Tidak ada data yang dihapus.

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { modeEfektif, type ModeKegiatan } from "@/lib/sigapFoto";
import { adalahAdminFoto, modeBawaan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  if (!(await adalahAdminFoto(db, akunId))) return galat("Tidak punya izin.", 403);
  const [bawaan, { data: keg }, { data: set }] = await Promise.all([
    modeBawaan(db),
    db.from("sigap_kegiatan").select("id, kode, nama, jenis, tanggal_selesai").eq("aktif", true).order("nama"),
    db.from("sigap_foto_pengaturan_kegiatan").select("kegiatan_id, mode"),
  ]);
  const peta = new Map((set ?? []).map((s) => [s.kegiatan_id as number, s.mode as ModeKegiatan]));
  return NextResponse.json({
    bawaan,
    kegiatan: (keg ?? []).map((k) => {
      const mode = peta.get(k.id as number) ?? "ikuti";
      return { id: k.id, kode: k.kode, nama: k.nama, jenis: k.jenis, mode, efektif: modeEfektif(bawaan, mode) };
    }),
  });
}

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  if (!(await adalahAdminFoto(db, akunId))) return galat("Tidak punya izin.", 403);
  const b = (await req.json().catch(() => null)) as { bawaan?: unknown; kegiatan?: unknown } | null;
  if (!b) return galat("Isian tidak terbaca.");
  const sekarang = new Date().toISOString();

  if (b.bawaan !== undefined) {
    if (b.bawaan !== "kamera" && b.bawaan !== "unggah") return galat("bawaan harus 'kamera' atau 'unggah'.");
    const lama = await modeBawaan(db);
    if (lama !== b.bawaan) {
      const { error } = await db.from("sigap_foto_pengaturan").upsert({ id: 1, mode_bawaan: b.bawaan, diubah_at: sekarang, diubah_oleh: akunId });
      if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
      await catatAudit(db, akunId, "foto.saklar", { tingkat: "bawaan", dari: lama, ke: b.bawaan });
    }
  }
  if (b.kegiatan !== undefined) {
    if (!Array.isArray(b.kegiatan)) return galat("kegiatan harus daftar.");
    for (const x of b.kegiatan as { kegiatan_id?: unknown; mode?: unknown }[]) {
      const id = Number(x?.kegiatan_id);
      if (!Number.isInteger(id) || (x?.mode !== "ikuti" && x?.mode !== "kamera" && x?.mode !== "unggah")) return galat("Isian kegiatan tidak valid.");
      const { data: lama } = await db.from("sigap_foto_pengaturan_kegiatan").select("mode").eq("kegiatan_id", id).maybeSingle();
      const dari = (lama?.mode as string | undefined) ?? "ikuti";
      if (dari === x.mode) continue;
      const { error } = await db.from("sigap_foto_pengaturan_kegiatan").upsert({ kegiatan_id: id, mode: x.mode, diubah_at: sekarang, diubah_oleh: akunId });
      if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
      await catatAudit(db, akunId, "foto.saklar", { tingkat: "kegiatan", kegiatan_id: id, dari, ke: x.mode });
    }
  }
  return NextResponse.json({ ok: true });
}
