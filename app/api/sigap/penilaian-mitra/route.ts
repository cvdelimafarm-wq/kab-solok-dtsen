// app/api/sigap/penilaian-mitra/route.ts
//
// (31 Okt 2026) Penilaian Mitra per kegiatan (tab "Penilaian Mitra" di Kelola Peran & Akses). Tiap kegiatan = satu kolom; tiap Mitra bernilai 1-5 per kolom.
//   GET  -> { tabel_siap, boleh_kelola, kolom[], mitra[], kegiatan_tersedia[] }                        (izin akses.kelola, level lihat)
//   POST { aksi: "tambah_kolom", nama?, kegiatan_id? }                                                  (izin akses.kelola, level kelola)
//   POST { aksi: "ubah_kolom", kolom_id, nama?, dibuka? }
//   POST { aksi: "simpan_nilai", kolom_id, akun_id, nilai (1-5 | null = hapus), catatan? }
//   POST { aksi: "simpan_banyak", kolom_id, baris: [{ akun_id, nilai, catatan? }] }                     (maks 500)
//   POST { aksi: "tempel", kolom_id, teks, simpan: boolean }  teks dari Excel: NIK/nama <tab> nilai <tab> catatan; simpan=false hanya mengecek kecocokan.
// Tabel dibuat SQL 20261031j. Trigger SQL menurunkan rata-rata ke bencana_petugas.nilai_kinerja (dibaca halaman Bencana dan seleksi lama).
// Akun "masuk sebagai" (aktor lain) tidak boleh mengubah.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { rincianPerAkun } from "@/lib/portal/rincianAkun";
import { cocokkanMitra, periksaBanyak, periksaKolomBaru, periksaNilai, uraiTempel, type NilaiMitra } from "@/lib/penilaianMitra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MAKS_TEKS = 300_000;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function sesi(req: NextRequest, db: Db) {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  const { izin } = await izinAkun(db, akunId);
  return { akunId, izin };
}

type Kolom = { id: number; kode: string; nama: string; kegiatan_id: number | null; urutan: number; dibuka: boolean };
const KOLOM_PENILAIAN = "id, kode, nama, kegiatan_id, urutan, dibuka";

const halaman = async <T,>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ baris: T[]; ok: boolean }> => {
  const baris: T[] = [];
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) return { baris, ok: false };
    baris.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return { baris, ok: true };
};

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (!boleh(s.izin, "akses.kelola", "lihat")) return galat("Tidak punya izin.", 403);
    const bolehKelola = boleh(s.izin, "akses.kelola", "kelola");

    const { data: kolomData, error: eKolom } = await db.from("sigap_penilaian_kolom").select(KOLOM_PENILAIAN).order("urutan").order("id");
    if (eKolom) return NextResponse.json({ tabel_siap: false, boleh_kelola: bolehKelola, kolom: [], mitra: [], kegiatan_tersedia: [] });
    const kolom = (kolomData ?? []) as Kolom[];

    const akun = await halaman<{ id: number; nama: string; alamat_kecamatan: string | null; aktif: boolean; mitra_id: number | null; petugas_bencana_id: number | null }>((a, b) =>
      db.from("sigap_akun").select("id, nama, alamat_kecamatan, aktif, mitra_id, petugas_bencana_id").eq("jenis", "mitra").order("nama").range(a, b),
    );
    if (!akun.ok) return galat("Gagal membaca akun Mitra.", 500);

    const nilai = await halaman<{ kolom_id: number; akun_id: number; nilai: number; catatan: string | null }>((a, b) =>
      db.from("sigap_penilaian_mitra").select("kolom_id, akun_id, nilai, catatan").order("kolom_id").order("akun_id").range(a, b),
    );
    if (!nilai.ok) return galat("Gagal membaca penilaian.", 500);
    const perAkun = new Map<number, Record<string, NilaiMitra>>();
    for (const n of nilai.baris) {
      const m = perAkun.get(n.akun_id) ?? {};
      m[String(n.kolom_id)] = { n: n.nilai, c: n.catatan };
      perAkun.set(n.akun_id, m);
    }

    const rincian = await rincianPerAkun(db, akun.baris);

    const pakai = new Set(kolom.map((k) => k.kegiatan_id).filter((x): x is number => x !== null));
    const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, aktif").order("id", { ascending: false });
    const kegiatanTersedia = ((keg ?? []) as { id: number; nama: string; aktif: boolean | null }[]).filter((k) => !pakai.has(k.id)).map((k) => ({ id: k.id, nama: k.nama }));

    return NextResponse.json({
      tabel_siap: true,
      boleh_kelola: bolehKelola,
      kolom,
      mitra: akun.baris.map((a) => ({
        akun_id: a.id,
        nama: a.nama,
        kecamatan: a.alamat_kecamatan,
        nagari: rincian.get(a.id)?.nagari ?? null,
        aktif: a.aktif,
        nilai: perAkun.get(a.id) ?? {},
      })),
      kegiatan_tersedia: kegiatanTersedia,
    });
  } catch {
    return galat("Gagal memuat penilaian Mitra.", 500);
  }
}

async function kolomAda(db: Db, id: number): Promise<{ kolom: Kolom | null; galat: string | null }> {
  const { data, error } = await db.from("sigap_penilaian_kolom").select(KOLOM_PENILAIAN).eq("id", id).maybeSingle();
  if (error) return { kolom: null, galat: "Gagal membaca kolom. Pastikan SQL 20261031j sudah dijalankan." };
  return { kolom: (data as Kolom | null) ?? null, galat: data ? null : "Kolom penilaian tidak ditemukan." };
}

/** Hanya akun Mitra yang boleh dinilai. */
async function akunMitraSah(db: Db, ids: number[]): Promise<Set<number>> {
  const sah = new Set<number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("sigap_akun").select("id").eq("jenis", "mitra").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { id: number }[]) sah.add(r.id);
  }
  return sah;
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (!boleh(s.izin, "akses.kelola", "kelola")) return galat("Tidak punya izin.", 403);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mengubah penilaian saat masuk sebagai akun lain.", 403);

    const isi = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const aksi = isi?.aksi;
    const sekarang = new Date().toISOString();

    if (aksi === "tambah_kolom") {
      let kegiatan: { id: number; nama: string; kode: string | null } | null = null;
      if (isi?.kegiatan_id !== undefined && isi.kegiatan_id !== null) {
        const id = Number(isi.kegiatan_id);
        if (!Number.isInteger(id) || id <= 0) return galat("Kegiatan tidak sah.");
        const { data } = await db.from("sigap_kegiatan").select("id, nama, kode").eq("id", id).maybeSingle();
        if (!data) return galat("Kegiatan tidak ditemukan.", 404);
        kegiatan = data as { id: number; nama: string; kode: string | null };
        const { data: sudah } = await db.from("sigap_penilaian_kolom").select("id").eq("kegiatan_id", id).maybeSingle();
        if (sudah) return galat("Kegiatan ini sudah punya kolom penilaian.");
      }
      const p = periksaKolomBaru(isi, kegiatan);
      if (!p.ok) return galat(p.pesan);
      const { data: maks } = await db.from("sigap_penilaian_kolom").select("urutan").order("urutan", { ascending: false }).limit(1).maybeSingle();
      const urutan = ((maks as { urutan: number } | null)?.urutan ?? 0) + 1;
      let dibuat: Kolom | null = null;
      for (let i = 1; i <= 9 && !dibuat; i++) {
        const kode = i === 1 ? p.nilai.kode : `${p.nilai.kode.slice(0, 37)}-${i}`;
        const { data, error } = await db.from("sigap_penilaian_kolom").insert({ kode, nama: p.nilai.nama, kegiatan_id: p.nilai.kegiatan_id, urutan, dibuat_oleh: s.akunId }).select(KOLOM_PENILAIAN).single();
        if (!error) dibuat = data as Kolom;
        else if ((error as { code?: string }).code !== "23505") return galat("Gagal menambah kolom. Pastikan SQL 20261031j sudah dijalankan.", 500);
      }
      if (!dibuat) return galat("Kode kolom sudah dipakai; ubah nama kolom.");
      await catatAudit(db, s.akunId, "penilaian_kolom", { aksi: "tambah", kolom_id: dibuat.id, kode: dibuat.kode }).catch(() => undefined);
      return NextResponse.json({ ok: true, kolom: dibuat });
    }

    if (aksi === "ubah_kolom") {
      const id = Number(isi?.kolom_id);
      if (!Number.isInteger(id) || id <= 0) return galat("Kolom penilaian tidak sah.");
      const k = await kolomAda(db, id);
      if (!k.kolom) return galat(k.galat ?? "Kolom tidak ditemukan.", k.galat?.startsWith("Gagal") ? 500 : 404);
      const ubah: Record<string, unknown> = {};
      if (isi?.nama !== undefined) {
        const p = periksaKolomBaru({ nama: isi.nama }, null);
        if (!p.ok) return galat(p.pesan);
        ubah.nama = p.nilai.nama;
      }
      if (typeof isi?.dibuka === "boolean") ubah.dibuka = isi.dibuka;
      if (Object.keys(ubah).length === 0) return galat("Tidak ada yang diubah.");
      const { error } = await db.from("sigap_penilaian_kolom").update(ubah).eq("id", id);
      if (error) return galat("Gagal menyimpan.", 500);
      await catatAudit(db, s.akunId, "penilaian_kolom", { aksi: "ubah", kolom_id: id, ...ubah }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_nilai") {
      const p = periksaNilai(isi);
      if (!p.ok) return galat(p.pesan);
      const n = p.nilai;
      const k = await kolomAda(db, n.kolom_id);
      if (!k.kolom) return galat(k.galat ?? "Kolom tidak ditemukan.", k.galat?.startsWith("Gagal") ? 500 : 404);
      if (!k.kolom.dibuka) return galat("Kolom ini sudah ditutup; buka kembali untuk mengubah nilai.");
      if (!(await akunMitraSah(db, [n.akun_id])).has(n.akun_id)) return galat("Hanya akun Mitra yang bisa dinilai.", 404);
      if (n.nilai === null) {
        const { error } = await db.from("sigap_penilaian_mitra").delete().eq("kolom_id", n.kolom_id).eq("akun_id", n.akun_id);
        if (error) return galat("Gagal menghapus nilai.", 500);
      } else {
        const { error } = await db.from("sigap_penilaian_mitra").upsert({ kolom_id: n.kolom_id, akun_id: n.akun_id, nilai: n.nilai, catatan: n.catatan, dinilai_oleh: s.akunId, diubah_at: sekarang }, { onConflict: "kolom_id,akun_id" });
        if (error) return galat("Gagal menyimpan nilai.", 500);
      }
      await catatAudit(db, s.akunId, "penilaian_mitra", { kolom_id: n.kolom_id, akun_id: n.akun_id, nilai: n.nilai }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_banyak" || aksi === "tempel") {
      let kolomId: number;
      let baris: { akun_id: number; nilai: number; catatan: string | null }[];
      let laporan: Record<string, unknown> = {};
      if (aksi === "simpan_banyak") {
        const p = periksaBanyak(isi);
        if (!p.ok) return galat(p.pesan);
        kolomId = p.kolom_id;
        baris = p.baris;
      } else {
        kolomId = Number(isi?.kolom_id);
        if (!Number.isInteger(kolomId) || kolomId <= 0) return galat("Kolom penilaian tidak sah.");
        const teks = typeof isi?.teks === "string" ? isi.teks : "";
        if (teks.trim() === "") return galat("Tempel dulu isi dari Excel.");
        if (teks.length > MAKS_TEKS) return galat("Isi tempelan terlalu besar.");
        const u = uraiTempel(teks);
        const mitra = await halaman<{ id: number; nama: string; nik: string | null }>((a, b) => db.from("sigap_akun").select("id, nama, nik").eq("jenis", "mitra").order("id").range(a, b));
        if (!mitra.ok) return galat("Gagal membaca akun Mitra.", 500);
        const c = cocokkanMitra(u.baris, mitra.baris);
        baris = c.cocok.map((x) => ({ akun_id: x.akun_id, nilai: x.nilai, catatan: x.catatan }));
        laporan = {
          cocok: c.cocok.length,
          contoh: c.cocok.slice(0, 8).map((x) => ({ nama: x.nama, nilai: x.nilai })),
          tidak_cocok: c.tidak_cocok.slice(0, 50),
          jumlah_tidak_cocok: c.tidak_cocok.length,
          ambigu: c.ambigu.slice(0, 50),
          jumlah_ambigu: c.ambigu.length,
          galat_baris: u.galat.slice(0, 50),
          jumlah_galat: u.galat.length,
        };
        if (isi?.simpan !== true) return NextResponse.json({ ok: true, disimpan: 0, ...laporan });
        if (baris.length === 0) return galat("Tidak ada baris yang cocok dengan Mitra mana pun; periksa NIK/nama dan nilainya.");
        if (baris.length > 5000) return galat("Terlalu banyak baris.");
      }
      const k = await kolomAda(db, kolomId);
      if (!k.kolom) return galat(k.galat ?? "Kolom tidak ditemukan.", k.galat?.startsWith("Gagal") ? 500 : 404);
      if (!k.kolom.dibuka) return galat("Kolom ini sudah ditutup; buka kembali untuk mengubah nilai.");
      const sah = await akunMitraSah(db, baris.map((b) => b.akun_id));
      const layak = baris.filter((b) => sah.has(b.akun_id));
      for (let i = 0; i < layak.length; i += 500) {
        const { error } = await db.from("sigap_penilaian_mitra").upsert(
          layak.slice(i, i + 500).map((b) => ({ kolom_id: kolomId, akun_id: b.akun_id, nilai: b.nilai, catatan: b.catatan, dinilai_oleh: s.akunId, diubah_at: sekarang })),
          { onConflict: "kolom_id,akun_id" },
        );
        if (error) return galat("Gagal menyimpan nilai.", 500);
      }
      await catatAudit(db, s.akunId, "penilaian_mitra", { kolom_id: kolomId, jumlah: layak.length, lewat: aksi }).catch(() => undefined);
      return NextResponse.json({ ok: true, disimpan: layak.length, dilewati: baris.length - layak.length, ...laporan });
    }

    return galat("Aksi tidak dikenal.");
  } catch {
    return galat("Gagal menyimpan penilaian.", 500);
  }
}
