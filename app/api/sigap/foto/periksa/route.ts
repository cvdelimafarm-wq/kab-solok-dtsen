// app/api/sigap/foto/periksa/route.ts
//
// (19 Okt 2026) Pemeriksaan foto oleh PML / admin.
// GET  -> { foto: [...] } foto berstatus belum diperiksa yang kepercayaannya kuning/merah (admin: semua; PML: timnya).
// POST { foto_id, hasil: 'diperiksa'|'dipertanyakan', catatan? }
//   'diperiksa'     -> tag yang ditahan dilepas dan ditulis ke nomor foto (sigap_foto_lepas_tahan).
//   'dipertanyakan' -> HANYA menandai (lencana + tag baru tetap ditahan). Baris nomor foto yang sudah terisi TIDAK dicabut
//                      (mencabut = hapus; sengaja tidak dilakukan). Admin menindaklanjuti manual.

import { NextRequest, NextResponse } from "next/server";
import { adalahAdminFoto, bolehPeriksa } from "@/lib/sigapFotoServer";
import { catatAudit } from "@/lib/sigapAkses";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";
import type { Db } from "@/lib/sigap";
import { jarakM } from "@/lib/sigapFoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Id akun yang diawasi seorang PML. Harus SAMA dengan yang diizinkan `bolehPeriksa` (lib/sigapFotoServer.ts -> pmlDariAkun):
 *  (1) PPL pada alokasi Sub SLS miliknya, dan (2) anggota kelompok-tim tempat ia berperan PML (20 Okt 2026: dulu hanya (1), sehingga foto anggota kelompok-tim tidak tampil).
 */
async function timDiawasi(db: Db, pmlAkunId: number): Promise<number[]> {
  const hasil = new Set<number>();
  const { data: a } = await db.from("sigap_akun").select("petugas_bencana_id").eq("id", pmlAkunId).maybeSingle();
  const pid = a?.petugas_bencana_id as number | null | undefined;
  if (pid) {
    const { data: al } = await db.from("bencana_alokasi_subsls").select("ppl_id").eq("pml_id", pid).not("ppl_id", "is", null);
    const ppl = Array.from(new Set((al ?? []).map((r) => r.ppl_id as number)));
    if (ppl.length) {
      const { data: ak } = await db.from("sigap_akun").select("id").in("petugas_bencana_id", ppl);
      for (const r of ak ?? []) hasil.add(r.id as number);
    }
  }
  const { data: kel } = await db.from("bencana_kelompok_tim").select("kegiatan_id, kelompok").eq("akun_id", pmlAkunId).eq("peran", "pml").eq("aktif", true);
  for (const k of kel ?? []) {
    const { data: anggota } = await db.from("bencana_kelompok_tim").select("akun_id").eq("kegiatan_id", k.kegiatan_id).eq("kelompok", k.kelompok).eq("aktif", true);
    for (const r of anggota ?? []) hasil.add(r.akun_id as number);
  }
  hasil.delete(pmlAkunId); // tidak memeriksa foto sendiri
  return Array.from(hasil);
}

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const admin = await adalahAdminFoto(db, akunId);
  let q = db
    .from("sigap_foto")
    .select("id, kode, kegiatan_id, akun_pengambil, tanggal, diambil_at, diterima_at, lokasi_teks, lat, lng, jarak_wilayah_m, akurasi_m, kepercayaan, alasan, status_periksa")
    .eq("status_periksa", "belum")
    .in("kepercayaan", ["kuning", "merah"])
    .order("diambil_at", { ascending: false })
    .limit(200);
  if (!admin) {
    const tim = await timDiawasi(db, akunId);
    if (!tim.length) return NextResponse.json({ foto: [] });
    q = q.in("akun_pengambil", tim);
  }
  const { data } = await q;
  const ids = Array.from(new Set((data ?? []).map((f) => f.akun_pengambil as number)));
  const { data: nama } = ids.length ? await db.from("sigap_akun").select("id, nama, domisili_lat, domisili_lng").in("id", ids) : { data: [] as Record<string, unknown>[] };
  const peta = new Map((nama ?? []).map((a) => [a.id as number, a.nama as string]));
  const rumah = new Map((nama ?? []).map((a) => [a.id as number, typeof a.domisili_lat === "number" && typeof a.domisili_lng === "number" ? { lat: a.domisili_lat, lng: a.domisili_lng } : null]));
  // (20 Okt 2026) jarak titik foto ke rumah petugas (m), bahan pemeriksa menilai "di luar wilayah"; null bila domisili/koordinat tidak ada
  return NextResponse.json({
    foto: (data ?? []).map((f) => {
      const r = rumah.get(f.akun_pengambil as number) ?? null;
      const jarakRumah = r && typeof f.lat === "number" && typeof f.lng === "number" ? Math.round(jarakM(f.lat, f.lng, r.lat, r.lng)) : null;
      return { ...f, pemotret: peta.get(f.akun_pengambil as number) ?? "-", jarak_rumah_m: jarakRumah };
    }),
  });
}

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const b = (await req.json().catch(() => null)) as { foto_id?: unknown; hasil?: unknown; catatan?: unknown } | null;
  const fotoId = Number(b?.foto_id);
  if (!Number.isInteger(fotoId) || (b?.hasil !== "diperiksa" && b?.hasil !== "dipertanyakan")) return galat("foto_id dan hasil wajib.");
  const catatan = typeof b?.catatan === "string" ? b.catatan.trim().slice(0, 500) : "";
  if (b.hasil === "dipertanyakan" && !catatan) return galat("Alasan wajib diisi untuk menandai Dipertanyakan.");
  const { data: foto } = await db.from("sigap_foto").select("id, akun_pengambil").eq("id", fotoId).maybeSingle();
  if (!foto) return galat("Foto tidak ditemukan.", 404);
  if (!(await bolehPeriksa(db, akunId, foto.akun_pengambil as number))) return galat("Anda tidak berhak memeriksa foto ini.", 403);

  const { error } = await db
    .from("sigap_foto")
    .update({ status_periksa: b.hasil, diperiksa_oleh: akunId, diperiksa_at: new Date().toISOString(), catatan_periksa: catatan || null })
    .eq("id", fotoId);
  if (error) return galat(`Gagal menyimpan: ${error.message}`, 500);
  await catatAudit(db, akunId, "foto.periksa", { foto_id: fotoId, hasil: b.hasil, catatan: catatan || null });

  let lepas: unknown = null;
  if (b.hasil === "diperiksa") {
    const { data, error: e2 } = await db.rpc("sigap_foto_lepas_tahan", { p_foto_id: fotoId, p_oleh: akunId });
    lepas = e2 ? { ok: false, error: e2.message } : data;
  }
  return NextResponse.json({ ok: true, hasil: b.hasil, lepas });
}
