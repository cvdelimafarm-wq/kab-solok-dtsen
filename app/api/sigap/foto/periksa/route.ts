// app/api/sigap/foto/periksa/route.ts
//
// (19 Okt 2026) Pemeriksaan foto oleh PML / admin.
// GET  -> { foto: [...] } foto berstatus belum diperiksa yang kepercayaannya kuning/merah, DITAMBAH foto yang menahan nomor seseorang (tag 'ditahan', apa pun warnanya)
//         (admin: semua; PML: timnya).
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
  const KOLOM = "id, kode, kegiatan_id, akun_pengambil, tanggal, diambil_at, diterima_at, waktu_hp, lokasi_teks, lat, lng, jarak_wilayah_m, akurasi_m, sumber_lokasi, kepercayaan, alasan, status_periksa";
  let tim: number[] | null = null;
  if (!admin) {
    tim = await timDiawasi(db, akunId);
    if (!tim.length) return NextResponse.json({ foto: [] });
  }
  // (1 Nov 2026) Foto yang MENAHAN nomor seseorang (tag 'ditahan') selalu ikut tampil, apa pun warnanya. Dulu hanya kuning/merah, sehingga tag ditahan pada foto hijau
  // tidak pernah bisa dilepas oleh siapa pun dan nomor penerimanya kosong (hari petugas tercatat "terlewat").
  const { data: tahanan } = await db.from("sigap_foto_tag").select("foto_id, akun_id, slot").eq("status", "ditahan");
  const idTahan = Array.from(new Set((tahanan ?? []).map((t) => t.foto_id as number)));
  let q = db.from("sigap_foto").select(KOLOM).eq("status_periksa", "belum").in("kepercayaan", ["kuning", "merah"]).order("diambil_at", { ascending: false }).limit(200);
  if (tim) q = q.in("akun_pengambil", tim);
  let q2 = idTahan.length ? db.from("sigap_foto").select(KOLOM).in("id", idTahan).limit(200) : null;
  if (q2 && tim) q2 = q2.in("akun_pengambil", tim);
  const [{ data: a }, { data: b }] = await Promise.all([q, q2 ?? Promise.resolve({ data: [] as Record<string, unknown>[] })]);
  const gabung = new Map<number, Record<string, unknown>>();
  for (const f of [...(a ?? []), ...(b ?? [])]) gabung.set(f.id as number, f as Record<string, unknown>);
  const data = Array.from(gabung.values()).sort((x, y) => String(y.diambil_at).localeCompare(String(x.diambil_at))).slice(0, 200);
  const idsAkun = Array.from(new Set([...data.map((f) => f.akun_pengambil as number), ...(tahanan ?? []).map((t) => t.akun_id as number)]));
  type AkunRingkas = { id: number; nama: string; domisili_lat: number | null; domisili_lng: number | null };
  const { data: namaRaw } = idsAkun.length ? await db.from("sigap_akun").select("id, nama, domisili_lat, domisili_lng").in("id", idsAkun) : { data: [] };
  const nama = (namaRaw ?? []) as AkunRingkas[];
  const peta = new Map(nama.map((x) => [x.id, x.nama]));
  const rumah = new Map(nama.map((x) => [x.id, typeof x.domisili_lat === "number" && typeof x.domisili_lng === "number" ? { lat: x.domisili_lat, lng: x.domisili_lng } : null]));
  // (1 Nov 2026) siapa yang nomornya ditahan oleh foto ini
  const ditahanUntuk = new Map<number, { nama: string; slot: number | null }[]>();
  for (const t of tahanan ?? []) {
    const arr = ditahanUntuk.get(t.foto_id as number) ?? [];
    arr.push({ nama: peta.get(t.akun_id as number) ?? "-", slot: (t.slot as number | null) ?? null });
    ditahanUntuk.set(t.foto_id as number, arr);
  }
  // (20 Okt 2026) jarak titik foto ke rumah petugas (m), bahan pemeriksa menilai "di luar wilayah"; null bila domisili/koordinat tidak ada
  return NextResponse.json({
    foto: data.map((f) => {
      const r = rumah.get(f.akun_pengambil as number) ?? null;
      const jarakRumah = r && typeof f.lat === "number" && typeof f.lng === "number" ? Math.round(jarakM(f.lat, f.lng, r.lat, r.lng)) : null;
      return { ...f, pemotret: peta.get(f.akun_pengambil as number) ?? "-", jarak_rumah_m: jarakRumah, ditahan_untuk: ditahanUntuk.get(f.id as number) ?? [] };
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
