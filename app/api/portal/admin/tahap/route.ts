// app/api/portal/admin/tahap/route.ts
//
// (9 Okt 2026) Admin Aplikasi mengatur tahap proses bisnis per kegiatan induk (tabel sigap_induk + sigap_tahap).
// GET  -> semua induk + semua tahap (termasuk nonaktif) + daftar kegiatan anggaran yang boleh dipasang sebagai modul Transport Lokal.
// (7 Nov 2026) GET juga memuat `tanpa_induk`: kegiatan aktif yang sudah punya penugasan tetapi belum masuk induk mana pun (petugasnya tidak melihat kartu kegiatan).
// POST { aksi:"buat_induk", kegiatan_id } -> membuat induk dari satu kegiatan dengan isi awal Transport Lokal (+ Pelatihan untuk jenis pelatihan) -> { ok, kode }
// POST { induk_kode, tahap: [{ kode, nama, uraian, isi[], buka_mode, buka_tanggal, aktif }] } -> simpan. Urutan = urutan array.
//   Tahap yang tidak ikut dikirim DINONAKTIFKAN (tidak dihapus permanen). Izin: portal.kelola (kelola).

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { periksaTahapAdmin, type BukaMode } from "@/lib/sigapTahap";
import { kegiatanTanpaInduk, susunIndukBaru } from "@/lib/sigapIndukBaru";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status: number) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "portal.kelola", "kelola")) return galat("Hanya Admin Aplikasi yang dapat mengatur tahap kegiatan.", 403);
  const [{ data: induk }, { data: tahap }, { data: keg }, { data: pen }] = await Promise.all([
    db.from("sigap_induk").select("kode, nama, pendek, ikon, kegiatan_ids, urutan, aktif").order("urutan"),
    db.from("sigap_tahap").select("induk_kode, kode, urutan, nama, uraian, isi, buka_mode, buka_tanggal, aktif").order("urutan"),
    db.from("sigap_kegiatan").select("id, nama, jenis, aktif").order("id"),
    db.from("sigap_penugasan").select("kegiatan_id").eq("aktif", true).limit(20000),
  ]);
  const perKeg = new Map<number, number>();
  for (const p of (pen ?? []) as { kegiatan_id: number }[]) perKeg.set(Number(p.kegiatan_id), (perKeg.get(Number(p.kegiatan_id)) ?? 0) + 1);
  const tanpa_induk = kegiatanTanpaInduk((keg ?? []) as { id: number; nama: string; jenis?: string | null; aktif?: boolean | null }[], perKeg, (induk ?? []) as { kegiatan_ids: (number | string)[] }[]);
  return NextResponse.json({ induk: induk ?? [], tahap: tahap ?? [], kegiatan: keg ?? [], tanpa_induk });
}

type MasukanTahap = { kode?: unknown; nama?: unknown; uraian?: unknown; isi?: unknown; buka_mode?: unknown; buka_tanggal?: unknown; aktif?: unknown };

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "portal.kelola", "kelola")) return galat("Hanya Admin Aplikasi yang dapat mengatur tahap kegiatan.", 403);

  let body: { aksi?: unknown; kegiatan_id?: unknown; induk_kode?: unknown; tahap?: unknown };
  try {
    body = await req.json();
  } catch {
    return galat("Isi permintaan tidak valid.", 400);
  }
  if (body.aksi === "buat_induk") {
    const kid = Number(body.kegiatan_id);
    if (!Number.isInteger(kid) || kid <= 0) return galat("Kegiatan tidak valid.", 400);
    const [{ data: keg }, { data: semua }] = await Promise.all([
      db.from("sigap_kegiatan").select("id, nama, jenis, aktif").eq("id", kid).maybeSingle(),
      db.from("sigap_induk").select("kode, kegiatan_ids, urutan"),
    ]);
    if (!keg) return galat("Kegiatan tidak ditemukan.", 404);
    const daftar = (semua ?? []) as { kode: string; kegiatan_ids: (number | string)[]; urutan: number }[];
    if (daftar.some((i) => i.kegiatan_ids.some((x) => Number(x) === kid))) return galat("Kegiatan ini sudah menjadi bagian dari sebuah induk.", 409);
    const s = susunIndukBaru(keg as { id: number; nama: string; jenis?: string | null; aktif?: boolean | null }, new Set(daftar.map((i) => i.kode)), daftar.reduce((m, i) => Math.max(m, Number(i.urutan) || 0), 0));
    if (!s.ok) return galat(s.pesan, 400);
    const { error: e0 } = await db.from("sigap_induk").insert(s.baru.induk);
    if (e0) return galat(`Gagal membuat induk: ${e0.message}`, 500);
    const waktu = new Date().toISOString();
    const { error: e1 } = await db.from("sigap_tahap").insert(s.baru.tahap.map((t) => ({ induk_kode: s.baru.induk.kode, ...t, diubah_at: waktu, diubah_oleh: akun.nama })));
    if (e1) {
      await db.from("sigap_induk").delete().eq("kode", s.baru.induk.kode); // jangan menyisakan induk tanpa tahap
      return galat(`Gagal membuat tahap awal: ${e1.message}`, 500);
    }
    await catatAudit(db, akun.id, "induk.buat", { induk: s.baru.induk.kode, kegiatan_id: kid, tahap: s.baru.tahap.map((t) => t.kode) });
    return NextResponse.json({ ok: true, kode: s.baru.induk.kode });
  }
  const indukKode = typeof body.induk_kode === "string" ? body.induk_kode : "";
  const { data: induk } = await db.from("sigap_induk").select("kode, kegiatan_ids").eq("kode", indukKode).maybeSingle();
  if (!induk) return galat("Kegiatan induk tidak ditemukan.", 404);
  if (!Array.isArray(body.tahap) || body.tahap.length === 0 || body.tahap.length > 12) return galat("Daftar tahap harus berisi 1–12 tahap.", 400);

  const kegIds = ((induk.kegiatan_ids as number[]) ?? []).map(Number);
  const bersih: { kode: string; nama: string; uraian: string | null; isi: string[]; buka_mode: BukaMode; buka_tanggal: string | null; aktif: boolean }[] = [];
  for (const m of body.tahap as MasukanTahap[]) {
    const t = {
      kode: typeof m.kode === "string" ? m.kode.trim() : "",
      nama: typeof m.nama === "string" ? m.nama.trim() : "",
      uraian: typeof m.uraian === "string" && m.uraian.trim() ? m.uraian.trim().slice(0, 200) : null,
      isi: Array.isArray(m.isi) ? m.isi.filter((x): x is string => typeof x === "string") : [],
      buka_mode: (typeof m.buka_mode === "string" ? m.buka_mode : "langsung") as BukaMode,
      buka_tanggal: typeof m.buka_tanggal === "string" && m.buka_tanggal ? m.buka_tanggal : null,
      aktif: m.aktif !== false,
    };
    const err = periksaTahapAdmin(t, kegIds);
    if (err) return galat(err, 400);
    bersih.push(t);
  }
  if (new Set(bersih.map((t) => t.kode)).size !== bersih.length) return galat("Kode tahap tidak boleh kembar.", 400);
  if (!bersih.some((t) => t.aktif)) return galat("Minimal satu tahap harus aktif.", 400);

  const { data: lama } = await db.from("sigap_tahap").select("kode").eq("induk_kode", indukKode);
  const adaLama = new Set((lama ?? []).map((x) => x.kode as string));
  const kirim = new Set(bersih.map((t) => t.kode));
  const baris = bersih.map((t, i) => ({
    induk_kode: indukKode,
    kode: t.kode,
    urutan: i + 1,
    nama: t.nama,
    uraian: t.uraian,
    isi: t.isi,
    buka_mode: t.buka_mode,
    buka_tanggal: t.buka_mode === "tanggal" ? t.buka_tanggal : null,
    aktif: t.aktif,
    diubah_at: new Date().toISOString(),
    diubah_oleh: akun.nama,
  }));
  const { error: e1 } = await db.from("sigap_tahap").upsert(baris, { onConflict: "induk_kode,kode" });
  if (e1) return galat(`Gagal menyimpan: ${e1.message}`, 500);
  // tahap lama yang tidak dikirim lagi: nonaktifkan (tidak dihapus)
  const hilang = Array.from(adaLama).filter((k) => !kirim.has(k));
  if (hilang.length) {
    const { error: e2 } = await db.from("sigap_tahap").update({ aktif: false, diubah_at: new Date().toISOString(), diubah_oleh: akun.nama }).eq("induk_kode", indukKode).in("kode", hilang);
    if (e2) return galat(`Tahap tersimpan, tetapi gagal menonaktifkan tahap lama: ${e2.message}`, 500);
  }
  await catatAudit(db, akun.id, "tahap.simpan", { induk: indukKode, tahap: bersih.map((t) => t.kode), dinonaktifkan: hilang });
  return NextResponse.json({ ok: true, dinonaktifkan: hilang });
}
