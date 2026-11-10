// app/api/sigap/penilaian360/route.ts
// UMPAN-BALIK: penilaian360   (penanda penjaga lib/__tests__/umpanBalikMonitoring.test.ts; registri lib/umpanBalik.ts; pantauan /sigap/kelola/umpan-balik/penilaian360)
//
// (10 Nov 2026) Penilaian 360 antaranggota tim (Pendataan Bencana). Aturan murni: lib/penilaian360.ts; tabel: sigap_penilaian360.
//   GET  ?kegiatan=ID        -> { ada:false, bolehRekap } bila akun bukan anggota tim; selain itu
//                               { ada:true, bolehRekap, kelompok, lintas, anggota:[{akun_id, nama, peran, sudah, skor|null, catatan|null}], kemajuan:{total,sudah,sisa,lengkap} }
//                               (hanya penilaian MILIK AKUN SENDIRI; tidak pernah mengembalikan nilai orang lain tentang dirinya)
//   GET  ?kegiatan=ID&rekap=1 -> rekap per orang { rekap:[{akun_id, nama, peran, kelompok, penilai, rata, per}], belum:[{akun_id,nama,kelompok,sisa}] }, hanya pemegang izin lihat survei PSP
//   POST { kegiatan, dinilai, skor:{kinerja,kedisiplinan,tim,kerjasama,komunikasi}, catatan? } -> menyimpan (membuat atau memperbarui) lalu membalas seperti GET.
//        Ditolak bila rekan itu bukan satu tim (403) atau saat "masuk sebagai" akun lain (403).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { bacaPenilaian, kemajuan, KODE_KRITERIA, petaKeanggotaan, rekapPerOrang, susunTim, type BarisNilai, type PeranTim, type Skor } from "@/lib/penilaian360";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const idKegiatan = (s: unknown): number | null => {
  const t = typeof s === "number" ? String(s) : typeof s === "string" ? s : "";
  return /^\d{1,9}$/.test(t) && Number(t) > 0 ? Number(t) : null;
};

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const KOLOM_SKOR = KODE_KRITERIA.join(", ");

async function muatDasar(db: Db, kegiatan: number) {
  const [{ data: tim }, { data: ppl }] = await Promise.all([
    db.from("bencana_kelompok_tim").select("kelompok, peran, akun_id").eq("kegiatan_id", kegiatan).eq("aktif", true).in("peran", ["kortim", "pml"]).limit(2000),
    db.from("sigap_penugasan").select("akun_id, atasan_akun_id").eq("kegiatan_id", kegiatan).eq("aktif", true).eq("peran", "ppl").limit(2000),
  ]);
  return { kelompokTim: (tim ?? []) as { kelompok: number; peran: string; akun_id: number }[], ppl: (ppl ?? []) as { akun_id: number; atasan_akun_id: number | null }[] };
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const peta = new Map<number, string>();
  if (ids.length === 0) return peta;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", ids).limit(2000);
  for (const a of (data ?? []) as { id: number; nama: string | null }[]) peta.set(a.id, a.nama ?? `Akun ${a.id}`);
  return peta;
}

async function keadaanSaya(db: Db, akunId: number, kegiatan: number) {
  const { kelompokTim, ppl } = await muatDasar(db, kegiatan);
  const tim = susunTim(akunId, kelompokTim, ppl);
  if (!tim) return { ada: false as const };
  const ids = tim.anggota.map((a) => a.akun_id);
  const [nama, { data: milik }] = await Promise.all([
    namaAkun(db, ids),
    db.from("sigap_penilaian360").select(`dinilai_akun_id, catatan, ${KOLOM_SKOR}`).eq("kegiatan_id", kegiatan).eq("penilai_akun_id", akunId).limit(2000),
  ]);
  const peta = new Map<number, { skor: Skor; catatan: string | null }>();
  for (const r of (milik ?? []) as unknown as ({ dinilai_akun_id: number; catatan: string | null } & Skor)[]) {
    const skor = {} as Skor;
    for (const k of KODE_KRITERIA) skor[k] = r[k];
    peta.set(r.dinilai_akun_id, { skor, catatan: r.catatan });
  }
  const anggota = tim.anggota.map((a) => ({
    akun_id: a.akun_id, nama: nama.get(a.akun_id) ?? `Akun ${a.akun_id}`, peran: a.peran as PeranTim,
    sudah: peta.has(a.akun_id), skor: peta.get(a.akun_id)?.skor ?? null, catatan: peta.get(a.akun_id)?.catatan ?? null,
  }));
  return { ada: true as const, kelompok: tim.kelompok, lintas: tim.lintas, anggota, kemajuan: kemajuan(ids, [...peta.keys()]) };
}

async function rekapAdmin(db: Db, kegiatan: number) {
  const { kelompokTim, ppl } = await muatDasar(db, kegiatan);
  const semua = petaKeanggotaan(kelompokTim, ppl);
  const { data } = await db.from("sigap_penilaian360").select(`penilai_akun_id, dinilai_akun_id, ${KOLOM_SKOR}`).eq("kegiatan_id", kegiatan).limit(20000);
  const baris = (data ?? []) as unknown as BarisNilai[];
  const nama = await namaAkun(db, [...semua.keys()]);
  const rekap = rekapPerOrang(baris).map((r) => ({ ...r, nama: nama.get(r.akun_id) ?? `Akun ${r.akun_id}`, peran: semua.get(r.akun_id)?.peran ?? null, kelompok: (semua.get(r.akun_id)?.kelompok.length ?? 0) === 1 ? semua.get(r.akun_id)!.kelompok[0] : null }));
  // kemajuan menilai per orang: berapa rekan yang belum dinilai olehnya
  const sudahPer = new Map<number, number[]>();
  for (const b of baris) sudahPer.set(b.penilai_akun_id, [...(sudahPer.get(b.penilai_akun_id) ?? []), b.dinilai_akun_id]);
  const belum: { akun_id: number; nama: string; kelompok: number | null; sisa: number }[] = [];
  for (const [id, v] of semua) {
    const t = susunTim(id, kelompokTim, ppl);
    if (!t) continue;
    const k = kemajuan(t.anggota.map((a) => a.akun_id), sudahPer.get(id) ?? []);
    if (!k.lengkap) belum.push({ akun_id: id, nama: nama.get(id) ?? `Akun ${id}`, kelompok: v.kelompok.length === 1 ? v.kelompok[0] : null, sisa: k.sisa });
  }
  belum.sort((a, b) => (a.kelompok ?? 0) - (b.kelompok ?? 0) || b.sisa - a.sisa || a.nama.localeCompare(b.nama, "id"));
  return { rekap, belum, jumlahOrang: semua.size };
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatan = idKegiatan(req.nextUrl.searchParams.get("kegiatan"));
    if (!kegiatan) return galat("Kegiatan tidak sah.");
    if (req.nextUrl.searchParams.get("rekap") === "1") {
      const { izin } = await izinAkun(db as Db, akunId);
      if (!boleh(izin, "bencana.admin", "lihat", kegiatan)) return galat("Tidak berwenang melihat rekap penilaian.", 403);
      return NextResponse.json(await rekapAdmin(db as Db, kegiatan));
    }
    const [saya, { izin }] = await Promise.all([keadaanSaya(db as Db, akunId, kegiatan), izinAkun(db as Db, akunId)]);
    return NextResponse.json({ ...saya, bolehRekap: boleh(izin, "bencana.admin", "lihat", kegiatan) });
  } catch {
    return galat("Gagal memuat penilaian.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat menyimpan penilaian.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Isi permintaan tidak sah."); }
    const kegiatan = idKegiatan((badan as { kegiatan?: unknown } | null)?.kegiatan);
    if (!kegiatan) return galat("Kegiatan tidak sah.");
    const baca = bacaPenilaian(badan);
    if (!baca.ok) return galat(baca.pesan);
    if (baca.dinilai === akunId) return galat("Tidak dapat menilai diri sendiri.");
    const { kelompokTim, ppl } = await muatDasar(db as Db, kegiatan);
    const tim = susunTim(akunId, kelompokTim, ppl);
    if (!tim) return galat("Anda bukan anggota tim kegiatan ini.", 403);
    if (!tim.anggota.some((a) => a.akun_id === baca.dinilai)) return galat("Rekan ini bukan anggota satu tim dengan Anda.", 403);
    const { error } = await db.from("sigap_penilaian360").upsert(
      { kegiatan_id: kegiatan, penilai_akun_id: akunId, dinilai_akun_id: baca.dinilai, ...baca.skor, catatan: baca.catatan, diubah_at: new Date().toISOString() },
      { onConflict: "kegiatan_id,penilai_akun_id,dinilai_akun_id" },
    );
    if (error) return galat("Gagal menyimpan penilaian.", 500);
    return NextResponse.json(await keadaanSaya(db as Db, akunId, kegiatan));
  } catch {
    return galat("Gagal menyimpan penilaian.", 500);
  }
}
