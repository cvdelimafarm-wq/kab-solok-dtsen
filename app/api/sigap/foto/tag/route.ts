// app/api/sigap/foto/tag/route.ts
//
// (19 Okt 2026) Pemotret menambah tag pada fotonya (rekan tim atau di luar tim). Tag baru berstatus 'diajukan' -- penerima yang memutuskan.
// POST { foto_id, tag: [{ akun_id, slot_usulan? }] } -> { ok, ditambah }

import { NextRequest, NextResponse } from "next/server";
import { MAKS_TAG, jendelaBagiFoto, slotValid, type PeranTag } from "@/lib/sigapFoto";
import { hariIniWib } from "@/lib/sigap";
import { rekanTim } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const b = (await req.json().catch(() => null)) as { foto_id?: unknown; tag?: unknown } | null;
  const fotoId = Number(b?.foto_id);
  if (!Number.isInteger(fotoId) || !Array.isArray(b?.tag) || !b.tag.length) return galat("foto_id dan tag wajib.");
  const { data: foto } = await db.from("sigap_foto").select("id, kegiatan_id, akun_pengambil, tanggal").eq("id", fotoId).maybeSingle();
  if (!foto || foto.akun_pengambil !== akunId) return galat("Hanya pemotret yang dapat menambah tag.", 403);
  // (26 Okt 2026) Berbagi foto dibuka sampai akhir H+1 (23.59 WIB sehari sesudah tanggal foto).
  if (!jendelaBagiFoto(foto.tanggal as string, hariIniWib())) return galat("Berbagi foto sudah ditutup. Foto hanya bisa dibagikan sampai akhir hari sesudah tanggal foto (H+1).", 403);

  const baru: { akun_id: number; slot_usulan: number | null }[] = [];
  for (const x of b.tag as { akun_id?: unknown; slot_usulan?: unknown }[]) {
    const id = Number(x?.akun_id);
    const s = x?.slot_usulan == null ? null : Number(x.slot_usulan);
    if (!Number.isInteger(id) || id <= 0 || id === akunId || (s !== null && !slotValid(s))) return galat("Daftar tag tidak valid.");
    if (!baru.some((n) => n.akun_id === id)) baru.push({ akun_id: id, slot_usulan: s });
  }
  const { data: ada } = await db.from("sigap_foto_tag").select("akun_id").eq("foto_id", fotoId);
  const sudah = new Set((ada ?? []).map((t) => t.akun_id as number));
  const tambah = baru.filter((n) => !sudah.has(n.akun_id));
  if (!tambah.length) return NextResponse.json({ ok: true, ditambah: 0 });
  if (sudah.size - 1 + tambah.length > MAKS_TAG) return galat(`Maksimal ${MAKS_TAG} orang per foto.`);

  const { data: ak } = await db.from("sigap_akun").select("id").eq("aktif", true).in("id", tambah.map((t) => t.akun_id));
  const aktif = new Set((ak ?? []).map((a) => a.id as number));
  if (tambah.some((t) => !aktif.has(t.akun_id))) return galat("Ada petugas yang dipilih tidak ditemukan atau tidak aktif.");
  const tim = new Set((await rekanTim(db, akunId, foto.kegiatan_id as number)).map((r) => r.akun_id));
  const { error } = await db.from("sigap_foto_tag").insert(
    tambah.map((t) => ({ foto_id: fotoId, akun_id: t.akun_id, peran_tag: (tim.has(t.akun_id) ? "tim" : "luar_tim") as PeranTag, slot_usulan: t.slot_usulan }))
  );
  if (error) return galat(`Gagal menambah tag: ${error.message}`, 500);
  return NextResponse.json({ ok: true, ditambah: tambah.length });
}
